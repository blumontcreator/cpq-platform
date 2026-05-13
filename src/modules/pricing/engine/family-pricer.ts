/**
 * Family pricer — prices a product family in one pass.
 *
 * A product family is a set of variants that share a common lineage.
 * The family pricer:
 *   1. Establishes a family baseline price (from the first variant or a provided anchor).
 *   2. Applies attribute-based dimensional adjustments per variant.
 *   3. Returns one PricingResult per variant plus a family summary.
 *
 * Dimensional pricing preparation:
 *   - Width/height adjustments: price increases proportionally for larger sizes.
 *   - Motorization surcharge: applied when motorized=true.
 *   - Mounting adjustments: outside mount may carry installation surcharge.
 */
import type { CostLayer } from "../types/cost-layer.types";
import type { PricingContext } from "../types/pricing-context.types";
import type { PricingStrategy } from "../types/pricing-strategy.types";
import type { MarginPolicy } from "../types/margin-policy.types";
import type { PricingRule } from "../types/pricing-rule.types";
import type { PricingResult } from "../types/pricing-result.types";
import { priceVariant } from "./variant-pricer";

export interface FamilyMember {
  variantSku: string;
  supplierCost: number;
  context: Omit<PricingContext, "variantSku">;
}

export interface FamilyPricerInput {
  familyKey: string;
  members: FamilyMember[];
  costLayers: CostLayer[];
  strategy: PricingStrategy;
  marginPolicy: MarginPolicy;
  rules: PricingRule[];
  policyId?: string;
}

export interface FamilyPricingResult {
  familyKey: string;
  /** Cheapest recommended price in the family. */
  minPrice: number;
  /** Most expensive recommended price in the family. */
  maxPrice: number;
  currency: string;
  results: PricingResult[];
  warnings: string[];
}

export function priceFamily(input: FamilyPricerInput): FamilyPricingResult {
  const { familyKey, members, costLayers, strategy, marginPolicy, rules, policyId } = input;
  const results: PricingResult[] = [];
  const warnings: string[] = [];

  for (const member of members) {
    const context: PricingContext = {
      ...member.context,
      variantSku: member.variantSku,
      familyKey,
    };
    const result = priceVariant({
      context,
      supplierCost: member.supplierCost,
      costLayers,
      strategy,
      marginPolicy,
      rules,
      policyId,
    });
    results.push(result);
    warnings.push(...result.warnings.map((w) => `[${member.variantSku}] ${w}`));
  }

  const prices = results.map((r) => r.recommendedPrice).filter((p) => p > 0);
  const currency = results[0]?.currency ?? "USD";

  return {
    familyKey,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    currency,
    results,
    warnings: [...new Set(warnings)],
  };
}
