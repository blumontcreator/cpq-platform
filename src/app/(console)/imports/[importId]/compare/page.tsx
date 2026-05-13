export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeImportDiff, getImportDiffForImport } from "@/modules/lifecycle";
import { Card, CardBody, CardHeader, StatRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ImportAnomaly } from "@/modules/lifecycle/import-diff";
import Link from "next/link";

interface Props {
  params: Promise<{ importId: string }>;
  searchParams: Promise<{ baseId?: string }>;
}

const SEVERITY_COLORS: Record<string, "red" | "yellow" | "blue" | "zinc"> = {
  CRITICAL: "red",
  HIGH:     "red",
  MEDIUM:   "yellow",
  LOW:      "blue",
};

const KIND_ICONS: Record<string, string> = {
  PRICE_SPIKE:       "↑ Price Spike",
  PRICE_DROP:        "↓ Price Drop",
  MISSING_SKU:       "✕ Missing SKU",
  NEW_SKU:           "+ New SKU",
  LEAD_TIME_INCREASE:"⏱ Lead Time ↑",
  LEAD_TIME_DECREASE:"⏱ Lead Time ↓",
  CONFIDENCE_DROP:   "⚠ Confidence Drop",
  ATTRIBUTE_CHANGE:  "~ Attribute Change",
};

export default async function ImportComparePage({ params, searchParams }: Props) {
  const { importId } = await params;
  const { baseId }   = await searchParams;

  const newImport = await prisma.supplierImport.findUnique({
    where:   { id: importId },
    include: { supplier: true },
  });
  if (!newImport) notFound();

  // SupplierImport uses `sourceKey` as the "filename"

  if (!baseId) {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-500">No base import specified. Use the Imports page to select a comparison.</p>
        <Link href="/imports" className="text-blue-400 hover:text-blue-300 text-sm mt-2 block">← Back to Imports</Link>
      </div>
    );
  }

  // Try to get cached diff first, then compute if missing
  let diff = await getImportDiffForImport(prisma, importId);

  if (!diff) {
    diff = await computeImportDiff(prisma, baseId, importId);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/imports" className="text-zinc-500 hover:text-zinc-300 text-sm">← Imports</Link>
        <span className="text-zinc-700">/</span>
        <span className="text-sm text-zinc-300 font-mono">{newImport.sourceKey}</span>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Import Comparison Viewer</h1>
        <p className="text-xs text-zinc-500 mt-1">
          {newImport.supplier.name} — {newImport.sourceKey} vs previous import run
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "New SKUs",         value: diff.newSkuCount,         accent: "blue" },
          { label: "Removed SKUs",     value: diff.removedSkuCount,     accent: "red" },
          { label: "Price Changes",    value: diff.priceChangeCount,    accent: "yellow" },
          { label: "Lead Time Δ",      value: diff.leadTimeChangeCount, accent: "yellow" },
          { label: "Confidence Drops", value: diff.confidenceDropCount, accent: "red" },
        ].map((s) => (
          <Card key={s.label} className={s.value > 0 && s.accent === "red" ? "border-red-700/50" : ""}>
            <CardBody>
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${
                s.value > 0 && s.accent === "red" ? "text-red-400" :
                s.value > 0 && s.accent === "yellow" ? "text-yellow-400" :
                s.value > 0 ? "text-blue-400" : "text-zinc-500"
              }`}>{s.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Overall risk */}
      <Card className={diff.overallRiskLevel === "CRITICAL" || diff.overallRiskLevel === "HIGH" ? "border-red-700/50" : ""}>
        <CardHeader label="Overall Risk Assessment" actions={
          <Badge variant={diff.overallRiskLevel === "CRITICAL" || diff.overallRiskLevel === "HIGH" ? "red" : diff.overallRiskLevel === "MEDIUM" ? "yellow" : "green"}>
            {diff.overallRiskLevel}
          </Badge>
        } />
        <CardBody>
          <StatRow label="New Import ID" value={diff.newImportId} />
          <StatRow label="Base Import ID" value={diff.baseImportId} />
          <StatRow label="Total Anomalies" value={diff.anomalies.length} accent={diff.anomalies.length > 5 ? "red" : diff.anomalies.length > 0 ? "yellow" : "green"} />
          <StatRow label="Computed At" value={diff.createdAt.toLocaleString()} />
        </CardBody>
      </Card>

      {/* Anomaly table */}
      {diff.anomalies.length > 0 ? (
        <Card>
          <CardHeader label={`Anomalies (${diff.anomalies.length})`} />
          <CardBody>
            <div className="space-y-2">
              {diff.anomalies.map((a: ImportAnomaly, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-zinc-900 rounded border border-zinc-800">
                  <div className="shrink-0 w-32">
                    <Badge variant={SEVERITY_COLORS[a.severity] ?? "zinc"}>{a.severity}</Badge>
                    <p className="text-xs text-zinc-500 mt-1">{KIND_ICONS[a.kind] ?? a.kind}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 font-mono">{a.sku}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{a.description}</p>
                  </div>
                  {(a.previousValue !== undefined || a.newValue !== undefined) && (
                    <div className="text-right shrink-0">
                      {a.previousValue !== undefined && (
                        <p className="text-xs text-zinc-500">
                          Before: <span className="text-zinc-300">{a.previousValue}</span>
                        </p>
                      )}
                      {a.newValue !== undefined && (
                        <p className="text-xs text-zinc-500">
                          After: <span className={a.severity === "LOW" ? "text-green-400" : "text-red-400"}>{a.newValue}</span>
                        </p>
                      )}
                      {a.changePct !== undefined && (
                        <p className={`text-xs font-medium ${a.changePct > 0 ? "text-red-400" : "text-green-400"}`}>
                          {a.changePct > 0 ? "+" : ""}{(a.changePct * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-zinc-500 text-center py-4">No anomalies detected between these two import runs.</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
