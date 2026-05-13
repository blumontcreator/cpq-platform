/**
 * Alternative variant recommendation generator.
 *
 * Suggests swapping a low-confidence or high-cost node for an alternative.
 * Currently works from two signals:
 *   1. A node with a PricingResult that has low confidence (<0.7) — might
 *      have unreliable pricing and a re-assessment is suggested.
 *   2. A node whose pricingResult.unresolvedFactors is non-empty — the
 *      pricing engine could not resolve some attributes; the quote should
 *      flag it for manual review.
 *
 * AI-ready: the actionPayload is structured so an LLM agent can prompt
 * a catalog search for alternatives.
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../types/graph.types";
import type { QuoteEvaluation } from "../../types/evaluation.types";
import type { QuoteRecommendation } from "../../types/recommendation.types";

export function generateAlternativeRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
): QuoteRecommendation[] {
  const recommendations: QuoteRecommendation[] = [];

  for (const node of graph.nodes) {
    if (node.kind !== "PRODUCT_VARIANT" && node.kind !== "ACCESSORY") continue;

    const pricingResult = node.pricingResult;
    if (!pricingResult) continue;

    if (pricingResult.confidence < 0.7) {
      recommendations.push({
        id: randomUUID(),
        kind: "ALTERNATIVE_VARIANT",
        priority: pricingResult.confidence < 0.5 ? "HIGH" : "MEDIUM",
        title: `Low-confidence pricing on "${node.label}" — consider reviewing`,
        reasoning: `The pricing engine has ${(pricingResult.confidence * 100).toFixed(0)}% confidence on SKU "${node.variantSku}". ` +
          (pricingResult.unresolvedFactors?.length
            ? `Unresolved factors: ${pricingResult.unresolvedFactors.join(", ")}.`
            : "Review supplier cost data and ensure the pricing policy is current."),
        targetNodeIds: [node.id],
        actionPayload: {
          action: "REVIEW_OR_REPLACE",
          nodeId: node.id,
          variantSku: node.variantSku,
          pricingConfidence: pricingResult.confidence,
          unresolvedFactors: pricingResult.unresolvedFactors,
          suggestedSearchQuery: `alternatives for ${node.variantSku} category:${node.kind}`,
        },
      });
    }

    if (pricingResult.unresolvedFactors?.length) {
      const ne = evaluation.nodeEvaluations.find((e) => e.nodeId === node.id);
      if (ne && ne.effectiveMarginPct < 25) {
        recommendations.push({
          id: randomUUID(),
          kind: "ALTERNATIVE_VARIANT",
          priority: "LOW",
          title: `Explore alternatives for "${node.label}" with better margin`,
          reasoning: `"${node.label}" (SKU: ${node.variantSku}) has unresolved pricing factors and only ${ne.effectiveMarginPct.toFixed(1)}% margin. ` +
            "Searching for functionally equivalent alternatives may yield a better cost.",
          targetNodeIds: [node.id],
          actionPayload: {
            action: "CATALOG_SEARCH",
            nodeId: node.id,
            variantSku: node.variantSku,
            searchHint: node.attributes,
          },
        });
      }
    }
  }

  return recommendations;
}
