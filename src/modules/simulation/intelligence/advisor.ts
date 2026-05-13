/**
 * Commercial advisor.
 *
 * Consolidates margin recovery, bundle improvement, and complexity reduction
 * recommendations into a single module.
 *
 * Each generator returns SimulationRecommendation[] and is designed to be
 * called independently or together via the generateAdvisoryRecommendations
 * entry point.
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../quoting/types/graph.types";
import type { QuoteEvaluation } from "../../quoting/types/evaluation.types";
import type { SimulationRecommendation } from "../types/optimization.types";

const DEFAULT_MARGIN_FLOOR = 20;

// ── Margin recovery ───────────────────────────────────────────────────────────

export function generateMarginRecoveryRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
): SimulationRecommendation[] {
  const recs: SimulationRecommendation[] = [];
  const floor = graph.context.minimumMarginPct ?? DEFAULT_MARGIN_FLOOR;

  for (const ne of evaluation.nodeEvaluations) {
    if (ne.kind === "DISCOUNT" || ne.kind === "SURCHARGE") continue;
    if (ne.lineRevenue <= 0) continue;
    if (ne.effectiveMarginPct >= floor) continue;

    const node = graph.nodes.find((n) => n.id === ne.nodeId);
    if (!node) continue;

    const targetPrice = node.unitCost / (1 - floor / 100);
    const requiredIncrease = targetPrice - node.unitPrice;

    recs.push({
      id: randomUUID(),
      kind: "MARGIN_RECOVERY",
      priority: ne.effectiveMarginPct < 0 ? "CRITICAL" : "HIGH",
      title: `Recover margin on "${node.label}" (${ne.effectiveMarginPct.toFixed(1)}% → ${floor}%)`,
      reasoning:
        `"${node.label}" is at ${ne.effectiveMarginPct.toFixed(1)}% margin, below the ${floor}% floor. ` +
        `Raising unit price by ${graph.context.currency} ${requiredIncrease.toFixed(2)} to ${targetPrice.toFixed(2)} would restore the floor.`,
      estimatedImpact: {
        marginPctChange: floor - ne.effectiveMarginPct,
        revenueChange: requiredIncrease * node.quantity,
        currency: graph.context.currency,
      },
      actionPayload: {
        action: "RAISE_PRICE",
        nodeId: node.id,
        currentPrice: node.unitPrice,
        targetPrice,
      },
    });
  }

  return recs;
}

// ── Bundle improvements ──────────────────────────────────────────────────────

export function generateBundleImprovementRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
): SimulationRecommendation[] {
  const recs: SimulationRecommendation[] = [];

  const bundleNodes = graph.nodes.filter((n) => n.kind === "BUNDLE");
  const productNodes = graph.nodes.filter((n) => n.kind === "PRODUCT_VARIANT");

  // If multiple products and no bundle node: suggest creating one
  if (productNodes.length >= 2 && bundleNodes.length === 0) {
    const totalProductRevenue = productNodes.reduce((s, n) => s + n.unitPrice * n.quantity, 0);
    const suggestedBundleDiscount = totalProductRevenue * 0.05; // 5% bundle incentive

    recs.push({
      id: randomUUID(),
      kind: "BUNDLE_IMPROVEMENT",
      priority: "MEDIUM",
      title: `Create a bundle for ${productNodes.length} products to improve attach rate`,
      reasoning:
        `The quote has ${productNodes.length} product variants with no bundle structure. ` +
        `A ${graph.context.currency} ${suggestedBundleDiscount.toFixed(2)} bundle incentive (5%) could increase perceived value and win probability.`,
      estimatedImpact: {
        revenueChange: -suggestedBundleDiscount,
        marginPctChange: -2,
        currency: graph.context.currency,
      },
      actionPayload: {
        action: "ADD_BUNDLE",
        productNodeIds: productNodes.map((n) => n.id),
        suggestedBundleDiscountAmount: -suggestedBundleDiscount,
      },
    });
  }

  // Existing bundles with negative margin: flag
  for (const bundle of bundleNodes) {
    const ne = evaluation.nodeEvaluations.find((n) => n.nodeId === bundle.id);
    if (ne && ne.effectiveMarginPct < -10) {
      recs.push({
        id: randomUUID(),
        kind: "BUNDLE_IMPROVEMENT",
        priority: "HIGH",
        title: `Bundle "${bundle.label}" is eroding margin — review discount size`,
        reasoning: `The bundle discount is causing a ${Math.abs(ne.effectiveMarginPct).toFixed(1)}% margin drag. Consider reducing the discount or removing the bundle node.`,
        actionPayload: {
          action: "REVIEW_BUNDLE",
          nodeId: bundle.id,
          currentBundlePrice: bundle.unitPrice,
        },
      });
    }
  }

  return recs;
}

// ── Complexity reduction ──────────────────────────────────────────────────────

export function generateComplexityReductionRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
): SimulationRecommendation[] {
  const recs: SimulationRecommendation[] = [];

  if (evaluation.metrics.complexityLevel === "SIMPLE" || evaluation.metrics.complexityLevel === "MODERATE") {
    return recs;
  }

  // Identify highest-complexity non-essential nodes
  const highComplexity = evaluation.nodeEvaluations
    .filter((ne) => ne.complexityScore >= 6)
    .filter((ne) => {
      const node = graph.nodes.find((n) => n.id === ne.nodeId);
      return node && !node.isRequired && !node.isMandatoryService;
    })
    .sort((a, b) => b.complexityScore - a.complexityScore)
    .slice(0, 3);

  for (const ne of highComplexity) {
    const node = graph.nodes.find((n) => n.id === ne.nodeId);
    if (!node) continue;

    recs.push({
      id: randomUUID(),
      kind: "COMPLEXITY_REDUCTION",
      priority: "MEDIUM",
      title: `Remove or simplify "${node.label}" to reduce complexity`,
      reasoning:
        `"${node.label}" has a complexity score of ${ne.complexityScore}/10. ` +
        `Removing or restructuring this node would reduce overall quote complexity from "${evaluation.metrics.complexityLevel}" level.`,
      actionPayload: {
        action: "SIMPLIFY_OR_REMOVE",
        nodeId: node.id,
        complexityScore: ne.complexityScore,
      },
    });
  }

  // Too many REQUIRES edges → suggest parallel delivery
  const requiresEdges = graph.edges.filter((e) => e.kind === "REQUIRES").length;
  if (requiresEdges > graph.nodes.length) {
    recs.push({
      id: randomUUID(),
      kind: "COMPLEXITY_REDUCTION",
      priority: "LOW",
      title: "Simplify dependency chain — too many REQUIRES edges",
      reasoning:
        `The quote has ${requiresEdges} REQUIRES edges across ${graph.nodes.length} nodes, creating a complex dependency graph. ` +
        `Consider restructuring to allow parallel delivery where possible.`,
      actionPayload: { action: "REVIEW_DEPENDENCIES", requiresEdgeCount: requiresEdges },
    });
  }

  return recs;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function generateAdvisoryRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
): SimulationRecommendation[] {
  return [
    ...generateMarginRecoveryRecommendations(graph, evaluation),
    ...generateBundleImprovementRecommendations(graph, evaluation),
    ...generateComplexityReductionRecommendations(graph, evaluation),
  ];
}
