/**
 * Objective scorer.
 *
 * Maps a QuoteEvaluation to a normalized 0–1 score for each ObjectiveKind.
 *
 * Normalization strategy per objective:
 *   MAXIMIZE_MARGIN          → margin% / 60 (60% is considered excellent, clamp to 1)
 *   MAXIMIZE_WIN_PROBABILITY → heuristic: high margin = lower win prob, use curve
 *   MINIMIZE_COMPLEXITY      → 1 - (score / 10)
 *   MINIMIZE_LEAD_TIME       → 1 - min(criticalPath / 90, 1)
 *   MAXIMIZE_ATTACH_RATE     → optionalNodes included / total optional nodes
 *   MAXIMIZE_PROFITABILITY   → composite of margin% × revenue (normalized)
 *
 * The win-probability curve is deliberately simple and AI-replaceable:
 *   At 15% margin → 0.90 win prob (very competitive)
 *   At 35% margin → 0.55 win prob (balanced)
 *   At 55% margin → 0.20 win prob (premium, low probability)
 * This is the "LLM slot" — replace estimateWinProbability() with an AI call.
 */
import type { QuoteEvaluation } from "../../quoting/types/evaluation.types";
import type { OptimizationObjective, ObjectiveKind } from "../types/optimization.types";
import type { ObjectiveScore } from "../types/scenario.types";

/**
 * Deterministic win-probability heuristic.
 * Replace this function with an AI/ML model call for production.
 */
export function estimateWinProbability(marginPct: number): number {
  // Logistic-style decay: competitive at low margin, poor at high margin
  const base = 0.90;
  const decay = 0.020;
  const prob = base - decay * Math.max(0, marginPct - 15);
  return Math.max(0.10, Math.min(0.95, prob));
}

function scoreForKind(
  kind: ObjectiveKind,
  evaluation: QuoteEvaluation,
  baseline?: QuoteEvaluation,
): { rawValue: number; normalizedScore: number; reasoning: string } {
  const m = evaluation.metrics;

  switch (kind) {
    case "MAXIMIZE_MARGIN": {
      const raw = m.overallMarginPct;
      const score = Math.min(1, Math.max(0, raw / 60));
      return { rawValue: raw, normalizedScore: score, reasoning: `Margin ${raw.toFixed(1)}% (normalized to 60% ceiling)` };
    }

    case "MAXIMIZE_WIN_PROBABILITY": {
      const raw = estimateWinProbability(m.overallMarginPct);
      return { rawValue: raw, normalizedScore: raw, reasoning: `Estimated win probability ${(raw * 100).toFixed(0)}% at ${m.overallMarginPct.toFixed(1)}% margin` };
    }

    case "MINIMIZE_COMPLEXITY": {
      const raw = m.overallComplexityScore;
      const score = 1 - raw / 10;
      return { rawValue: raw, normalizedScore: Math.max(0, score), reasoning: `Complexity score ${raw}/10` };
    }

    case "MINIMIZE_LEAD_TIME": {
      const raw = m.criticalPathLeadTimeDays;
      const score = 1 - Math.min(1, raw / 90);
      return { rawValue: raw, normalizedScore: score, reasoning: `Critical path ${raw} days (90d = 0 score)` };
    }

    case "MAXIMIZE_ATTACH_RATE": {
      // Fraction of COMPATIBLE_WITH targets that are actually on the graph
      // Use optional node count as a proxy if no graph available
      const total = evaluation.nodeEvaluations.length;
      const nonDiscount = evaluation.nodeEvaluations.filter(
        (n) => n.kind !== "DISCOUNT" && n.kind !== "SURCHARGE",
      ).length;
      const raw = total > 0 ? nonDiscount / total : 1;
      return { rawValue: raw, normalizedScore: raw, reasoning: `${nonDiscount}/${total} non-discount nodes on quote` };
    }

    case "MAXIMIZE_PROFITABILITY_SCORE": {
      const marginScore = Math.min(1, m.overallMarginPct / 60);
      const revScore = baseline
        ? Math.min(1, m.totalRevenue / Math.max(1, baseline.metrics.totalRevenue))
        : 0.5;
      const raw = (marginScore * 0.7 + revScore * 0.3);
      return { rawValue: raw, normalizedScore: raw, reasoning: `Composite: 70% margin score (${marginScore.toFixed(2)}) + 30% revenue ratio (${revScore.toFixed(2)})` };
    }
  }
}

export function scoreObjective(
  objective: OptimizationObjective,
  evaluation: QuoteEvaluation,
  baseline?: QuoteEvaluation,
): ObjectiveScore {
  const { rawValue, normalizedScore, reasoning } = scoreForKind(
    objective.kind,
    evaluation,
    baseline,
  );

  // Apply hard constraint: if violated, normalizedScore = 0
  let effectiveScore = normalizedScore;
  if (objective.constraint) {
    const violated =
      (objective.constraint.operator === "GTE" && rawValue < objective.constraint.value) ||
      (objective.constraint.operator === "LTE" && rawValue > objective.constraint.value);
    if (violated) {
      effectiveScore = 0;
    }
  }

  return {
    kind: objective.kind,
    rawValue,
    normalizedScore: effectiveScore,
    weight: objective.weight,
    weightedScore: effectiveScore * objective.weight,
    reasoning,
  };
}

/** Score a graph against a full objective list, return composite (0–1). */
export function scoreAll(
  objectives: OptimizationObjective[],
  evaluation: QuoteEvaluation,
  baseline?: QuoteEvaluation,
): { scores: ObjectiveScore[]; composite: number } {
  const scores = objectives.map((o) => scoreObjective(o, evaluation, baseline));
  const totalWeight = scores.reduce((s, o) => s + o.weight, 0);
  const composite =
    totalWeight > 0 ? scores.reduce((s, o) => s + o.weightedScore, 0) / totalWeight : 0;
  return { scores, composite };
}
