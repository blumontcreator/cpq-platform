/**
 * Simulation engine.
 *
 * Runs a batch of QuoteScenarios against a single baseline graph,
 * returning all ScenarioEvaluations ranked by compositeScore.
 *
 * Designed for:
 *   - what-if analysis (run 3 hand-crafted scenarios)
 *   - optimizer candidate evaluation (run 20 auto-generated candidates)
 *   - future RL experimentation (run thousands of stochastic scenarios)
 */
import type { QuoteGraph } from "../../quoting/types/graph.types";
import type { QuoteEvaluation } from "../../quoting/types/evaluation.types";
import type { QuoteConstraint } from "../../quoting/types/constraint.types";
import type { QuoteScenario, ScenarioEvaluation } from "../types/scenario.types";
import type { OptimizationObjective } from "../types/optimization.types";
import { runScenario } from "./scenario-runner";

export interface SimulationEngineInput {
  baselineGraph: QuoteGraph;
  baselineEvaluation: QuoteEvaluation;
  scenarios: QuoteScenario[];
  constraints?: QuoteConstraint[];
  objectives?: OptimizationObjective[];
}

export interface SimulationEngineResult {
  ranked: ScenarioEvaluation[];  // best → worst by compositeScore
  best: ScenarioEvaluation;
  baselineEvaluation: QuoteEvaluation;
}

export async function runSimulation(
  input: SimulationEngineInput,
): Promise<SimulationEngineResult> {
  const results = await Promise.all(
    input.scenarios.map((scenario) =>
      runScenario({
        scenario,
        baselineGraph: input.baselineGraph,
        baselineEvaluation: input.baselineEvaluation,
        constraints: input.constraints,
        objectives: input.objectives,
      }),
    ),
  );

  const ranked = [...results].sort((a, b) => b.compositeScore - a.compositeScore);

  return {
    ranked,
    best: ranked[0],
    baselineEvaluation: input.baselineEvaluation,
  };
}
