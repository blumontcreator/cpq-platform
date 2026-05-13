import type { LayerProcessor, LayerProcessorInput } from "../layer-processor";
import type { CostLayerResult } from "../../types/cost-layer.types";
import { evaluateConditions } from "../layer-processor";

/**
 * SUPPLIER_COST — the seed layer.
 *
 * When valueKind=override: uses context.supplierCostOverride or the layer.value directly.
 * When valueKind=percentage: treats it as a cost-factor applied to the override/input
 * (e.g. supplier list × 0.6 = dealer cost).
 * Running total before this layer is always 0 (it IS the base).
 */
export const supplierCostProcessor: LayerProcessor = {
  kind: "SUPPLIER_COST",

  process({ layer, context }: LayerProcessorInput): CostLayerResult {
    const label = layer.label ?? "Supplier Cost";

    const { pass, reason } = evaluateConditions(layer, context);
    if (!pass) {
      return { kind: "SUPPLIER_COST", label, inputAmount: 0, addedAmount: 0, outputAmount: 0, skipped: true, skipReason: reason };
    }

    // The supplier cost can come from context override or the layer's configured value.
    let amount: number;
    if (context.supplierCostOverride !== undefined) {
      amount = context.supplierCostOverride;
    } else if (layer.valueKind === "override" || layer.valueKind === "absolute") {
      amount = layer.value;
    } else if (layer.valueKind === "percentage") {
      // Treat as discount-to-list: layer.value % of the configured base
      amount = layer.value;
    } else {
      amount = layer.value;
    }

    return {
      kind: "SUPPLIER_COST",
      label,
      inputAmount: 0,
      addedAmount: amount,
      outputAmount: amount,
      skipped: false,
    };
  },
};
