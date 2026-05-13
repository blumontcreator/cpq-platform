import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../../quoting/types/graph.types";
import type { ServiceToggleParams } from "../../types/scenario.types";

export function applyServiceToggle(graph: QuoteGraph, params: ServiceToggleParams): QuoteGraph {
  if (params.action === "REMOVE") {
    if (!params.nodeId) return graph;
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => n.id !== params.nodeId),
      edges: graph.edges.filter(
        (e) => e.fromNodeId !== params.nodeId && e.toNodeId !== params.nodeId,
      ),
    };
  }

  // ADD
  if (!params.nodeToAdd) return graph;
  const n = params.nodeToAdd;
  const newNode = {
    id: n.id ?? randomUUID(),
    kind: (n.kind as QuoteGraph["nodes"][number]["kind"]) ?? "SERVICE",
    label: n.label,
    quantity: n.quantity,
    unitCost: n.unitCost,
    unitPrice: n.unitPrice,
    currency: graph.context.currency,
    installationHours: n.installationHours,
    isMandatoryService: n.isMandatoryService ?? false,
    isRequired: false,
    isOptional: false,
  };
  return { ...graph, nodes: [...graph.nodes, newNode] };
}
