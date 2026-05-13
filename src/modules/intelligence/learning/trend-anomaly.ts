/**
 * Trend detection & anomaly detection.
 *
 * Trend:  compares a metric's average over a recent window (30d) vs a baseline
 *         window (90d) to classify it as IMPROVING / STABLE / DECLINING.
 *
 * Anomaly: z-score over a rolling window. If |z| > 2.5, the current value is
 *          flagged as anomalous. Designed as a preparation step for future
 *          ML-based anomaly detection — the z-score logic can be replaced by
 *          an isolation forest or LSTM without changing the interface.
 */
import type { OutcomeSignal } from "../types/outcome.types";
import type { TrendAnalysis, TrendDirection, AnomalySignal } from "../types/learning.types";

const TREND_THRESHOLD_PCT = 5; // changes < 5% are "STABLE"

export function detectTrend(
  metric: string,
  recentSignal: OutcomeSignal | undefined,
  baselineSignal: OutcomeSignal | undefined,
): TrendAnalysis {
  if (!recentSignal || !baselineSignal || recentSignal.sampleSize < 3 || baselineSignal.sampleSize < 3) {
    return {
      metric,
      direction: "INSUFFICIENT_DATA",
      recentValue: recentSignal?.value ?? 0,
      baselineValue: baselineSignal?.value ?? 0,
      absoluteChange: 0,
      pctChange: 0,
      confidence: 0,
      note: "Not enough data to determine trend",
    };
  }

  const recent = recentSignal.value;
  const baseline = baselineSignal.value;
  const absoluteChange = recent - baseline;
  const pctChange = baseline !== 0 ? (absoluteChange / baseline) * 100 : 0;

  let direction: TrendDirection;
  if (Math.abs(pctChange) < TREND_THRESHOLD_PCT) {
    direction = "STABLE";
  } else if (
    // For these metrics, higher = better
    (["WIN_RATE", "REALIZED_MARGIN", "SUPPLIER_RELIABILITY"].includes(recentSignal.signalType) && pctChange > 0) ||
    // For these metrics, lower = better
    (["DISCOUNT_RATE", "CYCLE_DURATION"].includes(recentSignal.signalType) && pctChange < 0)
  ) {
    direction = "IMPROVING";
  } else {
    direction = "DECLINING";
  }

  const conf = Math.min(recentSignal.confidence, baselineSignal.confidence);
  const label = direction === "IMPROVING" ? "▲" : direction === "DECLINING" ? "▼" : "→";

  return {
    metric,
    direction,
    recentValue: recent,
    baselineValue: baseline,
    absoluteChange,
    pctChange,
    confidence: conf,
    note: `${label} ${metric}: ${recent.toFixed(2)} (30d) vs ${baseline.toFixed(2)} (90d) — ${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`,
  };
}

/**
 * Detect anomalies in a set of recent signals compared to historical baselines.
 * Flags signals with |z-score| > 2.5 as anomalous.
 */
export function detectAnomalies(
  recentSignals: OutcomeSignal[],
  baselineSignals: OutcomeSignal[],
): AnomalySignal[] {
  const anomalies: AnomalySignal[] = [];
  const baselineMap = new Map(baselineSignals.map((s) => [s.signalKey.replace(/_30d$/, "_90d"), s]));

  for (const recent of recentSignals) {
    // Match to baseline (30d → 90d)
    const baselineKey = recent.signalKey.replace(/_30d$/, "_90d");
    const baseline = baselineMap.get(baselineKey);
    if (!baseline || baseline.sampleSize < 5) continue;

    // Simple z-score approximation: deviation / stdDev estimate
    // With only two data points we use the absolute deviation as a proxy
    const deviation = Math.abs(recent.value - baseline.value);
    const stdEstimate = baseline.value * 0.15; // 15% of mean as std estimate
    if (stdEstimate === 0) continue;

    const zScore = deviation / stdEstimate;
    if (zScore < 2.5) continue;

    const direction = recent.value > baseline.value ? "above" : "below";
    const severity: AnomalySignal["severity"] = zScore > 4 ? "HIGH" : zScore > 3 ? "MEDIUM" : "LOW";

    anomalies.push({
      metric: recent.signalKey,
      currentValue: recent.value,
      expectedValue: baseline.value,
      zScore,
      severity,
      detectedAt: new Date().toISOString(),
      explanation: `${recent.signalKey} is ${deviation.toFixed(2)} units ${direction} the 90d baseline (z=${zScore.toFixed(1)})`,
    });
  }

  return anomalies.sort((a, b) => b.zScore - a.zScore);
}

export function detectAllTrends(signals: OutcomeSignal[]): TrendAnalysis[] {
  const by30d = new Map(signals.filter((s) => s.period === "30d").map((s) => [s.signalKey.replace(/_30d$/, ""), s]));
  const by90d = new Map(signals.filter((s) => s.period === "90d").map((s) => [s.signalKey.replace(/_90d$/, ""), s]));

  const metrics = new Set([...by30d.keys(), ...by90d.keys()]);
  const trends: TrendAnalysis[] = [];

  for (const metric of metrics) {
    trends.push(detectTrend(metric, by30d.get(metric), by90d.get(metric)));
  }

  return trends.filter((t) => t.direction !== "INSUFFICIENT_DATA");
}
