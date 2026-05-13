/**
 * Structured JSON logger for the CPQ platform.
 *
 * Design:
 *   - Every log entry is a JSON object (machine-parseable for log aggregators)
 *   - Scoped loggers carry a `module` field for filtering
 *   - `time()` wraps any async operation and logs its duration
 *   - `ERROR` entries include the stack trace under `error.stack`
 *   - In production, swap `console.*` for a transport (Axiom, Datadog, CloudWatch)
 *
 * No external dependencies — pure Node.js stdlib.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  duration_ms?: number;
  /** Structured context attached to this log line. */
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  /** Trace / correlation ID for distributed systems. */
  traceId?: string;
}

// ── Log level filtering ────────────────────────────────────────────────────

const LEVEL_RANKS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO:  1,
  WARN:  2,
  ERROR: 3,
};

const MINIMUM_LEVEL: LogLevel =
  (process.env["CPQ_LOG_LEVEL"] as LogLevel | undefined) ?? "INFO";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANKS[level] >= LEVEL_RANKS[MINIMUM_LEVEL];
}

// ── Transport ─────────────────────────────────────────────────────────────

function write(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "ERROR" || entry.level === "WARN") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

// ── Logger class ──────────────────────────────────────────────────────────

export class Logger {
  constructor(
    private readonly module: string,
    private readonly baseContext?: Record<string, unknown>,
  ) {}

  /** Create a child logger with additional context merged in. */
  child(subModule: string, additionalContext?: Record<string, unknown>): Logger {
    return new Logger(`${this.module}.${subModule}`, {
      ...this.baseContext,
      ...additionalContext,
    });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("DEBUG", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("INFO", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("WARN", message, context);
  }

  error(message: string, err?: Error | unknown, context?: Record<string, unknown>): void {
    const errorObj = err instanceof Error ? {
      name: err.name,
      message: err.message,
      stack: err.stack,
    } : err ? { name: "UnknownError", message: String(err) } : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      module: this.module,
      message,
      context: { ...this.baseContext, ...context },
      error: errorObj,
    };

    if (shouldLog("ERROR")) write(entry);
  }

  /**
   * Wraps an async operation: logs start + end with duration.
   * Re-throws the error after logging so callers can handle it.
   */
  async time<T>(
    operationLabel: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    const startMs = Date.now();
    this.debug(`${operationLabel} — started`, context);
    try {
      const result = await fn();
      const durationMs = Date.now() - startMs;
      this.info(`${operationLabel} — completed`, { ...context, duration_ms: durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startMs;
      this.error(`${operationLabel} — failed`, err, { ...context, duration_ms: durationMs });
      throw err;
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      context: { ...this.baseContext, ...context },
    };
    write(entry);
  }
}

// ── Singleton loggers per domain ──────────────────────────────────────────

export const rootLogger = new Logger("cpq");
export const catalogLogger = rootLogger.child("catalog");
export const pricingLogger  = rootLogger.child("pricing");
export const quotingLogger  = rootLogger.child("quoting");
export const simLogger      = rootLogger.child("simulation");
export const workflowLogger = rootLogger.child("workflow");
export const intelligenceLogger = rootLogger.child("intelligence");
export const governanceLogger   = rootLogger.child("governance");
export const eventBusLogger     = rootLogger.child("events");
