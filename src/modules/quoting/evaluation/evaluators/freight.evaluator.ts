/**
 * Freight evaluator.
 *
 * Identifies freight consolidation opportunities by grouping nodes that:
 *   1. Are already linked by SHARES_FREIGHT edges, OR
 *   2. Share the same freightClass and are not yet consolidated
 *
 * Estimates a potential saving using a simple consolidation heuristic:
 *   consolidated cost ≈ max(individual freight costs) + 20% of the rest
 *
 * The "freight group id" for each node is set so downstream recommendation
 * generators can produce actionable freight consolidation suggestions.
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../types/graph.types";
import type { NodeEvaluation, FreightGroup, GraphMetrics } from "../../types/evaluation.types";

/** Union-Find for grouping nodes. */
class UnionFind {
  private parent: Map<string, string>;
  constructor(ids: string[]) {
    this.parent = new Map(ids.map((id) => [id, id]));
  }
  find(id: string): string {
    const p = this.parent.get(id) ?? id;
    if (p !== id) {
      const root = this.find(p);
      this.parent.set(id, root);
      return root;
    }
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function evaluateFreight(
  graph: QuoteGraph,
  partials: Partial<NodeEvaluation>[],
): { nodeUpdates: Partial<NodeEvaluation>[]; metrics: Partial<GraphMetrics> } {
  const allIds = graph.nodes.map((n) => n.id);
  const uf = new UnionFind(allIds);

  // Union nodes connected by SHARES_FREIGHT
  for (const edge of graph.edges) {
    if (edge.kind === "SHARES_FREIGHT") {
      uf.union(edge.fromNodeId, edge.toNodeId);
    }
  }

  // Also group by matching freightClass (consolidation opportunity)
  const byFreightClass = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.freightClass) {
      const list = byFreightClass.get(node.freightClass) ?? [];
      list.push(node.id);
      byFreightClass.set(node.freightClass, list);
    }
  }
  for (const [, ids] of byFreightClass) {
    if (ids.length > 1) {
      for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
    }
  }

  // Build freight groups from union roots
  const groupMap = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const root = uf.find(node.id);
    const list = groupMap.get(root) ?? [];
    list.push(node.id);
    groupMap.set(root, list);
  }

  const freightNodesByKind = new Set<string>(
    graph.nodes.filter((n) => n.kind === "FREIGHT").map((n) => n.id),
  );

  const freightGroups: FreightGroup[] = [];
  let potentialFreightSaving = 0;
  const freightGroupIdByNode = new Map<string, string>();

  for (const [, nodeIds] of groupMap) {
    if (nodeIds.length <= 1) continue;

    // Only create a group if at least one node has freight signals
    const hasFreightSignal = nodeIds.some(
      (id) =>
        freightNodesByKind.has(id) ||
        graph.nodes.find((n) => n.id === id)?.freightClass != null ||
        (graph.nodes.find((n) => n.id === id)?.weightKg ?? 0) > 0,
    );
    if (!hasFreightSignal) continue;

    const groupId = randomUUID();
    const freightNodes = nodeIds
      .map((id) => graph.nodes.find((n) => n.id === id)!)
      .filter(Boolean);

    const individualFreightCosts = freightNodes
      .filter((n) => n.kind === "FREIGHT")
      .map((n) => n.unitPrice * n.quantity);

    const combinedWeightKg = freightNodes.reduce(
      (s, n) => s + (n.weightKg ?? 0) * n.quantity,
      0,
    );

    // Simple saving estimate: consolidate to largest + 20% of rest
    const sortedCosts = [...individualFreightCosts].sort((a, b) => b - a);
    const consolidatedCost = sortedCosts[0] ?? 0 + sortedCosts.slice(1).reduce((s, v) => s + v * 0.2, 0);
    const totalIndividualCost = individualFreightCosts.reduce((s, v) => s + v, 0);
    const saving = Math.max(0, totalIndividualCost - consolidatedCost);

    potentialFreightSaving += saving;
    for (const id of nodeIds) freightGroupIdByNode.set(id, groupId);

    freightGroups.push({
      groupId,
      nodeIds,
      combinedWeightKg,
      consolidatedFreightCost: consolidatedCost,
      potentialSaving: saving,
      freightClass: freightNodes.find((n) => n.freightClass)?.freightClass,
    });
  }

  const nodeUpdates: Partial<NodeEvaluation>[] = partials.map((p, i) => ({
    ...p,
    nodeId: graph.nodes[i].id,
    freightGroupId: freightGroupIdByNode.get(graph.nodes[i].id),
  }));

  return {
    nodeUpdates,
    metrics: {
      freightGroups,
      potentialFreightSaving,
    },
  };
}
