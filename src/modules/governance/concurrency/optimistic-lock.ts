/**
 * Optimistic concurrency control for the CPQ platform.
 *
 * Optimistic locking prevents lost updates in multi-user scenarios:
 *   1. Reader loads entity and notes its `version` number
 *   2. Writer sends update with the expected version
 *   3. DB checks: if `version` still matches → update + increment version
 *   4. If `version` has changed (concurrent write) → throw ConcurrencyConflictError
 *
 * Design:
 *   - Pure functions where possible (no implicit DB calls)
 *   - ConcurrencyConflictError is a named, catchable error type
 *   - No retry logic here — callers decide how to handle conflicts
 *     (use withRetry from reliability module)
 *
 * Prisma implementation: uses the WHERE clause to check the version atomically.
 * Prisma returns `count: 0` if no row was updated → conflict detected.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { governanceLogger as log } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

// ── Error ─────────────────────────────────────────────────────────────────

export class ConcurrencyConflictError extends Error {
  constructor(
    public readonly entityType: string,
    public readonly entityId: string,
    public readonly expectedVersion: number,
    public readonly description = "Concurrent modification detected",
  ) {
    super(
      `${entityType} ${entityId} was modified by another operation. ` +
      `Expected version ${expectedVersion}. Reload and retry.`,
    );
    this.name = "ConcurrencyConflictError";
  }
}

// ── Quote optimistic update ────────────────────────────────────────────────

export interface QuoteUpdateResult {
  updated: boolean;
  newVersion: number;
}

/**
 * Update a Quote, checking the expected version first.
 * Throws ConcurrencyConflictError if the version has changed.
 */
export async function updateQuoteWithVersion(
  prisma: PrismaClient,
  quoteId: string,
  expectedVersion: number,
  updates: Prisma.QuoteUpdateInput,
): Promise<QuoteUpdateResult> {
  const start = Date.now();

  const result = await prisma.quote.updateMany({
    where: { id: quoteId, version: expectedVersion },
    data: {
      ...updates,
      version: { increment: 1 },
    },
  });

  metrics.recordTiming("concurrency.quote_update", Date.now() - start);

  if (result.count === 0) {
    metrics.increment("concurrency.conflicts", 1, { entityType: "Quote" });
    log.warn("Quote version conflict detected", { quoteId, expectedVersion });
    throw new ConcurrencyConflictError("Quote", quoteId, expectedVersion);
  }

  return { updated: true, newVersion: expectedVersion + 1 };
}

// ── WorkflowInstance optimistic update ────────────────────────────────────

export async function updateWorkflowWithVersion(
  prisma: PrismaClient,
  workflowId: string,
  expectedVersion: number,
  updates: Prisma.WorkflowInstanceUpdateInput,
): Promise<QuoteUpdateResult> {
  const result = await prisma.workflowInstance.updateMany({
    where: { id: workflowId, version: expectedVersion },
    data: {
      ...updates,
      version: { increment: 1 },
    },
  });

  if (result.count === 0) {
    metrics.increment("concurrency.conflicts", 1, { entityType: "WorkflowInstance" });
    throw new ConcurrencyConflictError("WorkflowInstance", workflowId, expectedVersion);
  }

  return { updated: true, newVersion: expectedVersion + 1 };
}

// ── Generic version assertion ──────────────────────────────────────────────

/**
 * Asserts that an entity's current version matches the expected version.
 * Use before performing a multi-step operation where you fetched the entity earlier.
 */
export function assertVersion(
  entityType: string,
  entityId: string,
  currentVersion: number,
  expectedVersion: number,
): void {
  if (currentVersion !== expectedVersion) {
    throw new ConcurrencyConflictError(entityType, entityId, expectedVersion);
  }
}

// ── Edit session ──────────────────────────────────────────────────────────

export interface EditSession {
  entityId: string;
  entityType: string;
  lockedByUserId: string;
  lockedAt: string;
  /** ISO timestamp after which the lock expires automatically. */
  expiresAt: string;
  version: number;
}

/**
 * In-memory edit session store.
 * Prevents two operators from simultaneously editing the same quote.
 * In production, replace with Redis or a DB-backed lock table.
 */
class EditSessionStore {
  private sessions = new Map<string, EditSession>();

  acquire(
    entityId: string,
    entityType: string,
    userId: string,
    currentVersion: number,
    ttlMs = 10 * 60 * 1000, // 10 minutes default
  ): EditSession | { conflict: EditSession } {
    const key = `${entityType}:${entityId}`;
    const existing = this.sessions.get(key);

    if (existing) {
      // Check if it's expired
      if (new Date(existing.expiresAt) > new Date()) {
        // Still valid — allow same user to refresh
        if (existing.lockedByUserId !== userId) {
          return { conflict: existing };
        }
      }
    }

    const session: EditSession = {
      entityId,
      entityType,
      lockedByUserId: userId,
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      version: currentVersion,
    };

    this.sessions.set(key, session);
    return session;
  }

  release(entityId: string, entityType: string, userId: string): boolean {
    const key = `${entityType}:${entityId}`;
    const session = this.sessions.get(key);
    if (!session || session.lockedByUserId !== userId) return false;
    this.sessions.delete(key);
    return true;
  }

  getSession(entityId: string, entityType: string): EditSession | undefined {
    const key = `${entityType}:${entityId}`;
    return this.sessions.get(key);
  }
}

export const editSessionStore = new EditSessionStore();
