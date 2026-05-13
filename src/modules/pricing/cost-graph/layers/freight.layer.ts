import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { applyValueKind, evaluateConditions } from "../layer-processor";

/**
 * FREIGHT — adds shipping/freight to the running total.
 *
 * valueKind=percentage: X% of supplier cost at this point.
 * valueKind=absolute: flat freight amount per unit.
 */
export const freightProcessor: LayerProcessor = {
  kind: "FREIGHT",

  process({ layer, runningTotal, supplierCost, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Freight";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "FREIGHT", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }

    const added = applyValueKind(
      layer.valueKind === "percentage" ? supplierCost : runningTotal,
      layer,
    );

    return {
      kind: "FREIGHT",
      label,
      inputAmount: runningTotal,
      addedAmount: added,
      outputAmount: runningTotal + added,
      skipped: false,
    };
  },
};
