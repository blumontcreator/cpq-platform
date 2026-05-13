/**
 * Operational complexity evaluator.
 *
 * Scores each node's operational burden on a 0–10 scale using:
 *   - Node kind base scores
 *   - Installation hours
 *   - Motorization attributes
 *   - REQUIRES / SHARES_INSTALLATION edge density
 *
 * Graph-level complexity is the weighted average, not the sum,
 * so small quotes with simple nodes stay low-complexity.
 */
import type { QuoteGraph } from "../../types/graph.types";
import type { NodeEvaluation, GraphMetrics, ComplexityLevel } from "../../types/evaluation.types";

const KIND_BASE_SCORE: Record<string, number> = {
  PRODUCT_VARIANT:  2,
  ACCESSORY:        1.5,
  SERVICE:          2.5,
  INSTALLATION:     4,
  WARRANTY:         1,
  FREIGHT:          2,
  BUNDLE:           3,
  DISCOUNT:         0.5,
  SURCHARGE:        0.5,
};

function toComplexityLevel(score: number): ComplexityLevel {
  if (score <= 2) return "SIMPLE";
  if (score <= 4) return "MODERATE";
  if (score <= 7) return "COMPLEX";
  return "HIGHLY_COMPLEX";
}

export function evaluateComplexity(
  graph: QuoteGraph,
  partials: Partial<NodeEvaluation>[],
): { nodeUpdates: Partial<NodeEvaluation>[]; metrics: Partial<GraphMetrics> } {
  const requiresDegree = new Map<string, number>(); // how many REQUIRES edges involve this node
  const installationShared = new Map<string, number>();

  for (const edge of graph.edges) {
    if (edge.kind === "REQUIRES") {
      requiresDegree.set(edge.fromNodeId, (requiresDegree.get(edge.fromNodeId) ?? 0) + 1);
    }
    if (edge.kind === "SHARES_INSTALLATION") {
      installationShared.set(edge.fromNodeId, (installationShared.get(edge.fromNodeId) ?? 0) + 1);
      installationShared.set(edge.toNodeId, (installationShared.get(edge.toNodeId) ?? 0) + 1);
    }
  }

  let totalInstallationHours = 0;
  const nodeUpdates: Partial<NodeEvaluation>[] = graph.nodes.map((node, idx) => {
    let score = KIND_BASE_SCORE[node.kind] ?? 1;

    // Installation hours add complexity
    if (node.installationHours) {
      totalInstallationHours += node.installationHours * node.quantity;
      score += Math.min(node.installationHours / 2, 2); // up to +2 for complex installs
    }

    // Motorized products are operationally more demanding
    const attrs = node.attributes as Record<string, unknown> | undefined;
    const motorized = (attrs?.extracted as Record<string, unknown> | undefined)?.motorization;
    if (motorized && (motorized as Record<string, unknown>)?.value) score += 1;

    // Dense REQUIRES dependencies mean tighter coordination
    score += Math.min((requiresDegree.get(node.id) ?? 0) * 0.5, 2);

    // Shared installation reduces individual complexity slightly
    if (installationShared.has(node.id)) score = Math.max(score - 0.5, 0);

    // Clamp to 0–10
    const complexityScore = Math.min(Math.round(score * 10) / 10, 10);

    return {
      ...partials[idx],
      nodeId: node.id,
      complexityScore,
      complexityLevel: toComplexityLevel(complexityScore),
    };
  });

  const scores = nodeUpdates.map((n) => n.complexityScore ?? 0);
  const overallComplexityScore = scores.length
    ? Math.min(Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10, 10)
    : 0;

  return {
    nodeUpdates,
    metrics: {
      overallComplexityScore,
      complexityLevel: toComplexityLevel(overallComplexityScore),
      totalInstallationHours,
    },
  };
}
