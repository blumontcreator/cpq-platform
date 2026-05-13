/**
 * Quote evaluation repository.
 *
 * Persists and retrieves QuoteEvaluationRecords.
 * Each evaluation run is immutable — results are appended, not overwritten,
 * providing a full audit trail of how the quote evolved over time.
 */
import type { PrismaClient } from "@prisma/client";
import type { QuoteEvaluation } from "../types/evaluation.types";

// ── Persistence ───────────────────────────────────────────────────────────────

export async function saveEvaluation(
  prisma: PrismaClient,
  quoteId: string,
  evaluation: QuoteEvaluation,
): Promise<string> {
  const record = await prisma.quoteEvaluationRecord.create({
    data: {
      quoteId,
      evaluation: JSON.parse(JSON.stringify(evaluation)),
    },
  });
  return record.id;
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

/** Returns all evaluation records for a quote, newest first. */
export async function getEvaluationHistory(
  prisma: PrismaClient,
  quoteId: string,
): Promise<{ id: string; createdAt: Date; evaluation: QuoteEvaluation }[]> {
  const records = await prisma.quoteEvaluationRecord.findMany({
    where: { quoteId },
    orderBy: { createdAt: "desc" },
  });

  return records.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    evaluation: r.evaluation as unknown as QuoteEvaluation,
  }));
}

/** Returns only the most recent evaluation for a quote. */
export async function getLatestEvaluation(
  prisma: PrismaClient,
  quoteId: string,
): Promise<QuoteEvaluation | null> {
  const record = await prisma.quoteEvaluationRecord.findFirst({
    where: { quoteId },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;
  return record.evaluation as unknown as QuoteEvaluation;
}

// ── Summary queries ───────────────────────────────────────────────────────────

export interface QuoteEvaluationSummary {
  quoteId: string;
  latestEvaluationId: string;
  totalRevenue: number;
  totalMargin: number;
  overallMarginPct: number;
  violationCount: number;
  recommendationCount: number;
  confidence: number;
  evaluatedAt: string;
}

export async function getEvaluationSummaries(
  prisma: PrismaClient,
  quoteIds: string[],
): Promise<QuoteEvaluationSummary[]> {
  const summaries: QuoteEvaluationSummary[] = [];

  for (const quoteId of quoteIds) {
    const record = await prisma.quoteEvaluationRecord.findFirst({
      where: { quoteId },
      orderBy: { createdAt: "desc" },
    });
    if (!record) continue;

    const ev = record.evaluation as unknown as QuoteEvaluation;
    summaries.push({
      quoteId,
      latestEvaluationId: record.id,
      totalRevenue: ev.metrics.totalRevenue,
      totalMargin: ev.metrics.totalMargin,
      overallMarginPct: ev.metrics.overallMarginPct,
      violationCount: ev.violations.length,
      recommendationCount: ev.recommendations.length,
      confidence: ev.confidence,
      evaluatedAt: ev.trace.evaluatedAt,
    });
  }

  return summaries;
}
