/**
 * Escalation engine.
 *
 * Evaluates EscalationPolicy[] against the current context and
 * returns escalation requirements with SLAs and target roles.
 *
 * Escalation is triggered by:
 *   - Approval timeout (approval SLA exceeded)
 *   - Critical operational risk signals
 *   - Supplier failures above a risk threshold
 *   - Repeated negotiation rounds without resolution
 */
import type { WorkflowContext } from "../types/workflow.types";
import type { EscalationPolicy } from "../types/approval.types";

// ── Default escalation policies ───────────────────────────────────────────

export const DEFAULT_ESCALATION_POLICIES: EscalationPolicy[] = [
  {
    id: "approval-timeout",
    name: "Approval SLA Exceeded",
    condition: (ctx) => ctx.approvalStatus === "PENDING" && !!(ctx.metadata?.["approvalOverdue"]),
    escalateTo: "COMMERCIAL_DIRECTOR",
    slaHours: 4,
    reason: "Approval request has exceeded the SLA window without a decision.",
    riskLevel: "HIGH",
  },
  {
    id: "critical-risk",
    name: "Critical Operational Risk",
    condition: (ctx) => (ctx.operationalRiskScore ?? 0) >= 80,
    escalateTo: "OPERATIONS_MANAGER",
    slaHours: 2,
    reason: "Operational risk score is at CRITICAL level — immediate intervention required.",
    riskLevel: "CRITICAL",
  },
  {
    id: "margin-critical",
    name: "Critical Margin Erosion",
    condition: (ctx) => ctx.marginPct != null && ctx.marginPct < 5,
    escalateTo: "EXECUTIVE",
    slaHours: 4,
    reason: "Margin is critically low — deal may be economically unviable without restructuring.",
    riskLevel: "CRITICAL",
  },
  {
    id: "supplier-failure",
    name: "Supplier Failure Signal",
    condition: (ctx) => (ctx.operationalRiskScore ?? 0) >= 70 && ctx.currentState === "PROCUREMENT",
    escalateTo: "SUPPLY_CHAIN_MANAGER",
    slaHours: 8,
    reason: "Supplier reliability issues detected during procurement — alternative sourcing may be required.",
    riskLevel: "HIGH",
  },
];

// ── Evaluation ────────────────────────────────────────────────────────────

export interface EscalationRequirement {
  policyId: string;
  name: string;
  escalateTo: string;
  slaHours: number;
  reason: string;
  riskLevel: EscalationPolicy["riskLevel"];
  deadline: string;
}

export function evaluateEscalationPolicies(
  ctx: WorkflowContext & { currentState?: string },
  policies: EscalationPolicy[] = DEFAULT_ESCALATION_POLICIES,
): EscalationRequirement[] {
  return policies
    .filter((p) => p.condition(ctx))
    .map((p) => ({
      policyId: p.id,
      name: p.name,
      escalateTo: p.escalateTo,
      slaHours: p.slaHours,
      reason: p.reason,
      riskLevel: p.riskLevel,
      deadline: new Date(Date.now() + p.slaHours * 3600000).toISOString(),
    }))
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
      return order[a.riskLevel] - order[b.riskLevel];
    });
}
