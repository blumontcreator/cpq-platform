/**
 * Strategy learner.
 *
 * Joins ScenarioRun records with QuoteOutcome records to measure which
 * optimization strategies lead to real-world wins.
 *
 * Output:
 *   - StrategyRank[] for the feedback engine (biases candidate generation)
 *   - WinProbabilityModel built from empirical margin-bracket win rates
 *
 * The WinProbabilityModel is the core AI integration seam:
 * when enough data accumulates (minSamplePerBucket = 5), it replaces the
 * heuristic in objective-scorer.ts.
 */
import type { PrismaClient } from "@prisma/client";
import type { WinProbabilityModel, WinProbabilityBucket, StrategyRank } from "../types/learning.types";

const MARGIN_BUCKETS = [
  { low: 0,  high: 15  },
  { low: 15, high: 20  },
  { low: 20, high: 25  },
  { low: 25, high: 30  },
  { low: 30, high: 40  },
  { low: 40, high: 50  },
  { low: 50, high: 100 },
];

const MIN_BUCKET_SAMPLE = 5;

export async function buildWinProbabilityModel(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<WinProbabilityModel> {
  const where = {
    outcome: { in: ["WON", "LOST"] as string[] },
    ...(periodDays ? { quotedAt: { gte: new Date(Date.now() - periodDays * 86400000) } } : {}),
  };

  const outcomes = await prisma.quoteOutcome.findMany({
    where,
    select: { outcome: true, quotedMarginPct: true },
  });

  if (outcomes.length < MIN_BUCKET_SAMPLE * 2) {
    return {
      buckets: [],
      hasEnoughData: false,
      minSamplePerBucket: MIN_BUCKET_SAMPLE,
      builtAt: new Date().toISOString(),
      observedMarginRange: { min: 0, max: 0 },
    };
  }

  const margins = outcomes.map((o) => Number(o.quotedMarginPct));
  const minMargin = Math.min(...margins);
  const maxMargin = Math.max(...margins);

  const buckets: WinProbabilityBucket[] = MARGIN_BUCKETS.map((b) => {
    const inBucket = outcomes.filter((o) => {
      const m = Number(o.quotedMarginPct);
      return m >= b.low && m < b.high;
    });
    const wins = inBucket.filter((o) => o.outcome === "WON");
    return {
      marginLow: b.low,
      marginHigh: b.high,
      winRate: inBucket.length > 0 ? wins.length / inBucket.length : 0,
      sampleSize: inBucket.length,
      confidence: Math.min(1, inBucket.length / MIN_BUCKET_SAMPLE),
    };
  });

  const hasEnoughData = buckets.some((b) => b.sampleSize >= MIN_BUCKET_SAMPLE);

  return {
    buckets,
    hasEnoughData,
    minSamplePerBucket: MIN_BUCKET_SAMPLE,
    builtAt: new Date().toISOString(),
    observedMarginRange: { min: minMargin, max: maxMargin },
  };
}

export async function buildStrategyRanking(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<StrategyRank[]> {
  const outcomeWhere = {
    outcome: { in: ["WON", "LOST"] as string[] },
    strategy: { not: null },
    ...(periodDays ? { quotedAt: { gte: new Date(Date.now() - periodDays * 86400000) } } : {}),
  };

  const outcomes = await prisma.quoteOutcome.findMany({
    where: outcomeWhere,
    select: {
      outcome: true,
      strategy: true,
      realizedMarginPct: true,
      quotedMarginPct: true,
      channel: true,
    },
  });

  const grouped = new Map<string, { wins: number; total: number; margins: number[]; quotedMargins: number[]; channels: string[] }>();
  for (const o of outcomes) {
    const k = o.strategy!;
    const g = grouped.get(k) ?? { wins: 0, total: 0, margins: [], quotedMargins: [], channels: [] };
    g.total++;
    if (o.outcome === "WON") {
      g.wins++;
      if (o.realizedMarginPct != null) g.margins.push(Number(o.realizedMarginPct));
      if (o.quotedMarginPct != null) g.quotedMargins.push(Number(o.quotedMarginPct));
    }
    if (o.channel) g.channels.push(o.channel);
    grouped.set(k, g);
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const ranks: StrategyRank[] = [...grouped.entries()].map(([kind, g]) => {
    const winRate = g.total > 0 ? g.wins / g.total : 0;
    const avgMargin = avg(g.margins);
    const avgQuoted = avg(g.quotedMargins);
    const retention = avgQuoted > 0 ? avgMargin / avgQuoted : 0;
    const composite = winRate * 0.6 + Math.min(1, avgMargin / 60) * 0.4;

    // Most common channels this strategy is used in
    const channelCounts = new Map<string, number>();
    for (const ch of g.channels) channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1);
    const topChannels = [...channelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([ch]) => ch);

    return {
      strategyKind: kind,
      rank: 0,
      compositeScore: composite,
      winRate,
      marginRetention: retention,
      confidence: Math.min(1, g.total / 15),
      suggestFor: topChannels,
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);

  return ranks.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Look up empirical win probability from the model.
 * Returns null if the model doesn't have enough data for this margin level.
 */
export function lookupWinProbability(
  model: WinProbabilityModel,
  marginPct: number,
): number | null {
  if (!model.hasEnoughData) return null;
  const bucket = model.buckets.find(
    (b) => marginPct >= b.marginLow && marginPct < b.marginHigh,
  );
  if (!bucket || bucket.confidence < 0.5) return null;
  return bucket.winRate;
}
