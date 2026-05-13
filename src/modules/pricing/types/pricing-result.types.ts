import type { CostLayerResult } from "./cost-layer.types";
import type { AppliedRule } from "./pricing-rule.types";

/**
 * PricingResult — everything the engine produced for one variant + context.
 *
 * Designed for:
 *   - direct use by quoting (targetPrice, recommendedPrice)
 *   - UI explainability (trace, costBreakdown, appliedRules)
 *   - LLM context injection (warnings, confidence, unresolvedFactors)
 *   - profitability simulation (margin, marginPct, floorPrice)
 */

export interface CostBreakdown {
  /** The supplier base cost used as seed for the cost graph. */
  supplierCost: number;
  /** Fully-loaded cost after all enabled layers. */
  totalCost: number;
  currency: string;
  layers: CostLayerResult[];
}

export interface PriceTrace {
  /** Ordered log of every decision the engine made. */
  steps: PriceTraceStep[];
  /** ISO timestamp of this calculation. */
  calculatedAt: string;
  /** The policy id used (if any). */
  policyId?: string;
  /** Version of the pricing engine that produced this. */
  engineVersion: number;
}

export interface PriceTraceStep {
  step: number;
  label: string;
  priceIn: number;
  priceOut: number;
  note?: string;
}

export interface PricingResult {
  variantSku: string;
  currency: string;

  // ── Core prices ────────────────────────────────────────────────────────────
  /** Fully-loaded cost (bottom of the cost graph). */
  totalCost: number;
  /** Minimum acceptable sell price (enforced by margin floor). */
  floorPrice: number;
  /** Strategy-derived sell price (cost-plus / market / competitive). */
  targetPrice: number;
  /**
   * Final recommended price after all rules applied.
   * This is what the quote engine should use.
   */
  recommendedPrice: number;

  // ── Margin intel ──────────────────────────────────────────────────────────
  /** Margin in currency units at recommendedPrice. */
  marginAmount: number;
  /** Gross margin % at recommendedPrice. */
  marginPct: number;

  // ── Explainability ────────────────────────────────────────────────────────
  costBreakdown: CostBreakdown;
  appliedRules: AppliedRule[];
  trace: PriceTrace;

  // ── Quality signals ───────────────────────────────────────────────────────
  /** 0–1 confidence in this result (lower when inputs are estimated). */
  confidence: number;
  warnings: string[];
  /** Factors that could not be resolved (feeds future AI prompts). */
  unresolvedFactors: string[];
}
