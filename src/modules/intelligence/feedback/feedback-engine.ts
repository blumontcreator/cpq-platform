/**
 * Feedback engine.
 *
 * Aggregates all learning signals and profiles into a FeedbackSignals object
 * that can be injected into the simulation/optimization engine to make it
 * data-driven instead of heuristic-only.
 *
 * Integration seams with the optimizer:
 *
 *   1. WinProbabilityModel → replaces estimateWinProbability() in objective-scorer.ts
 *      when hasEnoughData = true (use lookupWinProbability() instead).
 *
 *   2. StrategyRanking → biases the default strategy choice in runOptimization().
 *
 *   3. SupplierRiskFactor.leadTimeConfidenceMultiplier → applied to lead-time
 *      nodes in the candidate generator to add appropriate buffers.
 *
 *   4. PricingConfidenceFactor → lowers evaluation.confidence for variants with
 *      high historical discount rates.
 *
 *   5. CustomerBehaviorProfile → calibrates negotiation walk-away prices
 *      in buildNegotiationGuidance().
 *
 * This module is the "memory loop" — it feeds commercial history back into
 * future quote decisions without requiring any manual configuration.
 */
import type { PrismaClient } from "@prisma/client";
import type { FeedbackSignals, PricingConfidenceFactor } from "../types/learning.types";
import { aggregateSignals } from "../learning/signal-aggregator";
import { buildWinProbabilityModel, buildStrategyRanking } from "../learning/strategy-learner";
import { detectAllTrends, detectAnomalies } from "../learning/trend-anomaly";
import { buildCustomerProfile } from "../profiles/customer-profiler";
import { buildAllSupplierRiskFactors } from "../profiles/supplier-profiler";

export interface FeedbackContext {
  customerId?: string;
  /** Specific supplier ids to include in risk factors (all if omitted). */
  supplierIds?: string[];
  periodDays?: number;
}

export async function buildFeedbackSignals(
  prisma: PrismaClient,
  context: FeedbackContext = {},
): Promise<FeedbackSignals> {
  const { customerId, periodDays = 90 } = context;

  // Aggregate signals across multiple periods
  const allSignals = await aggregateSignals(prisma);
  const signals30d = allSignals.filter((s) => s.period === "30d");
  const signals90d = allSignals.filter((s) => s.period === "90d");

  // Strategy ranking + win probability model
  const [strategyRanking, winProbabilityModel] = await Promise.all([
    buildStrategyRanking(prisma, periodDays),
    buildWinProbabilityModel(prisma, periodDays),
  ]);

  // Supplier risk factors
  const supplierRiskFactors = await buildAllSupplierRiskFactors(prisma, periodDays);

  // Pricing confidence factors (derived from avg discount history per variant)
  const pricingConfidenceFactors = await buildPricingConfidenceFactors(prisma, periodDays);

  // Customer profile (optional)
  const customerProfile = customerId
    ? await buildCustomerProfile(prisma, customerId, periodDays)
    : undefined;

  // Trends & anomalies
  const trends = detectAllTrends(allSignals);
  const anomalies = detectAnomalies(signals30d, signals90d);

  // Overall confidence: based on data richness
  const totalSignals = allSignals.filter((s) => s.period === "30d").length;
  const overallConfidence = Math.min(1, totalSignals / 8);

  return {
    winProbabilityModel,
    strategyRanking,
    pricingConfidenceFactors,
    customerProfile,
    supplierRiskFactors,
    trends,
    anomalies,
    generatedAt: new Date().toISOString(),
    overallConfidence,
  };
}

async function buildPricingConfidenceFactors(
  prisma: PrismaClient,
  periodDays: number,
): Promise<PricingConfidenceFactor[]> {
  // Find variants with consistently high discounts in won deals
  const won = await prisma.quoteOutcome.findMany({
    where: {
      outcome: "WON",
      realizedDiscount: { gt: 0 },
      ...(periodDays ? { quotedAt: { gte: new Date(Date.now() - periodDays * 86400000) } } : {}),
    },
    include: {
      quote: { include: { lines: { include: { variant: true } } } },
    },
  });

  const skuDiscounts = new Map<string, number[]>();

  for (const outcome of won) {
    const discount = Number(outcome.realizedDiscount ?? 0);
    for (const line of outcome.quote.lines) {
      const sku = line.variant.sku;
      const list = skuDiscounts.get(sku) ?? [];
      list.push(discount);
      skuDiscounts.set(sku, list);
    }
  }

  const factors: PricingConfidenceFactor[] = [];
  for (const [sku, discounts] of skuDiscounts) {
    if (discounts.length < 3) continue;
    const avg = discounts.reduce((s, v) => s + v, 0) / discounts.length;
    if (avg < 5) continue; // ignore tiny discounts

    // Penalty: 5% avg discount → -0.05 confidence penalty (cap at -0.3)
    const penalty = Math.min(0.3, avg / 100);
    factors.push({
      variantSku: sku,
      confidencePenalty: penalty,
      avgHistoricalDiscount: avg,
      sampleSize: discounts.length,
      reason: `SKU ${sku} has been discounted an average of ${avg.toFixed(1)}% across ${discounts.length} won deals — list price may be above market`,
    });
  }

  return factors;
}
