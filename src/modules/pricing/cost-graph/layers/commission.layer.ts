import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { evaluateConditions } from "../layer-processor";

/**
 * COMMISSION — sales commission baked into the cost base.
 *
 * Commission is tricky: it's typically a % of the *sell* price, not cost.
 * We model it as a cost uplift using the formula:
 *   uplift = cost × commissionPct / (100 - commissionPct)
 *
 * This ensures the commission is correctly reflected as a % of sell price
 * when margin is subsequently applied.
 *
 * valueKind=percentage, value = commission % of sell price (e.g. 10).
 */
export const commissionProcessor: LayerProcessor = {
  kind: "COMMISSION",

  process({ layer, runningTotal, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Sales Commission";
    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "COMMISSION", label, inputAmount: runningTotal, addedAmount: 0, outputAmount: runningTotal, skipped: true, skipReason: reason };
    }

    const pct = Math.min(Math.max(layer.value, 0), 99);
    // Commission uplift formula: cost / (1 - pct/100) - cost
    const uplift = runningTotal * (pct / (100 - pct));
    return {
      kind: "COMMISSION",
      label,
      inputAmount: runningTotal,
      addedAmount: uplift,
      outputAmount: runningTotal + uplift,
      skipped: false,
      note: `${pct}% of sell price (uplifted on cost)`,
    };
  },
};
