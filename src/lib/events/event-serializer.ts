/**
 * Event serialization / deserialization boundary.
 *
 * This module is the ONLY place where Prisma.JsonValue ↔ domain types cross.
 * All reads from the event store go through `deserializeEventRecord`.
 * All writes go through `serializeDomainEvent`.
 *
 * Architecture rationale:
 *   - Domain event types (AnyDomainEvent) carry strongly-typed payloads.
 *   - Prisma stores JSON as `JsonValue`, which TypeScript types as
 *     `string | number | boolean | null | JsonObject | JsonArray`.
 *     That union does NOT overlap structurally with every concrete payload
 *     shape, so a direct cast is correctly rejected by the compiler.
 *   - The solution is to route through `unknown` at a single, named
 *     boundary so the unsafe assertion is isolated, documented, and testable.
 *   - At runtime, the shape IS correct because we serialise with
 *     `JSON.stringify / JSON.parse` symmetrically; TypeScript cannot prove
 *     this statically, so we make the contract explicit here.
 *
 * Future:
 *   - Add `zod` schemas per event type here for full runtime validation.
 *   - Replace the `unknown` cast with `safeParse` to catch schema drift.
 */
import type { Prisma } from "@prisma/client";
import type {
  DomainEvent,
  DomainEventMetadata,
  AnyDomainEvent,
} from "./domain-events";

// ── Prisma-layer types (kept local so they never escape to domain code) ───

/** The raw shape returned by prisma.domainEventRecord.findMany / findUnique. */
export interface RawEventRecord {
  id: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: Prisma.JsonValue;
  metadata: Prisma.JsonValue | null;
  occurredAt: Date;
  processedAt: Date | null;
  idempotencyKey: string | null;
}

// ── Serialise ──────────────────────────────────────────────────────────────

/**
 * Convert a domain event into the data shape expected by
 * `prisma.domainEventRecord.create`.
 *
 * Payload and metadata are deeply cloned through JSON to strip any
 * non-serialisable values (Date objects, undefined fields, etc.).
 * The result is a plain `JsonObject` that Prisma accepts without complaint.
 */
export function serializeDomainEvent(event: DomainEvent): {
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: Prisma.InputJsonValue;
  metadata: Prisma.InputJsonValue;
  occurredAt: Date;
} {
  return {
    eventType:     event.type,
    aggregateId:   event.aggregateId,
    aggregateType: event.aggregateType,
    // JSON round-trip ensures only Prisma-safe primitives remain
    payload:  JSON.parse(JSON.stringify(event.payload))  as Prisma.InputJsonValue,
    metadata: JSON.parse(JSON.stringify(event.metadata)) as Prisma.InputJsonValue,
    occurredAt: new Date(event.metadata.occurredAt),
  };
}

// ── Deserialise ────────────────────────────────────────────────────────────

/**
 * Convert a raw Prisma record back into a domain event.
 *
 * The `unknown` intermediary is the explicit contract:
 * "We asserted at write-time that the stored JSON has this shape; we trust it."
 *
 * If you add runtime validation (e.g. zod), replace the `as unknown as T`
 * casts below with `EventSchemas[record.eventType].parse(...)`.
 */
export function deserializeEventRecord(record: RawEventRecord): AnyDomainEvent {
  // Route through unknown to bridge Prisma.JsonValue → typed payload.
  // This is the single, documented, intentionally-unsafe boundary.
  const payload  = record.payload  as unknown;
  const metadata = (record.metadata ?? {}) as unknown;

  return {
    type:          record.eventType,
    aggregateId:   record.aggregateId,
    aggregateType: record.aggregateType,
    payload,
    metadata: metadata as DomainEventMetadata,
  } as AnyDomainEvent;
}

/**
 * Deserialise a batch of raw records.
 * Filters out idempotency bookkeeping records (eventType = "IDEMPOTENCY_RECORD").
 */
export function deserializeEventRecords(records: RawEventRecord[]): AnyDomainEvent[] {
  return records
    .filter((r) => r.eventType !== "IDEMPOTENCY_RECORD")
    .map(deserializeEventRecord);
}

// ── Null-coercion helpers (Prisma nullable → domain optional) ─────────────

/** Converts `T | null` to `T | undefined`. */
export function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Normalise a Prisma record's nullable optional fields to `undefined`.
 * Use this at every Prisma→domain mapping boundary instead of scattering
 * `?? undefined` throughout the codebase.
 */
export function coerceNullable<T extends Record<string, unknown>>(obj: T): {
  [K in keyof T]: null extends T[K] ? Exclude<T[K], null> | undefined : T[K];
} {
  const result = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value === null ? undefined : value;
  }
  return result as ReturnType<typeof coerceNullable<T>>;
}
