import type { PrismaClient, Prisma } from "@prisma/client";
import type {
  Opportunity,
  CreateOpportunityInput,
  UpdateOpportunityInput,
  OpportunityQuery,
  OpportunitySummary,
} from "./types";

let refCounter = 1;
function nextRef(): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `OPP-${ts}-${String(refCounter++).padStart(3, "0")}`;
}

function normalise(r: {
  id: string; reference: string; customerName: string; customerId: string;
  salesOwnerId: string; channel: string; expectedCloseDate: Date | null;
  targetMarginPct: Prisma.Decimal; strategicPriority: string; status: string;
  estimatedRevenue: Prisma.Decimal | null; notes: string | null;
  metadata: Prisma.JsonValue | null; createdAt: Date; updatedAt: Date;
}): Opportunity {
  return {
    id:                r.id,
    reference:         r.reference,
    customerName:      r.customerName,
    customerId:        r.customerId,
    salesOwnerId:      r.salesOwnerId,
    channel:           r.channel,
    expectedCloseDate: r.expectedCloseDate ?? undefined,
    targetMarginPct:   Number(r.targetMarginPct),
    strategicPriority: r.strategicPriority as Opportunity["strategicPriority"],
    estimatedRevenue:  r.estimatedRevenue ? Number(r.estimatedRevenue) : undefined,
    status:            r.status as Opportunity["status"],
    notes:             r.notes ?? undefined,
    metadata:          r.metadata ? (r.metadata as Record<string, unknown>) : undefined,
    createdAt:         r.createdAt,
    updatedAt:         r.updatedAt,
  };
}

export async function createOpportunity(
  prisma: PrismaClient,
  input: CreateOpportunityInput,
): Promise<Opportunity> {
  const record = await prisma.opportunity.create({
    data: {
      reference:         nextRef(),
      customerName:      input.customerName,
      customerId:        input.customerId,
      salesOwnerId:      input.salesOwnerId,
      channel:           input.channel ?? "DIRECT",
      expectedCloseDate: input.expectedCloseDate,
      targetMarginPct:   input.targetMarginPct,
      strategicPriority: input.strategicPriority ?? "STANDARD",
      estimatedRevenue:  input.estimatedRevenue,
      notes:             input.notes,
      metadata:          input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  return normalise(record);
}

export async function getOpportunity(
  prisma: PrismaClient,
  id: string,
): Promise<Opportunity | null> {
  const r = await prisma.opportunity.findUnique({ where: { id } });
  return r ? normalise(r) : null;
}

export async function updateOpportunity(
  prisma: PrismaClient,
  id: string,
  input: UpdateOpportunityInput,
): Promise<Opportunity> {
  const r = await prisma.opportunity.update({ where: { id }, data: input });
  return normalise(r);
}

export async function listOpportunities(
  prisma: PrismaClient,
  query: OpportunityQuery = {},
): Promise<OpportunitySummary[]> {
  const rows = await prisma.opportunity.findMany({
    where: {
      customerId:        query.customerId,
      salesOwnerId:      query.salesOwnerId,
      status:            query.status,
      strategicPriority: query.strategicPriority,
    },
    orderBy: { createdAt: "desc" },
    take:    query.limit ?? 50,
    include: { _count: { select: { quotes: true } } },
  });

  return rows.map((r) => ({
    id:               r.id,
    reference:        r.reference,
    customerName:     r.customerName,
    channel:          r.channel,
    salesOwnerId:     r.salesOwnerId,
    targetMarginPct:  Number(r.targetMarginPct),
    estimatedRevenue: r.estimatedRevenue ? Number(r.estimatedRevenue) : undefined,
    strategicPriority: r.strategicPriority,
    status:           r.status,
    expectedCloseDate: r.expectedCloseDate ?? undefined,
    quoteCount:       r._count.quotes,
    createdAt:        r.createdAt,
  }));
}

export async function closeOpportunity(
  prisma: PrismaClient,
  id: string,
  outcome: "WON" | "LOST" | "ABANDONED",
): Promise<Opportunity> {
  const r = await prisma.opportunity.update({
    where: { id },
    data:  { status: outcome },
  });
  return normalise(r);
}
