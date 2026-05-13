/**
 * Operational risk assessor.
 *
 * Synthesizes signals from multiple intelligence sources into a unified
 * OperationalRisk score that drives workflow routing:
 *   - Supplier risk factor        (from intelligence/profiles)
 *   - Lead-time confidence        (from supplier reliability + delay history)
 *   - Installation complexity     (from quote graph node complexity)
 *   - Customer behavior risk      (from customer profile — payment delay, change requests)
 *   - Profitability risk          (from margin vs thresholds)
 *
 * Output:
 *   OperationalRisk — scored 0–100, with level classification and action suggestions
 *
 * AI seam: The signal weights are explicit constants that can be learned
 * (reinforcement learning, Bayesian optimization) from historical outcome data
 * once enough WorkflowInstance + QuoteOutcome records exist.
 */
import type { WorkflowContext, WorkflowInsight, QuoteLifecycleState } from "../types/workflow.types";
import type { ActionKind } from "../types/action.types";
import type { SupplierRiskFactor, CustomerBehaviorProfile } from "../../intelligence/types/learning.types";

// ── Operational risk result ────────────────────────────────────────────────

export interface OperationalRisk {
  overallScore: number;       // 0–100 (higher = riskier)
  supplierRisk: number;       // 0–100 contribution
  leadTimeRisk: number;       // 0–100 contribution
  installationComplexity: number;
  customerRisk: number;
  profitabilityRisk: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  signals: string[];
  mitigationActions: ActionKind[];
  aiContextBlock: string;
}

// ── Signal weights ─────────────────────────────────────────────────────────
// These are the initial heuristic weights — designed to be learned/replaced

const WEIGHTS = {
  supplier:       0.30,
  leadTime:       0.20,
  installation:   0.15,
  customer:       0.20,
  profitability:  0.15,
};

// ── Assessment ────────────────────────────────────────────────────────────

export interface RiskAssessmentInput {
  context: WorkflowContext;
  supplierRiskFactors?: SupplierRiskFactor[];
  customerProfile?: CustomerBehaviorProfile;
  /** Graph complexity score 0–100 derived from evaluation.complexity */
  installationComplexityScore?: number;
}

