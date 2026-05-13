/**
 * Dependency evaluator.
 *
 * Validates REQUIRES and EXCLUDES edge semantics:
 *   REQUIRES(A, B) → B must be present in the graph
 *   EXCLUDES(A, B) → A and B cannot both be present
 *
 * Returns structural warnings so the constraint engine can build
 * formal ConstraintViolations from them.
 */
import type { QuoteGraph } from "../../types/graph.types";

export interface DependencyIssue {
  kind: "MISSING_DEPENDENCY" | "EXCLUDED_COMBINATION";
  fromNodeId: string;
  toNodeId: string;
  fromLabel: string;
  toLabel: string;
  message: string;
}

export function evaluateDependencies(
  graph: QuoteGraph,
  // partials not needed by this evaluator — kept for uniform signature
): { issues: DependencyIssue[] } {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const issues: DependencyIssue[] = [];

  for (const edge of graph.edges) {
    if (edge.kind === "REQUIRES") {
      if (!nodeIds.has(edge.toNodeId)) {
        issues.push({
          kind: "MISSING_DEPENDENCY",
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          fromLabel: labelById.get(edge.fromNodeId) ?? edge.fromNodeId,
          toLabel: edge.toNodeId,
          message: `"${labelById.get(edge.fromNodeId)}" requires a node that is not in the graph (${edge.toNodeId})`,
        });
      }
    }

    if (edge.kind === "EXCLUDES") {
      if (nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId)) {
        issues.push({
          kind: "EXCLUDED_COMBINATION",
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          fromLabel: labelById.get(edge.fromNodeId) ?? edge.fromNodeId,
          toLabel: labelById.get(edge.toNodeId) ?? edge.toNodeId,
          message: `"${labelById.get(edge.fromNodeId)}" and "${labelById.get(edge.toNodeId)}" are incompatible but both present`,
        });
      }
    }
  }

  return { issues };
}
