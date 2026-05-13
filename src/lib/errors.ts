/**
 * Centralized CPQ error hierarchy.
 *
 * All domain modules throw from this set so callers can:
 *   - Distinguish domain errors from unexpected runtime errors
 *   - Match on `code` for programmatic handling
 *   - Surface structured details to the UI / API layer without leaking internals
 *
 * Usage:
 *   throw new NotFoundError("Quote", quoteId);
 *   throw new ValidationError("margin.below_floor", { actual: 0.02, floor: 0.05 });
 *   if (err instanceof CpqError) { ... }
 */

/** Structured error codes — extend as new domains are added. */
export type CpqErrorCode =
  // ── Resource lifecycle ───────────────────────────────────────────────
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  | "VERSION_MISMATCH"
  // ── Input validation ─────────────────────────────────────────────────
  | "VALIDATION_ERROR"
  | "INVALID_PAYLOAD"
  | "MISSING_REQUIRED_FIELD"
  | "UNSUPPORTED_FORMAT"
  // ── Authorization ────────────────────────────────────────────────────
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "APPROVAL_REQUIRED"
  // ── Domain logic ─────────────────────────────────────────────────────
  | "GOVERNANCE_VIOLATION"
  | "WORKFLOW_BLOCKED"
  | "IMPORT_FAILED"
  | "IMPORT_CHUNK_FAILED"
  | "EVALUATION_FAILED"
  | "PRICING_FAILED"
  | "OPTIMIZATION_FAILED"
  // ── Infrastructure ───────────────────────────────────────────────────
  | "TRANSACTION_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "SNAPSHOT_FAILED"
  | "EVENT_PUBLISH_FAILED"
  | "TIMEOUT"
  | "RATE_LIMITED";

/** Base class for all CPQ domain errors. */
export class CpqError extends Error {
  readonly code: CpqErrorCode;
  readonly domain: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(
    code: CpqErrorCode,
    message: string,
    options: {
      domain?: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "CpqError";
    this.code = code;
    this.domain = options.domain ?? "cpq";
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }

  toJSON() {
    return {
      name:      this.name,
      code:      this.code,
      domain:    this.domain,
      message:   this.message,
      details:   this.details,
      retryable: this.retryable,
    };
  }
}

// ── Convenience subclasses ────────────────────────────────────────────────

export class NotFoundError extends CpqError {
  constructor(entityType: string, id: string, domain?: string) {
    super("NOT_FOUND", `${entityType} '${id}' not found`, {
      domain: domain ?? entityType.toLowerCase(),
      details: { entityType, id },
    });
    this.name = "NotFoundError";
  }
}

export class ValidationError extends CpqError {
  constructor(reason: string, details?: Record<string, unknown>, domain?: string) {
    super("VALIDATION_ERROR", `Validation failed: ${reason}`, {
      domain: domain ?? "validation",
      details,
    });
    this.name = "ValidationError";
  }
}

export class ConflictError extends CpqError {
  constructor(reason: string, details?: Record<string, unknown>, domain?: string) {
    super("CONFLICT", reason, {
      domain: domain ?? "conflict",
      details,
    });
    this.name = "ConflictError";
  }
}

export class VersionMismatchError extends CpqError {
  constructor(entityType: string, id: string, expected: number, actual: number) {
    super("VERSION_MISMATCH", `Optimistic lock conflict on ${entityType} '${id}'`, {
      domain:    entityType.toLowerCase(),
      details:   { entityType, id, expected, actual },
      retryable: true,
    });
    this.name = "VersionMismatchError";
  }
}

export class WorkflowBlockedError extends CpqError {
  constructor(quoteId: string, reason: string) {
    super("WORKFLOW_BLOCKED", reason, {
      domain:  "workflow",
      details: { quoteId },
    });
    this.name = "WorkflowBlockedError";
  }
}

export class GovernanceViolationError extends CpqError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super("GOVERNANCE_VIOLATION", reason, {
      domain:  "governance",
      details,
    });
    this.name = "GovernanceViolationError";
  }
}

export class ImportError extends CpqError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super("IMPORT_FAILED", reason, {
      domain:    "imports",
      details,
      retryable: true,
    });
    this.name = "ImportError";
  }
}

export class ImportChunkError extends CpqError {
  constructor(chunkIndex: number, rowRange: [number, number], cause: unknown) {
    super("IMPORT_CHUNK_FAILED", `Import chunk ${chunkIndex} failed (rows ${rowRange[0]}–${rowRange[1]})`, {
      domain:    "imports",
      details:   { chunkIndex, rowStart: rowRange[0], rowEnd: rowRange[1] },
      retryable: true,
      cause,
    });
    this.name = "ImportChunkError";
  }
}

export class TransactionError extends CpqError {
  constructor(operation: string, cause?: unknown) {
    super("TRANSACTION_FAILED", `Transaction failed during: ${operation}`, {
      domain:    "db",
      details:   { operation },
      retryable: true,
      cause,
    });
    this.name = "TransactionError";
  }
}

export class UnsupportedFormatError extends CpqError {
  constructor(format: string, context?: string) {
    super("UNSUPPORTED_FORMAT", `Unsupported format: ${format}${context ? ` (${context})` : ""}`, {
      domain:  "imports",
      details: { format, context },
    });
    this.name = "UnsupportedFormatError";
  }
}

// ── Guard helpers ──────────────────────────────────────────────────────────

export function isCpqError(err: unknown): err is CpqError {
  return err instanceof CpqError;
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof CpqError) return err.retryable;
  // Prisma unique constraint violation — not retryable
  if (err instanceof Error && err.message.includes("Unique constraint")) return false;
  // Prisma connection errors — retryable
  if (err instanceof Error && (
    err.message.includes("connect ECONNREFUSED") ||
    err.message.includes("Connection pool timeout") ||
    err.message.includes("P1001") ||
    err.message.includes("P1002")
  )) return true;
  return false;
}

/** Re-throw as a typed CpqError wrapping unknown infrastructure errors. */
export function wrapUnknown(err: unknown, operation: string): never {
  if (err instanceof CpqError) throw err;
  throw new TransactionError(operation, err);
}
