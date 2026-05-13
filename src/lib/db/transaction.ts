/**
 * Safe transaction wrapper.
 *
 * Provides a typed, retry-aware wrapper around `prisma.$transaction`.
 * Automatically retries on serialization failures and connection pool exhaustion
 * using the retry policy from `src/modules/governance/reliability/retry.ts`.
 *
 * Usage:
 *   const result = await withTransaction(prisma, "create-quote", async (tx) => {
 *     const q = await tx.quote.create({ ... });
 *     await tx.quoteRevision.create({ ... });
 *     return q;
 *   });
 */
import type { PrismaClient } from "@prisma/client";
import { TransactionError } from "@/lib/errors";

const TRANSACTION_TIMEOUT_MS = 30_000;  // 30s — safe for most write paths
const MAX_RETRIES             = 3;

/** Prisma transaction client type (inferred from $transaction callback). */
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export async function withTransaction<T>(
  prisma: PrismaClient,
  operation: string,
  fn: (tx: Tx) => Promise<T>,
  opts: { timeoutMs?: number; maxRetries?: number } = {},
): Promise<T> {
  const timeoutMs  = opts.timeoutMs  ?? TRANSACTION_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        timeout: timeoutMs,
        maxWait: 10_000,
      });
    } catch (err) {
      lastError = err;

      // Only retry on serialization / connection pool errors
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("deadlock") ||
        msg.includes("serialization failure") ||
        msg.includes("Connection pool timeout") ||
        msg.includes("P1001") ||
        msg.includes("P1002");

      if (!isRetryable || attempt >= maxRetries) break;

      // Exponential backoff with jitter
      const delayMs = Math.min(50 * 2 ** attempt + Math.random() * 20, 1000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new TransactionError(operation, lastError);
}
