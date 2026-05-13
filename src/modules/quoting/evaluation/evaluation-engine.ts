/**
 * Evaluation engine.
 *
 * Orchestrates all evaluators in sequence:
 *   1. Profitability  (economics, subsidies)
 *   2. Complexity     (operational burden)
 *   3. Freight        (consolidation groups)
 *   4. Lead-time      (critical path)
 *   5. Dependencies   (REQUIRES / EXCLUDES validation)
 *
 * Merges per-node outputs into a single NodeEvaluation[] then builds
 * a GraphMetrics summary and a full QuoteEvaluation.
 *
 * Pure function — takes a graph and (optionally) pre-computed violations
 * and recommendations, returns an immutable QuoteEvaluation.
 */
import type { QuoteGraph } from "../types/graph.types";
import type { NodeEvaluation, GraphMetrics, EvaluationTrace, QuoteEvaluation } from "../types/evaluation.types";
import type { ConstraintViolation } from "../types/constraint.types";
import type { QuoteRecommendation } from "../types/recommendation.types";
import {
  evaluateProfitability,
  evaluateComplexity,
  evaluateFreight,
  evaluateLeadTime,
  evaluateDependencies,
} from "./evaluators";

export const EVALUATION_ENGINE_VERSION = 1;

export function evaluateGraph(
  graph: QuoteGraph,
  options: {
    violations?: ConstraintViolation[];
    recommendations?: QuoteRecommendation[];
  } = {},
): QuoteEvaluation {
  const startedAt = Date.now();
  const trace: EvaluationTrace["steps"] = [];
  let step = 0;

  function record(evaluator: string, note: string) {
    trace.push({ step: ++step, evaluator, note, durationMs: Date.now() - startedAt });
  }

  // ── Seed empty partials ────────────────────────────────────────────────────
  let partials: Partial<NodeEvaluation>[] = graph.nodes.map((n) => ({
    nodeId: n.id,
    kind: n.kind,
    label: n.label,
    warnings: [],
  }));

  // ── 1. Profitability ───────────────────────────────────────────────────────
  const { nodeUpdates: profUpdates, metrics: profMetrics } = evaluateProfitability(graph, partials);
  partials = merge(partials, profUpdates);
  record("profitability", `computed economics for ${graph.nodes.length} nodes`);

  // ── 2. Complexity ──────────────────────────────────────────────────────────
  const { nodeUpdates: compUpdates, metrics: compMetrics } = evaluateComplexity(graph, partials);
  partials = merge(partials, compUpdates);
  record("complexity", `overall complexity ${compMetrics.overallComplexityScore} / 10`);

  // ── 3. Freight ─────────────────────────────────────────────────────────────
  const { nodeUpdates: freightUpdates, metrics: freightMetrics } = evaluateFreight(graph, partials);
  partials = merge(partials, freightUpdates);
  record(
    "freight",
    `${freightMetrics.freightGroups?.length ?? 0} freight groups, ~${(freightMetrics.potentialFreightSaving ?? 0).toFixed(2)} potential saving`,
  );

  // ── 4. Lead-time ───────────────────────────────────────────────────────────
  const { nodeUpdates: ltUpdates, metrics: ltMetrics } = evaluateLeadTime(graph, partials);
  partials = merge(partials, ltUpdates);
  record("lead-time", `critical path ${ltMetrics.criticalPathLeadTimeDays}d`);

  // ── 5. Dependencies ────────────────────────────────────────────────────────
  const { issues } = evaluateDependencies(graph);
  const depWarnings = issues.map((i) => i.message);
  record("dependencies", `${issues.length} dependency issues found`);

  // ── Assemble final NodeEvaluations ────────────────────────────────────────
  const nodeEvaluations: NodeEvaluation[] = partials.map((p, i) => {
    const node = graph.nodes[i];
    return {
      nodeId: p.nodeId ?? node.id,
      kind: node.kind,
      label: node.label,
      lineRevenue: p.lineRevenue ?? 0,
      lineCost: p.lineCost ?? 0,
      lineMargin: p.lineMargin ?? 0,
      lineMarginPct: p.lineMarginPct ?? 0,
      subsidyReceived: p.subsidyReceived ?? 0,
      subsidyGiven: p.subsidyGiven ?? 0,
      effectiveMarginPct: p.effectiveMarginPct ?? 0,
      complexityScore: p.complexityScore ?? 0,
      complexityLevel: p.complexityLevel ?? "SIMPLE",
      leadTimeRisk: p.leadTimeRisk ?? "LOW",
      freightGroupId: p.freightGroupId,
      warnings: [...(p.warnings ?? [])],
    };
  });

  // ── Assemble GraphMetrics ─────────────────────────────────────────────────
  const metrics: GraphMetrics = {
    totalRevenue: profMetrics.totalRevenue ?? 0,
    totalCost: profMetrics.totalCost ?? 0,
    totalMargin: profMetrics.totalMargin ?? 0,
    overallMarginPct: profMetrics.overallMarginPct ?? 0,
    marginByKind: profMetrics.marginByKind ?? {},
    highestMarginNodeId: profMetrics.highestMarginNodeId ?? null,
    lowestMarginNodeId: profMetrics.lowestMarginNodeId ?? null,
    overallComplexityScore: compMetrics.overallComplexityScore ?? 0,
    complexityLevel: compMetrics.complexityLevel ?? "SIMPLE",
    totalInstallationHours: compMetrics.totalInstallationHours ?? 0,
    criticalPathLeadTimeDays: ltMetrics.criticalPathLeadTimeDays ?? 0,
    freightGroups: freightMetrics.freightGroups ?? [],
    potentialFreightSaving: freightMetrics.potentialFreightSaving ?? 0,
  };

  // ── Confidence ────────────────────────────────────────────────────────────
  const nodesWithCost = graph.nodes.filter((n) => n.unitCost > 0).length;
  const costCoverage = graph.nodes.length ? nodesWithCost / graph.nodes.length : 0;
  const nodesWithLeadTime = graph.nodes.filter((n) => n.leadTimeDays != null).length;
  const leadTimeCoverage = graph.nodes.length ? nodesWithLeadTime / graph.nodes.length : 1;
  const confidence = Math.round(((costCoverage * 0.6 + leadTimeCoverage * 0.4) * 100)) / 100;

  // ── All warnings ──────────────────────────────────────────────────────────
  const warnings = [
    ...nodeEvaluations.flatMap((n) => n.warnings),
    ...depWarnings,
  ];

  const unresolvedFactors: string[] = [];
  if (costCoverage < 1) unresolvedFactors.push("some nodes are missing cost data");
  if (leadTimeCoverage < 1) unresolvedFactors.push("some nodes are missing lead-time data");

  return {
    graphId: graph.id,
    quoteId: graph.quoteId,
    metrics,
    nodeEvaluations,
    violations: options.violations ?? [],
    recommendations: options.recommendations ?? [],
    trace: {
      steps: trace,
      evaluatedAt: new Date().toISOString(),
      engineVersion: EVALUATION_ENGINE_VERSION,
    },
    confidence,
    warnings,
    unresolvedFactors,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Non-destructively merges two arrays of partial NodeEvaluations by index.
 * Later entries override earlier values while preserving arrays (warnings).
 */
function merge(
  base: Partial<NodeEvaluation>[],
  updates: Partial<NodeEvaluation>[],
): Partial<NodeEvaluation>[] {
  return base.map((b, i) => {
    const u = updates[i] ?? {};
    return {
      ...b,
      ...u,
      warnings: [...(b.warnings ?? []), ...(u.warnings?.filter((w) => !(b.warnings ?? []).includes(w)) ?? [])],
    };
  });
}
