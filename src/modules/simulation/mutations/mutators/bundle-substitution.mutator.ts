import type { QuoteGraph } from "../../../quoting/types/graph.types";
import type { BundleSubstitutionParams } from "../../types/scenario.types";

export function applyBundleSubstitution(
  graph: QuoteGraph,
  params: BundleSubstitutionParams,
): QuoteGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== params.bundleNodeId) return node;
      return {
        ...node,
        label: params.newLabel ?? node.label,
        unitPrice: params.newBundlePrice,
        unitCost: params.newBundleCost ?? node.unitCost,
      };
    }),
  };
}
