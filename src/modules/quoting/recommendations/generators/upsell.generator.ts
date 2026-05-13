/**
 * Upsell recommendation generator.
 *
 * Scans COMPATIBLE_WITH edges to find products that are compatible
 * with items on the quote but not yet included, and proposes them
 * as upsell opportunities with an estimated revenue impact.
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../types/graph.types";
import type { QuoteRecommendation } from "../../types/recommendation.types";

export function generateUpsellRecommendations(
  graph: QuoteGraph,
): QuoteRecommendation[] {
  const recommendations: QuoteRecommendation[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const edge of graph.edges) {
    if (edge.kind !== "COMPATIBLE_WITH") continue;

    // If the compatible target is NOT on the quote, suggest adding it
    if (!nodeIds.has(edge.toNodeId)) {
      const fromNode = nodeById.get(edge.fromNodeId);
      if (!fromNode) continue;

      recommendations.push({
        id: randomUUID(),
        kind: "UPSELL",
        priority: "MEDIUM",
        title: `Add compatible product to complement "${fromNode.label}"`,
        reasoning: `Node "${fromNode.label}" is marked compatible with "${edge.toNodeId}" which is not on this quote. Adding it may increase total revenue and improve the customer solution.`,
        targetNodeIds: [edge.fromNodeId],
        actionPayload: {
          action: "ADD_NODE",
          compatibleWith: edge.fromNodeId,
          suggestedNodeId: edge.toNodeId,
          edgeLabel: edge.label,
        },
      });
    }
  }

  return recommendations;
}
