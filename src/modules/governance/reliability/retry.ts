/**
 * Retry infrastructure.
 *
 * Provides:
 *   - withRetry: wraps any async operation with configurable exponential backoff
 *   - Retry policies: WORKFLOW (for state machine transitions), DB (for DB ops),
 *     ENGINE (for pricing/simulation runs), LENIENT (for intelligence queries)
 *
 * Design:
 *   - Deterministic: given the same seed, same retry delays (for testing)
 *   - Composable: retry policies are plain objects, easy to extend
 *   - Error-type aware: `retryOn` predicate filters retriable errors
 *   - Non-retriable by default: only retries when explicitly allowed
 */

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  /** Jitter fraction: 0 = no jitter, 0.5 = up to 50% random delay added. */
  jitter?: number;
  /** If provided, only retries when this returns true for the error. */
  retryOn?: (err: Error) => boolean;
  /** Label for logging. */
  name?: string;
}

// ── Predefined policies ────────────────────────────────────────────────────

function isTransient(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("socket") ||
    msg.includes("epipe") ||
    // Prisma connection pool timeout
    msg.includes("p1001") ||
    msg.includes("p1002") ||
    msg.includes("p1008") ||
    msg.includes("p1017")
  );
}

function isConcurrencyConflict(err: Error): boolean {
  return err.name === "ConcurrencyConflictError";
}

/** For workflow state transitions — few retries, medium delay. */
export const WORKFLOW_RETRY_POLICY: RetryPolicy = {
  name:              "workflow",
  maxAttempts:       3,
  baseDelayMs:       200,
  maxDelayMs:        2000,
  backoffMultiplier: 2,
  jitter:            0.2,
  retryOn:           (err) => isConcurrencyConflict(err) || isTransient(err),
};

/** For database operations — more retries, shorter base delay. */
export const DB_RETRY_POLICY: RetryPolicy = {
  name:              "database",
  maxAttempts:       5,
  baseDelayMs:       100,
  maxDelayMs:        5000,
  backoffMultiplier: 2,
  jitter:            0.3,
  retryOn:           isTransient,
};

/** For engine runs (pricing, simulation) — allow 2 retries on transient failures. */
export const ENGINE_RETRY_POLICY: RetryPolicy = {
  name:              "engine",
  maxAttempts:       3,
  baseDelayMs:       500,
  maxDelayMs:        10_000,
  backoffMultiplier: 2,
  jitter:            0.1,
  retryOn:           isTransient,
};

/** Lenient policy for intelligence/analytics — best-effort. */
export const LENIENT_RETRY_POLICY: RetryPolicy = {
  name:              "lenient",
  maxAttempts:       2,
  baseDelayMs:       250,
  maxDelayMs:        2000,
  backoffMultiplier: 2,
  retryOn:           isTransient,
};

// ── withRetry ─────────────────────────────────────────────────────────────

export class MaxRetriesExceededError extends Error {
  constructor(
    public readonly policyName: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(
      `Operation failed after ${attempts} attempts (policy: ${policyName}): ${lastError.message}`,
    );
    this.name = "MaxRetriesExceededError";
    this.cause = lastError;
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = DB_RETRY_POLICY,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (raw) {
      const err = raw instanceof Error ? raw : new Error(String(raw));
      lastError = err;

      const isLast = attempt === policy.maxAttempts;
      const shouldRetry = !policy.retryOn || policy.retryOn(err);

      if (isLast || !shouldRetry) {
        if (isLast && shouldRetry) {
          throw new MaxRetriesExceededError(policy.name ?? "unnamed", attempt, err);
        }
        throw err; // non-retriable or last attempt
      }

      const delay = computeDelay(policy, attempt);
      await sleep(delay);
    }
  }

  throw new MaxRetriesExceededError(
    policy.name ?? "unnamed",
    policy.maxAttempts,
    lastError!,
  );
}

function computeDelay(policy: RetryPolicy, attempt: number): number {
  const base = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
  const capped = Math.min(base, policy.maxDelayMs);
  const jitterMs = policy.jitter ? capped * policy.jitter * Math.random() : 0;
  return Math.round(capped + jitterMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
