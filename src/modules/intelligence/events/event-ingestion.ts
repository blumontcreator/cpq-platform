/**
 * Event ingestion pipeline.
 *
 * Each ingestEvent call:
 *   1. Validates the event payload against its schema
 *   2. Writes the immutable CommercialEvent record
 *   3. Runs event-specific projections (read-model updates):
 *      - quote_won / quote_lost / quote_expired → upsert QuoteOutcome
 *      - quote_negotiated → insert CustomerBehaviorRecord
 *      - supplier_delay / installation_issue → insert SupplierPerformanceRecord
 *      - customer_change_request / payment_delay → insert CustomerBehaviorRecord
 *
 * All projections run in a single transaction for consistency.
 * Validation failures throw — let callers decide how to handle.
 */
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import type { PrismaClient } from "@prisma/client";
import { validateEventPayload } from "./event-schema";
import type { EventKind } from "../types/event.types";
import type {
  QuoteWonPayload,
  QuoteLostPayload,
  QuoteExpiredPayload,
  QuoteCreatedPayload,
  QuoteNegotiatedPayload,
  SupplierDelayPayload,
  InstallationIssuePayload,
  PaymentDelayPayload,
  CustomerChangeRequestPayload,
} from "../types/event.types";

export interface IngestEventInput {
  kind: EventKind;
  quoteId?: string;
  customerId?: string;
  supplierId?: string;
  variantSku?: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface IngestResult {
  eventId: string;
  warnings: string[];
}

export async function ingestEvent(
  prisma: PrismaClient,
  input: IngestEventInput,
): Promise<IngestResult> {
  const validation = validateEventPayload(input.kind, input.payload);
  if (!validation.valid) {
    throw new ValidationError(`Invalid ${input.kind} payload: ${validation.errors?.join("; ")}`, { kind: input.kind }, "intelligence");
  }

  const payload = validation.parsed!;
  const eventId = randomUUID();
  const occurredAt = input.occurredAt ?? new Date();
  const warnings: string[] = [];

  await prisma.$transaction(async (tx) => {
    // 1. Write event log
    await tx.commercialEvent.create({
      data: {
        id: eventId,
        kind: input.kind,
        quoteId: input.quoteId,
        customerId: input.customerId,
        supplierId: input.supplierId,
        variantSku: input.variantSku,
        payload: payload as Parameters<typeof tx.commercialEvent.create>[0]["data"]["payload"],
        occurredAt,
        metadata: input.metadata
          ? (input.metadata as Parameters<typeof tx.commercialEvent.create>[0]["data"]["metadata"])
          : undefined,
      },
    });

    // 2. Projections
    switch (input.kind) {
      case "quote_created": {
        if (!input.quoteId) break;
        const p = payload as unknown as QuoteCreatedPayload;
        await tx.quoteOutcome.upsert({
          where: { quoteId: input.quoteId },
          create: {
            quoteId: input.quoteId,
            outcome: "PENDING",
            quotedRevenue: p.quotedRevenue,
            quotedMarginPct: p.quotedMarginPct,
            quotedDiscount: 0,
            strategy: p.strategy,
            channel: p.channel,
            customerId: input.customerId,
            quotedAt: occurredAt,
          },
          update: { strategy: p.strategy, channel: p.channel },
        });
        break;
      }

      case "quote_won": {
        if (!input.quoteId) break;
        const p = payload as unknown as QuoteWonPayload;
        const cycleDays = p.cycleDays;
        await tx.quoteOutcome.upsert({
          where: { quoteId: input.quoteId },
          create: {
            quoteId: input.quoteId,
            outcome: "WON",
            quotedRevenue: p.finalRevenue,
            quotedMarginPct: p.finalMarginPct,
            quotedDiscount: p.finalDiscount,
            realizedRevenue: p.finalRevenue,
            realizedMarginPct: p.finalMarginPct,
            realizedDiscount: p.finalDiscount,
            strategy: p.strategy,
            channel: p.channel,
            customerId: input.customerId,
            quotedAt: new Date(occurredAt.getTime() - cycleDays * 86400000),
            closedAt: occurredAt,
            cycleDays,
          },
          update: {
            outcome: "WON",
            realizedRevenue: p.finalRevenue,
            realizedMarginPct: p.finalMarginPct,
            realizedDiscount: p.finalDiscount,
            strategy: p.strategy ?? undefined,
            channel: p.channel ?? undefined,
            closedAt: occurredAt,
            cycleDays,
          },
        });
        break;
      }

      case "quote_lost": {
        if (!input.quoteId) break;
        const p = payload as unknown as QuoteLostPayload;
        await tx.quoteOutcome.upsert({
          where: { quoteId: input.quoteId },
          create: {
            quoteId: input.quoteId,
            outcome: "LOST",
            quotedRevenue: p.quotedRevenue,
            quotedMarginPct: 0,
            quotedDiscount: 0,
            lossReason: p.lossReason,
            competitorPrice: p.competitorPrice,
            strategy: p.strategy,
            customerId: input.customerId,
            quotedAt: new Date(occurredAt.getTime() - 86400000),
            closedAt: occurredAt,
          },
          update: {
            outcome: "LOST",
            lossReason: p.lossReason,
            competitorPrice: p.competitorPrice,
            closedAt: occurredAt,
          },
        });
        break;
      }

      case "quote_expired": {
        if (!input.quoteId) break;
        const p = payload as unknown as QuoteExpiredPayload;
        await tx.quoteOutcome.upsert({
          where: { quoteId: input.quoteId },
          create: {
            quoteId: input.quoteId,
            outcome: "EXPIRED",
            quotedRevenue: p.quotedRevenue,
            quotedMarginPct: 0,
            quotedDiscount: 0,
            customerId: input.customerId,
            quotedAt: new Date(occurredAt.getTime() - (p.daysSinceLastActivity ?? 30) * 86400000),
            closedAt: occurredAt,
            cycleDays: p.daysSinceLastActivity,
          },
          update: { outcome: "EXPIRED", closedAt: occurredAt },
        });
        break;
      }

      case "quote_negotiated": {
        if (!input.customerId) break;
        const p = payload as unknown as QuoteNegotiatedPayload;
        await tx.customerBehaviorRecord.create({
          data: {
            customerId: input.customerId,
            eventKind: "NEGOTIATED",
            originalValue: p.originalRevenue,
            negotiatedValue: p.negotiatedRevenue,
            discountRequested: p.discountRequested,
            discountGranted: p.discountGranted,
            quoteId: input.quoteId,
            occurredAt,
          },
        });
        if (input.quoteId) {
          await tx.quoteOutcome.updateMany({
            where: { quoteId: input.quoteId },
            data: {
              realizedDiscount: p.discountGranted,
              realizedRevenue: p.negotiatedRevenue,
            },
          });
        }
        break;
      }

      case "supplier_delay": {
        const p = payload as unknown as SupplierDelayPayload;
        await tx.supplierPerformanceRecord.create({
          data: {
            supplierId: p.supplierId ?? input.supplierId ?? "unknown",
            variantSku: p.variantSku ?? input.variantSku,
            promisedLeadDays: p.promisedLeadDays,
            actualLeadDays: p.actualLeadDays,
            delayDays: p.delayDays,
            wasDelayed: p.delayDays > 0,
            quoteId: input.quoteId,
            occurredAt,
          },
        });
        break;
      }

      case "installation_issue": {
        const p = payload as unknown as InstallationIssuePayload;
        await tx.supplierPerformanceRecord.create({
          data: {
            supplierId: p.supplierId ?? input.supplierId ?? "unknown",
            variantSku: p.variantSku ?? input.variantSku,
            hadIssue: true,
            issueDescription: p.issueDescription ?? p.issueKind,
            quoteId: input.quoteId,
            occurredAt,
          },
        });
        break;
      }

      case "payment_delay":
      case "customer_change_request": {
        const customerId =
          (payload as unknown as PaymentDelayPayload | CustomerChangeRequestPayload).customerId ??
          input.customerId;
        if (!customerId) break;
        await tx.customerBehaviorRecord.create({
          data: {
            customerId,
            eventKind: input.kind === "payment_delay" ? "PAYMENT_DELAY" : "CHANGE_REQUEST",
            quoteId: input.quoteId,
            occurredAt,
          },
        });
        break;
      }
    }
  });

  return { eventId, warnings };
}

export async function ingestBatch(
  prisma: PrismaClient,
  events: IngestEventInput[],
): Promise<{ ingested: number; failed: number; errors: string[] }> {
  let ingested = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const event of events) {
    try {
      await ingestEvent(prisma, event);
      ingested++;
    } catch (err) {
      failed++;
      errors.push(`${event.kind}${event.quoteId ? ` (quote ${event.quoteId})` : ""}: ${(err as Error).message}`);
    }
  }