export function assessOperationalRisk(input: RiskAssessmentInput): OperationalRisk {
  const { context, supplierRiskFactors, customerProfile, installationComplexityScore } = input;
  const signals: string[] = [];

  // ── Supplier risk ──────────────────────────────────────────────────────
  let supplierRisk = 0;
  if (supplierRiskFactors?.length) {
    const worstScore = supplierRiskFactors.reduce(
      (min, s) => Math.min(min, s.reliabilityScore),
      100,
    );
    supplierRisk = 100 - worstScore;
    if (supplierRisk > 30) {
      const worst = supplierRiskFactors.sort((a, b) => a.reliabilityScore - b.reliabilityScore)[0];
      signals.push(`Supplier ${worst.supplierId} reliability: ${worst.reliabilityScore}/100 (${worst.riskLevel})`);
    }
  } else if (context.supplierIds?.length) {
    supplierRisk = 20; // unknown supplier → moderate uncertainty
    signals.push(`${context.supplierIds.length} supplier(s) with no reliability history`);
  }

  // ── Lead-time risk ────────────────────────────────────────────────────
  let leadTimeRisk = 0;
  if (supplierRiskFactors?.length) {
    const avgMultiplier = supplierRiskFactors.reduce(
      (sum, s) => sum + s.leadTimeConfidenceMultiplier, 0,
    ) / supplierRiskFactors.length;
    // multiplier of 0.7 = 30% buffer needed → 60 risk points
    leadTimeRisk = Math.round((1 - avgMultiplier) * 200); // scale 0-100
    if (leadTimeRisk > 20) {
      signals.push(`Lead-time confidence: ${(avgMultiplier * 100).toFixed(0)}% (avg across suppliers)`);
    }
  }

  // ── Installation complexity ───────────────────────────────────────────
  const installationComplexity = installationComplexityScore ?? 25; // default: low-medium
  if (installationComplexity > 60) {
    signals.push(`Installation complexity: ${installationComplexity.toFixed(0)}/100`);
  }

  // ── Customer risk ─────────────────────────────────────────────────────
  let customerRisk = 0;
  if (customerProfile) {
    const changeRequestFactor = customerProfile.changeRequestRate * 40;
    const paymentFactor = customerProfile.paymentDelayRate * 60;
    customerRisk = Math.min(100, changeRequestFactor + paymentFactor);
    if (customerRisk > 30) {
      signals.push(`Customer ${context.customerId}: change request rate ${(customerProfile.changeRequestRate * 100).toFixed(0)}%, payment delay rate ${(customerProfile.paymentDelayRate * 100).toFixed(0)}%`);
    }
  } else if (context.customerId) {
    customerRisk = 10; // unknown customer
  }

  // ── Profitability risk ────────────────────────────────────────────────
  let profitabilityRisk = 0;
  if (context.marginPct != null) {
    if (context.marginPct < 10) {
      profitabilityRisk = 90;
      signals.push(`Critical margin: ${context.marginPct.toFixed(1)}% (< 10%)`);
    } else if (context.marginPct < 20) {
      profitabilityRisk = 60;
      signals.push(`Low margin: ${context.marginPct.toFixed(1)}% (< 20%)`);
    } else if (context.marginPct < 30) {
      profitabilityRisk = 25;
    }
  }

  // ── Composite score ───────────────────────────────────────────────────
  const overallScore = Math.round(
    supplierRisk       * WEIGHTS.supplier     +
    leadTimeRisk       * WEIGHTS.leadTime     +
    installationComplexity * WEIGHTS.installation +
    customerRisk       * WEIGHTS.customer     +
    profitabilityRisk  * WEIGHTS.profitability,
  );

  const level: OperationalRisk["level"] =
    overallScore >= 75 ? "CRITICAL" :
    overallScore >= 50 ? "HIGH"     :
    overallScore >= 25 ? "MEDIUM"   : "LOW";

  // ── Mitigation actions ────────────────────────────────────────────────
  const mitigationActions: ActionKind[] = [];
  if (level === "CRITICAL") {
    mitigationActions.push("escalate_issue", "notify_stakeholder");
  } else if (level === "HIGH") {
    mitigationActions.push("notify_stakeholder");
    if (profitabilityRisk >= 60) mitigationActions.push("trigger_repricing");
  } else if (level === "MEDIUM") {
    mitigationActions.push("suggest_alternatives");
  }

  // ── AI context block ──────────────────────────────────────────────────
  const aiContextBlock = [
    `[OPERATIONAL RISK CONTEXT]`,
    `Overall risk: ${overallScore}/100 (${level})`,
    `Supplier risk: ${supplierRisk}/100`,
    `Lead-time confidence: ${100 - leadTimeRisk}%`,
    `Customer risk: ${customerRisk}/100`,
    `Profitability risk: ${profitabilityRisk}/100`,
    signals.length ? `Signals:\n${signals.map((s) => `  - ${s}`).join("\n")}` : null,
    `Suggested mitigations: ${mitigationActions.join(", ") || "none"}`,
  ].filter(Boolean).join("\n");

  return {
    overallScore,
    supplierRisk,
    leadTimeRisk,
    installationComplexity,
    customerRisk,
    profitabilityRisk,
    level,
    signals,
    mitigationActions,
    aiContextBlock,
  };
}

// ── Build WorkflowInsight from risk + state ───────────────────────────────

export function buildWorkflowInsight(
  currentState: QuoteLifecycleState,
  risk: OperationalRisk,
  ctx: WorkflowContext,
): WorkflowInsight {
  const confidence = Math.max(0.3, 1 - risk.overallScore / 200);

  const suggestedActions: string[] = [...risk.mitigationActions];

  // Predict next state
  const nextStateMap: Partial<Record<QuoteLifecycleState, QuoteLifecycleState>> = {
    DRAFT: "PRICING",
    PRICING: "REVIEW",
    REVIEW: ctx.marginPct != null && ctx.marginPct < 25 ? "APPROVAL" : "NEGOTIATION",
    APPROVAL: ctx.approvalStatus === "APPROVED" ? "NEGOTIATION" : "REVIEW",
    NEGOTIATION: "WON",
    WON: "PROCUREMENT",
    PROCUREMENT: "LOGISTICS",
    LOGISTICS: "INSTALLATION",
    INSTALLATION: "COMPLETED",
  };
  const predictedNextState = nextStateMap[currentState];

  const reasoning = [
    `Current state: ${currentState}`,
    `Risk level: ${risk.level} (${risk.overallScore}/100)`,
    risk.signals.length ? `Key signals: ${risk.signals.slice(0, 2).join("; ")}` : null,
    predictedNextState ? `Likely next state: ${predictedNextState}` : null,
  ].filter(Boolean).join(". ");

  return {
    predictedNextState,
    predictedNextStateProbability: confidence,
    suggestedActions,
    operationalRiskScore: risk.overallScore,
    confidence,
    reasoning,
    aiContextBlock: [risk.aiContextBlock, `Predicted next state: ${predictedNextState ?? "unknown"}`].join("\n"),
  };
}
