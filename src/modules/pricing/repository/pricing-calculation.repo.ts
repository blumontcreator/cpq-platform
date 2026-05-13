/**
 * PricingCalculation repository.
 *
 * Supports audit retrieval, profitability queries, and simulation history.
 */
import type { PrismaClient } from "@prisma/client";
import type { PricingResult } from "../types/pricing-result.types";
import type { PricingContext } from "../types/pricing-context.types";

export async function getCalculationsByVariant(
  prisma: PrismaClient,
  variantSku: string,
  limit = 10,
) {
  const variant = await prisma.productVariant.findUnique({
    where: { sku: variantSku },
    select: { id: true },
  });
  if (!variant) return [];

  return prisma.pricingCalculation.findMany({
    where: { variantId: variant.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { policy: { select: { name: true } } },
  });
}

export async function getLatestCalculation(
  prisma: PrismaClient,
  variantSku: string,
): Promise<{ result: PricingResult; context: PricingContext } | null> {
  const variant = await prisma.productVariant.findUnique({
    where: { sku: variantSku },
    select: { id: true },
  });
  if (!variant) return null;

  const row = await prisma.pricingCalculation.findFirst({
    where: { variantId: variant.id },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;

  return {
    result: row.result as unknown as PricingResult,
    context: row.context as unknown as PricingContext,
  };
}

export interface ProfitabilitySummary {
  variantSku: string;
  latestMarginPct: number;
  latestRecommendedPrice: number;
  totalCost: number;
  currency: string;
  calculatedAt: string;
}

export async function getProfitabilitySummaries(
  prisma: PrismaClient,
  variantSkus: string[],
): Promise<ProfitabilitySummary[]> {
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: variantSkus } },
    select: { id: true, sku: true },
  });

  const results: ProfitabilitySummary[] = [];
  for (const v of variants) {
    const row = await prisma.pricingCalculation.findFirst({
      where: { variantId: v.id },
      orderBy: { createdAt: "desc" },
    });
    if (!row) continue;
    const r = row.result as unknown as PricingResult;
    results.push({
      variantSku: v.sku,
      latestMarginPct: r.marginPct,
      latestRecommendedPrice: r.recommendedPrice,
      totalCost: r.totalCost,
      currency: r.currency,
      calculatedAt: r.trace.calculatedAt,
    });
  }
  return results;
}
