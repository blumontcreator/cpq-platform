export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import { ConfidenceDot } from "@/components/ui/confidence-bar";

export const metadata = { title: "Catalog Explorer — CPQ Console" };

async function getCatalogData() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      variants: {
        where: { active: true },
        include: { prices: { where: { priceType: "LIST" }, orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { sku: "asc" },
      },
      _count: { select: { variants: true } },
    },
    orderBy: { canonicalName: "asc" },
    take: 200,
  });
  return products;
}

export default async function CatalogPage() {
  const products = await getCatalogData();
  const totalVariants = products.reduce((s, p) => s + p._count.variants, 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Catalog Explorer</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {products.length} products · {totalVariants} variants
          </p>
        </div>
      </div>

      {products.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-500 text-sm">No catalog data yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Run <code className="font-mono bg-zinc-800 px-1">npm run import:a400</code> to seed the catalog.</p>
        </div>
      )}

      <div className="space-y-4">
        {products.map((product) => (
          <Card key={product.id}>
            <CardHeader
              label={product.canonicalName}
              actions={
                <Badge variant="zinc">{product._count.variants} variants</Badge>
              }
            />
            <div className="divide-y divide-zinc-800/50">
              {product.variants.map((variant) => {
                const attrs = variant.attributes as Record<string, unknown> | null;
                const confidence = (attrs?.["confidence"] as number) ?? null;
                const listPrice = variant.prices[0];

                return (
                  <Link
                    key={variant.id}
                    href={`/catalog/${variant.sku}`}
                    className="flex items-center gap-4 px-4 py-2.5 hover:bg-zinc-800/40 transition-colors group"
                  >
                    <span className="w-40 font-mono text-xs text-zinc-300 group-hover:text-blue-400 truncate">
                      {variant.sku}
                    </span>
                    <span className="flex-1 text-sm text-zinc-400 truncate">
                      {variant.label ?? "—"}
                    </span>
                    {confidence != null && (
                      <span title={`Extraction confidence: ${Math.round(confidence * 100)}%`}>
                        <ConfidenceDot value={confidence} />
                      </span>
                    )}
                    {listPrice && (
                      <span className="font-mono text-xs text-zinc-300 w-24 text-right">
                        {listPrice.currency} {Number(listPrice.amount).toLocaleString("en", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    <Badge variant={statusBadge(variant.active ? "ACTIVE" : "INACTIVE")}>
                      {variant.active ? "active" : "inactive"}
                    </Badge>
                    <span className="text-zinc-700 group-hover:text-zinc-400">→</span>
                  </Link>
                );
              })}
              {product.variants.length === 0 && (
                <div className="px-4 py-3 text-xs text-zinc-600">No active variants</div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
