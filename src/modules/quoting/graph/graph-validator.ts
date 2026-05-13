/**
 * Graph structural validator.
 *
 * Checks the graph for structural problems before it reaches the evaluation engine:
 *   - Duplicate node ids
 *   - Edge references to non-existent nodes
 *   - REQUIRES cycles (would create deadlock in dependency resolution)
 */
import type { QuoteGraph } from "../types/graph.types";

export interface GraphValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export function validateGraphStructure(graph: QuoteGraph): GraphValidationError[] {
  const errors: GraphValidationError[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // Duplicate node ids
  if (nodeIds.size !== graph.nodes.length) {
    errors.push({ code: "DUPLICATE_NODE_ID", message: "Graph contains duplicate node ids" });
  }

  // Edge referential integrity
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      errors.push({ code: "INVALID_EDGE_FROM", message: `Edge ${edge.id} references unknown fromNodeId: ${edge.fromNodeId}`, edgeId: edge.id });
    }
    if (!nodeIds.has(edge.toNodeId)) {
      errors.push({ code: "INVALID_EDGE_TO", message: `Edge ${edge.id} references unknown toNodeId: ${edge.toNodeId}`, edgeId: edge.id });
    }
  }

  // REQUIRES cycle detection (DFS)
  const requiresAdj = buildAdjacency(graph, "REQUIRES");
  const cycleNodes = detectCycle(requiresAdj, [...nodeIds]);
  for (const nodeId of cycleNodes) {
    errors.push({ code: "REQUIRES_CYCLE", message: `REQUIRES cycle detected involving node: ${nodeId}`, nodeId });
  }

  return errors;
}

function buildAdjacency(graph: QuoteGraph, edgeKind: string): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    if (edge.kind === edgeKind) {
      adj.get(edge.fromNodeId)?.push(edge.toNodeId);
    }
  }
  return adj;
}

function detectCycle(adj: Map<string, string[]>, nodes: string[]): string[] {
  const color = new Map<string, "WHITE" | "GRAY" | "BLACK">(nodes.map((n) => [n, "WHITE"]));
  const cycleNodes: string[] = [];

  function dfs(id: string): boolean {
    color.set(id, "GRAY");
    for (const neighbor of adj.get(id) ?? []) {
      if (color.get(neighbor) === "GRAY") {
        cycleNodes.push(id);
        return true;
      }
      if (color.get(neighbor) === "WHITE" && dfs(neighbor)) return true;
    }
    color.set(id, "BLACK");
    return false;
  }

  for (const node of nodes) {
    if (color.get(node) === "WHITE") dfs(node);
  }
  return cycleNodes;
}

// ── Helpers used by the rest of the quoting module ───────────────────────────

/** Returns all nodes that are direct targets of a given edge kind from a source node. */
export function getEdgeTargets(graph: QuoteGraph, fromNodeId: string, kind: string): string[] {
  return graph.edges
    .filter((e) => e.kind === kind && e.fromNodeId === fromNodeId)
    .map((e) => e.toNodeId);
}

/** Returns all nodes that are direct sources of a given edge kind pointing to a target. */
export function getEdgeSources(graph: QuoteGraph, toNodeId: string, kind: string): string[] {
  return graph.edges
    .filter((e) => e.kind === kind && e.toNodeId === toNodeId)
    .map((e) => e.fromNodeId);
}

/** Compute the longest REQUIRES dependency chain (critical path) in days. */
export function criticalPathDays(graph: QuoteGraph): number {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();

  function longest(id: string): number {
    if (memo.has(id)) return memo.get(id)!;
    const node = nodeById.get(id);
    const self = node?.leadTimeDays ?? 0;
    const deps = getEdgeTargets(graph, id, "REQUIRES");
    const depMax = deps.length ? Math.max(...deps.map(longest)) : 0;
    const result = self + depMax;
    memo.set(id, result);
    return result;
  }

  const all = graph.nodes.map((n) => longest(n.id));
  return all.length ? Math.max(...all) : 0;
}