  return { ingested, failed, errors };
}

// ── Timeline builder ───────────────────────────────────────────────────────

export async function buildEventTimeline(
  prisma: PrismaClient,
  quoteId: string,
): Promise<import("../types/event.types").EventTimeline> {
  const events = await prisma.commercialEvent.findMany({
    where: { quoteId },
    orderBy: { occurredAt: "asc" },
  });

  const entries = events.map((e) => ({
    eventId: e.id,
    kind: e.kind as import("../types/event.types").EventKind,
    occurredAt: e.occurredAt,
    summary: summariseEvent(e.kind, e.payload as Record<string, unknown>),
  }));

  return {
    quoteId,
    entries,
    firstEventAt: entries[0]?.occurredAt,
    lastEventAt: entries[entries.length - 1]?.occurredAt,
  };
}

function summariseEvent(kind: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case "quote_created":   return `Quote created — ${payload["currency"]} ${Number(payload["quotedRevenue"]).toFixed(0)} at ${Number(payload["quotedMarginPct"]).toFixed(1)}% margin`;
    case "quote_sent":      return `Quote sent — ${Number(payload["quotedRevenue"]).toFixed(0)} revenue`;
    case "quote_viewed":    return `Quote viewed (view #${payload["viewCount"] ?? "?"})`;
    case "quote_negotiated":return `Negotiated: ${payload["discountGranted"]}% discount granted (${payload["discountRequested"]}% requested)`;
    case "quote_won":       return `WON at ${Number(payload["finalRevenue"]).toFixed(0)} revenue, ${Number(payload["finalMarginPct"]).toFixed(1)}% margin`;
    case "quote_lost":      return `LOST — reason: ${payload["lossReason"]}`;
    case "quote_expired":   return `Expired after ${payload["daysSinceLastActivity"] ?? "?"} days`;
    case "supplier_delay":  return `Supplier delayed ${payload["delayDays"]} days (promised ${payload["promisedLeadDays"]}d, actual ${payload["actualLeadDays"]}d)`;
    case "installation_issue": return `Installation issue: ${payload["issueKind"]}`;
    case "payment_delay":   return `Payment delayed ${payload["delayDays"]} days`;
    case "customer_change_request": return `Change request: ${payload["changeKind"]}`;
    default:                return kind.replace(/_/g, " ");
  }
}
