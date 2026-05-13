/**
 * Optimization engine.
 *
 * Full lifecycle:
 *   1. Evaluate baseline graph
 *   2. Generate candidate scenarios (targeted, strategy-aware)
 *   3. Run simulation for all candidates
 *   4. Score each candidate against weighted objectives
 *   5. Generate combination scenario from top singles
 *   6. Select best scenario
 *   7. Build explainability output: tradeoff analysis, risk analysis, trace
 *
 * Returns a complete OptimizationResult with full audit trail.
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../quoting/types/graph.types";
import type { QuoteConstraint } from "../../quoting/types/constraint.types";
import type { OptimizationResult, OptimizationTrace, TradeoffAnalysis, RiskAnalysis, RiskLevel } from "../types/optimization.types";
import type { StrategyProfile } from "../types/strategy.types";
import type { ScenarioEvaluation } from "../types/scenario.types";
import { runQuoteEngine } from "../../quoting/quote-engine";
import { runSimulation } from "../simulation/simulation-engine";
import { generateCandidates, generateCombinationCandidates } from "./candidate-generator";
import { estimateWinProbability } from "./objective-scorer";

export const OPTIMIZATION_ENGINE_VERSION = 1;

export interface OptimizeInput {
  graph: QuoteGraph;
  strategy: StrategyProfile;
  constraints?: QuoteConstraint[];
}

export async function optimize(input: OptimizeInput): Promise<OptimizationResult> {
  const { graph, strategy, constraints } = input;
  const startedAt = new Date().toISOString();

  // ── 1. Baseline evaluation ─────────────────────────────────────────────────
  const { evaluation: baselineEvaluation } = await runQuoteEngine({
    graph,
    constraints,
    persist: false,
  });

  // ── 2. Generate candidates ─────────────────────────────────────────────────
  const candidates = generateCandidates(graph, baselineEvaluation, strategy);
  const objectives = strategy.objectives;

  // ── 3. Simulate all candidates ────────────────────────────────────────────
  const { ranked: allScenarios } = await runSimulation({
    baselineGraph: graph,
    baselineEvaluation,
    scenarios: candidates,
    constraints,
    objectives,
  });

  // ── 4. Add combination scenario from top singles ──────────────────────────
  const topWithScores = allScenarios.slice(0, strategy.maxMutationDepth).map((s) => ({
    scenario: { id: s.scenarioId, name: s.scenarioName, baselineGraphId: graph.id, mutations: s.appliedMutations },
    score: s.compositeScore,
  }));
  const combinationCandidates = generateCombinationCandidates(topWithScores, strategy.maxMutationDepth);

  let finalRanked = allScenarios;
  if (combinationCandidates.length) {
    const { ranked: combinationResults } = await runSimulation({
      baselineGraph: graph,
      baselineEvaluation,
      scenarios: combinationCandidates,
      constraints,
      objectives,
    });
    finalRanked = [...allScenarios, ...combinationResults].sort(
      (a, b) => b.compositeScore - a.compositeScore,
    );
  }

  const best = finalRanked[0];

  // ── 5. Tradeoff analysis ───────────────────────────────────────────────────
  const tradeoffAnalysis = buildTradeoffAnalysis(best, baselineEvaluation.metrics.overallMarginPct);

  // ── 6. Risk analysis ───────────────────────────────────────────────────────
  const riskAnalysis = buildRiskAnalysis(best, graph);

  // ── 7. Optimization trace ──────────────────────────────────────────────────
  const trace: OptimizationTrace = {
    strategy: strategy.kind,
    objectivesUsed: objectives,
    candidatesGenerated: candidates.length,
    candidatesEvaluated: finalRanked.length,
    bestScenarioId: best.scenarioId,
    topCandidateIds: finalRanked.slice(0, 5).map((s) => s.scenarioId),
    scoringReasoning: best.objectiveScores.map((s) => `[${s.kind}] ${s.reasoning}`),
    optimizedAt: startedAt,
    engineVersion: OPTIMIZATION_ENGINE_VERSION,
  };

  // ── 8. Simulation recommendations ─────────────────────────────────────────
  const recommendations = buildSimulationRecommendations(best, baselineEvaluation, graph);

  // ── 9. Negotiation guidance (deferred to intelligence module) ─────────────
  // Import lazily to avoid circular dep; intelligence module imports types only
  const { buildNegotiationGuidance } = await import("../intelligence/negotiation-guide");
  const negotiationGuidance = buildNegotiationGuidance(
    best.mutatedGraph,
    best.evaluation,
  );

  const confidence = Math.min(
    1,
    (baselineEvaluation.confidence * 0.5 + best.evaluation.confidence * 0.5 +
      (finalRanked.length >= 5 ? 0.1 : 0)),
  );

  return {
    baselineEvaluation,
    bestScenario: best,
    allScenarios: finalRanked,
    appliedStrategy: strategy,
    trace,
    tradeoffAnalysis,
    riskAnalysis,
    negotiationGuidance,
    recommendations,
    confidence,
    warnings: [...baselineEvaluation.warnings, ...best.warnings],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTradeoffAnalysis(
  best: ScenarioEvaluation,
  baselineMarginPct: number,
): TradeoffAnalysis {
  const d = best.delta;
  const bestMargin = best.evaluation.metrics.overallMarginPct;

  const winProbDelta = estimateWinProbability(bestMargin) - estimateWinProbability(baselineMarginPct);

  return {
    marginVsComplexity:
      d.marginPctDelta >= 0 && d.complexityScoreDelta <= 0
        ? `Win-win: margin improved +${d.marginPctDelta.toFixed(1)}pp and complexity reduced by ${Math.abs(d.complexityScoreDelta).toFixed(1)}`
        : d.marginPctDelta >= 0
        ? `Margin improved +${d.marginPctDelta.toFixed(1)}pp at a complexity cost of +${d.complexityScoreDelta.toFixed(1)} points`
        : `Complexity reduced by ${Math.abs(d.complexityScoreDelta).toFixed(1)} at a margin cost of ${Math.abs(d.marginPctDelta).toFixed(1)}pp`,

    marginVsLeadTime:
      d.marginPctDelta >= 0 && d.leadTimeDelta <= 0
        ? `Win-win: margin +${d.marginPctDelta.toFixed(1)}pp and lead time reduced ${Math.abs(d.leadTimeDelta)}d`
        : `Margin ${d.marginPctDelta >= 0 ? "+" : ""}${d.marginPctDelta.toFixed(1)}pp, lead time ${d.leadTimeDelta >= 0 ? "+" : ""}${d.leadTimeDelta}d`,

    marginVsWinProbability:
      `At ${bestMargin.toFixed(1)}% margin, estimated win probability is ${(estimateWinProbability(bestMargin) * 100).toFixed(0)}% ` +
      `(${winProbDelta >= 0 ? "+" : ""}${(winProbDelta * 100).toFixed(0)}pp vs baseline)`,

    overallAssessment:
      best.compositeScore >= 0.7
        ? `Strong optimization: composite score ${(best.compositeScore * 100).toFixed(0)}/100`
        : best.compositeScore >= 0.5
        ? `Moderate optimization: composite score ${(best.compositeScore * 100).toFixed(0)}/100 — review tradeoffs carefully`
        : `Marginal improvement: composite score ${(best.compositeScore * 100).toFixed(0)}/100 — consider a different strategy`,

    mutationTradeoffs: best.appliedMutations.map((m) => ({
      mutationId: m.id,
      mutationLabel: m.label,
      gains: [m.rationale ?? `Applied ${m.kind}`],
      sacrifices:
        m.kind === "DISCOUNT_SIMULATION"
          ? [`Margin reduction of ~${((best.delta.marginPctDelta ?? 0) * -1).toFixed(1)}pp`]
          : m.kind === "LEAD_TIME_TRADEOFF"
          ? [`Increased cost due to expediting premium`]
          : [],
    })),
  };
}

function buildRiskAnalysis(best: ScenarioEvaluation, graph: QuoteGraph): RiskAnalysis {
  const riskFactors: RiskAnalysis["riskFactors"] = [];
  const margin = best.evaluation.metrics.overallMarginPct;
  const floor = graph.context.minimumMarginPct ?? 20;

  if (margin < floor) {
    riskFactors.push({
      factor: `Optimized margin (${margin.toFixed(1)}%) is below the ${floor}% floor`,
      severity: "HIGH",
      mitigation: "Review pricing or reduce cost to restore margin",
    });
  } else if (margin < floor + 5) {
    riskFactors.push({
      factor: `Margin (${margin.toFixed(1)}%) is close to the ${floor}% floor`,
      severity: "MEDIUM",
      mitigation: "Leave a 5pp buffer for negotiation",
    });
  }

  if (best.delta.violationCountDelta > 0) {
    riskFactors.push({
      factor: `Optimization introduced ${best.delta.violationCountDelta} new constraint violation(s)`,
      severity: "HIGH",
      mitigation: "Resolve violations before presenting to customer",
    });
  }

  if (best.evaluation.metrics.criticalPathLeadTimeDays > 45) {
    riskFactors.push({
      factor: `Critical path of ${best.evaluation.metrics.criticalPathLeadTimeDays} days may exceed customer expectations`,
      severity: "MEDIUM",
      mitigation: "Discuss lead-time tradeoff with customer or consider expediting options",
    });
  }

  if (best.evaluation.confidence < 0.7) {
    riskFactors.push({
      factor: `Low confidence (${(best.evaluation.confidence * 100).toFixed(0)}%) in the optimized evaluation`,
      severity: "MEDIUM",
      mitigation: "Ensure all nodes have complete cost and lead-time data",
    });
  }

  const highRiskCount = riskFactors.filter((r) => r.severity === "HIGH").length;
  const overallRisk: RiskLevel =
    highRiskCount >= 2 ? "CRITICAL" : highRiskCount === 1 ? "HIGH" : riskFactors.length > 0 ? "MEDIUM" : "LOW";

  return {
    overallRisk,
    riskFactors,
    confidenceScore: best.evaluation.confidence,
  };
}

function buildSimulationRecommendations(
  best: ScenarioEvaluation,
  baseline: import("../../quoting/types/evaluation.types").QuoteEvaluation,
  graph: QuoteGraph,
): import("../types/optimization.types").SimulationRecommendation[] {
  const recs: import("../types/optimization.types").SimulationRecommendation[] = [];

  // Margin recovery
  if (best.delta.marginPctDelta > 2) {
    recs.push({
      id: randomUUID(),
      kind: "MARGIN_RECOVERY",
      priority: "HIGH",
      title: `Applying best scenario improves margin by ${best.delta.marginPctDelta.toFixed(1)}pp`,
      reasoning: `The ${best.scenarioName} scenario increases margin from ${baseline.metrics.overallMarginPct.toFixed(1)}% to ${best.evaluation.metrics.overallMarginPct.toFixed(1)}%.`,
      estimatedImpact: {
        marginPctChange: best.delta.marginPctDelta,
        revenueChange: best.delta.revenueDelta,
        currency: graph.context.currency,
      },
    });
  }

  // Complexity reduction
  if (best.delta.complexityScoreDelta < -0.5) {
    recs.push({
      id: randomUUID(),
      kind: "COMPLEXITY_REDUCTION",
      priority: "MEDIUM",
      title: `Best scenario reduces operational complexity by ${Math.abs(best.delta.complexityScoreDelta).toFixed(1)} points`,
      reasoning: `Simplifying the quote reduces delivery coordination overhead and installation risk.`,
    });
  }

  // AI strategy prompt — the LLM slot
  recs.push({
    id: randomUUID(),
    kind: "AI_STRATEGY_PROMPT",
    priority: "LOW",
    title: "AI negotiation guidance available",
    reasoning: "Use the negotiation guidance below to brief the sales rep before the next customer interaction.",
    aiPrompt: buildAiStrategyPrompt(best, baseline, graph),
  });

  return recs;
}

function buildAiStrategyPrompt(
  best: ScenarioEvaluation,
  baseline: import("../../quoting/types/evaluation.types").QuoteEvaluation,
  graph: QuoteGraph,
): string {
  return `You are a senior commercial advisor for a CPQ platform.
Baseline quote: ${baseline.metrics.totalRevenue.toFixed(2)} ${graph.context.currency} revenue at ${baseline.metrics.overallMarginPct.toFixed(1)}% margin.
Optimized scenario: "${best.scenarioName}" — ${best.evaluation.metrics.totalRevenue.toFixed(2)} ${graph.context.currency} revenue at ${best.evaluation.metrics.overallMarginPct.toFixed(1)}% margin.
Applied mutations: ${best.appliedMutations.map((m) => m.label).join("; ")}.
Strategy: ${best.evaluation.metrics.overallMarginPct.toFixed(1)}% margin corresponds to ~${(estimateWinProbability(best.evaluation.metrics.overallMarginPct) * 100).toFixed(0)}% estimated win probability.
Task: Advise the sales representative on how to present this quote to the customer, handle price objections, and identify cross-sell opportunities.`;
}
