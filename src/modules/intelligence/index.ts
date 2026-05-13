// ── Public API ────────────────────────────────────────────────────────────────

// Engine entry points
export {
  buildIntelligence,
  ingestEvent,
  ingestBatch,
  getQuoteTimeline,
  getFeedbackSignals,
} from "./intelligence-engine";
export type {
  IntelligenceReport,
  IntelligenceSummary,
  BuildIntelligenceOptions,
  IngestEventInput,
} from "./intelligence-engine";

// Events
export { validateEventPayload, buildEventTimeline } from "./events";
export type { ValidationResult, IngestResult } from "./events";

// Analytics
export {
  computeWinRateReport,
  computeMarginReport,
  computeDiscountReport,
  computeSupplierPerformance,
  computeAllSupplierPerformance,
  computeBundleCycleReport,
  computeStrategyEffectivenessReport,
} from "./analytics";

// Learning
export { aggregateSignals, buildWinProbabilityModel, buildStrategyRanking, lookupWinProbability } from "./learning";
export { detectTrend, detectAnomalies, detectAllTrends } from "./learning";

// Profiles
export { buildCustomerProfile } from "./profiles";
export { buildSupplierRiskFactor, buildAllSupplierRiskFactors } from "./profiles";

// Feedback
export { buildFeedbackSignals } from "./feedback";
export type { FeedbackContext } from "./feedback";

// Repository
export { getEventsByQuote, getEventsByKind, countEventsByKind } from "./repository";
export { getQuoteOutcome, getOutcomesByCustomer, getRecentOutcomes } from "./repository";

// Types
export { COMMERCIAL_EVENT_KINDS } from "./types";
export type {
  EventKind,
  CommercialEvent,
  EventPayload,
  QuoteWonPayload,
  QuoteLostPayload,
  QuoteNegotiatedPayload,
  SupplierDelayPayload,
  LossReason,
  EventTimeline,
  OutcomeStatus,
  QuoteOutcome,
  OutcomeSignal,
  SignalType,
  WinRateReport,
  MarginReport,
  DiscountReport,
  SupplierPerformance,
  StrategyEffectiveness,
  StrategyEffectivenessReport,
  BundleCycleReport,
  WinProbabilityModel,
  WinProbabilityBucket,
  PricingConfidenceFactor,
  StrategyRank,
  TrendDirection,
  TrendAnalysis,
  AnomalySignal,
  LearningSignal,
  CustomerBehaviorProfile,
  FeedbackSignals,
  SupplierRiskFactor,
} from "./types";
