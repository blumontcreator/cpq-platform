/**
 * Profitability evaluator.
 *
 * Computes per-node and graph-level revenue, cost, and margin.
 * Accounts for SUBSIDIZES edges which transfer margin between nodes.
 */
import type { QuoteGraph, QuoteNodeKind } from "../../types/graph.types";
import type { NodeEvaluation, GraphMetrics, NodeKindSummary } from "../../types/evaluation.types";

interface SubsidyMap {
  given: Map<string, number>;
  received: Map<string, number>;
}

function buildSubsidyMap(graph: QuoteGraph): SubsidyMap {
  const given = new Map<string, number>();
  const received = new Map<string, number>();

  for (const edge of graph.edges) {
    if (edge.kind !== "SUBSIDIZES" || !edge.weight) continue;
    given.set(edge.fromNodeId, (given.get(edge.fromNodeId) ?? 0) + edge.weight);
    received.set(edge.toNodeId, (received.get(edge.toNodeId) ?? 0) + edge.weight);
  }
  return { given, received };
}

export function evaluateProfitability(
  graph: QuoteGraph,
  partials: Partial<NodeEvaluation>[],
): { nodeUpdates: Partial<NodeEvaluation>[]; metrics: Partial<GraphMetrics> } {
  const subsidies = buildSubsidyMap(graph);

  const nodeUpdates: Partial<NodeEvaluation>[] = graph.nodes.map((node, idx) => {
    const lineRevenue = node.unitPrice * node.quantity;
    const lineCost = node.unitCost * node.quantity;
    const lineMargin = lineRevenue - lineCost;
    const lineMarginPct = lineRevenue !== 0 ? (lineMargin / lineRevenue) * 100 : 0;

    const subsidyReceived = subsidies.received.get(node.id) ?? 0;
    const subsidyGiven = subsidies.given.get(node.id) ?? 0;
    const effectiveRevenue = lineRevenue + subsidyReceived - subsidyGiven;
    const effectiveMarginPct = effectiveRevenue !== 0
      ? ((effectiveRevenue - lineCost) / effectiveRevenue) * 100
      : 0;

    const warnings: string[] = [...(partials[idx]?.warnings ?? [])];
    if (lineMarginPct < 0) warnings.push(`Node "${node.label}" has negative margin (${lineMarginPct.toFixed(1)}%)`);

    return {
      nodeId: node.id,
      lineRevenue,
      lineCost,
      lineMargin,
      lineMarginPct,
      subsidyReceived,
      subsidyGiven,
      effectiveMarginPct,
      warnings,
    };
  });

  // Graph-level aggregates
  const totalRevenue = nodeUpdates.reduce((s, n) => s + (n.lineRevenue ?? 0), 0);
  const totalCost = nodeUpdates.reduce((s, n) => s + (n.lineCost ?? 0), 0);
  const totalMargin = totalRevenue - totalCost;
  const overallMarginPct = totalRevenue !== 0 ? (totalMargin / totalRevenue) * 100 : 0;

  const marginByKind: Partial<Record<QuoteNodeKind, NodeKindSummary>> = {};
  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    const nu = nodeUpdates[i];
    if (!marginByKind[node.kind]) {
      marginByKind[node.kind] = { revenue: 0, cost: 0, margin: 0, marginPct: 0, count: 0 };
    }
    const summary = marginByKind[node.kind]!;
    summary.revenue += nu.lineRevenue ?? 0;
    summary.cost += nu.lineCost ?? 0;
    summary.margin += nu.lineMargin ?? 0;
    summary.count += 1;
  }
  for (const kind of Object.keys(marginByKind) as QuoteNodeKind[]) {
    const s = marginByKind[kind]!;
    s.marginPct = s.revenue !== 0 ? (s.margin / s.revenue) * 100 : 0;
  }

  const sortedByMargin = [...nodeUpdates].sort((a, b) => (b.lineMargin ?? 0) - (a.lineMargin ?? 0));
  const highestMarginNodeId = sortedByMargin[0]?.nodeId ?? null;
  const lowestMarginNodeId = sortedByMargin[sortedByMargin.length - 1]?.nodeId ?? null;

  return {
    nodeUpdates,
    metrics: {
      totalRevenue,
      totalCost,
      totalMargin,
      overallMarginPct,
      marginByKind,
      highestMarginNodeId,
      lowestMarginNodeId,
    },
  };
}
