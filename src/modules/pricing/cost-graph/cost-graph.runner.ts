/**
 * Cost graph runner.
 *
 * Executes an ordered list of CostLayer configs through their processors
 * and returns the full cost breakdown including the total landed cost.
 */
import type { CostLayer, CostLayerResult } from "../types/cost-layer.types";
import type { PricingContext } from "../types/pricing-context.types";
import type { CostBreakdown } from "../types/pricing-result.types";
import { getLayerProcessor } from "./layer-registry";
import { COST_LAYER_KINDS } from "../types/cost-layer.types";

export function runCostGraph(
  layers: CostLayer[],
  context: PricingContext,
  supplierCost: number,
): CostBreakdown {
  // Sort layers by the canonical order defined in COST_LAYER_KINDS.
  const sortedLayers = [...layers].sort(
    (a, b) => COST_LAYER_KINDS.indexOf(a.kind) - COST_LAYER_KINDS.indexOf(b.kind),
  );

  const results: CostLayerResult[] = [];
  let runningTotal = 0;

  for (const layer of sortedLayers) {
    if (!layer.enabled) {
      results.push({
        kind: layer.kind,
        label: layer.label ?? layer.kind,
        inputAmount: runningTotal,
        addedAmount: 0,
        outputAmount: runningTotal,
        skipped: true,
        skipReason: "layer_disabled",
      });
      continue;
    }

    const processor = getLayerProcessor(layer.kind);
    const result = processor.process({
      layer,
      runningTotal,
      supplierCost,
      context,
    });

    results.push(result);
    runningTotal = result.outputAmount;
  }

  return {
    supplierCost,
    totalCost: runningTotal,
    currency: context.currency,
    layers: results,
  };
}
