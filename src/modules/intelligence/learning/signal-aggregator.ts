/**
 * Signal aggregator.
 *
 * Aggregates raw QuoteOutcome, CustomerBehaviorRecord, and SupplierPerformanceRecord
 * data into typed OutcomeSignals — confidence-weighted metrics across configurable
 * time periods (30d / 90d / all).
 *
 * Signals are the bridge between raw event data and the learning/feedback layer.
 * Each signal carries a confidence score based on sample size and recency.
 */
import type { PrismaClient } from "@prisma/client";
import type { OutcomeSignal, SignalType } from "../types/outcome.types";

const PERIODS = [
  { key: "30d",  days: 30 },
  { key: "90d",  days: 90 },
  { key: "1y",   days: 365 },
  { key: "all",  days: null as null },
] as const;

function buildWhere(days: number | null, extra?: Record<string, unknown>) {
  return {
    ...(days ? { occurredAt: { gte: new Date(Date.now() - days * 86400000) } } : {}),
    ...extra,
  };
}

function confidenceFromSample(n: number, idealSample = 20): number {
  return Math.min(1, n / idealSample);
}

function makeSignal(
  key: string,
  type: SignalType,
  value: number,
  sampleSize: number,
  period: string,
  supportingValues?: number[],
): OutcomeSignal {
  return {
    signalKey: key,
    signalType: type,
    value,
    confidence: confidenceFromSample(sampleSize),
    sampleSize,
    period,
    updatedAt: new Date().toISOString(),
    supportingValues,
  };
}

export async function aggregateSignals(prisma: PrismaClient): Promise<OutcomeSignal[]> {
  const signals: OutcomeSignal[] = [];

  for (const period of PERIODS) {
    const where = buildWhere(period.days);
    const outcomeWhere = {
      outcome: { in: ["WON", "LOST", "EXPIRED"] },
      ...(period.days ? { quotedAt: { gte: new Date(Date.now() - period.days * 86400000) } } : {}),
    };

    // Win rate
    const outcomes = await prisma.quoteOutcome.findMany({
      where: outcomeWhere,
      select: { outcome: true, realizedMarginPct: true, realizedDiscount: true, cycleDays: true },
    });
    if (outcomes.length > 0) {
      const wins = outcomes.filter((o) => o.outcome === "WON");
      signals.push(makeSignal(
        `win_rate_${period.key}`, "WIN_RATE",
        wins.length / outcomes.length, outcomes.length, period.key,
        [wins.length, outcomes.length],
      ));

      // Realized margin
      const margins = wins.map((o) => Number(o.realizedMarginPct ?? 0)).filter((m) => m !== 0);
      if (margins.length) {
        const avg = margins.reduce((s, v) => s + v, 0) / margins.length;
        signals.push(makeSignal(`realized_margin_pct_${period.key}`, "REALIZED_MARGIN", avg, margins.length, period.key, margins));
      }

      // Discount rate
      const discounts = wins.map((o) => Number(o.realizedDiscount ?? 0));
      const avgDiscount = discounts.reduce((s, v) => s + v, 0) / discounts.length;
      signals.push(makeSignal(`avg_discount_${period.key}`, "DISCOUNT_RATE", avgDiscount, discounts.length, period.key));

      // Cycle duration
      const cycles = outcomes.map((o) => o.cycleDays ?? 0).filter((d) => d > 0);
      if (cycles.length) {
        const avgCycle = cycles.reduce((s, v) => s + v, 0) / cycles.length;
        signals.push(makeSignal(`avg_cycle_days_${period.key}`, "CYCLE_DURATION", avgCycle, cycles.length, period.key));
      }
    }

    // Supplier reliability (all suppliers combined)
    const supplierRecords = await prisma.supplierPerformanceRecord.findMany({
      where,
      select: { wasDelayed: true, hadIssue: true },
    });
    if (supplierRecords.length > 0) {
      const onTime = supplierRecords.filter((r) => !r.wasDelayed).length / supplierRecords.length;
      const issueRate = supplierRecords.filter((r) => r.hadIssue).length / supplierRecords.length;
      signals.push(makeSignal(`supplier_on_time_rate_${period.key}`, "SUPPLIER_RELIABILITY", onTime, supplierRecords.length, period.key));
      signals.push(makeSignal(`supplier_issue_rate_${period.key}`, "SUPPLIER_RELIABILITY", issueRate, supplierRecords.length, period.key));
    }

    // Customer negotiation
    const negotiations = await prisma.customerBehaviorRecord.findMany({
      where: { ...buildWhere(period.days), eventKind: "NEGOTIATED" },
      select: { discountRequested: true, discountGranted: true },
    });
    if (negotiations.length > 0) {
      const reqs = negotiations.map((n) => Number(n.discountRequested ?? 0));
      const granteds = negotiations.map((n) => Number(n.discountGranted ?? 0));
      const avgReq = reqs.reduce((s, v) => s + v, 0) / reqs.length;
      const avgGranted = granteds.reduce((s, v) => s + v, 0) / granteds.length;
      signals.push(makeSignal(`avg_discount_requested_${period.key}`, "DISCOUNT_RATE", avgReq, negotiations.length, period.key));
      signals.push(makeSignal(`avg_discount_granted_${period.key}`, "DISCOUNT_RATE", avgGranted, negotiations.length, period.key));
    }
  }

  return signals;
}
