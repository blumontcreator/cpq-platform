/**
 * Scenario engine — the single public API for the simulation module.
 *
 * Exposes two entry points:
 *
 *   runOptimization  — full lifecycle: generate candidates, simulate, score,
 *                      build intelligence output, optionally persist
 *
 *   runScenarios     — run a set of hand-crafted scenarios (what-if analysis)
 *                      without the auto-candidate generation step
 *
 * Both are pure by default; pass `persist: true` + a PrismaClient to save results.
 */
import type { PrismaClient } from "@prisma/client";
import type { QuoteGraph } from "../quoting/types/graph.types";
import type { QuoteConstraint } from "../quoting/types/constraint.types";
import type { QuoteScenario } from "./types/scenario.types";
import type { OptimizationResult, SimulationRecommendation } from "./types/optimization.types";
import type { StrategyKind } from "./types/strategy.types";
import type { SimulationEngineResult } from "./simulation/simulation-engine";
import { runQuoteEngine } from "../quoting/quote-engine";
import { runSimulation } from "./simulation/simulation-engine";
import { optimize } from "./optimization/optimization-engine";
import { resolveStrategyProfile } from "./optimization/strategy-profiles";
import { saveScenarioRun } from "./repository/scenario-run.repo";
import { generateAdvisoryRecommendations } from "./intelligence/advisor";

// ── Optimization entry point ──────────────────────────────────────────────────

export interface RunOptimizationInput {
  graph: QuoteGraph;
  strategyKind?: StrategyKind;
  constraints?: QuoteConstraint[];
  persist?: boolean;
  prisma?: PrismaClient;
}

export async function runOptimization(
  input: RunOptimizationInput,
): Promise<{ result: OptimizationResult; runId?: string }> {
  const { graph, strategyKind = "BALANCED", constraints, persist = false, prisma } = input;
  const strategy = resolveStrategyProfile(strategyKind);
  const result = await optimize({ graph, strategy, constraints });

  // Enrich with advisory recommendations
  const advisoryRecs: SimulationRecommendation[] = generateAdvisoryRecommendations(
    result.bestScenario.mutatedGraph,
    result.bestScenario.evaluation,
  );
  const enrichedResult: OptimizationResult = {
    ...result,
    recommendations: [...result.recommendations, ...advisoryRecs],
  };

  let runId: string | undefined;
  if (persist && prisma && graph.quoteId) {
    runId = await saveScenarioRun(
      prisma,
      graph.quoteId,
      `${strategyKind} optimization`,
      strategyKind,
      enrichedResult,
    );
  }

  return { result: enrichedResult, runId };
}

// ── What-if simulation entry point ────────────────────────────────────────────

export interface RunWhatIfInput {
  graph: QuoteGraph;
  scenarios: QuoteScenario[];
  strategyKind?: StrategyKind;
  constraints?: QuoteConstraint[];
}

export async function runWhatIf(
  input: RunWhatIfInput,
): Promise<SimulationEngineResult> {
  const { graph, scenarios, strategyKind = "BALANCED", constraints } = input;
  const strategy = resolveStrategyProfile(strategyKind);

  const { evaluation: baselineEvaluation } = await runQuoteEngine({
    graph,
    constraints,
    persist: false,
  });

  return runSimulation({
    baselineGraph: graph,
    baselineEvaluation,
    scenarios,
    constraints,
    objectives: strategy.objectives,
  });
}
