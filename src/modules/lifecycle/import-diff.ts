/**
 * Import diff service.
 *
 * Compares two supplier import runs and detects:
 *   - New SKUs (added since last import)
 *   - Removed SKUs (no longer supplied)
 *   - Price spikes (> configurable threshold)
 *   - Lead-time changes
 *   - Attribute extraction confidence drops
 *
 * Results are persisted to ImportDiff for audit and displayed in the
 * Import Comparison Viewer UI.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────────────────

export type ImportAnomalyKind =
  | "PRICE_SPIKE"
  | "PRICE_DROP"
  | "MISSING_SKU"
  | "NEW_SKU"
  | "LEAD_TIME_INCREASE"
  | "LEAD_TIME_DECREASE"
  | "CONFIDENCE_DROP"
  | "ATTRIBUTE_CHANGE";

export interface ImportAnomaly {
  kind: ImportAnomalyKind;
  sku: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  previousValue?: number | string;
  newValue?: number | string;
  changePct?: number;
}

export interface ImportDiffSummary {
  supplierId: string;
  baseImportId: string;
  newImportId: string;
  newSkuCount: number;
  removedSkuCount: number;
  priceChangeCount: number;
  leadTimeChangeCount: number;
  confidenceDropCount: number;
  anomalies: ImportAnomaly[];
  overallRiskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  createdAt: Date;
}

// ── Thresholds ────────────────────────────────────────────────────────────

const PRICE_SPIKE_THRESHOLD     = 0.10;   // > 10% price increase → anomaly
const PRICE_DROP_THRESHOLD      = 0.10;   // > 10% price drop → anomaly
const LEAD_TIME_CHANGE_DAYS     = 3;      // > 3 days change → anomaly
const CONFIDENCE_DROP_THRESHOLD = 0.10;   // > 10pp confidence drop → anomaly

// ── Core diff computation ─────────────────────────────────────────────────

export async function computeImportDiff(
  prisma: PrismaClient,
  baseImportId: string,
  newImportId: string,
): Promise<ImportDiffSummary> {
  // Load variants linked to each import run
  // Load import rows linked to each import run (via SupplierImportRow → variant)
  const [baseRows, newRows, newImport] = await Promise.all([
    prisma.supplierImportRow.findMany({
      where: { importId: baseImportId, variantId: { not: null } },
      include: {
        variant: {
          include: { prices: { take: 1, orderBy: { createdAt: "desc" } } },
        },
      },
    }),
    prisma.supplierImportRow.findMany({
      where: { importId: newImportId, variantId: { not: null } },
      include: {
        variant: {
          include: { prices: { take: 1, orderBy: { createdAt: "desc" } } },
        },
      },
    }),
    prisma.supplierImport.findUnique({
      where: { id: newImportId },
      select: { supplierId: true },
    }),
  ]);

  const supplierId = newImport?.supplierId ?? "unknown";

  // Build maps by variant sku for comparison
  const baseBySkuMap = new Map(
    baseRows
      .filter((r) => r.variant)
      .map((r) => [r.variant!.sku, r.variant!]),
  );
  const newBySkuMap  = new Map(
    newRows
      .filter((r) => r.variant)
      .map((r) => [r.variant!.sku, r.variant!]),
  );

  const anomalies: ImportAnomaly[] = [];

  // Detect removed SKUs
  for (const [sku, base] of baseBySkuMap) {
    if (!newBySkuMap.has(sku)) {
      anomalies.push({
        kind:        "MISSING_SKU",
        sku,
        description: `SKU ${sku} (${base.label ?? sku}) was present in the previous import but is absent now`,
        severity:    "HIGH",
      });
    }
  }

  // Detect new SKUs
  for (const [sku, nv] of newBySkuMap) {
    if (!baseBySkuMap.has(sku)) {
      anomalies.push({
        kind:        "NEW_SKU",
        sku,
        description: `New SKU ${sku} (${nv.label ?? sku}) added by supplier`,
        severity:    "LOW",
      });
    }
  }

  // Detect price and lead-time changes for matching SKUs
  for (const [sku, nv] of newBySkuMap) {
    const base = baseBySkuMap.get(sku);
    if (!base) continue;

    // Price comparison — use `amount` field (the actual Prisma column)
    const basePrice = base.prices[0] ? Number(base.prices[0].amount) : null;
    const newPrice  = nv.prices[0]   ? Number(nv.prices[0].amount)   : null;

    if (basePrice !== null && newPrice !== null && basePrice > 0) {
      const changePct = (newPrice - basePrice) / basePrice;

      if (changePct > PRICE_SPIKE_THRESHOLD) {
        anomalies.push({
          kind:          "PRICE_SPIKE",
          sku,
          description:   `Price increased by ${(changePct * 100).toFixed(1)}% for ${sku}`,
          severity:      changePct > 0.25 ? "CRITICAL" : changePct > 0.15 ? "HIGH" : "MEDIUM",
          previousValue: basePrice,
          newValue:      newPrice,
          changePct,
        });
      } else if (changePct < -PRICE_DROP_THRESHOLD) {
        anomalies.push({
          kind:          "PRICE_DROP",
          sku,
          description:   `Price dropped by ${(Math.abs(changePct) * 100).toFixed(1)}% for ${sku}`,
          severity:      "LOW",
          previousValue: basePrice,
          newValue:      newPrice,
          changePct,
        });
      }
    }

    // Lead-time comparison (stored in attributes JSON)
    const baseAttrs = base.attributes ? (base.attributes as Record<string, unknown>) : {};
    const newAttrs  = nv.attributes   ? (nv.attributes  as Record<string, unknown>) : {};
    const baseLead  = typeof baseAttrs["leadTimeDays"] === "number" ? baseAttrs["leadTimeDays"] : null;
    const newLead   = typeof newAttrs["leadTimeDays"]  === "number" ? newAttrs["leadTimeDays"]  : null;

    if (baseLead !== null && newLead !== null) {
      const daysDelta = newLead - baseLead;
      if (Math.abs(daysDelta) >= LEAD_TIME_CHANGE_DAYS) {
        anomalies.push({
          kind:          daysDelta > 0 ? "LEAD_TIME_INCREASE" : "LEAD_TIME_DECREASE",
          sku,
          description:   `Lead time changed by ${daysDelta > 0 ? "+" : ""}${daysDelta} days for ${sku}`,
          severity:      daysDelta > 10 ? "HIGH" : daysDelta > 5 ? "MEDIUM" : "LOW",
          previousValue: baseLead,
          newValue:      newLead,
        });
      }
    }

    // Extraction confidence comparison
    const baseConf = typeof baseAttrs["extractionConfidence"] === "number"
      ? baseAttrs["extractionConfidence"] : null;
    const newConf  = typeof newAttrs["extractionConfidence"]  === "number"
      ? newAttrs["extractionConfidence"]  : null;

    if (baseConf !== null && newConf !== null) {
      const drop = baseConf - newConf;
      if (drop >= CONFIDENCE_DROP_THRESHOLD) {
        anomalies.push({
          kind:          "CONFIDENCE_DROP",
          sku,
          description:   `Attribute extraction confidence dropped by ${(drop * 100).toFixed(1)}pp for ${sku}`,
          severity:      drop > 0.3 ? "HIGH" : "MEDIUM",
          previousValue: Number(baseConf.toFixed(2)),
          newValue:      Number(newConf.toFixed(2)),
          changePct:     -drop,
        });
      }
    }
  }

  const newSkuCount       = anomalies.filter((a) => a.kind === "NEW_SKU").length;
  const removedSkuCount   = anomalies.filter((a) => a.kind === "MISSING_SKU").length;
  const priceChangeCount  = anomalies.filter((a) => a.kind === "PRICE_SPIKE" || a.kind === "PRICE_DROP").length;
  const leadTimeChangeCount = anomalies.filter((a) => a.kind === "LEAD_TIME_INCREASE" || a.kind === "LEAD_TIME_DECREASE").length;
  const confidenceDropCount = anomalies.filter((a) => a.kind === "CONFIDENCE_DROP").length;

  const overallRiskLevel = deriveRiskLevel(anomalies);

  // Persist
  await prisma.importDiff.create({
    data: {
      supplierId,
      baseImportId,
      newImportId,
      summary: {
        newSkuCount, removedSkuCount, priceChangeCount,
        leadTimeChangeCount, confidenceDropCount,
      } as Prisma.InputJsonValue,
      anomalies: anomalies as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    supplierId,
    baseImportId,
    newImportId,
    newSkuCount,
    removedSkuCount,
    priceChangeCount,
    leadTimeChangeCount,
    confidenceDropCount,
    anomalies,
    overallRiskLevel,
    createdAt: new Date(),
  };
}

function deriveRiskLevel(anomalies: ImportAnomaly[]): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (anomalies.some((a) => a.severity === "CRITICAL")) return "CRITICAL";
  if (anomalies.some((a) => a.severity === "HIGH"))     return "HIGH";
  if (anomalies.some((a) => a.severity === "MEDIUM"))   return "MEDIUM";
  return "LOW";
}

export async function getLatestImportDiff(
  prisma: PrismaClient,
  supplierId: string,
): Promise<ImportDiffSummary | null> {
  const r = await prisma.importDiff.findFirst({
    where:   { supplierId },
    orderBy: { createdAt: "desc" },
  });
  if (!r) return null;
  const s = r.summary as { newSkuCount: number; removedSkuCount: number; priceChangeCount: number; leadTimeChangeCount: number; confidenceDropCount: number };
  return {
    supplierId:          r.supplierId,
    baseImportId:        r.baseImportId,
    newImportId:         r.newImportId,
    newSkuCount:         s.newSkuCount,
    removedSkuCount:     s.removedSkuCount,
    priceChangeCount:    s.priceChangeCount,
    leadTimeChangeCount: s.leadTimeChangeCount,
    confidenceDropCount: s.confidenceDropCount,
    anomalies:           r.anomalies as unknown as ImportAnomaly[],
    overallRiskLevel:    deriveRiskLevel(r.anomalies as unknown as ImportAnomaly[]),
    createdAt:           r.createdAt,
  };
}

export async function getImportDiffForImport(
  prisma: PrismaClient,
  newImportId: string,
): Promise<ImportDiffSummary | null> {
  const r = await prisma.importDiff.findFirst({
    where:   { newImportId },
    orderBy: { createdAt: "desc" },
  });
  if (!r) return null;
  const s = r.summary as { newSkuCount: number; removedSkuCount: number; priceChangeCount: number; leadTimeChangeCount: number; confidenceDropCount: number };
  return {
    supplierId:          r.supplierId,
    baseImportId:        r.baseImportId,
    newImportId:         r.newImportId,
    newSkuCount:         s.newSkuCount,
    removedSkuCount:     s.removedSkuCount,
    priceChangeCount:    s.priceChangeCount,
    leadTimeChangeCount: s.leadTimeChangeCount,
    confidenceDropCount: s.confidenceDropCount,
    anomalies:           r.anomalies as unknown as ImportAnomaly[],
    overallRiskLevel:    deriveRiskLevel(r.anomalies as unknown as ImportAnomaly[]),
    createdAt:           r.createdAt,
  };
}
