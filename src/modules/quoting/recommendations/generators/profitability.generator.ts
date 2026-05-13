/**
 * Profitability improvement generator.
 *
 * Identifies nodes with margin below a threshold (graph context or 20% default)
 * and generates suggestions to raise their price or replace them.
 *
 * Also flags if the overall quote margin is below the context minimum.
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../types/graph.types";
import type { QuoteEvaluation } from "../../types/evaluation.types";
import type { QuoteRecommendation } from "../../types/recommendation.types";

const DEFAULT_MARGIN_FLOOR_PCT = 20;

export function generateProfitabilityRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
): QuoteRecommendation[] {
  const recommendations: QuoteRecommendation[] = [];
  const floor = graph.context.minimumMarginPct ?? DEFAULT_MARGIN_FLOOR_PCT;

  // Per-node: flag lines below the floor (excluding DISCOUNT nodes)
  for (const ne of evaluation.nodeEvaluations) {
    const node = graph.nodes.find((n) => n.id === ne.nodeId);
    if (!node || node.kind === "DISCOUNT" || node.kind === "SURCHARGE") continue;
    if (ne.lineRevenue <= 0) continue;

    if (ne.effectiveMarginPct < floor) {
      const gap = floor - ne.effectiveMarginPct;
      const requiredPriceIncrease = ne.lineCost > 0
        ? ne.lineCost / (1 - floor / 100) - ne.lineRevenue
        : 0;

      recommendations.push({
        id: randomUUID(),
        kind: "PROFITABILITY_IMPROVEMENT",
        priority: ne.effectiveMarginPct < 0 ? "CRITICAL" : "HIGH",
        title: `Improve margin on "${node.label}" (${ne.effectiveMarginPct.toFixed(1)}% → ${floor}%)`,
        reasoning: `"${node.label}" has an effective margin of ${ne.effectiveMarginPct.toFixed(1)}%, which is ${gap.toFixed(1)}pp below the ${floor}% floor. ` +
          (requiredPriceIncrease > 0
            ? `A price increase of ~${graph.context.currency} ${requiredPriceIncrease.toFixed(2)} would bring it to the floor.`
            : "Consider reviewing the cost structure."),
        targetNodeIds: [ne.nodeId],
        estimatedImpact: {
          marginPctChange: gap,
          revenueChange: requiredPriceIncrease,
          currency: graph.context.currency,
        },
        actionPayload: {
          action: "RAISE_PRICE",
          nodeId: ne.nodeId,
          currentPrice: node.unitPrice,
          suggestedMinPrice: node.unitCost > 0 ? node.unitCost / (1 - floor / 100) : undefined,
        },
      });
    }
  }

  // Graph-level margin alert
  if (evaluation.metrics.overallMarginPct < floor) {
    recommendations.push({
      id: randomUUID(),
      kind: "PROFITABILITY_IMPROVEMENT",
      priority: "HIGH",
      title: `Overall quote margin ${evaluation.metrics.overallMarginPct.toFixed(1)}% is below ${floor}%`,
      reasoning: `The full quote delivers a ${evaluation.metrics.overallMarginPct.toFixed(1)}% gross margin, below the ${floor}% policy floor. ` +
        "Review low-margin lines, apply selective price increases, or negotiate better supplier costs.",
      targetNodeIds: [],
      estimatedImpact: {
        marginPctChange: floor - evaluation.metrics.overallMarginPct,
        currency: graph.context.currency,
      },
    });
  }

  return recommendations;
}
