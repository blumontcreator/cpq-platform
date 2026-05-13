/**
 * Rule engine.
 *
 * Applies a sorted list of PricingRules to a price value within a PricingContext.
 * Returns the final adjusted price and the full list of applied rules for tracing.
 *
 * Evaluation order: rules sorted by priority (ascending = higher priority first).
 * Exclusive rules: if a rule is exclusive and matches, no further rules of the
 * same RuleKind are evaluated.
 */
import type { PricingRule, AppliedRule, RuleEffect } from "../types/pricing-rule.types";
import type { PricingContext } from "../types/pricing-context.types";
import { ruleMatchesContext } from "./rule-evaluator";

function applyEffect(price: number, effect: RuleEffect): number {
  switch (effect.kind) {
    case "discount_pct":
      return price * (1 - effect.value / 100);
    case "discount_abs":
      return price - effect.value;
    case "surcharge_pct":
      return price * (1 + effect.value / 100);
    case "surcharge_abs":
      return price + effect.value;
    case "set_price":
      return effect.value;
    case "floor_price":
      return Math.max(price, effect.value);
    case "ceil_price":
      return Math.min(price, effect.value);
  }
}

export interface RuleEngineResult {
  finalPrice: number;
  appliedRules: AppliedRule[];
}

export function applyRules(
  basePrice: number,
  rules: PricingRule[],
  context: PricingContext,
): RuleEngineResult {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const appliedRules: AppliedRule[] = [];
  const exhaustedKinds = new Set<string>();

  let price = basePrice;

  for (const rule of sorted) {
    if (exhaustedKinds.has(rule.kind)) continue;
    if (!ruleMatchesContext(rule, context)) continue;

    const priceIn = price;
    for (const effect of rule.effects) {
      price = applyEffect(price, effect);
    }
    // Never let rules drive price below zero
    price = Math.max(price, 0);

    appliedRules.push({
      ruleId: rule.id,
      ruleName: rule.name,
      kind: rule.kind,
      priceIn,
      priceOut: price,
      effectsApplied: rule.effects,
      note: rule.description,
    });

    if (rule.exclusive) {
      exhaustedKinds.add(rule.kind);
    }
  }

  return { finalPrice: price, appliedRules };
}
