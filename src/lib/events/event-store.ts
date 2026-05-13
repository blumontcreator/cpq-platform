/**
 * Event store — persistence layer for domain events.
 *
 * All events are append-only. The event store guarantees:
 *   - No duplicate event IDs (idempotencyKey uniqueness at DB level)
 *   - Total ordering within an aggregate (by occurredAt)
 *   - Queryable by aggregate, event type, and time range
 *
 * Prisma ↔ domain type boundary is handled exclusively by event-serializer.ts.
 * No Prisma-specific types leak out of this module.
 */
import type { PrismaClient } from "@prisma/client";
import type { DomainEvent, AnyDomainEvent } from "./domain-events";
import {
  serializeDomainEvent,
  deserializeEventRecord,
  deserializeEventRecords,
  nullToUndefined,
  type RawEventRecord,
} from "./event-serializer";
import { eventBusLogger as log } from "../observability/logger";

// ── Public shape of a stored event ────────────────────────────────────────

export interface StoredEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  /** Deserialised payload — use deserializeEventRecord for full domain type. */
  payload: unknown;
  metadata: unknown;
  occurredAt: Date;
  processedAt: Date | null;
  idempotencyKey: string | null;
}

// ── Internal helper ────────────────────────────────────────────────────────

function toStoredEvent(r: RawEventRecord): StoredEvent {
  return {
    id:            r.id,
    eventType:     r.eventType,
    aggregateId:   r.aggregateId,
    aggregateType: r.aggregateType,
    payload:       r.payload,
    metadata:      r.metadata,
    occurredAt:    r.occurredAt,
    processedAt:   r.processedAt,
    idempotencyKey: nullToUndefined(r.idempotencyKey) ?? null,
  };
}

// ── Append ────────────────────────────────────────────────────────────────

export async function appendEvent(
  prisma: PrismaClient,
  event: DomainEvent,
  options: { idempotencyKey?: string; markProcessed?: boolean } = {},
): Promise<StoredEvent> {
  const serialised = serializeDomainEvent(event);
  const idempotencyKey = options.idempotencyKey ?? event.metadata.eventId;

  try {
    const record = await prisma.domainEventRecord.create({
      data: {
        ...serialised,
        processedAt:   options.markProcessed ? new Date() : null,
        idempotencyKey,
      },
    });
    return toStoredEvent(record as RawEventRecord);
  } catch (err: unknown) {
    // Postgres unique violation on idempotencyKey → duplicate event, skip silently
    const isUniqueViolation =
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "P2002";

    if (isUniqueViolation) {
      log.debug("Duplicate event skipped", { idempotencyKey, type: event.type });
      const existing = await prisma.domainEventRecord.findUnique({
        where: { idempotencyKey },
      });
      return toStoredEvent(existing as RawEventRecord);
    }
    throw err;
  }
}

export async function appendBatch(
  prisma: PrismaClient,
  events: DomainEvent[],
  options: { markProcessed?: boolean } = {},
): Promise<number> {
  let appended = 0;
  for (const event of events) {
    await appendEvent(prisma, event, options);
    appended++;
  }
  return appended;
}

// ── Query ─────────────────────────────────────────────────────────────────

export async function getEventsForAggregate(
  prisma: PrismaClient,
  aggregateId: string,
  options: { eventType?: string; limit?: number } = {},
): Promise<StoredEvent[]> {
  const records = await prisma.domainEventRecord.findMany({
    where: { aggregateId, eventType: options.eventType },
    orderBy: { occurredAt: "asc" },
    take: options.limit ?? 200,
  });
  return records.map((r) => toStoredEvent(r as RawEventRecord));
}

export async function getUnprocessedEvents(
  prisma: PrismaClient,
  options: { eventType?: string; limit?: number } = {},
): Promise<StoredEvent[]> {
  const records = await prisma.domainEventRecord.findMany({
    where: { processedAt: null, eventType: options.eventType },
    orderBy: { occurredAt: "asc" },
    take: options.limit ?? 100,
  });
  return records.map((r) => toStoredEvent(r as RawEventRecord));
}

export async function markEventProcessed(
  prisma: PrismaClient,
  eventId: string,
): Promise<void> {
  await prisma.domainEventRecord.update({
    where: { id: eventId },
    data: { processedAt: new Date() },
  });
}

export async function markBatchProcessed(
  prisma: PrismaClient,
  eventIds: string[],
): Promise<void> {
  await prisma.domainEventRecord.updateMany({
    where: { id: { in: eventIds } },
    data: { processedAt: new Date() },
  });
}

// ── Replay support ────────────────────────────────────────────────────────

/**
 * Returns all domain events for an aggregate in chronological order.
 *
 * The deserialization boundary (RawEventRecord → AnyDomainEvent) is handled
 * by `deserializeEventRecords` in event-serializer.ts. Callers receive fully
 * typed domain events; no Prisma types escape.
 */
export async function replayEventsForAggregate(
  prisma: PrismaClient,
  aggregateId: string,
  upToDate?: Date,
): Promise<AnyDomainEvent[]> {
  const records = await prisma.domainEventRecord.findMany({
    where: {
      aggregateId,
      occurredAt: upToDate ? { lte: upToDate } : undefined,
    },
    orderBy: { occurredAt: "asc" },
  });

  // All Prisma→domain type coercion is isolated in the serializer module.
  return deserializeEventRecords(records as RawEventRecord[]);
}

/**
 * Deserialise a single stored event into a fully-typed domain event.
 * Use when you already have a StoredEvent from a query and need the typed form.
 */
export function hydrateDomainEvent(stored: StoredEvent): AnyDomainEvent {
  return deserializeEventRecord(stored as unknown as RawEventRecord);
}
