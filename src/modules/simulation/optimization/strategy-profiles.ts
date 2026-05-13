/**
 * Built-in strategy profiles.
 *
 * Each profile weights the six optimization objectives differently to reflect
 * a distinct commercial posture. The optimizer uses these weights when scoring
 * candidate scenarios.
 *
 * Profiles are deliberately simple so they can be audited and overridden by
 * sales managers or replaced by AI-generated weight sets.
 */
import type { StrategyProfile } from "../types/strategy.types";

export const AGGRESSIVE_PROFILE: StrategyProfile = {
  kind: "AGGRESSIVE",
  name: "Aggressive Margin",
  description: "Maximize gross margin above all else. Accept higher complexity and longer lead times.",
  objectives: [
    { kind: "MAXIMIZE_MARGIN",           weight: 0.55 },
    { kind: "MAXIMIZE_PROFITABILITY_SCORE", weight: 0.25 },
    { kind: "MAXIMIZE_WIN_PROBABILITY",  weight: 0.10 },
    { kind: "MINIMIZE_COMPLEXITY",       weight: 0.05 },
    { kind: "MINIMIZE_LEAD_TIME",        weight: 0.05 },
  ],
  maxMutationDepth: 3,
  maxCandidates: 20,
};

export const BALANCED_PROFILE: StrategyProfile = {
  kind: "BALANCED",
  name: "Balanced",
  description: "Equal weight across margin, win probability, and operational efficiency.",
  objectives: [
    { kind: "MAXIMIZE_MARGIN",           weight: 0.30 },
    { kind: "MAXIMIZE_WIN_PROBABILITY",  weight: 0.25 },
    { kind: "MAXIMIZE_PROFITABILITY_SCORE", weight: 0.15 },
    { kind: "MINIMIZE_COMPLEXITY",       weight: 0.15 },
    { kind: "MINIMIZE_LEAD_TIME",        weight: 0.15 },
  ],
  maxMutationDepth: 2,
  maxCandidates: 16,
};

export const PREMIUM_PROFILE: StrategyProfile = {
  kind: "PREMIUM",
  name: "Premium Positioning",
  description: "High margin + high attach rate. Not competing on price. Win through completeness.",
  objectives: [
    { kind: "MAXIMIZE_MARGIN",           weight: 0.40 },
    { kind: "MAXIMIZE_ATTACH_RATE",      weight: 0.30 },
    { kind: "MAXIMIZE_PROFITABILITY_SCORE", weight: 0.20 },
    { kind: "MINIMIZE_COMPLEXITY",       weight: 0.10 },
  ],
  maxMutationDepth: 3,
  maxCandidates: 18,
};

export const STRATEGIC_PROFILE: StrategyProfile = {
  kind: "STRATEGIC",
  name: "Strategic Win",
  description: "Win the deal and build the relationship. Accept lower margin to maximize win probability.",
  objectives: [
    { kind: "MAXIMIZE_WIN_PROBABILITY",  weight: 0.40 },
    { kind: "MAXIMIZE_ATTACH_RATE",      weight: 0.25 },
    { kind: "MAXIMIZE_MARGIN",           weight: 0.20 },
    { kind: "MINIMIZE_LEAD_TIME",        weight: 0.15 },
  ],
  maxMutationDepth: 2,
  maxCandidates: 14,
};

export const STRATEGY_PROFILES: Record<string, StrategyProfile> = {
  AGGRESSIVE: AGGRESSIVE_PROFILE,
  BALANCED: BALANCED_PROFILE,
  PREMIUM: PREMIUM_PROFILE,
  STRATEGIC: STRATEGIC_PROFILE,
};

export function resolveStrategyProfile(kind: string): StrategyProfile {
  return STRATEGY_PROFILES[kind] ?? BALANCED_PROFILE;
}
