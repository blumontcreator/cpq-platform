import type { PrismaClient } from "@prisma/client";
import type { MarginReport } from "../types/performance.types";

export async function computeMarginReport(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<MarginReport> {
  const where = {
    outcome: "WON" as const,
    realizedMarginPct: { not: null },
    ...(periodDays ? { quotedAt: { gte: new Date(Date.now() - periodDays * 86400000) } } : {}),
  };

  const outcomes = await prisma.quoteOutcome.findMany({
    where,
    select: {
      quotedMarginPct: true,
      realizedMarginPct: true,
      channel: true,
      strategy: true,
    },
  });

  if (outcomes.length === 0) {
    return {
      avgQuotedMarginPct: 0,
      avgRealizedMarginPct: 0,
      marginRetentionRate: 0,
      marginByChannel: {},
      marginByStrategy: {},
      period: periodDays ? `${periodDays}d` : "all",
      sampleSize: 0,
    };
  }

  function avg(nums: number[]): number {
    return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0;
  }

  const quotedMargins = outcomes.map((o) => Number(o.quotedMarginPct));
  const realizedMargins = outcomes
    .filter((o) => o.realizedMarginPct != null)
    .map((o) => Number(o.realizedMarginPct));

  const avgQuoted = avg(quotedMargins);
  const avgRealized = avg(realizedMargins);

  // Group by channel and strategy
  function groupMargins(key: "channel" | "strategy") {
    const groups = new Map<string, { quoted: number[]; realized: number[] }>();
    for (const o of outcomes) {
      const k = o[key] ?? "unknown";
      const g = groups.get(k) ?? { quoted: [], realized: [] };
      g.quoted.push(Number(o.quotedMarginPct));
      if (o.realizedMarginPct != null) g.realized.push(Number(o.realizedMarginPct));
      groups.set(k, g);
    }
    const result: Record<string, { quoted: number; realized: number; retention: number }> = {};
    for (const [k, g] of groups) {
      const q = avg(g.quoted);
      const r = avg(g.realized);
      result[k] = { quoted: q, realized: r, retention: q > 0 ? r / q : 0 };
    }
    return result;
  }

  return {
    avgQuotedMarginPct: avgQuoted,
    avgRealizedMarginPct: avgRealized,
    marginRetentionRate: avgQuoted > 0 ? avgRealized / avgQuoted : 0,
    marginByChannel: groupMargins("channel"),
    marginByStrategy: groupMargins("strategy"),
    period: periodDays ? `${periodDays}d` : "all",
    sampleSize: outcomes.length,
  };
}
