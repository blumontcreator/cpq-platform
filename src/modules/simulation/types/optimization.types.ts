/**
 * Optimization domain types.
 *
 * OptimizationObjective declares what the optimizer should maximize or minimize.
 * OptimizationResult is the full output: best scenario, all candidates, trace,
 * tradeoff analysis, risk analysis, and negotiation guidance.
 */
import type { ScenarioEvaluation } from "./scenario.types";
import type { StrategyKind, StrategyProfile } from "./strategy.types";

// ── Objective ─────────────────────────────────────────────────────────────

export type ObjectiveKind =
  | "MAXIMIZE_MARGIN"
  | "MAXIMIZE_WIN_PROBABILITY"
  | "MINIMIZE_COMPLEXITY"
  | "MINIMIZE_LEAD_TIME"
  | "MAXIMIZE_ATTACH_RATE"
  | "MAXIMIZE_PROFITABILITY_SCORE";

export interface ObjectiveConstraint {
  operator: "GTE" | "LTE";
  value: number;
}

export interface OptimizationObjective {
  kind: ObjectiveKind;
  /** Relative importance 0–1 (normalized by the engine if weights don't sum to 1). */
  weight: number;
  /** Optional hard constraint applied before scoring. */
  constraint?: ObjectiveConstraint;
}

// ── Tradeoff analysis ──────────────────────────────────────────────────────

export interface MutationTradeoff {
  mutationId: string;
  mutationLabel: string;
  gains: string[];
  sacrifices: string[];
}

export interface TradeoffAnalysis {
  marginVsComplexity: string;
  marginVsLeadTime: string;
  marginVsWinProbability: string;
  overallAssessment: string;
  mutationTradeoffs: MutationTradeoff[];
}

// ── Risk analysis ──────────────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskFactor {
  factor: string;
  severity: RiskLevel;
  mitigation?: string;
}

export interface RiskAnalysis {
  overallRisk: RiskLevel;
  riskFactors: RiskFactor[];
  /** 0–1 confidence in the optimization result. */
  confidenceScore: number;
}

// ── Optimization trace ────────────────────────────────────────────────────

export interface OptimizationTrace {
  strategy: StrategyKind;
  objectivesUsed: OptimizationObjective[];
  candidatesGenerated: number;
  candidatesEvaluated: number;
  bestScenarioId: string;
  topCandidateIds: string[];
  scoringReasoning: string[];
  optimizedAt: string;
  engineVersion: number;
}

// ── Optimization result ───────────────────────────────────────────────────

export interface OptimizationResult {
  /** The un-mutated baseline for comparison. */
  baselineEvaluation: import("../../quoting/types/evaluation.types").QuoteEvaluation;
  /** Scenario with the highest composite score. */
  bestScenario: ScenarioEvaluation;
  /** All evaluated candidate scenarios, ranked best → worst. */
  allScenarios: ScenarioEvaluation[];
  appliedStrategy: StrategyProfile;
  trace: OptimizationTrace;
  tradeoffAnalysis: TradeoffAnalysis;
  riskAnalysis: RiskAnalysis;
  negotiationGuidance: import("./intelligence.types").NegotiationGuidance;
  recommendations: SimulationRecommendation[];
  /** 0–1 overall confidence in the optimization output. */
  confidence: number;
  warnings: string[];
}

// ── Simulation recommendation ─────────────────────────────────────────────

export type SimulationRecommendationKind =
  | "NEGOTIATION_RANGE"
  | "BUNDLE_IMPROVEMENT"
  | "MARGIN_RECOVERY"
  | "COMPLEXITY_REDUCTION"
  | "AI_STRATEGY_PROMPT";

export interface SimulationRecommendation {
  id: string;
  kind: SimulationRecommendationKind;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  reasoning: string;
  /** Structured payload for AI agent consumption. */
  actionPayload?: Record<string, unknown>;
  /** Pre-built LLM prompt for this recommendation. */
  aiPrompt?: string;
  estimatedImpact?: {
    marginPctChange?: number;
    revenueChange?: number;
    currency: string;
  };
}
