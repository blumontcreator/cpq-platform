/**
 * Built-in approval rule factories.
 *
 * Rules are pure condition functions — zero dependencies on DB or state.
 * They are composed into an ApprovalRuleSet and evaluated by the ApprovalEngine.
 *
 * The default CPQ rule set mirrors standard commercial governance:
 *   Stage 1 (Sales Manager)   — moderate risk signals
 *   Stage 2 (Commercial Dir.) — high risk signals
 *   Stage 3 (Executive)       — critical signals / override scenarios
 *
 * Custom rules for strategic accounts or verticals can be injected alongside
 * the defaults without modifying this file (open/closed principle).
 */
import type { ApprovalRule } from "../types/approval.types";
import type { WorkflowContext } from "../types/workflow.types";

// ── Rule factories ─────────────────────────────────────────────────────────

export function marginApprovalRule(
  id: string,
  thresholdPct: number,
  stage: number,
  requiredRole: string,
  allowOverride = true,
): ApprovalRule {
  return {
    id,
    name: `Margin below ${thresholdPct}%`,
    kind: "MARGIN",
    stage,
    requiredRole,
    condition: (ctx: WorkflowContext) => ctx.marginPct != null && ctx.marginPct < thresholdPct,
    description: `Requires ${requiredRole} approval when realized margin is below ${thresholdPct}%.`,
    allowOverride,
  };
}

export function discountApprovalRule(
  id: string,
  thresholdPct: number,
  stage: number,
  requiredRole: string,
  allowOverride = true,
): ApprovalRule {
  return {
    id,
    name: `Discount above ${thresholdPct}%`,
    kind: "DISCOUNT",
    stage,
    requiredRole,
    condition: (ctx: WorkflowContext) => ctx.quotedDiscount != null && ctx.quotedDiscount > thresholdPct,
    description: `Requires ${requiredRole} approval when discount exceeds ${thresholdPct}%.`,
    allowOverride,
  };
}

export function strategicCustomerRule(
  id: string,
  customerIds: string[],
  stage: number,
  requiredRole: string,
  allowOverride = false,
): ApprovalRule {
  return {
    id,
    name: `Strategic customer approval`,
    kind: "STRATEGIC_CUSTOMER",
    stage,
    requiredRole,
    condition: (ctx: WorkflowContext) =>
      ctx.customerId != null && customerIds.includes(ctx.customerId),
    description: `Requires ${requiredRole} approval for strategic accounts: ${customerIds.join(", ")}.`,
    allowOverride,
  };
}

export function highValueRule(
  id: string,
  revenueThreshold: number,
  stage: number,
  requiredRole: string,
  allowOverride = true,
): ApprovalRule {
  return {
    id,
    name: `High-value deal (>${revenueThreshold.toLocaleString()})`,
    kind: "HIGH_VALUE",
    stage,
    requiredRole,
    condition: (ctx: WorkflowContext) =>
      ctx.revenueAmount != null && ctx.revenueAmount > revenueThreshold,
    description: `Requires ${requiredRole} approval for deals above ${revenueThreshold.toLocaleString()}.`,
    allowOverride,
  };
}

// ── Default CPQ rule set ───────────────────────────────────────────────────

export const DEFAULT_APPROVAL_RULES: ApprovalRule[] = [
  // Stage 1: Sales Manager
  marginApprovalRule("margin-stage1", 25, 1, "SALES_MANAGER"),
  discountApprovalRule("discount-stage1", 15, 1, "SALES_MANAGER"),
  highValueRule("high-value-stage1", 50000, 1, "SALES_MANAGER"),

  // Stage 2: Commercial Director (overlapping and additional conditions)
  marginApprovalRule("margin-stage2", 15, 2, "COMMERCIAL_DIRECTOR", false),
  discountApprovalRule("discount-stage2", 25, 2, "COMMERCIAL_DIRECTOR", false),
  highValueRule("high-value-stage2", 150000, 2, "COMMERCIAL_DIRECTOR"),

  // Stage 3: Executive (critical)
  marginApprovalRule("margin-stage3", 10, 3, "EXECUTIVE", false),
  discountApprovalRule("discount-stage3", 35, 3, "EXECUTIVE", false),
];
