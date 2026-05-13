/**
 * Quote engine — the single public API for the quoting module.
 *
 * Orchestrates the full lifecycle of a quote graph:
 *   1. Validate graph structure
 *   2. Run evaluation (profitability, complexity, freight, lead-time, dependencies)
 *   3. Evaluate constraints
 *   4. Generate recommendations
 *   5. Attach violations + recommendations back into the evaluation
 *   6. Optionally persist the graph and evaluation record to the DB
 *
 * This is the entry point for both API routes and CLI scripts.
 */
import type { PrismaClient } from "@prisma/client";
import type { QuoteGraph } from "./types/graph.types";
import type { QuoteConstraint } from "./types/constraint.types";
import type { QuoteEvaluation } from "./types/evaluation.types";
import { validateGraphStructure } from "./graph/graph-validator";
import type { GraphValidationError } from "./graph/graph-validator";
import { evaluateGraph } from "./evaluation/evaluation-engine";
import { evaluateConstraints } from "./constraints/constraint-engine";
import { generateRecommendations } from "./recommendations/recommendation-engine";
import { saveQuoteGraph, saveEvaluation } from "./repository";

export interface RunQuoteEngineInput {
  graph: QuoteGraph;
  constraints?: QuoteConstraint[];
  /** If true, persists the graph and evaluation to the DB. */
  persist?: boolean;
  prisma?: PrismaClient;
}

export interface RunQuoteEngineResult {
  evaluation: QuoteEvaluation;
  structuralErrors: GraphValidationError[];
  /** DB record id of the saved evaluation (only present when persist=true). */
  evaluationRecordId?: string;
}

export async function runQuoteEngine(input: RunQuoteEngineInput): Promise<RunQuoteEngineResult> {
  const { graph, constraints = [], persist = false, prisma } = input;

  // ── 1. Structural validation ───────────────────────────────────────────────
  const structuralErrors = validateGraphStructure(graph);

  // ── 2. Evaluate (without constraints/recommendations yet) ──────────────────
  const partialEvaluation = evaluateGraph(graph);

  // ── 3. Constraint evaluation ───────────────────────────────────────────────
  const violations = evaluateConstraints(graph, constraints, partialEvaluation);

  // ── 4. Recommendation generation ──────────────────────────────────────────
  const recommendations = generateRecommendations(graph, partialEvaluation, violations);

  // ── 5. Assemble final evaluation ──────────────────────────────────────────
  const evaluation: QuoteEvaluation = {
    ...partialEvaluation,
    violations,
    recommendations,
    warnings: [
      ...partialEvaluation.warnings,
      ...structuralErrors.map((e) => `Structural: ${e.message}`),
    ],
  };

  // ── 6. Persistence (optional) ─────────────────────────────────────────────
  let evaluationRecordId: string | undefined;
  if (persist && prisma && graph.quoteId) {
    await saveQuoteGraph(prisma, graph.quoteId, graph);
    evaluationRecordId = await saveEvaluation(prisma, graph.quoteId, evaluation);
  }

  return { evaluation, structuralErrors, evaluationRecordId };
}
