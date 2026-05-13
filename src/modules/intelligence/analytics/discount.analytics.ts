import type { PrismaClient } from "@prisma/client";
import type { DiscountReport, DiscountElasticityPoint } from "../types/performance.types";

const DISCOUNT_BUCKETS = [
  { label: "0-5%",   min: 0,  max: 5  },
  { label: "5-10%",  min: 5,  max: 10 },
  { label: "10-15%", min: 10, max: 15 },
  { label: "15-20%", min: 15, max: 20 },
  { label: "20%+",   min: 20, max: 999 },
];

export async function computeDiscountReport(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<DiscountReport> {
  const where = periodDays
    ? { quotedAt: { gte: new Date(Date.now() - periodDays * 86400000) } }
    : {};

  // Customer behavior records for negotiation events
  const negotiations = await prisma.customerBehaviorRecord.findMany({
    where: {
      eventKind: "NEGOTIATED",
      discountRequested: { not: null },
      ...(periodDays ? { occurredAt: { gte: new Date(Date.now() - periodDays * 86400000) } } : {}),
    },
    select: { discountRequested: true, discountGranted: true, quoteId: true },
  });

  // Outcomes for elasticity (win rate per discount bucket)
  const outcomes = await prisma.quoteOutcome.findMany({
    where: { outcome: { in: ["WON", "LOST"] }, ...where },
    select: { outcome: true, realizedDiscount: true, channel: true, realizedMarginPct: true },
  });

  const granted = negotiations.map((n) => Number(n.discountGranted ?? 0));
  const requested = negotiations.map((n) => Number(n.discountRequested ?? 0));
  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  // Elasticity
  const elasticity: DiscountElasticityPoint[] = DISCOUNT_BUCKETS.map((bucket) => {
    const inBucket = outcomes.filter((o) => {
      const d = Number(o.realizedDiscount ?? 0);
      return d >= bucket.min && d < bucket.max;
    });
    const wins = inBucket.filter((o) => o.outcome === "WON");
    const margins = wins.map((o) => Number(o.realizedMarginPct ?? 0));
    return {
      discountBucket: bucket.label,
      winRate: inBucket.length ? wins.length / inBucket.length : 0,
      sampleSize: inBucket.length,
      avgMarginPct: avg(margins),
    };
  });

  // By channel
  const channelMap = new Map<string, { discounts: number[]; count: number }>();
  for (const o of outcomes.filter((o) => o.outcome === "WON")) {
    const k = o.channel ?? "unknown";
    const g = channelMap.get(k) ?? { discounts: [], count: 0 };
    g.discounts.push(Number(o.realizedDiscount ?? 0));
    g.count++;
    channelMap.set(k, g);
  }
  const byChannel: Record<string, { avgGranted: number; sampleSize: number }> = {};
  for (const [k, g] of channelMap) {
    byChannel[k] = { avgGranted: avg(g.discounts), sampleSize: g.count };
  }

  const avgRequested = avg(requested);
  const avgGranted = avg(granted);

  return {
    avgDiscountRequested: avgRequested,
    avgDiscountGranted: avgGranted,
    concessionRate: avgRequested > 0 ? avgGranted / avgRequested : 0,
    elasticity,
    byChannel,
    period: periodDays ? `${periodDays}d` : "all",
    sampleSize: negotiations.length,
  };
}
