/**
 * Learning & AI-readiness types.
 *
 * These types represent the higher-order intelligence derived from aggregating
 * raw outcome signals. They are the primary feed for:
 *   1. Optimizer feedback (win-probability model, strategy ranking)
 *   2. Future ML/embedding pipelines
 *   3. Reinforcement learning experiments
 *   4. LLM context injection
 */

// ── Win probability model ─────────────────────────────────────────────────

export interface WinProbabilityBucket {
  marginLow: number;
  marginHigh: number;
  winRate: number;
  sampleSize: number;
  confidence: number;
}

/**
 * Empirical win-probability model built from historical outcomes.
 * Replaces the heuristic in objective-scorer.ts when enough data exists.
 * The optimizer checks `hasEnoughData` before using this model.
 */
export interface WinProbabilityModel {
  buckets: WinProbabilityBucket[];
  hasEnoughData: boolean;
  minSamplePerBucket: number;
  builtAt: string;
  /** Fallback to heuristic if margin is outside the observed range. */
  observedMarginRange: { min: number; max: number };
}

// ── Pricing confidence factor ──────────────────────────────────────────────

export interface PricingConfidenceFactor {
  variantSku: string;
  /** Downward adjustment to pricing confidence due to high discount history. */
  confidencePenalty: number;   // 0–1, subtract from raw confidence
  avgHistoricalDiscount: number;
  sampleSize: number;
  reason: string;
}

// ── Strategy ranking ───────────────────────────────────────────────────────

export interface StrategyRank {
  strategyKind: string;
  rank: number;
  compositeScore: number;    // weighted: winRate + marginRetention
  winRate: number;
  marginRetention: number;
  confidence: number;
  suggestFor: string[];      // e.g. ["DIRECT", "GOLD"]
}

// ── Trend & anomaly ────────────────────────────────────────────────────────

export type TrendDirection = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";

export interface TrendAnalysis {
  metric: string;
  direction: TrendDirection;
  /** Average value in the recent period (e.g., 30d). */
  recentValue: number;
  /** Average value in the baseline period (e.g., 90d). */
  baselineValue: number;
  /** Absolute change. */
  absoluteChange: number;
  /** Percentage change. */
  pctChange: number;
  confidence: number;
  note: string;
}

export interface AnomalySignal {
  metric: string;
  currentValue: number;
  expectedValue: number;
  zScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  detectedAt: string;
  explanation: string;
}

// ── Learning signal (aggregated for LLM/ML injection) ─────────────────────

export interface LearningSignal {
  /** Unique key for this signal in a feature store or prompt context. */
  key: string;
  value: number | string | boolean;
  confidence: number;
  derivedFrom: string[];    // which analytics/models produced this
  validUntil?: string;      // ISO datetime after which the signal should be re-computed
}

// ── Customer behavior profile ─────────────────────────────────────────────

export interface CustomerBehaviorProfile {
  customerId: string;
  // ── Negotiation ────────────────────────────────────────────────────────
  avgDiscountRequested: number;
  avgDiscountGranted: number;
  concessionRate: number;       // granted / requested
  avgNegotiationRounds: number;
  // ── Win/loss ───────────────────────────────────────────────────────────
  winRate: number;
  lostPriceTooHighRate: number;
  changeRequestRate: number;
  // ── Timing ─────────────────────────────────────────────────────────────
  avgCycleDays: number;
  paymentDelayRate: number;
  // ── Profile quality ────────────────────────────────────────────────────
  sampleSize: number;
  confidence: number;
  lastUpdated: string;
}

// ── Feedback signals (optimizer integration) ──────────────────────────────

export interface FeedbackSignals {
  winProbabilityModel?: WinProbabilityModel;
  strategyRanking: StrategyRank[];
  pricingConfidenceFactors: PricingConfidenceFactor[];
  customerProfile?: CustomerBehaviorProfile;
  supplierRiskFactors: SupplierRiskFactor[];
  trends: TrendAnalysis[];
  anomalies: AnomalySignal[];
  generatedAt: string;
  overallConfidence: number;
}

export interface SupplierRiskFactor {
  supplierId: string;
  reliabilityScore: number;         // 0–100
  /** Lead-time confidence multiplier: 0.7 means "add 30% buffer". */
  leadTimeConfidenceMultiplier: number;
  recentDelayRate: number;
  recentIssueRate: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  note: string;
}
