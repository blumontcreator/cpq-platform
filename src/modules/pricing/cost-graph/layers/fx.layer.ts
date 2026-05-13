import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { evaluateConditions } from "../layer-processor";

/**
 * FX_CONVERSION — converts the running total from supplier currency to target currency.
 *
 * valueKind=factor: layer.value is the FX rate (e.g. 1.08 for USD→EUR 1.08 rate).
 * context.fxRate takes precedence over layer.value when present.
 */
export const fxConversionProcessor: LayerProcessor = {
  kind: "FX_CONVERSION",

  process({ layer, runningTotal, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "FX Conversion";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "FX_CONVERSION", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }

    const rate = context.fxRate ?? layer.value;
    if (!rate || rate === 1) {
      return { kind: "FX_CONVERSION", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: "rate_is_1" };
    }

    const converted = runningTotal * rate;
    const delta = converted - runningTotal;
    return {
      kind: "FX_CONVERSION",
      label,
      inputAmount: runningTotal,
      addedAmount: delta,
      outputAmount: converted,
      skipped: false,
      note: `rate=${rate}`,
    };
  },
};
