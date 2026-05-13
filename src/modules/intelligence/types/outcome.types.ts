/**
 * Outcome types.
 *
 * QuoteOutcome is the commercial result of a quote lifecycle.
 * OutcomeSignal is a derived metric (confidence-weighted) from multiple outcomes.
 */

export type OutcomeStatus = "WON" | "LOST" | "EXPIRED" | "PENDING";

export interface QuoteOutcome {
  id: string;
  quoteId: string;
  outcome: OutcomeStatus;

  // ── Quoted vs realized ──────────────────────────────────────────────────
  quotedRevenue: number;
  quotedMarginPct: number;
  quotedDiscount: number;
  realizedRevenue?: number;
  realizedMarginPct?: number;
  realizedDiscount?: number;

  // ── Context ─────────────────────────────────────────────────────────────
  strategy?: string;
  channel?: string;
  customerId?: string;
  quotedAt: Date;
  closedAt?: Date;
  cycleDays?: number;
  lossReason?: string;
  competitorPrice?: number;
}

// ── Outcome signal ─────────────────────────────────────────────────────────

export interface OutcomeSignal {
  /** e.g. "win_rate_direct_channel", "avg_discount_gold_tier" */
  signalKey: string;
  signalType: SignalType;
  value: number;
  /** 0–1 confidence based on sample size and recency. */
  confidence: number;
  sampleSize: number;
  /** ISO period key: "30d" | "90d" | "1y" | "all" */
  period: string;
  updatedAt: string;
  /** Raw evidence supporting this signal. */
  supportingValues?: number[];
}

export type SignalType =
  | "WIN_RATE"
  | "REALIZED_MARGIN"
  | "DISCOUNT_RATE"
  | "CYCLE_DURATION"
  | "MARGIN_RETENTION"
  | "LEAD_TIME_ACCURACY"
  | "SUPPLIER_RELIABILITY"
  | "BUNDLE_SUCCESS"
  | "ATTACH_RATE";
