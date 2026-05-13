/**
 * Lead-time evaluator.
 *
 * Computes per-node lead-time risk and the graph's critical path.
 * The critical path is the longest chain of cumulative lead times
 * through REQUIRES dependency edges.
 */
import type { QuoteGraph } from "../../types/graph.types";
import type { NodeEvaluation, GraphMetrics, LeadTimeRisk } from "../../types/evaluation.types";
import { criticalPathDays, getEdgeTargets } from "../../graph/graph-validator";

function classifyRisk(leadTimeDays: number): LeadTimeRisk {
  if (leadTimeDays <= 7) return "LOW";
  if (leadTimeDays <= 21) return "MEDIUM";
  if (leadTimeDays <= 45) return "HIGH";
  return "CRITICAL";
}

/** Calculates the longest downstream REQUIRES chain for a single node (memoised). */
function buildNodeDepth(graph: QuoteGraph): Map<string, number> {
  const depth = new Map<string, number>();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  function resolve(id: string): number {
    if (depth.has(id)) return depth.get(id)!;
    const node = nodeById.get(id);
    const self = node?.leadTimeDays ?? 0;
    const deps = getEdgeTargets(graph, id, "REQUIRES");
    const downstream = deps.length ? Math.max(...deps.map(resolve)) : 0;
    const result = self + downstream;
    depth.set(id, result);
    return result;
  }

  for (const node of graph.nodes) resolve(node.id);
  return depth;
}

export function evaluateLeadTime(
  graph: QuoteGraph,
  partials: Partial<NodeEvaluation>[],
): { nodeUpdates: Partial<NodeEvaluation>[]; metrics: Partial<GraphMetrics> } {
  const nodeDepth = buildNodeDepth(graph);

  const nodeUpdates: Partial<NodeEvaluation>[] = graph.nodes.map((node, idx) => {
    const effectiveDays = nodeDepth.get(node.id) ?? 0;
    const leadTimeRisk = classifyRisk(effectiveDays);
    const warnings: string[] = [...(partials[idx]?.warnings ?? [])];
    if (leadTimeRisk === "CRITICAL") {
      warnings.push(`Node "${node.label}" is on the critical path with ${effectiveDays}d lead time`);
    }
    return { ...partials[idx], nodeId: node.id, leadTimeRisk, warnings };
  });

  return {
    nodeUpdates,
    metrics: {
      criticalPathLeadTimeDays: criticalPathDays(graph),
    },
  };
}
