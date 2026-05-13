/**
 * Workflow engine — single public API for the operational orchestration module.
 *
 * Entry points:
 *
 *   initWorkflow            — create or load the workflow for a quote
 *   processEvent            — ingest a CommercialEvent and advance the workflow
 *   processEvaluation       — ingest a QuoteEvaluation result and advance the workflow
 *   recordApproval          — record an approval decision and advance the workflow
 *   manualAdvance           — operator/admin forces a state advance
 *   getWorkflowStatus       — current state + context + pending approvals + insight
 *   getApprovalAuditTrail   — full immutable approval history for a quote
 */
import type { PrismaClient } from "@prisma/client";
import {
  processWorkflowTrigger,
  initWorkflow as _initWorkflow,
  type OrchestratorResult,
} from "./engine/orchestrator";
import {
  triggerFromCommercialEvent,
  triggerFromEvaluation,
  triggerFromApprovalDecision,
  triggerManualAdvance,
  triggerFromSupplierDelay,
  type EvaluationTriggerInput,
} from "./engine/trigger-evaluator";
import { canTransition } from "./engine/state-machine";
import { evaluateApprovalRules } from "./approval/approval-engine";
import { recordApprovalDecision, getApprovalAuditTrail, type ApprovalAuditEntry, type DecisionResult } from "./approval/approval-engine";
import { evaluateEscalationPolicies } from "./approval/escalation-engine";
import { assessOperationalRisk, buildWorkflowInsight, type OperationalRisk } from "./intelligence/risk-assessor";
import { loadWorkflowInstance } from "./repository/workflow.repo";
import type { WorkflowInstance, WorkflowContext, WorkflowInsight } from "./types/workflow.types";
import type { EventKind } from "../intelligence/types/event.types";
import type { ApprovalDecision } from "./types/approval.types";
import type { SupplierRiskFactor, CustomerBehaviorProfile } from "../intelligence/types/learning.types";

// ── Init / load ────────────────────────────────────────────────────────────

export async function initWorkflow(
  prisma: PrismaClient,
  quoteId: string,
  context: WorkflowContext,
): Promise<WorkflowInstance> {
  return _initWorkflow(prisma, quoteId, context);
}

// ── Event-driven advancement ───────────────────────────────────────────────

export async function processEvent(
  prisma: PrismaClient,
  quoteId: string,
  eventKind: EventKind,
  payload: Record<string, unknown>,
  initiatedBy?: string,
): Promise<OrchestratorResult> {
  const { trigger, contextUpdate } = triggerFromCommercialEvent(eventKind, payload, initiatedBy);
  return processWorkflowTrigger(prisma, { quoteId, trigger, contextUpdate });
}

export async function processEvaluationResult(
  prisma: PrismaClient,
  quoteId: string,
  input: EvaluationTriggerInput,
): Promise<OrchestratorResult> {
  const { trigger, contextUpdate } = triggerFromEvaluation(input);
  return processWorkflowTrigger(prisma, { quoteId, trigger, contextUpdate });
}

export async function processSupplierDelay(
  prisma: PrismaClient,
  quoteId: string,
  supplierId: string,
  delayDays: number,
  riskScore: number,
): Promise<OrchestratorResult> {
  const { trigger, contextUpdate } = triggerFromSupplierDelay(supplierId, delayDays, riskScore);
  return processWorkflowTrigger(prisma, { quoteId, trigger, contextUpdate });
}

export async function manualAdvance(
  prisma: PrismaClient,
  quoteId: string,
  initiatedBy: string,
  note?: string,
  contextUpdate?: Partial<WorkflowContext>,
): Promise<OrchestratorResult> {
  const trigger = triggerManualAdvance(initiatedBy, note);
  return processWorkflowTrigger(prisma, { quoteId, trigger, contextUpdate });
}

// ── Approval ───────────────────────────────────────────────────────────────

export async function submitApprovalDecision(
  prisma: PrismaClient,
  quoteId: string,
  decision: ApprovalDecision,
): Promise<{ decisionResult: DecisionResult; orchestratorResult?: OrchestratorResult }> {
  // Load the workflow to get workflowId
  const instance = await loadWorkflowInstance(prisma, quoteId);
  if (!instance) throw new Error(`No workflow found for quote ${quoteId}`);

  const decisionResult = await recordApprovalDecision(prisma, instance.id, decision);

  // If all stages resolved, advance the workflow
  let orchestratorResult: OrchestratorResult | undefined;
  if (decisionResult.allStagesComplete || decisionResult.newStatus === "REJECTED") {
    const { trigger, contextUpdate } = triggerFromApprovalDecision(
      decisionResult.newStatus === "APPROVED" ? "APPROVED" : "REJECTED",
      1,
      decisionResult.allStagesComplete,
      decision.decidedBy,
    );
    orchestratorResult = await processWorkflowTrigger(prisma, { quoteId, trigger, contextUpdate });
  }

  return { decisionResult, orchestratorResult };
}

// ── Status & insights ──────────────────────────────────────────────────────

export interface WorkflowStatus {
  instance: WorkflowInstance;
  pendingApprovals: { id: string; stage: number; kind: string; requiredRole: string; status: string }[];
  escalations: ReturnType<typeof evaluateEscalationPolicies>;
  operationalRisk: OperationalRisk;
  insight: WorkflowInsight;
  historyLength: number;
}

export async function getWorkflowStatus(
  prisma: PrismaClient,
  quoteId: string,
  options: {
    supplierRiskFactors?: SupplierRiskFactor[];
    customerProfile?: CustomerBehaviorProfile;
    installationComplexityScore?: number;
  } = {},
): Promise<WorkflowStatus | null> {
  const instance = await loadWorkflowInstance(prisma, quoteId);
  if (!instance) return null;

  const pendingApprovals = await prisma.approvalRequest.findMany({
    where: { workflowId: instance.id, status: "PENDING" },
    select: { id: true, stage: true, kind: true, requiredRole: true, status: true },
    orderBy: { stage: "asc" },
  });

  const risk = assessOperationalRisk({
    context: instance.context,
    supplierRiskFactors: options.supplierRiskFactors,
    customerProfile: options.customerProfile,
    installationComplexityScore: options.installationComplexityScore,
  });

  const escalations = evaluateEscalationPolicies({
    ...instance.context,
    currentState: instance.currentState,
  });

  const insight = buildWorkflowInsight(instance.currentState, risk, instance.context);

  return {
    instance,
    pendingApprovals,
    escalations,
    operationalRisk: risk,
    insight,
    historyLength: instance.history.length,
  };
}

export async function getApprovalHistory(
  prisma: PrismaClient,
  quoteId: string,
): Promise<ApprovalAuditEntry[]> {
  return getApprovalAuditTrail(prisma, quoteId);
}

// ── Evaluation helpers (pure, no DB) ──────────────────────────────────────

export { evaluateApprovalRules, canTransition };
export { assessOperationalRisk };
export type { OrchestratorResult, EvaluationTriggerInput, DecisionResult, OperationalRisk };
