/**
 * Strategy profile types.
 *
 * A StrategyProfile defines how optimization objectives are weighted.
 * The four built-in profiles cover the main commercial postures:
 *
 *   AGGRESSIVE  — squeeze maximum margin, operational concerns secondary
 *   BALANCED    — equal weighting across margin, win probability, ops
 *   PREMIUM     — premium pricing + high attach rate, not competing on price
 *   STRATEGIC   — win the deal (even at lower margin) to build the relationship
 */
import type { OptimizationObjective } from "./optimization.types";

export type StrategyKind = "AGGRESSIVE" | "BALANCED" | "PREMIUM" | "STRATEGIC" | "CUSTOM";

export interface StrategyProfile {
  kind: StrategyKind;
  name: string;
  description: string;
  objectives: OptimizationObjective[];
  /**
   * Maximum number of mutations the optimizer may combine in a single scenario.
   * Higher = more complex but potentially better result.
   */
  maxMutationDepth: number;
  /**
   * Maximum number of candidate scenarios to evaluate before picking the best.
   * Higher = more thorough but slower.
   */
  maxCandidates: number;
}
