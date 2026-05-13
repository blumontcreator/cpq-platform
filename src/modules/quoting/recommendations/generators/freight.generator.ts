/**
 * Freight consolidation recommendation generator.
 *
 * For each freight group identified by the freight evaluator,
 * generates a recommendation if there is a measurable saving.
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../types/graph.types";
import type { QuoteEvaluation } from "../../types/evaluation.types";
import type { QuoteRecommendation } from "../../types/recommendation.types";

const MIN_SAVING_THRESHOLD = 1; // only generate recommendation if saving > $1

export function generateFreightRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
): QuoteRecommendation[] {
  const recommendations: QuoteRecommendation[] = [];

  for (const group of evaluation.metrics.freightGroups) {
    if (group.potentialSaving < MIN_SAVING_THRESHOLD) continue;

    const nodeLabels = group.nodeIds
      .map((id) => graph.nodes.find((n) => n.id === id)?.label ?? id)
      .join(", ");

    recommendations.push({
      id: randomUUID(),
      kind: "FREIGHT_CONSOLIDATION",
      priority: group.potentialSaving > 100 ? "HIGH" : "MEDIUM",
      title: `Consolidate freight for ${group.nodeIds.length} items — save ~${graph.context.currency} ${group.potentialSaving.toFixed(2)}`,
      reasoning: `Items ${nodeLabels} share the same freight class (${group.freightClass ?? "unknown"}) with a combined weight of ${group.combinedWeightKg.toFixed(1)} kg. ` +
        `Consolidating into a single shipment could save approximately ${graph.context.currency} ${group.potentialSaving.toFixed(2)}.`,
      targetNodeIds: group.nodeIds,
      estimatedImpact: {
        revenueChange: -group.potentialSaving,
        marginChange: group.potentialSaving,
        currency: graph.context.currency,
      },
      actionPayload: {
        action: "CONSOLIDATE_FREIGHT",
        groupId: group.groupId,
        nodeIds: group.nodeIds,
        estimatedConsolidatedCost: group.consolidatedFreightCost,
      },
    });
  }

  return recommendations;
}
