/**
 * Warning alert recommendation generator.
 *
 * Surfaces critical operational and commercial risks as WARNING_ALERT
 * or LEAD_TIME_ALERT recommendations. Pulls from:
 *   - Node-level lead-time risks
 *   - Constraint violations already computed
 *   - Graph structural issues (e.g. no FREIGHT node for heavy items)
 *   - Critical-path lead time
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../types/graph.types";
import type { QuoteEvaluation } from "../../types/evaluation.types";
import type { ConstraintViolation } from "../../types/constraint.types";
import type { QuoteRecommendation } from "../../types/recommendation.types";

export function generateWarningRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
  violations: ConstraintViolation[],
): QuoteRecommendation[] {
  const recommendations: QuoteRecommendation[] = [];

  // ── Lead-time risks ───────────────────────────────────────────────────────
  for (const ne of evaluation.nodeEvaluations) {
    if (ne.leadTimeRisk !== "HIGH" && ne.leadTimeRisk !== "CRITICAL") continue;
    const node = graph.nodes.find((n) => n.id === ne.nodeId);
    if (!node) continue;

    recommendations.push({
      id: randomUUID(),
      kind: "LEAD_TIME_ALERT",
      priority: ne.leadTimeRisk === "CRITICAL" ? "CRITICAL" : "HIGH",
      title: `${ne.leadTimeRisk} lead-time risk on "${node.label}"`,
      reasoning: `"${node.label}" has a ${ne.leadTimeRisk.toLowerCase()} lead-time risk. ` +
        (node.leadTimeDays
          ? `Lead time is ${node.leadTimeDays} days.`
          : "No lead-time data is available — treat as high risk.") +
        " Consider confirming stock availability or selecting an in-stock alternative.",
      targetNodeIds: [node.id],
      actionPayload: { action: "REVIEW_LEAD_TIME", nodeId: node.id, leadTimeDays: node.leadTimeDays },
    });
  }

  // ── Critical path alert ───────────────────────────────────────────────────
  const cp = evaluation.metrics.criticalPathLeadTimeDays;
  if (cp > 45) {
    recommendations.push({
      id: randomUUID(),
      kind: "LEAD_TIME_ALERT",
      priority: "HIGH",
      title: `Critical path delivery is ${cp} days`,
      reasoning: `The longest dependency chain on this quote requires ${cp} days from order to completion. Review REQUIRES chains for parallel execution opportunities.`,
      targetNodeIds: [],
      actionPayload: { action: "REVIEW_CRITICAL_PATH", criticalPathDays: cp },
    });
  }

  // ── Constraint violations as warnings ────────────────────────────────────
  for (const violation of violations) {
    if (violation.severity === "INFO") continue;
    recommendations.push({
      id: randomUUID(),
      kind: "WARNING_ALERT",
      priority: violation.severity === "ERROR" ? "CRITICAL" : "HIGH",
      title: `Constraint violation: ${violation.constraintName}`,
      reasoning: violation.message + (violation.suggestedFix ? ` Suggested fix: ${violation.suggestedFix}` : ""),
      targetNodeIds: violation.involvedNodeIds,
      actionPayload: {
        action: "FIX_VIOLATION",
        constraintId: violation.constraintId,
        suggestedFix: violation.suggestedFix,
      },
    });
  }

  // ── Heavy items with no freight node ─────────────────────────────────────
  const hasFreightNode = graph.nodes.some((n) => n.kind === "FREIGHT");
  const heavyItems = graph.nodes.filter(
    (n) => (n.weightKg ?? 0) > 20 && n.kind === "PRODUCT_VARIANT",
  );
  if (heavyItems.length > 0 && !hasFreightNode) {
    recommendations.push({
      id: randomUUID(),
      kind: "WARNING_ALERT",
      priority: "MEDIUM",
      title: `${heavyItems.length} heavy items with no freight node on the quote`,
      reasoning: `Items ${heavyItems.map((n) => `"${n.label}"`).join(", ")} weigh over 20 kg each but no FREIGHT line item is included. This may understate the total quote cost.`,
      targetNodeIds: heavyItems.map((n) => n.id),
      actionPayload: {
        action: "ADD_FREIGHT_NODE",
        affectedNodeIds: heavyItems.map((n) => n.id),
        totalWeightKg: heavyItems.reduce((s, n) => s + (n.weightKg ?? 0) * n.quantity, 0),
      },
    });
  }

  return recommendations;
}
