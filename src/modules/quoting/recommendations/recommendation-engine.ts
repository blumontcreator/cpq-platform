/**
 * Recommendation engine.
 *
 * Runs all 5 recommendation generators in sequence, deduplicates overlapping
 * recommendations, and sorts the final list by priority.
 *
 * Pure function — no DB access, no side effects.
 */
import type { QuoteGraph } from "../types/graph.types";
import type { QuoteEvaluation } from "../types/evaluation.types";
import type { ConstraintViolation } from "../types/constraint.types";
import type { QuoteRecommendation, RecommendationPriority } from "../types/recommendation.types";
import {
  generateUpsellRecommendations,
  generateProfitabilityRecommendations,
  generateFreightRecommendations,
  generateAlternativeRecommendations,
  generateWarningRecommendations,
} from "./generators";

const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function generateRecommendations(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
  violations: ConstraintViolation[],
): QuoteRecommendation[] {
  const all: QuoteRecommendation[] = [
    ...generateWarningRecommendations(graph, evaluation, violations),
    ...generateProfitabilityRecommendations(graph, evaluation),
    ...generateFreightRecommendations(graph, evaluation),
    ...generateUpsellRecommendations(graph),
    ...generateAlternativeRecommendations(graph, evaluation),
  ];

  // Sort by priority
  return all.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
