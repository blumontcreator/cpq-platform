/**
 * Variant pricer — the core calculation unit.
 *
 * Given a PricingContext, a set of CostLayers, a PricingStrategy,
 * a MarginPolicy, and a list of PricingRules — produces a full PricingResult.
 *
 * This is pure: no DB calls, no I/O. All data must be resolved before calling.
 */
import type { CostLayer } from "../types/cost-layer.types";
import type { PricingContext } from "../types/pricing-context.types";
import type { PricingStrategy } from "../types/pricing-strategy.types";
import type { MarginPolicy } from "../types/margin-policy.types";
import type { PricingRule } from "../types/pricing-rule.types";
import type { PricingResult, PriceTrace, PriceTraceStep } from "../types/pricing-result.types";
import { runCostGraph } from "../cost-graph/cost-graph.runner";
import { runStrategy } from "../strategies/strategy-runner";
import { applyRules } from "../rules/rule-engine";
import { marginFromCostAndPrice, priceFromCostAndMargin } from "../types/margin-policy.types";

export const PRICING_ENGINE_VERSION = 1;

export interface VariantPricerInput {
  context: PricingContext;
  supplierCost: number;
  costLayers: CostLayer[];
  strategy: PricingStrategy;
  marginPolicy: MarginPolicy;
  rules: PricingRule[];
  policyId?: string;
}

export function priceVariant(input: VariantPricerInput): PricingResult {
  const { context, supplierCost, costLayers, strategy, marginPolicy, rules, policyId } = input;
  const warnings: string[] = [];
  const unresolvedFactors: string[] = [];
  const traceSteps: PriceTraceStep[] = [];
  let stepNum = 0;

  function step(label: string, priceIn: number, priceOut: number, note?: string) {
    traceSteps.push({ step: ++stepNum, label, priceIn, priceOut, note });
  }

  // ── Manual override short-circuit ─────────────────────────────────────────
  if (context.manualPriceOverride !== undefined) {
    const p = context.manualPriceOverride;
    const marginPct = marginFromCostAndPrice(supplierCost, p);
    step("Manual Price Override", 0, p, `Bypasses cost graph and all rules`);
    if (marginPct < marginPolicy.floorMarginPct) {
      warnings.push(`manual_override_below_floor_margin:${marginPct.toFixed(1)}%`);
    }
    return buildResult(context, supplierCost, p, p, p, p, [], warnings, unresolvedFactors, traceSteps, costLayers, policyId);
  }

  // ── Cost graph ─────────────────────────────────────────────────────────────
  const costBreakdown = runCostGraph(costLayers, context, supplierCost);
  const totalCost = costBreakdown.totalCost;
  step("Cost Graph Complete", supplierCost, totalCost, `${costBreakdown.layers.filter(l => !l.skipped).length} layers applied`);

  if (supplierCost <= 0) {
    warnings.push("supplier_cost_zero_or_missing");
    unresolvedFactors.push("supplier_cost");
  }

  // ── Pricing strategy ───────────────────────────────────────────────────────
  const strategyOutput = runStrategy(totalCost, strategy);
  let targetPrice = strategyOutput.targetPrice;
  step("Strategy", totalCost, targetPrice, strategyOutput.note);

  // ── Margin floor ──────────────────────────────────────────────────────────
  const floorPrice = priceFromCostAndMargin(totalCost, marginPolicy.floorMarginPct);
  if (targetPrice < floorPrice && marginPolicy.autoEnforceFloor) {
    step("Margin Floor Enforced", targetPrice, floorPrice,
      `Floor margin ${marginPolicy.floorMarginPct}% requires ≥ ${floorPrice.toFixed(2)}`);
    warnings.push(`target_below_floor_adjusted:floor=${floorPrice.toFixed(2)}`);
    targetPrice = floorPrice;
  } else if (targetPrice < floorPrice) {
    warnings.push(`target_below_floor_not_adjusted:floor=${floorPrice.toFixed(2)}`);
  }

  // ── Rules ─────────────────────────────────────────────────────────────────
  const { finalPrice: priceAfterRules, appliedRules } = applyRules(targetPrice, rules, context);
  if (appliedRules.length) {
    step("Rules Applied", targetPrice, priceAfterRules, `${appliedRules.length} rule(s)`);
  }

  // ── Post-rule floor re-check ──────────────────────────────────────────────
  let recommendedPrice = priceAfterRules;
  if (recommendedPrice < floorPrice && marginPolicy.autoEnforceFloor) {
    step("Floor Re-enforced After Rules", recommendedPrice, floorPrice);
    warnings.push(`rules_pushed_below_floor_readjusted`);
    recommendedPrice = floorPrice;
  }

  // ── Warning threshold ────────────────────────────────────────────────────
  const finalMarginPct = marginFromCostAndPrice(totalCost, recommendedPrice);
  if (
    marginPolicy.warningThresholdPct !== undefined &&
    finalMarginPct < marginPolicy.warningThresholdPct
  ) {
    warnings.push(`margin_below_warning_threshold:${finalMarginPct.toFixed(1)}%`);
  }

  return buildResult(
    context, supplierCost, totalCost, floorPrice, targetPrice, recommendedPrice,
    appliedRules, warnings, unresolvedFactors, traceSteps, costLayers, policyId,
  );
}

function buildResult(
  context: PricingContext,
  supplierCost: number,
  totalCost: number,
  floorPrice: number,
  targetPrice: number,
  recommendedPrice: number,
  appliedRules: ReturnType<typeof applyRules>["appliedRules"],
  warnings: string[],
  unresolvedFactors: string[],
  traceSteps: PriceTraceStep[],
  costLayers: CostLayer[],
  policyId?: string,
): PricingResult {
  const marginAmount = recommendedPrice - totalCost;
  const marginPct = marginFromCostAndPrice(totalCost, recommendedPrice);
  const confidence = computeConfidence(supplierCost, warnings);
  const costBreakdown = runCostGraph(costLayers, context, supplierCost);

  const trace: PriceTrace = {
    steps: traceSteps,
    calculatedAt: new Date().toISOString(),
    policyId,
    engineVersion: PRICING_ENGINE_VERSION,
  };

  return {
    variantSku: context.variantSku,
    currency: context.currency,
    totalCost,
    floorPrice,
    targetPrice,
    recommendedPrice,
    marginAmount,
    marginPct,
    costBreakdown,
    appliedRules,
    trace,
    confidence,
    warnings,
    unresolvedFactors,
  };
}

function computeConfidence(supplierCost: number, warnings: string[]): number {
  let score = 1.0;
  if (supplierCost <= 0) score -= 0.4;
  score -= warnings.length * 0.05;
  return Math.max(0, Math.min(1, score));
}
