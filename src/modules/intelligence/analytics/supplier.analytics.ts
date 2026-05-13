import type { PrismaClient } from "@prisma/client";
import type { SupplierPerformance } from "../types/performance.types";

function computeReliabilityScore(
  onTimeRate: number,
  issueRate: number,
  sampleSize: number,
): number {
  const base = onTimeRate * 80 + (1 - issueRate) * 20;
  // Dampen confidence with small sample sizes
  const sampleFactor = Math.min(1, sampleSize / 20);
  return Math.round(base * sampleFactor);
}

export async function computeSupplierPerformance(
  prisma: PrismaClient,
  supplierId: string,
  periodDays?: number,
): Promise<SupplierPerformance> {
  const where = {
    supplierId,
    ...(periodDays ? { occurredAt: { gte: new Date(Date.now() - periodDays * 86400000) } } : {}),
  };

  const records = await prisma.supplierPerformanceRecord.findMany({
    where,
    select: { wasDelayed: true, hadIssue: true, delayDays: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  if (records.length === 0) {
    return {
      supplierId,
      onTimeDeliveryRate: 1,
      avgDelayDays: 0,
      maxDelayDays: 0,
      issueRate: 0,
      reliabilityScore: 100,
      reliabilityTrend: "INSUFFICIENT_DATA" as const,
      sampleSize: 0,
      confidence: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  const delayed = records.filter((r) => r.wasDelayed);
  const withIssues = records.filter((r) => r.hadIssue);
  const delayDays = delayed.map((r) => r.delayDays ?? 0);

  const onTimeRate = 1 - delayed.length / records.length;
  const issueRate = withIssues.length / records.length;
  const avgDelay = delayDays.length ? delayDays.reduce((s, v) => s + v, 0) / delayDays.length : 0;
  const maxDelay = delayDays.length ? Math.max(...delayDays) : 0;

  // Trend: compare most recent half vs older half
  const mid = Math.floor(records.length / 2);
  const recent = records.slice(mid);
  const older = records.slice(0, mid);
  const recentOnTime = older.length ? 1 - recent.filter((r) => r.wasDelayed).length / recent.length : onTimeRate;
  const olderOnTime = older.length ? 1 - older.filter((r) => r.wasDelayed).length / older.length : onTimeRate;
  const trend: SupplierPerformance["reliabilityTrend"] =
    Math.abs(recentOnTime - olderOnTime) < 0.05
      ? "STABLE"
      : recentOnTime > olderOnTime
      ? "IMPROVING"
      : "DECLINING";

  return {
    supplierId,
    onTimeDeliveryRate: onTimeRate,
    avgDelayDays: avgDelay,
    maxDelayDays: maxDelay,
    issueRate,
    reliabilityScore: computeReliabilityScore(onTimeRate, issueRate, records.length),
    reliabilityTrend: trend,
    sampleSize: records.length,
    confidence: Math.min(1, records.length / 20),
    lastUpdated: new Date().toISOString(),
  };
}

export async function computeAllSupplierPerformance(
  prisma: PrismaClient,
  periodDays?: number,
): Promise<SupplierPerformance[]> {
  const suppliers = await prisma.supplierPerformanceRecord.groupBy({
    by: ["supplierId"],
    _count: { id: true },
  });

  return Promise.all(
    suppliers.map((s) => computeSupplierPerformance(prisma, s.supplierId, periodDays)),
  );
}
