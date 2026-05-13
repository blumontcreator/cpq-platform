import type { QuoteGraph } from "../../../quoting/types/graph.types";
import type { SupplierSwapParams } from "../../types/scenario.types";

export function applySupplierSwap(graph: QuoteGraph, params: SupplierSwapParams): QuoteGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== params.nodeId) return node;
      return {
        ...node,
        variantSku: params.newVariantSku,
        label: params.newLabel ?? params.newVariantSku,
        unitCost: params.newUnitCost,
        unitPrice: params.newUnitPrice,
        leadTimeDays: params.newLeadTimeDays ?? node.leadTimeDays,
        weightKg: params.newWeightKg ?? node.weightKg,
        pricingResult: undefined, // invalidated by the swap
      };
    }),
  };
}
