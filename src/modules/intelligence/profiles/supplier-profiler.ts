/**
 * Supplier profiler.
 *
 * Builds SupplierRiskFactor from historical SupplierPerformanceRecord data.
 * Used by the feedback engine to adjust lead-time confidence in the optimizer.
 */
import type { PrismaClient } from "@prisma/client";
import type { SupplierRiskFactor } from "../types/learning.types";

export async function buildSupplierRiskFactor(
  prisma: PrismaClient,
  supplierId: string,
  periodDays = 90,
): Promise<SupplierRiskFactor> {
  const records = await prisma.supplierPerformanceRecord.findMany({
    where: {
      supplierId,
      occurredAt: { gte: new Date(Date.now() - periodDays * 86400000) },
    },
    select: { wasDelayed: true, hadIssue: true },
  });

  if (records.length === 0) {
    return {
      supplierId,
      reliabilityScore: 100,
      leadTimeConfidenceMultiplier: 1.0,
      recentDelayRate: 0,
      recentIssueRate: 0,
      riskLevel: "LOW",
      note: "No recent data — assuming full reliability",
    };
  }

  const delayRate = records.filter((r) => r.wasDelayed).length / records.length;
  const issueRate = records.filter((r) => r.hadIssue).length / records.length;
  const reliabilityScore = Math.round((1 - delayRate) * 80 + (1 - issueRate) * 20);

  // Lead-time confidence multiplier:
  //   0% delays → 1.0 (full confidence in quoted lead times)
  //   50% delays → 0.7 (add 30% buffer to lead-time estimates)
  //   80%+ delays → 0.5 (halve the confidence)
  const ltMultiplier = Math.max(0.5, 1.0 - delayRate * 0.6);

  const riskLevel: SupplierRiskFactor["riskLevel"] =
    reliabilityScore >= 85 ? "LOW" :
    reliabilityScore >= 65 ? "MEDIUM" :
    reliabilityScore >= 40 ? "HIGH" : "CRITICAL";

  return {
    supplierId,
    reliabilityScore,
    leadTimeConfidenceMultiplier: Math.round(ltMultiplier * 100) / 100,
    recentDelayRate: delayRate,
    recentIssueRate: issueRate,
    riskLevel,
    note: `${records.length}-event sample: ${(delayRate * 100).toFixed(0)}% delays, ${(issueRate * 100).toFixed(0)}% issues`,
  };
}

export async function buildAllSupplierRiskFactors(
  prisma: PrismaClient,
  periodDays = 90,
): Promise<SupplierRiskFactor[]> {
  const suppliers = await prisma.supplierPerformanceRecord.groupBy({
    by: ["supplierId"],
    _count: { id: true },
  });
  return Promise.all(suppliers.map((s) => buildSupplierRiskFactor(prisma, s.supplierId, periodDays)));
}
