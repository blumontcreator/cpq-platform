import type { QuoteNodeKind } from "./graph.types";
import type { ConstraintViolation } from "./constraint.types";
import type { QuoteRecommendation } from "./recommendation.types";

// ── Per-node evaluation ───────────────────────────────────────────────────────

export type LeadTimeRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ComplexityLevel = "SIMPLE" | "MODERATE" | "COMPLEX" | "HIGHLY_COMPLEX";

export interface NodeEvaluation {
  nodeId: string;
  kind: QuoteNodeKind;
  label: string;

  // ── Economics ────────────────────────────────────────────────────────────
  lineRevenue: number;       // unitPrice × quantity
  lineCost: number;          // unitCost × quantity
  lineMargin: number;        // lineRevenue - lineCost
  lineMarginPct: number;     // lineMargin / lineRevenue × 100
  /** Margin uplift/reduction from SUBSIDIZES edges. */
  subsidyReceived: number;
  subsidyGiven: number;
  /** Effective margin after subsidies. */
  effectiveMarginPct: number;

  // ── Operational ──────────────────────────────────────────────────────────
  complexityScore: number;   // 0–10
  complexityLevel: ComplexityLevel;
  leadTimeRisk: LeadTimeRisk;
  /** Shared freight group key (undefined if standalone freight). */
  freightGroupId?: string;

  warnings: string[];
}

// ── Freight groups ────────────────────────────────────────────────────────────

export interface FreightGroup {
  groupId: string;
  nodeIds: string[];
  combinedWeightKg: number;
  consolidatedFreightCost: number;
  /** Saving vs shipping each item separately. */
  potentialSaving: number;
  freightClass?: string;
}

// ── Graph-level metrics ───────────────────────────────────────────────────────

export interface NodeKindSummary {
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  count: number;
}

export interface GraphMetrics {
  // ── Revenue & margin ────────────────────────────────────────────────────
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  overallMarginPct: number;

  /** Margin breakdown by node kind. */
  marginByKind: Partial<Record<QuoteNodeKind, NodeKindSummary>>;

  /** Highest and lowest margin nodes for profitability targeting. */
  highestMarginNodeId: string | null;
  lowestMarginNodeId: string | null;

  // ── Operational ─────────────────────────────────────────────────────────
  overallComplexityScore: number;
  complexityLevel: ComplexityLevel;
  /** Days on the longest REQUIRES dependency chain. */
  criticalPathLeadTimeDays: number;
  totalInstallationHours: number;

  // ── Freight ─────────────────────────────────────────────────────────────
  freightGroups: FreightGroup[];
  potentialFreightSaving: number;
}

// ── Evaluation trace ─────────────────────────────────────────────────────────

export interface EvaluationTraceStep {
  step: number;
  evaluator: string;
  note: string;
  durationMs?: number;
}

export interface EvaluationTrace {
  steps: EvaluationTraceStep[];
  evaluatedAt: string;
  engineVersion: number;
}

// ── Full evaluation ───────────────────────────────────────────────────────────

export interface QuoteEvaluation {
  graphId: string;
  quoteId?: string;
  metrics: GraphMetrics;
  nodeEvaluations: NodeEvaluation[];
  violations: ConstraintViolation[];
  recommendations: QuoteRecommendation[];
  trace: EvaluationTrace;
  /** 0–1 overall confidence in this evaluation. */
  confidence: number;
  warnings: string[];
  /** Tokens/factors that could not be resolved — feeds LLM prompts. */
  unresolvedFactors: string[];
}
