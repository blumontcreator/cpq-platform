import type { PrismaClient } from "@prisma/client";
import type { WinRateBreakdown, WinRateReport } from "../types/performance.types";

function computeBreakdown(
  rows: { outcome: string; cycleDays: number | null; dimension: string }[],
): WinRateBreakdown[] {
  const grouped = new Map<string, { wins: number; losses: number; expirations: number; cycles: number[] }>();

  for (const row of rows) {
    const g = grouped.get(row.dimension) ?? { wins: 0, losses: 0, expirations: 0, cycles: [] };
    if (row.outcome === "WON") g.wins++;
    else if (row.outcome === "LOST") g.losses++;
    else if (row.outcome === "EXPIRED") g.expirations++;
    if (row.cycleDays != null) g.cycles.push(row.cycleDays);
    grouped.set(row.dimension, g);
  }

  return [...grouped.entries()].map(([dim, g]) => {
    const total = g.wins + g.losses + g.expirations;
    return {
      dimension: dim,
      wins: g.wins,
      losses: g.losses,
      expirations: g.expirations,
      total,
      winRate: total > 0 ? g.wins / total : 0,
      avgCycleDays: g.cycles.length
        ? g.cycles.reduce((s, v) => s + v, 0) / g.cycles.length
        : undefined,
    };
  }).sort((a, b) => b.winRate - a.winRate);
}

export async function computeWinRateReport(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<WinRateReport> {
  const where = periodDays
    ? { quotedAt: { gte: new Date(Date.now() - periodDays * 86400000) } }
    : {};

  const outcomes = await prisma.quoteOutcome.findMany({
    where: { outcome: { in: ["WON", "LOST", "EXPIRED"] as string[] }, ...where },
    select: { outcome: true, cycleDays: true, channel: true, strategy: true, customerId: true },
  });

  if (outcomes.length === 0) {
    const empty: WinRateBreakdown = { dimension: "all", wins: 0, losses: 0, expirations: 0, total: 0, winRate: 0 };
    return { overall: empty, byChannel: [], byStrategy: [], period: periodDays ? `${periodDays}d` : "all", sampleSize: 0 };
  }

  const byChannel = computeBreakdown(outcomes.map((o) => ({ ...o, dimension: o.channel ?? "unknown" })));
  const byStrategy = computeBreakdown(outcomes.map((o) => ({ ...o, dimension: o.strategy ?? "unknown" })));

  const overall = computeBreakdown(outcomes.map((o) => ({ ...o, dimension: "all" })))[0];

  return {
    overall,
    byChannel,
    byStrategy,
    period: periodDays ? `${periodDays}d` : "all",
    sampleSize: outcomes.length,
  };
}
