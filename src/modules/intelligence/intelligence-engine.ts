/**
 * Intelligence engine — the single public API for the commercial intelligence module.
 *
 * Entry points:
 *
 *   ingestEvent         — record a commercial event, run projections
 *   ingestBatch         — record multiple events
 *   buildIntelligence   — run full analytics + learning + feedback pipeline,
 *                         return an IntelligenceReport
 *   getQuoteTimeline    — event timeline for a specific quote
 *   getFeedbackSignals  — just the feedback signals (for optimizer injection)
 */
import type { PrismaClient } from "@prisma/client";
import { ingestEvent, ingestBatch, buildEventTimeline } from "./events/event-ingestion";
import type { IngestEventInput } from "./events/event-ingestion";
import { computeWinRateReport } from "./analytics/win-rate.analytics";
import { computeMarginReport } from "./analytics/margin.analytics";
import { computeDiscountReport } from "./analytics/discount.analytics";
import { computeStrategyEffectivenessReport } from "./analytics/bundle-cycle.analytics";
import { computeBundleCycleReport } from "./analytics/bundle-cycle.analytics";
import { aggregateSignals } from "./learning/signal-aggregator";
import { detectAllTrends, detectAnomalies } from "./learning/trend-anomaly";
import { buildFeedbackSignals } from "./feedback/feedback-engine";
import type { FeedbackContext } from "./feedback/feedback-engine";
import type { FeedbackSignals } from "./types/learning.types";
import type { WinRateReport, MarginReport, DiscountReport, StrategyEffectivenessReport, BundleCycleReport } from "./types/performance.types";
import type { TrendAnalysis, AnomalySignal } from "./types/learning.types";
import type { OutcomeSignal } from "./types/outcome.types";
import type { EventTimeline } from "./types/event.types";

// ── Intelligence report ───────────────────────────────────────────────────

export interface IntelligenceReport {
  generatedAt: string;
  period: string;
  // ── Analytics ─────────────────────────────────────────────────────────
  winRate: WinRateReport;
  margin: MarginReport;
  discount: DiscountReport;
  strategyEffectiveness: StrategyEffectivenessReport;
  bundleCycle: BundleCycleReport;
  // ── Learning ──────────────────────────────────────────────────────────
  signals: OutcomeSignal[];
  trends: TrendAnalysis[];
  anomalies: AnomalySignal[];
  // ── Feedback ──────────────────────────────────────────────────────────
  feedback: FeedbackSignals;
  // ── Summary ───────────────────────────────────────────────────────────
  summary: IntelligenceSummary;
  confidence: number;
  warnings: string[];
}

export interface IntelligenceSummary {
  totalOutcomes: number;
  winRate: number;
  avgRealizedMarginPct: number;
  avgDiscountGranted: number;
  bestStrategy: string;
  topTrend: string;
  topAnomaly: string | null;
  /** Pre-built LLM context block for injecting commercial intelligence into prompts. */
  aiContextBlock: string;
}

export interface BuildIntelligenceOptions {
  periodDays?: number;
  feedbackContext?: FeedbackContext;
}

export async function buildIntelligence(
  prisma: PrismaClient,
  options: BuildIntelligenceOptions = {},
): Promise<IntelligenceReport> {
  const { periodDays = 90, feedbackContext = {} } = options;
  const generatedAt = new Date().toISOString();

  const [winRate, margin, discount, strategyEff, bundleCycle, signals, feedback] =
    await Promise.all([
      computeWinRateReport(prisma, periodDays),
      computeMarginReport(prisma, periodDays),
      computeDiscountReport(prisma, periodDays),
      computeStrategyEffectivenessReport(prisma, periodDays),
      computeBundleCycleReport(prisma, periodDays),
      aggregateSignals(prisma),
      buildFeedbackSignals(prisma, { ...feedbackContext, periodDays }),
    ]);

  const signals30d = signals.filter((s) => s.period === "30d");
  const signals90d = signals.filter((s) => s.period === "90d");
  const trends = detectAllTrends(signals);
  const anomalies = detectAnomalies(signals30d, signals90d);

  const warnings: string[] = [];
  if (winRate.sampleSize < 5) warnings.push("Low sample size — analytics confidence is limited");
  if (anomalies.some((a) => a.severity === "HIGH")) warnings.push("High-severity anomaly detected — review recent commercial data");
  for (const violation of strategyEff.strategies.filter((s) => s.winRate < 0.25 && s.sampleSize >= 5)) {
    warnings.push(`Strategy ${violation.strategyKind} has a low win rate (${(violation.winRate * 100).toFixed(0)}%)`);
  }

  const summary = buildSummary(winRate, margin, discount, strategyEff, trends, anomalies);
  const confidence = Math.min(1, winRate.sampleSize / 20);

  return {
    generatedAt,
    period: `${periodDays}d`,
    winRate,
    margin,
    discount,
    strategyEffectiveness: strategyEff,
    bundleCycle,
    signals,
    trends,
    anomalies,
    feedback,
    summary,
    confidence,
    warnings,
  };
}

function buildSummary(
  winRate: WinRateReport,
  margin: MarginReport,
  discount: DiscountReport,
  strategy: StrategyEffectivenessReport,
  trends: TrendAnalysis[],
  anomalies: AnomalySignal[],
): IntelligenceSummary {
  const topTrend = trends[0]?.note ?? "No trend data available";
  const topAnomaly = anomalies[0]?.explanation ?? null;

  const aiContextBlock = [
    `[COMMERCIAL INTELLIGENCE CONTEXT]`,
    `Win rate: ${(winRate.overall.winRate * 100).toFixed(0)}% (${winRate.sampleSize} outcomes)`,
    `Avg realized margin: ${margin.avgRealizedMarginPct.toFixed(1)}% (retention: ${(margin.marginRetentionRate * 100).toFixed(0)}%)`,
    `Avg discount granted: ${discount.avgDiscountGranted.toFixed(1)}% (concession rate: ${(discount.concessionRate * 100).toFixed(0)}%)`,
    `Best strategy by win rate: ${strategy.bestByWinRate}`,
    `Best strategy by margin: ${strategy.bestByMargin}`,
    topAnomaly ? `⚠ Anomaly: ${topAnomaly}` : null,
    `Top trend: ${topTrend}`,
  ].filter(Boolean).join("\n");

  return {
    totalOutcomes: winRate.sampleSize,
    winRate: winRate.overall.winRate,
    avgRealizedMarginPct: margin.avgRealizedMarginPct,
    avgDiscountGranted: discount.avgDiscountGranted,
    bestStrategy: strategy.bestOverall,
    topTrend,
    topAnomaly,
    aiContextBlock,
  };
}

// ── Public convenience functions ──────────────────────────────────────────

export { ingestEvent, ingestBatch };
export type { IngestEventInput };

export async function getQuoteTimeline(
  prisma: PrismaClient,
  quoteId: string,
): Promise<EventTimeline> {
  return buildEventTimeline(prisma, quoteId);
}

export async function getFeedbackSignals(
  prisma: PrismaClient,
  context: FeedbackContext = {},
): Promise<FeedbackSignals> {
  return buildFeedbackSignals(prisma, context);
}
