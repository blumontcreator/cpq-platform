/**
 * Strategy runner — converts a fully-loaded cost into a target sell price.
 *
 * The three strategies share this one entry point. Future strategies
 * (AI-assisted, auction, dynamic) add a new case here.
 */
import type { PricingStrategy } from "../types/pricing-strategy.types";
import { priceFromCostAndMargin } from "../types/margin-policy.types";

export interface StrategyOutput {
  targetPrice: number;
  /** Human-readable note for the price trace. */
  note: string;
}

export function runStrategy(
  totalCost: number,
  strategy: PricingStrategy,
): StrategyOutput {
  switch (strategy.kind) {
    case "COST_PLUS": {
      const price = priceFromCostAndMargin(totalCost, strategy.targetMarginPct);
      return {
        targetPrice: price,
        note: `Cost-plus @ ${strategy.targetMarginPct}% target margin`,
      };
    }

    case "MARKET_BASED": {
      const costPlus = priceFromCostAndMargin(totalCost, strategy.fallbackMarginPct);
      if (strategy.marketPriceAnchor == null) {
        return {
          targetPrice: costPlus,
          note: `Market anchor unavailable — fell back to cost-plus @ ${strategy.fallbackMarginPct}%`,
        };
      }
      const anchor = strategy.marketPriceAnchor;
      let price: number;
      if (strategy.capAtMarketPrice) {
        price = Math.min(costPlus, anchor);
      } else {
        price = costPlus;
      }
      return {
        targetPrice: price,
        note: `Market-based: anchor=${anchor}, cap=${strategy.capAtMarketPrice}`,
      };
    }

    case "COMPETITIVE": {
      const competitivePrice =
        strategy.marketPriceAnchor * (1 - strategy.belowMarketPct / 100);
      const minPrice = priceFromCostAndMargin(totalCost, strategy.minimumMarginPct);
      const price = Math.max(competitivePrice, minPrice);
      return {
        targetPrice: price,
        note: `Competitive: ${strategy.belowMarketPct}% below market anchor=${strategy.marketPriceAnchor}`,
      };
    }
  }
}
