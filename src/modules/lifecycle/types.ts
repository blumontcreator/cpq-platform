import type { QuoteEvaluation } from "@/modules/quoting/types/evaluation.types";
import type { OptimizationResult } from "@/modules/simulation/types/optimization.types";
import type { NegotiationGuidance } from "@/modules/negotiation/types";
import type { StrategicPriority } from "@/modules/opportunity/types";

export interface QuoteItemRequest {
  sku: string;
  quantity: number;
  /** Optional list price override — if absent, catalog price is used. */
  listPriceOverride?: number;
  /** Is this item part of a bundle? */
  bundleId?: string;
  isOptional?: boolean;
  isService?: boolean;
  isAccessory?: boolean;
}

export interface LiveQuoteContext {
  opportunityId: string;
  items: QuoteItemRequest[];
  currency?: string;
  operatorUserId: string;
}

/** Scores computed by the lifecycle orchestrator for commercial decision support. */
export interface CommercialScores {
  /** 0–1: profitability relative to target margin. */
  profitabilityScore: number;
  /** 0–1: inverse of operational risk (lead time, supplier reliability). */
  operationalRiskScore: number;
  /** 0–1: inverse of delivery risk (critical path, freight complexity). */
  deliveryRiskScore: number;
  /** 0–1: alignment with strategic account/priority goals. */
  strategicFitScore: number;
  /** 0–1: overall commercial health (weighted composite). */
  overallScore: number;
  /** Narrative explanation for each score. */
  explanations: Record<keyof Omit<CommercialScores, "explanations">, string>;
}

/** Approval requirement derived from governance checks. */
export interface ApprovalRequirement {
  kind: "MARGIN" | "DISCOUNT" | "HIGH_VALUE" | "STRATEGIC" | "OVERRIDE";
  reason: string;
  requiredRole: string;
  urgent: boolean;
}

/** Full governance check result. */
export interface GovernanceCheckResult {
  passed: boolean;
  approvalRequirements: ApprovalRequirement[];
  warnings: string[];
  blockers: string[];
}

/** The complete result of a lifecycle execution. */
export interface LifecycleResult {
  quoteId: string;
  opportunityId: string;
  evaluation: QuoteEvaluation;
  optimizationResult: OptimizationResult;
  governanceCheck: GovernanceCheckResult;
  scores: CommercialScores;
  negotiationGuidance: NegotiationGuidance;
  approvalRequirements: ApprovalRequirement[];
  snapshotId: string;
  executedAt: string;
  durationMs: number;
  trace: string[];
}

/** Input to close a quote outcome. */
export interface CloseOutcomeInput {
  quoteId: string;
  outcome: "WON" | "LOST" | "EXPIRED" | "PARTIALLY_WON";
  realizedRevenue?: number;
  realizedMarginPct?: number;
  realizedDiscount?: number;
  lossReason?: string;
  competitorPrice?: number;
  strategy?: string;
  customerId?: string;
  operatorUserId: string;
  notes?: string;
}

export interface OutcomeResult {
  outcomeId: string;
  quoteId: string;
  outcome: string;
  feedbackLoopTriggered: boolean;
  intelligenceUpdated: boolean;
  eventsEmitted: string[];
}

/** Context for the learning feedback loop. */
export interface FeedbackContext {
  quoteId: string;
  outcome: "WON" | "LOST" | "EXPIRED" | "PARTIALLY_WON";
  realizedMarginPct?: number;
  realizedRevenue?: number;
  realizedDiscount?: number;
  quotedMarginPct: number;
  quotedRevenue: number;
  quotedDiscount: number;
  strategy?: string;
  channel?: string;
  customerId?: string;
  cycleDays?: number;
  lossReason?: string;
  competitorPrice?: number;
  strategicPriority: StrategicPriority;
}
