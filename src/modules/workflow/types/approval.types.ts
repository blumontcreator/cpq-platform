/**
 * Approval domain types.
 *
 * Multi-stage approvals gate workflow advancement through the APPROVAL state.
 * Stages are evaluated in order: all required stages must pass.
 *
 * ApprovalRules are pure condition functions — no DB, no side effects.
 * The ApprovalEngine evaluates them against the current WorkflowContext and
 * returns which stages are required and which roles must sign off.
 *
 * Override tracking: when a required approval is bypassed, the override is
 * persisted alongside the approver, reason, and timestamp for audit.
 */
import type { WorkflowContext } from "./workflow.types";

// ── Approval rule ──────────────────────────────────────────────────────────

export type ApprovalKind =
  | "MARGIN"
  | "DISCOUNT"
  | "STRATEGIC_CUSTOMER"
  | "HIGH_VALUE"
  | "OVERRIDE";

export interface ApprovalRule {
  id: string;
  name: string;
  kind: ApprovalKind;
  /** Stage number — lower stage runs first. Multiple rules can share a stage. */
  stage: number;
  requiredRole: string;
  /** Pure predicate: returns true when approval is required. */
  condition: (ctx: WorkflowContext) => boolean;
  description: string;
  /** If true, a manager can override without formal approval (still logged). */
  allowOverride: boolean;
}

// ── Approval requirement ───────────────────────────────────────────────────

export interface ApprovalRequirement {
  ruleId: string;
  stage: number;
  kind: ApprovalKind;
  requiredRole: string;
  reason: string;
  allowOverride: boolean;
}

// ── Approval decision ──────────────────────────────────────────────────────

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED" | "EXPIRED";

export interface ApprovalDecision {
  approvalRequestId: string;
  decision: "APPROVED" | "REJECTED" | "OVERRIDE";
  decidedBy: string;
  note?: string;
  overrideReason?: string;
}

// ── Escalation policy ──────────────────────────────────────────────────────

export interface EscalationPolicy {
  id: string;
  name: string;
  /** Pure predicate: returns true when escalation should trigger. */
  condition: (ctx: WorkflowContext) => boolean;
  escalateTo: string;
  slaHours: number;
  reason: string;
  riskLevel: "MEDIUM" | "HIGH" | "CRITICAL";
}

// ── Approval evaluation result ────────────────────────────────────────────

export interface ApprovalEvaluationResult {
  requiresApproval: boolean;
  requirements: ApprovalRequirement[];
  highestStage: number;
  totalStages: number;
  appliedRules: string[];
  reasoning: string;
}
