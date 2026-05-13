/**
 * Performance analytics types.
 *
 * These are materialized views of commercial performance, computed by the
 * analytics engines from QuoteOutcome and raw event records.
 */

// ── Win-rate analytics ────────────────────────────────────────────────────

export interface WinRateBreakdown {
  dimension: string;   // e.g. "DIRECT", "GOLD", "BALANCED"
  wins: number;
  losses: number;
  expirations: number;
  total: number;
  winRate: number;     // 0–1
  avgCycleDays?: number;
}

export interface WinRateReport {
  overall: WinRateBreakdown;
  byChannel: WinRateBreakdown[];
  byStrategy: WinRateBreakdown[];
  byCustomerTier?: WinRateBreakdown[];
  period: string;
  sampleSize: number;
}

// ── Margin analytics ──────────────────────────────────────────────────────

export interface MarginReport {
  avgQuotedMarginPct: number;
  avgRealizedMarginPct: number;
  /** How much margin survives negotiation: realized / quoted. */
  marginRetentionRate: number;
  marginByChannel: Record<string, { quoted: number; realized: number; retention: number }>;
  marginByStrategy: Record<string, { quoted: number; realized: number; retention: number }>;
  period: string;
  sampleSize: number;
}

// ── Discount analytics ────────────────────────────────────────────────────

export interface DiscountElasticityPoint {
  discountBucket: string;   // e.g. "0-5%", "5-10%", "10-15%"
  winRate: number;
  sampleSize: number;
  avgMarginPct: number;
}

export interface DiscountReport {
  avgDiscountRequested: number;
  avgDiscountGranted: number;
  /** Typical concession rate: granted / requested. */
  concessionRate: number;
  elasticity: DiscountElasticityPoint[];
  byChannel: Record<string, { avgGranted: number; sampleSize: number }>;
  period: string;
  sampleSize: number;
}

// ── Supplier performance ──────────────────────────────────────────────────

export interface SupplierPerformance {
  supplierId: string;
  supplierCode?: string;
  onTimeDeliveryRate: number;
  avgDelayDays: number;
  maxDelayDays: number;
  issueRate: number;
  /** 0–100 composite reliability score. */
  reliabilityScore: number;
  reliabilityTrend: "IMPROVING" | "STABLE" | "DECLINING";
  sampleSize: number;
  confidence: number;
  lastUpdated: string;
}

// ── Bundle & attach analytics ─────────────────────────────────────────────

export interface BundleCycleReport {
  bundleInclusionRate: number;    // pct of won quotes with a BUNDLE node
  avgAttachRate: number;          // avg optional-service inclusion rate
  avgQuoteCycleDays: number;
  medianQuoteCycleDays: number;
  fastestCycleDays: number;
  slowestCycleDays: number;
  period: string;
  sampleSize: number;
}

// ── Strategy effectiveness ────────────────────────────────────────────────

export interface StrategyEffectiveness {
  strategyKind: string;
  sampleSize: number;
  winRate: number;
  avgRealizedMarginPct: number;
  avgDiscountGranted: number;
  avgCycleDays: number;
  /** 0–1 confidence based on sample size (low below 10 outcomes). */
  confidence: number;
  trend: "IMPROVING" | "STABLE" | "DECLINING";
  recommendation: string;
}

export interface StrategyEffectivenessReport {
  strategies: StrategyEffectiveness[];
  bestByWinRate: string;
  bestByMargin: string;
  bestOverall: string;
  period: string;
}
