/**
 * Customer behavior profiler.
 *
 * Builds a CustomerBehaviorProfile from historical negotiation,
 * win/loss, and behavioral event records for a specific customer.
 *
 * Profiles are used by:
 *   - The negotiation guidance module (calibrate walk-away recommendations)
 *   - The optimizer (adjust win-probability estimate per customer)
 *   - LLM prompts (inject customer context before negotiation assistance)
 */
import type { PrismaClient } from "@prisma/client";
import type { CustomerBehaviorProfile } from "../types/learning.types";

export async function buildCustomerProfile(
  prisma: PrismaClient,
  customerId: string,
  periodDays?: number,
): Promise<CustomerBehaviorProfile> {
  const dateFilter = periodDays
    ? new Date(Date.now() - periodDays * 86400000)
    : undefined;

  // Negotiation records
  const negotiations = await prisma.customerBehaviorRecord.findMany({
    where: {
      customerId,
      eventKind: "NEGOTIATED",
      ...(dateFilter ? { occurredAt: { gte: dateFilter } } : {}),
    },
    select: { discountRequested: true, discountGranted: true },
  });

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const requested = negotiations.map((n) => Number(n.discountRequested ?? 0));
  const granted = negotiations.map((n) => Number(n.discountGranted ?? 0));
  const avgRequested = avg(requested);
  const avgGranted = avg(granted);

  // Win/loss outcomes
  const outcomes = await prisma.quoteOutcome.findMany({
    where: {
      customerId,
      outcome: { in: ["WON", "LOST", "EXPIRED"] },
      ...(dateFilter ? { quotedAt: { gte: dateFilter } } : {}),
    },
    select: { outcome: true, lossReason: true, cycleDays: true },
  });

  const total = outcomes.length;
  const wins = outcomes.filter((o) => o.outcome === "WON").length;
  const lostOnPrice = outcomes.filter((o) => o.lossReason === "PRICE_TOO_HIGH").length;
  const winRate = total > 0 ? wins / total : 0;
  const lostPriceTooHighRate = total > 0 ? lostOnPrice / total : 0;
  const cycles = outcomes.map((o) => o.cycleDays ?? 0).filter((d) => d > 0);

  // Change request events
  const changeRequests = await prisma.customerBehaviorRecord.findMany({
    where: {
      customerId,
      eventKind: "CHANGE_REQUEST",
      ...(dateFilter ? { occurredAt: { gte: dateFilter } } : {}),
    },
    select: { id: true },
  });

  // Payment delays
  const paymentDelays = await prisma.customerBehaviorRecord.findMany({
    where: {
      customerId,
      eventKind: "PAYMENT_DELAY",
      ...(dateFilter ? { occurredAt: { gte: dateFilter } } : {}),
    },
    select: { id: true },
  });

  const totalEvents = outcomes.length + negotiations.length;
  const sampleSize = totalEvents;
  const confidence = Math.min(1, sampleSize / 10);

  return {
    customerId,
    avgDiscountRequested: avgRequested,
    avgDiscountGranted: avgGranted,
    concessionRate: avgRequested > 0 ? avgGranted / avgRequested : 0,
    avgNegotiationRounds: Math.max(1, negotiations.length / Math.max(1, outcomes.length)),
    winRate,
    lostPriceTooHighRate,
    changeRequestRate: total > 0 ? changeRequests.length / total : 0,
    avgCycleDays: avg(cycles),
    paymentDelayRate: total > 0 ? paymentDelays.length / total : 0,
    sampleSize,
    confidence,
    lastUpdated: new Date().toISOString(),
  };
}
