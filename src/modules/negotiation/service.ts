import type { PrismaClient, Prisma } from "@prisma/client";
import type {
  NegotiationEvent,
  RecordNegotiationEventInput,
  QuoteRevision,
  CreateRevisionInput,
  ConcessionSummary,
  NegotiationGuidance,
  NegotiationEventKind,
  QuoteRevisionReason,
} from "./types";

// ── Normalisation ──────────────────────────────────────────────────────────

function normaliseEvent(r: {
  id: string; quoteId: string; revisionNo: number | null; kind: string;
  requestedValue: Prisma.Decimal | null; requestedDiscount: Prisma.Decimal | null;
  grantedValue: Prisma.Decimal | null; grantedDiscount: Prisma.Decimal | null;
  concessionNote: string | null; performedBy: string | null;
  occurredAt: Date; metadata: Prisma.JsonValue | null;
}): NegotiationEvent {
  return {
    id:                r.id,
    quoteId:           r.quoteId,
    revisionNo:        r.revisionNo ?? undefined,
    kind:              r.kind as NegotiationEventKind,
    requestedValue:    r.requestedValue ? Number(r.requestedValue) : undefined,
    requestedDiscount: r.requestedDiscount ? Number(r.requestedDiscount) : undefined,
    grantedValue:      r.grantedValue ? Number(r.grantedValue) : undefined,
    grantedDiscount:   r.grantedDiscount ? Number(r.grantedDiscount) : undefined,
    concessionNote:    r.concessionNote ?? undefined,
    performedBy:       r.performedBy ?? undefined,
    occurredAt:        r.occurredAt,
    metadata:          r.metadata ? (r.metadata as Record<string, unknown>) : undefined,
  };
}

function normaliseRevision(r: {
  id: string; quoteId: string; revisionNo: number; reason: string;
  snapshot: Prisma.JsonValue; changedBy: string | null; changeNote: string | null;
  createdAt: Date;
}): QuoteRevision {
  return {
    id:         r.id,
    quoteId:    r.quoteId,
    revisionNo: r.revisionNo,
    reason:     r.reason as QuoteRevisionReason,
    snapshot:   r.snapshot,
    changedBy:  r.changedBy  ?? undefined,
    changeNote: r.changeNote ?? undefined,
    createdAt:  r.createdAt,
  };
}

// ── Revisions ─────────────────────────────────────────────────────────────

export async function createRevision(
  prisma: PrismaClient,
  input: CreateRevisionInput,
): Promise<QuoteRevision> {
  // Determine next revision number
  const latest = await prisma.quoteRevision.findFirst({
    where:   { quoteId: input.quoteId },
    orderBy: { revisionNo: "desc" },
    select:  { revisionNo: true },
  });
  const nextNo = (latest?.revisionNo ?? 0) + 1;

  const r = await prisma.quoteRevision.create({
    data: {
      quoteId:    input.quoteId,
      revisionNo: nextNo,
      reason:     input.reason,
      snapshot:   input.snapshot as Prisma.InputJsonValue,
      changedBy:  input.changedBy,
      changeNote: input.changeNote,
    },
  });
  return normaliseRevision(r);
}

export async function getRevisions(
  prisma: PrismaClient,
  quoteId: string,
): Promise<QuoteRevision[]> {
  const rows = await prisma.quoteRevision.findMany({
    where:   { quoteId },
    orderBy: { revisionNo: "desc" },
  });
  return rows.map(normaliseRevision);
}

export async function getRevision(
  prisma: PrismaClient,
  quoteId: string,
  revisionNo: number,
): Promise<QuoteRevision | null> {
  const r = await prisma.quoteRevision.findUnique({
    where: { quoteId_revisionNo: { quoteId, revisionNo } },
  });
  return r ? normaliseRevision(r) : null;
}

// ── Negotiation events ─────────────────────────────────────────────────────

