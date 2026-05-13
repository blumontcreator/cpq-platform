/**
 * Idempotency infrastructure.
 *
 * Guarantees that the same operation, submitted multiple times with the same
 * idempotency key, produces the same result without side effects on repeat calls.
 *
 * Use cases:
 *   - Retried HTTP requests (e.g. client timeout, then retry)
 *   - Event handler deduplication (process each event exactly once)
 *   - Background worker restarts (reprocess from checkpoint)
 *
 * Implementation:
 *   The idempotencyKey is stored as a unique field on DomainEventRecord.
 *   On first call: execute operation → store result under key.
 *   On duplicate: retrieve stored result → return without re-executing.
 *
 * Note: The result stored is the serialized return value. For non-serializable
 * return types, use the simpler `isAlreadyProcessed` / `markProcessed` pattern.
 */
import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { governanceLogger as log } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

// ── Result-caching idempotency ────────────────────────────────────────────

export interface IdempotencyResult<T> {
  result: T;
  isDuplicate: boolean;
}

/**
 * Wraps an operation with idempotency checking.
 * If a record with `idempotencyKey` already exists, returns the cached result.
 * Otherwise, executes the operation and stores the result.
 */
export async function withIdempotency<T>(
  prisma: PrismaClient,
  idempotencyKey: string,
  operation: () => Promise<T>,
): Promise<IdempotencyResult<T>> {
  // Check for existing record
  const existing = await prisma.domainEventRecord.findUnique({
    where: { idempotencyKey },
    select: { id: true, payload: true },
  });

  if (existing) {
    log.debug("Idempotent duplicate detected", { idempotencyKey });
    metrics.increment("idempotency.duplicate");
    const payload = existing.payload as { __idempotency_result?: T };
    return {
      result: payload.__idempotency_result as T,
      isDuplicate: true,
    };
  }

  // Execute and store
  const result = await operation();

  await prisma.domainEventRecord.create({
    data: {
      eventType:     "IDEMPOTENCY_RECORD",
      aggregateId:   idempotencyKey,
      aggregateType: "IdempotencyKey",
      payload:       { __idempotency_result: result } as Prisma.InputJsonValue,
      idempotencyKey,
      processedAt:   new Date(),
    },
  }).catch((err: unknown) => {
    // Race condition: another process wrote the same key — ignore
    const isUniqueViolation =
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "P2002";
    if (!isUniqueViolation) throw err;
    log.debug("Idempotency key race condition — duplicate ignored", { idempotencyKey });
  });

  metrics.increment("idempotency.processed");
  return { result, isDuplicate: false };
}

// ── Simple flag-based idempotency (for event handlers) ───────────────────

/**
 * Check if an event (by its metadata.eventId) has already been processed.
 */
export async function isEventAlreadyProcessed(
  prisma: PrismaClient,
  eventId: string,
): Promise<boolean> {
  const record = await prisma.domainEventRecord.findFirst({
    where: {
      idempotencyKey: eventId,
      processedAt: { not: null },
    },
    select: { id: true },
  });
  return record !== null;
}

/**
 * Mark an event as processed by updating its processedAt timestamp.
 * If multiple handlers process the same event record (fan-out),
 * use separate idempotency keys per handler.
 */
export async function markEventProcessed(
  prisma: PrismaClient,
  domainEventRecordId: string,
): Promise<void> {
  await prisma.domainEventRecord.update({
    where: { id: domainEventRecordId },
    data: { processedAt: new Date() },
  });
  metrics.increment("idempotency.mark_processed");
}
