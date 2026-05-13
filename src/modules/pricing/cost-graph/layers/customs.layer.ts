import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { applyValueKind, evaluateConditions } from "../layer-processor";

/**
 * CUSTOMS — import duties and customs fees.
 *
 * Applied as a percentage of (supplier cost + freight) = landed cost so far.
 * valueKind=percentage is the standard use; absolute is also supported.
 */
export const customsProcessor: LayerProcessor = {
  kind: "CUSTOMS",

  process({ layer, runningTotal, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Import / Customs";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "CUSTOMS", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }

    const added = applyValueKind(runningTotal, layer);
    return {
      kind: "CUSTOMS",
      label,
      inputAmount: runningTotal,
      addedAmount: added,
      outputAmount: runningTotal + added,
      skipped: false,
    };
  },
};
