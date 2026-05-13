import type { QuoteGraph } from "../../../quoting/types/graph.types";
import type { PricingAdjustmentParams } from "../../types/scenario.types";

export function applyPricingAdjustment(
  graph: QuoteGraph,
  params: PricingAdjustmentParams,
): QuoteGraph {
  const targetIds = new Set(params.nodeIds ?? []);

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const byId = targetIds.size === 0 || targetIds.has(node.id);
      const byKind = !params.applyToKind || node.kind === params.applyToKind;
      if (!byId || !byKind || node.kind === "DISCOUNT") return node;

      let newPrice = node.unitPrice;
      if (params.adjustmentPct != null) {
        newPrice = newPrice * (1 + params.adjustmentPct / 100);
      }
      if (params.adjustmentAmount != null) {
        newPrice = newPrice + params.adjustmentAmount;
      }
      return { ...node, unitPrice: Math.max(0, newPrice) };
    }),
  };
}
