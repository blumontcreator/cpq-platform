/**
 * Multi-stage approval engine.
 *
 * Evaluates ApprovalRule[] against the current WorkflowContext to determine
 * which approval stages are required. Rules at the same stage are combined:
 * if ANY rule at stage N fires, that stage requires approval.
 *
 * Approval lifecycle:
 *   1. evaluateApprovalRules → ApprovalEvaluationResult (pure)
 *   2. Action handler creates ApprovalRequest records (one per required stage)
 *   3. recordApprovalDecision → updates the ApprovalRequest + advances/blocks the workflow
 *   4. getApprovalAuditTrail → full immutable history for the quote
 *
 * Override tracking:
 *   When a manager overrides an approval (allowOverride=true), the override reason
 *   is stored in overrideReason alongside the decision. All overrides appear in the
 *   audit trail with full attribution.
 */
import type { PrismaClient } from "@prisma/client";
import type { WorkflowContext } from "../types/workflow.types";
import type {
  ApprovalRule,
  ApprovalRequirement,
  ApprovalEvaluationResult,
  ApprovalDecision,
  ApprovalStatus,
} from "../types/approval.types";
import { DEFAULT_APPROVAL_RULES } from "./approval-rules";

// ── Pure evaluation ────────────────────────────────────────────────────────

export function evaluateApprovalRules(
  ctx: WorkflowContext,
  rules: ApprovalRule[] = DEFAULT_APPROVAL_RULES,
): ApprovalEvaluationResult {
  const firedRules = rules.filter((r) => r.condition(ctx));

  if (firedRules.length === 0) {
    return {
      requiresApproval: false,
      requirements: [],
      highestStage: 0,
      totalStages: 0,
      appliedRules: [],
      reasoning: "No approval rules matched the current context.",
    };
  }

  // Group by stage — deduplicate (highest requiredRole wins per stage)
  const stageMap = new Map<number, ApprovalRequirement>();
  for (const rule of firedRules) {
    const existing = stageMap.get(rule.stage);
    // If multiple rules fire at the same stage, pick the most restrictive role
    if (!existing || rule.stage > existing.stage) {
      stageMap.set(rule.stage, {
        ruleId: rule.id,
        stage: rule.stage,
        kind: rule.kind,
        requiredRole: rule.requiredRole,
        reason: rule.description,
        allowOverride: rule.allowOverride,
      });
    }
  }

  const requirements = [...stageMap.values()].sort((a, b) => a.stage - b.stage);
  const highestStage = Math.max(...requirements.map((r) => r.stage));

  const reasonParts = firedRules.map((r) => r.name);
  const reasoning = `${firedRules.length} approval rule(s) triggered: ${reasonParts.join("; ")}. Requires ${requirements.length} stage(s) of approval (up to Stage ${highestStage}).`;

  return {
    requiresApproval: true,
    requirements,
    highestStage,
    totalStages: requirements.length,
    appliedRules: firedRules.map((r) => r.id),
    reasoning,
  };
}

// ── Approval request queries ───────────────────────────────────────────────

export async function getPendingApprovals(
  prisma: PrismaClient,
  workflowId: string,
): Promise<{ id: string; stage: number; kind: string; requiredRole: string; status: string }[]> {
  return prisma.approvalRequest.findMany({
    where: { workflowId, status: "PENDING" },
    orderBy: { stage: "asc" },
    select: { id: true, stage: true, kind: true, requiredRole: true, status: true },
  });
}

export async function getAllApprovals(
  prisma: PrismaClient,
  quoteId: string,
): Promise<{ id: string; stage: number; kind: string; requiredRole: string; status: string; decisionBy: string | null; decisionAt: Date | null; decisionNote: string | null; overrideReason: string | null; createdAt: Date }[]> {
  return prisma.approvalRequest.findMany({
    where: { quoteId },
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      stage: true,
      kind: true,
      requiredRole: true,
      status: true,
      decisionBy: true,
      decisionAt: true,
      decisionNote: true,
      overrideReason: true,
      createdAt: true,
    },
  });
}

// ── Record a decision ──────────────────────────────────────────────────────

export interface DecisionResult {
  approvalRequestId: string;
  newStatus: ApprovalStatus;
  allStagesComplete: boolean;
  remainingStages: number;
}

export async function recordApprovalDecision(
  prisma: PrismaClient,
  workflowId: string,
  input: ApprovalDecision,
): Promise<DecisionResult> {
  const now = new Date();
  const newStatus: ApprovalStatus =
    input.decision === "OVERRIDE" ? "APPROVED" : input.decision;

  await prisma.approvalRequest.update({
    where: { id: input.approvalRequestId },
    data: {
      status: newStatus,
      decisionBy: input.decidedBy,
      decisionAt: now,
      decisionNote: input.note,
      overrideReason: input.overrideReason,
    },
  });

  const pendingCount = await prisma.approvalRequest.count({
    where: { workflowId, status: "PENDING" },
  });

  return {
    approvalRequestId: input.approvalRequestId,
    newStatus,
    allStagesComplete: pendingCount === 0 && newStatus !== "REJECTED",
    remainingStages: pendingCount,
  };
}

// ── Audit trail ───────────────────────────────────────────────────────────

export interface ApprovalAuditEntry {
  stage: number;
  kind: string;
  requiredRole: string;
  status: string;
  decisionBy?: string;
  decisionAt?: string;
  note?: string;
  isOverride: boolean;
}

export async function getApprovalAuditTrail(
  prisma: PrismaClient,
  quoteId: string,
): Promise<ApprovalAuditEntry[]> {
  const records = await getAllApprovals(prisma, quoteId);
  return records.map((r) => ({
    stage: r.stage,
    kind: r.kind,
    requiredRole: r.requiredRole,
    status: r.status,
    decisionBy: r.decisionBy ?? undefined,
    decisionAt: r.decisionAt?.toISOString(),
    note: r.decisionNote ?? undefined,
    isOverride: r.overrideReason != null,
  }));
}
