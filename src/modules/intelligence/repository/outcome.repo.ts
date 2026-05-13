import type { PrismaClient } from "@prisma/client";
import type { QuoteOutcome, OutcomeStatus } from "../types/outcome.types";

function mapRow(row: {
  id: string; quoteId: string; outcome: string;
  quotedRevenue: unknown; quotedMarginPct: unknown; quotedDiscount: unknown;
  realizedRevenue: unknown | null; realizedMarginPct: unknown | null; realizedDiscount: unknown | null;
  strategy: string | null; channel: string | null; customerId: string | null;
  quotedAt: Date; closedAt: Date | null; cycleDays: number | null;
  lossReason: string | null; competitorPrice: unknown | null;
}): QuoteOutcome {
  return {
    id: row.id,
    quoteId: row.quoteId,
    outcome: row.outcome as OutcomeStatus,
    quotedRevenue: Number(row.quotedRevenue),
    quotedMarginPct: Number(row.quotedMarginPct),
    quotedDiscount: Number(row.quotedDiscount),
    realizedRevenue: row.realizedRevenue != null ? Number(row.realizedRevenue) : undefined,
    realizedMarginPct: row.realizedMarginPct != null ? Number(row.realizedMarginPct) : undefined,
    realizedDiscount: row.realizedDiscount != null ? Number(row.realizedDiscount) : undefined,
    strategy: row.strategy ?? undefined,
    channel: row.channel ?? undefined,
    customerId: row.customerId ?? undefined,
    quotedAt: row.quotedAt,
    closedAt: row.closedAt ?? undefined,
    cycleDays: row.cycleDays ?? undefined,
    lossReason: row.lossReason ?? undefined,
    competitorPrice: row.competitorPrice != null ? Number(row.competitorPrice) : undefined,
  };
}

export async function getQuoteOutcome(
  prisma: PrismaClient,
  quoteId: string,
): Promise<QuoteOutcome | null> {
  const row = await prisma.quoteOutcome.findUnique({ where: { quoteId } });
  return row ? mapRow(row) : null;
}

export async function getOutcomesByCustomer(
  prisma: PrismaClient,
  customerId: string,
  limitDays?: number,
): Promise<QuoteOutcome[]> {
  const rows = await prisma.quoteOutcome.findMany({
    where: {
      customerId,
      ...(limitDays ? { quotedAt: { gte: new Date(Date.now() - limitDays * 86400000) } } : {}),
    },
    orderBy: { quotedAt: "desc" },
  });
  return rows.map(mapRow);
}

export async function getRecentOutcomes(
  prisma: PrismaClient,
  limitDays = 90,
  limit = 200,
): Promise<QuoteOutcome[]> {
  const rows = await prisma.quoteOutcome.findMany({
    where: { quotedAt: { gte: new Date(Date.now() - limitDays * 86400000) } },
    orderBy: { quotedAt: "desc" },
    take: limit,
  });
  return rows.map(mapRow);
}
