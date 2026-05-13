import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { applyValueKind, evaluateConditions } from "../layer-processor";

/**
 * WARRANTY — support and warranty reserve.
 * Typically 1–3% of unit cost. Motor products may carry a higher rate.
 */
export const warrantyProcessor: LayerProcessor = {
  kind: "WARRANTY",

  process({ layer, runningTotal, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Support & Warranty";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "WARRANTY", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }
    const added = applyValueKind(runningTotal, layer);
    return { kind: "WARRANTY", label, inputAmount: runningTotal, addedAmount: added, outputAmount: runningTotal + added, skipped: false };
  },
};
