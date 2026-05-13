import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { applyValueKind, evaluateConditions } from "../layer-processor";

/**
 * INSTALLATION — labour / installation cost.
 * For motorized or large-format products, this can be a meaningful absolute cost.
 * May be conditional on motorization attribute (set conditions in the policy).
 */
export const installationProcessor: LayerProcessor = {
  kind: "INSTALLATION",

  process({ layer, runningTotal, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Installation";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "INSTALLATION", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }
    const added = applyValueKind(runningTotal, layer);
    return { kind: "INSTALLATION", label, inputAmount: runningTotal, addedAmount: added, outputAmount: runningTotal + added, skipped: false };
  },
};
