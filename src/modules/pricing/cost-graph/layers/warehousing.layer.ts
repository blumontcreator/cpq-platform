import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { applyValueKind, evaluateConditions } from "../layer-processor";

/**
 * WAREHOUSING — storage and handling overhead.
 * Applied as a percentage of the fully-landed cost so far.
 */
export const warehousingProcessor: LayerProcessor = {
  kind: "WAREHOUSING",

  process({ layer, runningTotal, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Warehousing & Handling";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "WAREHOUSING", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }
    const added = applyValueKind(runningTotal, layer);
    return { kind: "WAREHOUSING", label, inputAmount: runningTotal, addedAmount: added, outputAmount: runningTotal + added, skipped: false };
  },
};
