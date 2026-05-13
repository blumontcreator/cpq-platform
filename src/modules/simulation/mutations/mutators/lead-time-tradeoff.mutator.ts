import type { QuoteGraph } from "../../../quoting/types/graph.types";
import type { LeadTimeTradeoffParams } from "../../types/scenario.types";

export function applyLeadTimeTradeoff(
  graph: QuoteGraph,
  params: LeadTimeTradeoffParams,
): QuoteGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== params.nodeId) return node;
      const newCost = node.unitCost * (1 + params.costPremiumPct / 100);
      return {
        ...node,
        unitCost: newCost,
        leadTimeDays: params.newLeadTimeDays,
      };
    }),
  };
}
