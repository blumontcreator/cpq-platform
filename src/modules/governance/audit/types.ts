/**
 * Governance audit types.
 *
 * Every override, exception, and manual intervention must be recorded with:
 *   1. What entity was changed (entityId + entityType)
 *   2. Who made the change (performedBy)
 *   3. What changed (previousValue → newValue)
 *   4. Why it was changed (justification — MANDATORY)
 *   5. What the risk level is (LOW → CRITICAL)
 *   6. Whether it was itself approved by a higher authority
 *
 * This model satisfies SOX, GDPR, and typical enterprise audit requirements.
 */

export type GovernanceAuditKind =
  | "PRICING_OVERRIDE"       // changed a price outside normal rules
  | "MARGIN_EXCEPTION"       // allowed margin below company threshold
  | "DISCOUNT_EXCEPTION"     // granted discount above approved limits
  | "WORKFLOW_OVERRIDE"      // force-advanced or rolled back workflow state
  | "APPROVAL_BYPASS"        // skipped a required approval stage
  | "QUOTE_UNLOCK"           // unlocked a locked/sent quote for editing
  | "STATUS_ROLLBACK"        // reverted a status change
  | "RULESET_OVERRIDE";      // bypassed a pricing/constraint rule

export type GovernanceRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface OverrideImpact {
  /** Revenue change (positive = increase). */
  revenueChange?: number;
  /** Margin percentage-point change (positive = improvement). */
  marginPctChange?: number;
  currency?: string;
  /** Narrative description of the impact. */
  description?: string;
}

export interface GovernanceAuditRecord {
  id: string;
  kind: GovernanceAuditKind;
  entityId: string;
  entityType: string;
  performedBy: string;
  performedAt: Date;
  justification: string;
  previousValue?: unknown;
  newValue?: unknown;
  impact?: OverrideImpact;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  riskLevel: GovernanceRiskLevel;
  metadata?: Record<string, unknown>;
}

export interface CreateAuditRecordInput {
  kind: GovernanceAuditKind;
  entityId: string;
  entityType: string;
  performedBy: string;
  justification: string;
  previousValue?: unknown;
  newValue?: unknown;
  impact?: OverrideImpact;
  riskLevel?: GovernanceRiskLevel;
  metadata?: Record<string, unknown>;
}

export interface AuditQuery {
  kind?: GovernanceAuditKind;
  entityId?: string;
  entityType?: string;
  performedBy?: string;
  riskLevel?: GovernanceRiskLevel;
  approved?: boolean;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

export interface AuditSummary {
  totalOverrides: number;
  byCriticalRisk: number;
  byHighRisk: number;
  unapprovedCount: number;
  topPerformers: { userId: string; count: number }[];
  topKinds: { kind: GovernanceAuditKind; count: number }[];
  period: string;
}
