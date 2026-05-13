import { randomUUID } from "node:crypto";
import type { QuoteGraph, QuoteEdge } from "../../../quoting/types/graph.types";
import type { FreightRegroupParams } from "../../types/scenario.types";

export function applyFreightRegroup(graph: QuoteGraph, params: FreightRegroupParams): QuoteGraph {
  if (params.nodeIds.length < 2) return graph;

  // Remove any existing SHARES_FREIGHT edges between these nodes
  const targetSet = new Set(params.nodeIds);
  const filteredEdges = graph.edges.filter(
    (e) =>
      !(e.kind === "SHARES_FREIGHT" && targetSet.has(e.fromNodeId) && targetSet.has(e.toNodeId)),
  );

  // Add SHARES_FREIGHT edges connecting all nodes in a chain
  const newEdges: QuoteEdge[] = [];
  for (let i = 0; i < params.nodeIds.length - 1; i++) {
    newEdges.push({
      id: randomUUID(),
      kind: "SHARES_FREIGHT",
      fromNodeId: params.nodeIds[i],
      toNodeId: params.nodeIds[i + 1],
    });
  }

  return { ...graph, edges: [...filteredEdges, ...newEdges] };
}
