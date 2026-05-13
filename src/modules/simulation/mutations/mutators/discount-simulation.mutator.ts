import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../../quoting/types/graph.types";
import type { DiscountSimulationParams } from "../../types/scenario.types";

export function applyDiscountSimulation(
  graph: QuoteGraph,
  params: DiscountSimulationParams,
): QuoteGraph {
  const totalRevenue = graph.nodes
    .filter((n) => n.kind !== "DISCOUNT")
    .reduce((s, n) => s + n.unitPrice * n.quantity, 0);

  let discountAmount = 0;
  if (params.discountAmount != null) {
    discountAmount = params.discountAmount;
  } else if (params.discountPct != null) {
    discountAmount = totalRevenue * (params.discountPct / 100);
  }

  const label = params.label ?? `Discount (${params.discountPct ?? ""}%)`;
  const newDiscountNode = {
    id: params.existingDiscountNodeId ?? randomUUID(),
    kind: "DISCOUNT" as const,
    label,
    quantity: 1,
    unitCost: 0,
    unitPrice: -Math.abs(discountAmount),
    currency: graph.context.currency,
    isRequired: false,
    isOptional: false,
    isMandatoryService: false,
  };

  if (params.existingDiscountNodeId) {
    return {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === params.existingDiscountNodeId ? newDiscountNode : n,
      ),
    };
  }

  return { ...graph, nodes: [...graph.nodes, newDiscountNode] };
}
