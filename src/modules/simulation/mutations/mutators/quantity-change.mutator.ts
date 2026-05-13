import type { QuoteGraph } from "../../../quoting/types/graph.types";
import type { QuantityChangeParams } from "../../types/scenario.types";

export function applyQuantityChange(graph: QuoteGraph, params: QuantityChangeParams): QuoteGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== params.nodeId) return node;
      return { ...node, quantity: Math.max(0, params.newQuantity) };
    }),
  };
}
