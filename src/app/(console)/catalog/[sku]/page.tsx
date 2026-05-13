export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardBody, StatRow } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { TracePanel, TraceRow } from "@/components/ui/trace-panel";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return { title: `${sku} — Catalog — CPQ Console` };
}

async function getVariantData(sku: string) {
  return prisma.productVariant.findUnique({
    where: { sku },
    include: {
      product: true,
      supplier: true,
      prices: { orderBy: [{ priceType: "asc" }, { createdAt: "desc" }] },
      calculations: {
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { policy: { select: { name: true, strategy: true } } },
      },
    },
  });
}

export default async function VariantInspectorPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const variant = await getVariantData(sku);
  if (!variant) notFound();

  const attrs = variant.attributes as Record<string, unknown> | null;
  const confidence = (attrs?.["confidence"] as number) ?? null;
  const warnings = (attrs?.["warnings"] as string[]) ?? [];
  const unresolvedTokens = (attrs?.["unresolvedTokens"] as string[]) ?? [];
  const latestCalc = variant.calculations[0];
  const calcResult = latestCalc ? (latestCalc.result as Record<string, unknown>) : null;
  const costLayers = calcResult?.["costLayers"] as Record<string, number> | null;
  const appliedRules = calcResult?.["appliedRules"] as string[] | null;

  return (
    <div className="p-6 space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Link href="/catalog" className="hover:text-zinc-300">Catalog</Link>
        <span>/</span>
        <span className="font-mono text-zinc-300">{sku}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold text-zinc-100">{sku}</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{variant.label ?? variant.product.canonicalName}</p>
        </div>
        <Badge variant={statusBadge(variant.active ? "ACTIVE" : "INACTIVE")}>
          {variant.active ? "active" : "inactive"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Identity */}
        <Card>
          <CardHeader label="Identity" />
          <CardBody>
            <StatRow label="SKU" value={sku} />
            <StatRow label="Product" value={variant.product.canonicalName} mono={false} />
            <StatRow label="Supplier SKU" value={variant.supplierSku ?? "—"} />
            <StatRow label="Supplier" value={variant.supplier?.name ?? variant.supplier?.code ?? "—"} mono={false} />
          </CardBody>
        </Card>

        {/* Prices */}
        <Card>
          <CardHeader label="Prices" />
          <CardBody>
            {variant.prices.length === 0 ? (
              <p className="text-xs text-zinc-600">No price records</p>
            ) : (
              variant.prices.map((p) => (
                <StatRow
                  key={p.id}
                  label={p.priceType}
                  value={`${p.currency} ${Number(p.amount).toLocaleString("en", { minimumFractionDigits: 2 })}`}
                />
              ))
            )}
          </CardBody>
        </Card>

        {/* Extracted attributes */}
        <Card className="lg:col-span-2">
          <CardHeader label="Extracted Attributes" actions={
            confidence != null ? (
              <div className="flex items-center gap-3 w-40">
                <span className="text-xs text-zinc-500">confidence</span>
                <ConfidenceBar value={confidence} />
              </div>
            ) : undefined
          } />
          <CardBody>
            {attrs && Object.keys(attrs).filter(k => !["confidence", "warnings", "unresolvedTokens"].includes(k)).length > 0 ? (
              <div className="grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-3">
                {Object.entries(attrs).filter(([k]) => !["confidence", "warnings", "unresolvedTokens", "claimedTokens"].includes(k)).map(([key, val]) => (
                  <StatRow key={key} label={key} value={String(val ?? "—")} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">No extracted attributes on record</p>
            )}

            {(warnings.length > 0 || unresolvedTokens.length > 0) && (
              <TracePanel label={`Extraction warnings (${warnings.length + unresolvedTokens.length})`} className="mt-3" defaultOpen={false}>
                {warnings.map((w, i) => <TraceRow key={i} label="warning" value={w} />)}
                {unresolvedTokens.length > 0 && (
                  <TraceRow label="unresolved" value={unresolvedTokens.join(", ")} />
                )}
              </TracePanel>
            )}
          </CardBody>
        </Card>

        {/* Pricing calculations */}
        {latestCalc && (
          <Card className="lg:col-span-2">
            <CardHeader label="Latest Pricing Calculation" actions={
              <span className="font-mono text-[10px] text-zinc-600">{new Date(latestCalc.createdAt).toISOString().slice(0, 16)}</span>
            } />
            <CardBody>
              <div className="grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-3">
                {calcResult && Object.entries(calcResult)
                  .filter(([k]) => !["costLayers", "appliedRules", "trace"].includes(k))
                  .map(([k, v]) => (
                    <StatRow key={k} label={k} value={typeof v === "number" ? v.toFixed(2) : String(v ?? "—")} />
                  ))}
              </div>

              {costLayers && (
                <TracePanel label="Cost layers" defaultOpen>
                  {Object.entries(costLayers).map(([layer, amount]) => (
                    <TraceRow key={layer} label={layer} value={`USD ${Number(amount).toFixed(2)}`} />
                  ))}
                </TracePanel>
              )}

              {appliedRules && appliedRules.length > 0 && (
                <TracePanel label={`Applied pricing rules (${appliedRules.length})`}>
                  {appliedRules.map((r, i) => <TraceRow key={i} label={`rule ${i + 1}`} value={r} />)}
                </TracePanel>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