export async function recordNegotiationEvent(
  prisma: PrismaClient,
  input: RecordNegotiationEventInput,
): Promise<NegotiationEvent> {
  const r = await prisma.negotiationEvent.create({
    data: {
      quoteId:           input.quoteId,
      revisionNo:        input.revisionNo,
      kind:              input.kind,
      requestedValue:    input.requestedValue,
      requestedDiscount: input.requestedDiscount,
      grantedValue:      input.grantedValue,
      grantedDiscount:   input.grantedDiscount,
      concessionNote:    input.concessionNote,
      performedBy:       input.performedBy,
      metadata:          input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  return normaliseEvent(r);
}

export async function getNegotiationTimeline(
  prisma: PrismaClient,
  quoteId: string,
): Promise<NegotiationEvent[]> {
  const rows = await prisma.negotiationEvent.findMany({
    where:   { quoteId },
    orderBy: { occurredAt: "asc" },
  });
  return rows.map(normaliseEvent);
}

// ── Concession summary ─────────────────────────────────────────────────────

export async function buildConcessionSummary(
  prisma: PrismaClient,
  quoteId: string,
): Promise<ConcessionSummary> {
  const events = await getNegotiationTimeline(prisma, quoteId);

  let totalDiscountRequested = 0;
  let totalDiscountGranted   = 0;
  let totalValueRequested    = 0;
  let totalValueGranted      = 0;

  for (const e of events) {
    totalDiscountRequested += e.requestedDiscount ?? 0;
    totalDiscountGranted   += e.grantedDiscount   ?? 0;
    totalValueRequested    += e.requestedValue    ?? 0;
    totalValueGranted      += e.grantedValue      ?? 0;
  }

  const isClosed = events.some(
    (e) => e.kind === "ACCEPTANCE" || e.kind === "REJECTION",
  );

  return {
    quoteId,
    totalDiscountRequested,
    totalDiscountGranted,
    totalValueRequested,
    totalValueGranted,
    concessionRatio: totalDiscountRequested > 0
      ? totalDiscountGranted / totalDiscountRequested
      : 0,
    eventCount:    events.length,
    timeline:      events,
    lastEventKind: events.at(-1)?.kind,
    isClosed,
  };
}

// ── Negotiation guidance (simulated assistant) ────────────────────────────

export function buildNegotiationGuidance(params: {
  currentPrice: number;
  costBasis: number;
  targetMarginPct: number;
  winProbabilityAtCurrentPrice: number;
  concessionSummary: ConcessionSummary;
  strategicPriority: string;
}): NegotiationGuidance {
  const {
    currentPrice, costBasis, targetMarginPct,
    winProbabilityAtCurrentPrice, concessionSummary, strategicPriority,
  } = params;

  // Minimum acceptable price preserving a 5pp margin floor
  const absoluteFloorMargin = Math.max(0.05, targetMarginPct - 0.12);
  const suggestedFloor = costBasis / (1 - absoluteFloorMargin);

  // Counter-offer: current price minus half the gap to floor
  const suggestedCounterOffer = currentPrice - (currentPrice - suggestedFloor) * 0.4;

  // Win probability at floor (heuristic: higher discount → higher win prob)
  const discountToFloor = (currentPrice - suggestedFloor) / currentPrice;
  const winProbabilityAtFloor = Math.min(
    0.95,
    winProbabilityAtCurrentPrice + discountToFloor * 0.4,
  );

  const marginAtCurrentPrice = (currentPrice - costBasis) / currentPrice;
  const marginAtFloor = absoluteFloorMargin;

  const maxConcessionPct = (currentPrice - suggestedFloor) / currentPrice;

  const tactics: string[] = [
    "Anchor to value delivered, not unit price",
    "Bundle accessories to protect core unit margin",
    `Current margin at ${(marginAtCurrentPrice * 100).toFixed(1)}% — floor is ${(marginAtFloor * 100).toFixed(1)}%`,
  ];

  if (strategicPriority === "MUST_WIN" || strategicPriority === "STRATEGIC") {
    tactics.push("Strategic account — prioritize win over short-term margin");
    tactics.push("Offer extended warranty or service SLA as non-cash concession");
  }

  if (concessionSummary.concessionRatio > 0.6) {
    tactics.push("Concession ratio is high — stop discounting; offer scope reduction instead");
  }

  if (concessionSummary.eventCount >= 3) {
    tactics.push("Multiple negotiation rounds — set clear deadline to close");
  }

  const risks: string[] = [];
  if (marginAtCurrentPrice < targetMarginPct) {
    risks.push(`Already below target margin of ${(targetMarginPct * 100).toFixed(1)}% — requires approval`);
  }
  if (discountToFloor > 0.15) {
    risks.push("Large remaining concession space — customer may continue pushing");
  }
  if (concessionSummary.isClosed) {
    risks.push("Negotiation is closed — no further modifications accepted");
  }

  const aiContextBlock = JSON.stringify({
    currentPrice,
    suggestedFloor,
    suggestedCounterOffer,
    maxConcessionPct,
    winProbabilityAtCurrentPrice,
    winProbabilityAtFloor,
    marginAtCurrentPrice,
    marginAtFloor,
    tactics,
    risks,
    strategicPriority,
    concessionRatio: concessionSummary.concessionRatio,
    eventCount: concessionSummary.eventCount,
  });

  return {
    suggestedFloor,
    suggestedCounterOffer,
    maxConcessionPct,
    winProbabilityAtCurrentPrice,
    winProbabilityAtFloor,
    marginAtCurrentPrice,
    marginAtFloor,
    tactics,
    risks,
    aiContextBlock,
  };
}
