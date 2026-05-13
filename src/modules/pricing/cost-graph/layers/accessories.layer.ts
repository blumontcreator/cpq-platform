import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { applyValueKind, evaluateConditions } from "../layer-processor";

/**
 * ACCESSORIES — bundled accessory cost (valances, brackets, motors, etc.).
 * Absolute amount per unit is most common; percentage is also supported.
 */
export const accessoriesProcessor: LayerProcessor = {
  kind: "ACCESSORIES",

  process({ layer, runningTotal, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Accessories";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "ACCESSORIES", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }
    const added = applyValueKind(runningTotal, layer);
    return { kind: "ACCESSORIES", label, inputAmount: runningTotal, addedAmount: added, outputAmount: runningTotal + added, skipped: false };
  },
};
