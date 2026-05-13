/**
 * Trigger evaluator.
 *
 * Translates external signals into WorkflowTrigger objects that the state machine
 * can process. This is the bridge between the commercial world and the workflow engine.
 *
 * Supported signal sources:
 *   - CommercialEvent (quote_won, quote_lost, supplier_delay, etc.)
 *   - QuoteEvaluation results (margin thresholds, score thresholds)
 *   - Constraint violations (structural violations from ConstraintEngine)
 *   - FeedbackSignals (supplier risk, customer behavior)
 *   - Manual input (user-initiated state advance)
 */
import type { WorkflowTrigger, WorkflowContext } from "../types/workflow.types";
import type { EventKind } from "../../intelligence/types/event.types";

// ── Commercial event → trigger mapping ────────────────────────────────────

const EVENT_TRIGGER_MAP: Record<EventKind, WorkflowTrigger["kind"]> = {
  quote_created:          "COMMERCIAL_EVENT",
  quote_sent:             "COMMERCIAL_EVENT",
  quote_viewed:           "COMMERCIAL_EVENT",
  quote_negotiated:       "COMMERCIAL_EVENT",
  quote_won:              "COMMERCIAL_EVENT",
  quote_lost:             "COMMERCIAL_EVENT",
  quote_expired:          "COMMERCIAL_EVENT",
  supplier_delay:         "SUPPLIER_SIGNAL",
  installation_issue:     "COMMERCIAL_EVENT",
  payment_delay:          "COMMERCIAL_EVENT",
  customer_change_request: "COMMERCIAL_EVENT",
};

export function triggerFromCommercialEvent(
  eventKind: EventKind,
  payload: Record<string, unknown>,
  initiatedBy?: string,
): { trigger: WorkflowTrigger; contextUpdate: Partial<WorkflowContext> } {
  const kind = EVENT_TRIGGER_MAP[eventKind];

  const contextUpdate: Partial<WorkflowContext> = {
    metadata: { eventKind, ...payload },
  };

  // Extract margin/revenue from won events
  if (eventKind === "quote_won") {
    contextUpdate.marginPct = payload["finalMarginPct"] as number | undefined;
    contextUpdate.revenueAmount = payload["finalRevenue"] as number | undefined;
  }
  if (eventKind === "quote_negotiated") {
    contextUpdate.quotedDiscount = payload["discountGranted"] as number | undefined;
    if (payload["negotiatedRevenue"] && payload["originalRevenue"]) {
      const marginPct = payload["currentMarginPct"] as number | undefined;
      if (marginPct != null) contextUpdate.marginPct = marginPct;
    }
  }
  if (eventKind === "supplier_delay") {
    const delayDays = payload["delayDays"] as number | undefined;
    if (delayDays && delayDays > 14) {
      contextUpdate.operationalRiskScore = Math.min(100, (delayDays / 30) * 100);
    }
  }

  return {
    trigger: {
      kind,
      subKind: eventKind,
      payload,
      initiatedBy,
      occurredAt: new Date(),
    },
    contextUpdate,
  };
}

// ── Evaluation result → trigger ────────────────────────────────────────────

export interface EvaluationTriggerInput {
  overallMarginPct: number;
  compositeScore: number;
  constraintViolationIds?: string[];
  initiatedBy?: string;
}

export function triggerFromEvaluation(
  input: EvaluationTriggerInput,
): { trigger: WorkflowTrigger; contextUpdate: Partial<WorkflowContext> } {
  const hasViolations = (input.constraintViolationIds?.length ?? 0) > 0;

  const trigger: WorkflowTrigger = {
    kind: hasViolations ? "CONSTRAINT_VIOLATION" : "EVALUATION_RESULT",
    subKind: hasViolations ? "constraint_violation" : "evaluation_complete",
    payload: {
      overallMarginPct: input.overallMarginPct,
      compositeScore: input.compositeScore,
      violations: input.constraintViolationIds,
    },
    initiatedBy: input.initiatedBy,
    occurredAt: new Date(),
  };

  const contextUpdate: Partial<WorkflowContext> = {
    marginPct: input.overallMarginPct,
    evaluationScore: input.compositeScore,
    constraintViolationIds: input.constraintViolationIds,
  };

  // Margin alert if margin is too low
  if (input.overallMarginPct < 15 && !hasViolations) {
    trigger.kind = "MARGIN_ALERT";
    trigger.subKind = "low_margin";
  }

  return { trigger, contextUpdate };
}

// ── Approval decision → trigger ────────────────────────────────────────────

export function triggerFromApprovalDecision(
  decision: "APPROVED" | "REJECTED" | "ESCALATED",
  stage: number,
  allStagesComplete: boolean,
  initiatedBy?: string,
): { trigger: WorkflowTrigger; contextUpdate: Partial<WorkflowContext> } {
  return {
    trigger: {
      kind: "APPROVAL_DECISION",
      subKind: decision.toLowerCase(),
      payload: { decision, stage, allStagesComplete },
      initiatedBy,
      occurredAt: new Date(),
    },
    contextUpdate: {
      approvalStatus: decision === "APPROVED" && allStagesComplete ? "APPROVED" : decision as WorkflowContext["approvalStatus"],
      pendingApprovalStage: allStagesComplete ? undefined : stage,
    },
  };
}

// ── Manual advance trigger ─────────────────────────────────────────────────

export function triggerManualAdvance(
  initiatedBy: string,
  note?: string,
): WorkflowTrigger {
  return {
    kind: "MANUAL_ADVANCE",
    subKind: "manual",
    payload: { note },
    initiatedBy,
    occurredAt: new Date(),
  };
}

// ── Supplier delay trigger ─────────────────────────────────────────────────

export function triggerFromSupplierDelay(
  supplierId: string,
  delayDays: number,
  riskScore: number,
  initiatedBy?: string,
): { trigger: WorkflowTrigger; contextUpdate: Partial<WorkflowContext> } {
  return {
    trigger: {
      kind: "SUPPLIER_SIGNAL",
      subKind: "supplier_delay",
      payload: { supplierId, delayDays, riskScore },
      initiatedBy,
      occurredAt: new Date(),
    },
    contextUpdate: {
      operationalRiskScore: riskScore,
      metadata: { eventKind: "supplier_delay", supplierId, delayDays },
    },
  };
}
