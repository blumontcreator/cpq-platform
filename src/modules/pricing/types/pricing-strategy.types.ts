/**
 * PricingStrategy — converts a fully-loaded cost into a sell price.
 *
 * Three strategies are supported out of the box:
 *
 *   COST_PLUS       cost / (1 - targetMarginPct/100)
 *   MARKET_BASED    take the lesser of cost-plus and a market anchor
 *   COMPETITIVE     market anchor × (1 - competitiveBelowMarketPct/100)
 *
 * Future strategies (AI-assisted, auction, dynamic) implement the same interface.
 */

export type StrategyKind = "COST_PLUS" | "MARKET_BASED" | "COMPETITIVE";

export interface CostPlusStrategy {
  kind: "COST_PLUS";
  /** Target margin percentage (0–99). Drives the sell price formula. */
  targetMarginPct: number;
}

export interface MarketBasedStrategy {
  kind: "MARKET_BASED";
  /** External market/MSRP anchor. If null the engine falls back to cost-plus. */
  marketPriceAnchor: number | null;
  /** Used as fallback when market anchor is unavailable. */
  fallbackMarginPct: number;
  /** When true: cap sell price at market anchor even if cost-plus would be lower. */
  capAtMarketPrice: boolean;
}

export interface CompetitiveStrategy {
  kind: "COMPETITIVE";
  /** Market anchor price (MSRP or competitor list). */
  marketPriceAnchor: number;
  /** How far below market to position (0–50). e.g. 10 = 10% below market. */
  belowMarketPct: number;
  /** Never produce a price with margin below this even if competitive target says so. */
  minimumMarginPct: number;
}

export type PricingStrategy =
  | CostPlusStrategy
  | MarketBasedStrategy
  | CompetitiveStrategy;
