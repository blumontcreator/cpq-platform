/**
 * Scenario runner.
 *
 * Takes a baseline QuoteGraph + a QuoteScenario, applies all mutations to a
 * clone of the baseline, re-runs the quote evaluation engine, and produces a
 * ScenarioEvaluation with a full delta comparison.
 *
 * Pure function — no DB access, no side effects.
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../quoting/types/graph.types";
import type { QuoteEvaluation } from "../../quoting/types/evaluation.types";
import type { QuoteConstraint } from "../../quoting/types/constraint.types";
import type { QuoteScenario, ScenarioEvaluation, ScenarioDelta, ObjectiveScore } from "../types/scenario.types";
import type { OptimizationObjective } from "../types/optimization.types";
import { cloneGraphWithId } from "./graph-cloner";
import { applyMutations } from "../mutations/mutation-applicator";
import { runQuoteEngine } from "../../quoting/quote-engine";
import { scoreObjective } from "../optimization/objective-scorer";

export const SCENARIO_ENGINE_VERSION = 1;

export interface RunScenarioInput {
  scenario: QuoteScenario;
  baselineGraph: QuoteGraph;
  baselineEvaluation: QuoteEvaluation;
  constraints?: QuoteConstraint[];
  objectives?: OptimizationObjective[];
}

export function buildDelta(
  baseline: QuoteEvaluation,
  mutated: QuoteEvaluation,
): ScenarioDelta {
  const bRev = baseline.metrics.totalRevenue;
  const mRev = mutated.metrics.totalRevenue;
  return {
    revenueDelta: mRev - bRev,
    revenueDeltaPct: bRev !== 0 ? ((mRev - bRev) / bRev) * 100 : 0,
    costDelta: mutated.metrics.totalCost - baseline.metrics.totalCost,
    marginDelta: mutated.metrics.totalMargin - baseline.metrics.totalMargin,
    marginPctDelta: mutated.metrics.overallMarginPct - baseline.metrics.overallMarginPct,
    complexityScoreDelta:
      mutated.metrics.overallComplexityScore - baseline.metrics.overallComplexityScore,
    leadTimeDelta:
      mutated.metrics.criticalPathLeadTimeDays - baseline.metrics.criticalPathLeadTimeDays,
    violationCountDelta: mutated.violations.length - baseline.violations.length,
    recommendationCountDelta: mutated.recommendations.length - baseline.recommendations.length,
  };
}

export async function runScenario(input: RunScenarioInput): Promise<ScenarioEvaluation> {
  const { scenario, baselineGraph, baselineEvaluation, constraints, objectives = [] } = input;
  const scenarioGraphId = randomUUID();
  const simulatedAt = new Date().toISOString();

  // ── Clone + mutate ─────────────────────────────────────────────────────────
  const cloned = cloneGraphWithId(baselineGraph, scenarioGraphId);
  const mutatedGraph = applyMutations(cloned, scenario.mutations);

  // ── Evaluate mutated graph ─────────────────────────────────────────────────
  const { evaluation: mutatedEvaluation } = await runQuoteEngine({
    graph: mutatedGraph,
    constraints,
    persist: false,
  });

  // ── Delta ──────────────────────────────────────────────────────────────────
  const delta = buildDelta(baselineEvaluation, mutatedEvaluation);

  // ── Objective scores ───────────────────────────────────────────────────────
  const objectiveScores: ObjectiveScore[] = objectives.map((obj) =>
    scoreObjective(obj, mutatedEvaluation, baselineEvaluation),
  );

  const totalWeight = objectiveScores.reduce((s, o) => s + o.weight, 0);
  const compositeScore =
    totalWeight > 0
      ? objectiveScores.reduce((s, o) => s + o.weightedScore, 0) / totalWeight
      : 0;

  // ── Trace ──────────────────────────────────────────────────────────────────
  const traceSteps = scenario.mutations.map((m, idx) => ({
    step: idx + 1,
    mutation: `${m.kind}: ${m.label}`,
    before: {},
    after: {},
    note: m.rationale ?? `Applied ${m.kind}`,
  }));

  const warnings: string[] = [];
  if (delta.marginPctDelta < -5) {
    warnings.push(`Margin dropped ${Math.abs(delta.marginPctDelta).toFixed(1)}pp vs baseline`);
  }
  if (delta.violationCountDelta > 0) {
    warnings.push(`Scenario introduced ${delta.violationCountDelta} new constraint violation(s)`);
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    appliedMutations: scenario.mutations,
    mutatedGraph,
    evaluation: mutatedEvaluation,
    delta,
    objectiveScores,
    compositeScore,
    trace: {
      scenarioId: scenario.id,
      steps: traceSteps,
      simulatedAt,
      engineVersion: SCENARIO_ENGINE_VERSION,
    },
    warnings,
  };
}
