/**
 * Scenario run repository.
 *
 * Persists OptimizationResult audit records to ScenarioRun rows.
 * Each run is immutable — results are appended, never overwritten.
 */
import type { PrismaClient } from "@prisma/client";
import type { OptimizationResult } from "../types/optimization.types";

export async function saveScenarioRun(
  prisma: PrismaClient,
  quoteId: string,
  name: string,
  strategy: string,
  result: OptimizationResult,
): Promise<string> {
  const record = await prisma.scenarioRun.create({
    data: {
      quoteId,
      name,
      strategy,
      result: JSON.parse(JSON.stringify(result)),
    },
  });
  return record.id;
}

export async function getScenarioRuns(
  prisma: PrismaClient,
  quoteId: string,
): Promise<{ id: string; name: string; strategy: string; createdAt: Date; result: OptimizationResult }[]> {
  const records = await prisma.scenarioRun.findMany({
    where: { quoteId },
    orderBy: { createdAt: "desc" },
  });

  return records.map((r) => ({
    id: r.id,
    name: r.name,
    strategy: r.strategy,
    createdAt: r.createdAt,
    result: r.result as unknown as OptimizationResult,
  }));
}

export async function getLatestScenarioRun(
  prisma: PrismaClient,
  quoteId: string,
): Promise<OptimizationResult | null> {
  const record = await prisma.scenarioRun.findFirst({
    where: { quoteId },
    orderBy: { createdAt: "desc" },
  });
  return record ? (record.result as unknown as OptimizationResult) : null;
}

export interface ScenarioRunSummary {
  quoteId: string;
  runId: string;
  strategy: string;
  baselineMarginPct: number;
  bestMarginPct: number;
  marginDelta: number;
  compositeScore: number;
  candidatesEvaluated: number;
  confidence: number;
  createdAt: Date;
}

export async function getScenarioRunSummaries(
  prisma: PrismaClient,
  quoteIds: string[],
): Promise<ScenarioRunSummary[]> {
  const summaries: ScenarioRunSummary[] = [];

  for (const quoteId of quoteIds) {
    const record = await prisma.scenarioRun.findFirst({
      where: { quoteId },
      orderBy: { createdAt: "desc" },
    });
    if (!record) continue;

    const r = record.result as unknown as OptimizationResult;
    summaries.push({
      quoteId,
      runId: record.id,
      strategy: record.strategy,
      baselineMarginPct: r.baselineEvaluation.metrics.overallMarginPct,
      bestMarginPct: r.bestScenario.evaluation.metrics.overallMarginPct,
      marginDelta: r.bestScenario.delta.marginPctDelta,
      compositeScore: r.bestScenario.compositeScore,
      candidatesEvaluated: r.trace.candidatesEvaluated,
      confidence: r.confidence,
      createdAt: record.createdAt,
    });
  }

  return summaries;
}
