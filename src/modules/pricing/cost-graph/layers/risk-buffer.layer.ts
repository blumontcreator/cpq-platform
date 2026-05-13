import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { applyValueKind, evaluateConditions } from "../layer-processor";

/**
 * RISK_BUFFER — a general contingency buffer applied to the total loaded cost.
 * Accounts for price volatility, supply disruptions, currency swings, etc.
 * Typically 1–5%. Applied last before the strategy converts cost to sell price.
 */
export const riskBufferProcessor: LayerProcessor = {
  kind: "RISK_BUFFER",

  process({ layer, runningTotal, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Risk Buffer";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "RISK_BUFFER", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }
    const added = applyValueKind(runningTotal, layer);
    return { kind: "RISK_BUFFER", label, inputAmount: runningTotal, addedAmount: added, outputAmount: runningTotal + added, skipped: false };
  },
};
