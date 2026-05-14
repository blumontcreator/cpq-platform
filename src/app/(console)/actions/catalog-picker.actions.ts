"use server";

import { requireConsoleAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export type CatalogPickerRow = {
  sku: string;
  label: string | null;
  productName: string;
};

/**
 * Typeahead search for catalog-backed quote lines. Scoped to authenticated console only.
 */
export async function searchCatalogVariantsForPicker(
  query: string,
): Promise<CatalogPickerRow[]> {
  await requireConsoleAuth();

  const q = query.trim();

  const rows = await prisma.productVariant.findMany({
    where: {
      active: true,
      ...(q.length === 0
        ? {}
        : {
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { label: { contains: q, mode: "insensitive" } },
              { product: { canonicalName: { contains: q, mode: "insensitive" } } },
            ],
          }),
    },
    take:  q.length === 0 ? 30 : 40,
    orderBy: { sku: "asc" },
    include: { product: { select: { canonicalName: true } } },
  });

  return rows.map((r) => ({
    sku: r.sku,
    label: r.label,
    productName: r.product.canonicalName,
  }));
}
