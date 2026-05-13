import type { PrismaClient } from "@prisma/client";
import type { BundleCycleReport, StrategyEffectivenessReport, StrategyEffectiveness } from "../types/performance.types";

export async function computeBundleCycleReport(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<BundleCycleReport> {
  const where = {
    outcome: "WON" as const,
    ...(periodDays ? { quotedAt: { gte: new Date(Date.now() - periodDays * 86400000) } } : {}),
  };

  const won = await prisma.quoteOutcome.findMany({
    where,
    select: { cycleDays: true, quoteId: true },
  });

  const cycles = won.map((o) => o.cycleDays ?? 0).filter((d) => d > 0).sort((a, b) => a - b);

  // Bundle inclusion: count won quotes where the graph contains a BUNDLE node
  let bundleCount = 0;
  for (const outcome of won) {
    const quote = await prisma.quote.findUnique({
      where: { id: outcome.quoteId },
      select: { graph: true },
    });
    if (quote?.graph) {
      const g = quote.graph as { nodes?: { kind: string }[] };
      if (g.nodes?.some((n) => n.kind === "BUNDLE")) bundleCount++;
    }
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };

  return {
    bundleInclusionRate: won.length > 0 ? bundleCount / won.length : 0,
    avgAttachRate: 0,  // requires graph node analysis — placeholder
    avgQuoteCycleDays: avg(cycles),
    medianQuoteCycleDays: median(cycles),
    fastestCycleDays: cycles[0] ?? 0,
    slowestCycleDays: cycles[cycles.length - 1] ?? 0,
    period: periodDays ? `${periodDays}d` : "all",
    sampleSize: won.length,
  };
}

export async function computeStrategyEffectivenessReport(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<StrategyEffectivenessReport> {
  const where = {
    outcome: { in: ["WON", "LOST"] as string[] },
    strategy: { not: null },
    ...(periodDays ? { quotedAt: { gte: new Date(Date.now() - periodDays * 86400000) } } : {}),
  };

  const outcomes = await prisma.quoteOutcome.findMany({
    where,
    select: { outcome: true, strategy: true, realizedMarginPct: true, realizedDiscount: true, cycleDays: true },
  });

  const grouped = new Map<string, { wins: number; total: number; margins: number[]; discounts: number[]; cycles: number[] }>();

  for (const o of outcomes) {
    const k = o.strategy ?? "unknown";
    const g = grouped.get(k) ?? { wins: 0, total: 0, margins: [], discounts: [], cycles: [] };
    g.total++;
    if (o.outcome === "WON") {
      g.wins++;
      if (o.realizedMarginPct != null) g.margins.push(Number(o.realizedMarginPct));
      if (o.realizedDiscount != null) g.discounts.push(Number(o.realizedDiscount));
    }
    if (o.cycleDays != null) g.cycles.push(o.cycleDays);
    grouped.set(k, g);
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const confidenceFromSample = (n: number) => Math.min(1, n / 15);

  const strategies: StrategyEffectiveness[] = [...grouped.entries()].map(([kind, g]) => {
    const winRate = g.total > 0 ? g.wins / g.total : 0;
    const conf = confidenceFromSample(g.total);
    return {
      strategyKind: kind,
      sampleSize: g.total,
      winRate,
      avgRealizedMarginPct: avg(g.margins),
      avgDiscountGranted: avg(g.discounts),
      avgCycleDays: avg(g.cycles),
      confidence: conf,
      trend: "STABLE" as const,
      recommendation:
        winRate >= 0.6
          ? `${kind} is performing well — continue using it for similar deals.`
          : winRate < 0.3
          ? `${kind} has a low win rate — consider switching strategies for this deal type.`
          : `${kind} is performing moderately — review pricing and discount approach.`,
    };
  }).sort((a, b) => b.winRate - a.winRate);

  const bestByWinRate = strategies[0]?.strategyKind ?? "BALANCED";
  const byMargin = [...strategies].sort((a, b) => b.avgRealizedMarginPct - a.avgRealizedMarginPct);
  const bestByMargin = byMargin[0]?.strategyKind ?? "AGGRESSIVE";

  // Composite: 0.6×winRate + 0.4×marginRetention
  const byComposite = [...strategies].sort(
    (a, b) =>
      (b.winRate * 0.6 + (b.avgRealizedMarginPct / 60) * 0.4) -
      (a.winRate * 0.6 + (a.avgRealizedMarginPct / 60) * 0.4),
  );

  return {
    strategies,
    bestByWinRate,
    bestByMargin,
    bestOverall: byComposite[0]?.strategyKind ?? "BALANCED",
    period: periodDays ? `${periodDays}d` : "all",
  };
}
