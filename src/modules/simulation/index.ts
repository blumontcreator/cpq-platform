// ── Public API ────────────────────────────────────────────────────────────────

// Engine entry points
export { runOptimization, runWhatIf } from "./scenario-engine";
export type { RunOptimizationInput, RunWhatIfInput } from "./scenario-engine";

// Simulation primitives
export { cloneGraph, cloneGraphWithId } from "./simulation";
export { runScenario, buildDelta } from "./simulation";
export { runSimulation } from "./simulation";
export type { SimulationEngineInput, SimulationEngineResult } from "./simulation";

// Mutations
export { applyMutation, applyMutations } from "./mutations";

// Optimization
export { optimize, OPTIMIZATION_ENGINE_VERSION } from "./optimization";
export { resolveStrategyProfile, STRATEGY_PROFILES } from "./optimization";
export { estimateWinProbability, scoreObjective, scoreAll } from "./optimization";
export {
  AGGRESSIVE_PROFILE,
  BALANCED_PROFILE,
  PREMIUM_PROFILE,
  STRATEGIC_PROFILE,
} from "./optimization";

// Intelligence
export { buildNegotiationGuidance } from "./intelligence";
export {
  generateAdvisoryRecommendations,
  generateMarginRecoveryRecommendations,
  generateBundleImprovementRecommendations,
  generateComplexityReductionRecommendations,
} from "./intelligence";

// Repository
export {
  saveScenarioRun,
  getScenarioRuns,
  getLatestScenarioRun,
  getScenarioRunSummaries,
} from "./repository";
export type { ScenarioRunSummary } from "./repository";

// Types
export { SCENARIO_MUTATION_KINDS } from "./types";
export type {
  ScenarioMutationKind,
  ScenarioMutation,
  QuoteScenario,
  ScenarioDelta,
  ScenarioEvaluation,
  ObjectiveScore,
  ObjectiveKind,
  OptimizationObjective,
  OptimizationResult,
  TradeoffAnalysis,
  RiskAnalysis,
  SimulationRecommendation,
  SimulationRecommendationKind,
  StrategyKind,
  StrategyProfile,
  NegotiationGuidance,
  NodeNegotiationGuidance,
} from "./types";
