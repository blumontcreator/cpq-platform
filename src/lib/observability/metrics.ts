/**
 * In-process metrics collector for the CPQ platform.
 *
 * Tracks:
 *   - Timing histograms: engine execution durations
 *   - Counters: event counts, error rates, transition counts
 *   - Gauges: current queue depth, active workflows, active quotes
 *
 * No external dependency. In production, replace `flush()` output with
 * a Prometheus push, Datadog statsd, or CloudWatch PutMetricData call.
 *
 * Thread-safety note: Node.js is single-threaded; no locking needed.
 */

export interface TimingRecord {
  operation: string;
  durationMs: number;
  tags: Record<string, string>;
  timestamp: string;
}

export interface CounterRecord {
  metric: string;
  value: number;
  tags: Record<string, string>;
  timestamp: string;
}

export interface MetricsSummary {
  timings: TimingSummary[];
  counters: CounterSummary[];
  gauges: Record<string, number>;
  collectedAt: string;
  windowMs: number;
}

export interface TimingSummary {
  operation: string;
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface CounterSummary {
  metric: string;
  total: number;
  rate: number;   // events per second
}

// ── Collector ──────────────────────────────────────────────────────────────

export class MetricsCollector {
  private timings: TimingRecord[] = [];
  private counters: CounterRecord[] = [];
  private gauges: Map<string, number> = new Map();
  private startedAt = Date.now();

  /** Record how long an operation took. */
  recordTiming(
    operation: string,
    durationMs: number,
    tags: Record<string, string> = {},
  ): void {
    this.timings.push({ operation, durationMs, tags, timestamp: new Date().toISOString() });
    // Keep last 1000 timings per operation to bound memory
    if (this.timings.length > 5000) this.timings = this.timings.slice(-5000);
  }

  /** Increment a counter. */
  increment(metric: string, value = 1, tags: Record<string, string> = {}): void {
    this.counters.push({ metric, value, tags, timestamp: new Date().toISOString() });
    if (this.counters.length > 10000) this.counters = this.counters.slice(-10000);
  }

  /** Set an instantaneous gauge value. */
  gauge(metric: string, value: number): void {
    this.gauges.set(metric, value);
  }

  /**
   * Wraps an async operation, recording its duration automatically.
   * Re-throws on failure; increments an error counter.
   */
  async track<T>(
    operation: string,
    fn: () => Promise<T>,
    tags: Record<string, string> = {},
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.recordTiming(operation, Date.now() - start, tags);
      this.increment(`${operation}.success`, 1, tags);
      return result;
    } catch (err) {
      this.recordTiming(operation, Date.now() - start, tags);
      this.increment(`${operation}.error`, 1, tags);
      throw err;
    }
  }

  /** Produce a snapshot summary of all collected metrics. */
  flush(): MetricsSummary {
    const windowMs = Date.now() - this.startedAt;

    // Aggregate timings by operation
    const timingsByOp = new Map<string, number[]>();
    for (const t of this.timings) {
      const arr = timingsByOp.get(t.operation) ?? [];
      arr.push(t.durationMs);
      timingsByOp.set(t.operation, arr);
    }

    const timingSummaries: TimingSummary[] = [];
    for (const [operation, durations] of timingsByOp) {
      const sorted = [...durations].sort((a, b) => a - b);
      timingSummaries.push({
        operation,
        count: sorted.length,
        minMs: sorted[0] ?? 0,
        maxMs: sorted[sorted.length - 1] ?? 0,
        avgMs: sorted.reduce((s, v) => s + v, 0) / sorted.length,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
      });
    }

    // Aggregate counters
    const counterTotals = new Map<string, number>();
    for (const c of this.counters) {
      counterTotals.set(c.metric, (counterTotals.get(c.metric) ?? 0) + c.value);
    }

    const counterSummaries: CounterSummary[] = [];
    for (const [metric, total] of counterTotals) {
      counterSummaries.push({
        metric,
        total,
        rate: total / (windowMs / 1000),
      });
    }

    return {
      timings: timingSummaries,
      counters: counterSummaries,
      gauges: Object.fromEntries(this.gauges),
      collectedAt: new Date().toISOString(),
      windowMs,
    };
  }

  /** Reset all collected data. */
  reset(): void {
    this.timings = [];
    this.counters = [];
    this.gauges.clear();
    this.startedAt = Date.now();
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx] ?? 0;
}

// ── Singleton ─────────────────────────────────────────────────────────────

export const metrics = new MetricsCollector();
