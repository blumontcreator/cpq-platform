import type { Prisma, PrismaClient } from "@prisma/client";
import { ImportSourceKind, PriceKind } from "@prisma/client";
import type { ImportProfile } from "../profiles/profile.types";
import type { MappedImportRow, NormalizedCatalogRow } from "../../catalog/normalization/normalization.service";
import { mapRawToFields, normalizeMappedRow } from "../../catalog/normalization/normalization.service";
import type { ParsedFileResult } from "../types";
import type { ExtractionProvider } from "../../catalog/extraction/types";

export function buildInternalSku(supplierCode: string, supplierSku: string): string {
  const code = supplierCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const sku = String(supplierSku).trim().replace(/:/g, "-");
  const base = `${code}:${sku}`;
  return base.length > 180 ? base.slice(0, 180) : base;
}

export async function upsertCatalogFromMappedRow(
  tx: Prisma.TransactionClient,
  params: {
    supplierId: string;
    profile: ImportProfile;
    mapped: MappedImportRow;
    normalized: NormalizedCatalogRow;
  },
): Promise<{ productId: string; variantId: string }> {
  const { supplierId, profile, mapped, normalized } = params;
  // Serialisable attribute payload stored on both Product and ProductVariant
  const attributePayload = JSON.parse(
    JSON.stringify(normalized.envelope),
  ) as Prisma.InputJsonValue;

  const existing = await tx.productVariant.findUnique({
    where: {
      supplierId_supplierSku: {
        supplierId,
        supplierSku: mapped.supplierSku,
      },
    },
  });

  const internalSku = buildInternalSku(profile.supplierCode, mapped.supplierSku);

  if (existing) {
    await tx.product.update({
      where: { id: existing.productId },
      data: {
        canonicalName: normalized.canonicalName,
        description: mapped.rawDescription ?? undefined,
        attributes: attributePayload,
        active: true,
      },
    });
    await tx.productVariant.update({
      where: { id: existing.id },
      data: {
        sku: internalSku,
        label: normalized.variantLabel ?? undefined,
        attributes: attributePayload,
        active: true,
      },
    });

    await syncListPrice(tx, {
      supplierId,
      productId: existing.productId,
      variantId: existing.id,
      currency: profile.defaultCurrency,
      listPrice: mapped.listPrice,
    });

    return { productId: existing.productId, variantId: existing.id };
  }

  const product = await tx.product.create({
    data: {
      canonicalName: normalized.canonicalName,
      description: mapped.rawDescription ?? null,
      attributes: attributePayload,
    },
  });

  const variant = await tx.productVariant.create({
    data: {
      productId: product.id,
      supplierId,
      supplierSku: mapped.supplierSku,
      sku: internalSku,
      label: normalized.variantLabel ?? null,
      attributes: attributePayload,
    },
  });

  await syncListPrice(tx, {
    supplierId,
    productId: product.id,
    variantId: variant.id,
    currency: profile.defaultCurrency,
    listPrice: mapped.listPrice,
  });

  return { productId: product.id, variantId: variant.id };
}

async function syncListPrice(
  tx: Prisma.TransactionClient,
  params: {
    supplierId: string;
    productId: string;
    variantId: string;
    currency: string;
    listPrice?: number;
  },
): Promise<void> {
  const { supplierId, productId, variantId, currency, listPrice } = params;

  await tx.productPrice.deleteMany({
    where: {
      variantId,
      supplierId,
      priceType: PriceKind.LIST,
    },
  });

  if (listPrice === undefined) return;

  await tx.productPrice.create({
    data: {
      supplierId,
      productId,
      variantId,
      currency,
      amount: listPrice,
      priceType: PriceKind.LIST,
      metadata: { layer: "supplier_import" } as Prisma.InputJsonValue,
    },
  });
}

export async function persistSupplierImport(
  prisma: PrismaClient,
  input: {
    supplierId: string;
    profile: ImportProfile;
    sourceKey: string;
    sourceKind: ImportSourceKind;
    parsed: ParsedFileResult;
    /** Override the extraction provider (default: rule-based). Swap for LLM. */
    extractionProvider?: ExtractionProvider;
  },
): Promise<{
  importId: string;
  version: number;
  rowCount: number;
  parsedCount: number;
  skippedCount: number;
  errorCount: number;
}> {
  const { supplierId, profile, sourceKey, sourceKind, parsed, extractionProvider } = input;

  const maxRow = await prisma.supplierImport.findFirst({
    where: { supplierId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (maxRow?.version ?? 0) + 1;

  const skippedCount = parsed.rows.filter((r) => r.skipped).length;
  const materialRows = parsed.rows.filter((r) => !r.skipped);
  const rowCount = parsed.rows.length;

  const importRecord = await prisma.supplierImport.create({
    data: {
      supplierId,
      version,
      sourceKey,
      sourceKind,
      status: "RUNNING",
      rowCount,
      skippedCount,
      metadata: {
        globalErrors: parsed.globalErrors,
        profileKey: profile.profileKey,
      } as Prisma.InputJsonValue,
    },
  });

  if (parsed.globalErrors.length && materialRows.length === 0) {
    await prisma.supplierImport.update({
      where: { id: importRecord.id },
      data: {
        status: "FAILED",
        errorCount: 1,
        errorMessage: parsed.globalErrors.join("; "),
        completedAt: new Date(),
      },
    });
    return {
      importId: importRecord.id,
      version,
      rowCount,
      parsedCount: 0,
      skippedCount,
      errorCount: 1,
    };
  }

  // ── Phase 1: Map + normalize all rows outside the transaction ───────────────
  // Normalization is async (supports LLM providers) and must not run inside a
  // database transaction to avoid idle-timeout / P2028 errors.

  type PreparedRow =
    | {
        ok: false;
        source: (typeof parsed.rows)[number];
        errors: string[];
      }
    | {
        ok: true;
        source: (typeof parsed.rows)[number];
        mapped: MappedImportRow;
        normalized: NormalizedCatalogRow;
      };

  const prepared: PreparedRow[] = [];
  for (const row of parsed.rows) {
    if (row.skipped) continue;

    const mapResult = mapRawToFields(row.raw, profile);
    if (!mapResult.ok) {
      prepared.push({ ok: false, source: row, errors: mapResult.errors });
      continue;
    }
    const normalized = await normalizeMappedRow(
      mapResult.value,
      profile,
      extractionProvider,
    );
    prepared.push({ ok: true, source: row, mapped: mapResult.value, normalized });
  }

  // ── Phase 2: Persist everything inside a single fast transaction ─────────
  let parsedCount = 0;
  let errorCount = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const prep of prepared) {
        if (!prep.ok) {
          errorCount += 1;
          await tx.supplierImportRow.create({
            data: {
              importId: importRecord.id,
              sheetName: prep.source.sheetName ?? null,
              rowIndex: prep.source.rowIndex,
              raw: prep.source.raw as Prisma.InputJsonValue,
              supplierSku: null,
              supplierName: null,
              parseErrors: prep.errors as Prisma.InputJsonValue,
              parseWarnings: prep.source.parseWarnings.length
                ? (prep.source.parseWarnings as Prisma.InputJsonValue)
                : undefined,
            },
          });
          continue;
        }

        const { source, mapped, normalized } = prep;

        const { productId, variantId } = await upsertCatalogFromMappedRow(tx, {
          supplierId,
          profile,
          mapped,
          normalized,
        });

        parsedCount += 1;

        await tx.supplierImportRow.create({
          data: {
            importId: importRecord.id,
            sheetName: source.sheetName ?? null,
            rowIndex: source.rowIndex,
            raw: source.raw as Prisma.InputJsonValue,
            supplierSku: mapped.supplierSku,
            supplierName: mapped.supplierName ?? null,
            parseErrors: source.parseErrors.length
              ? (source.parseErrors as Prisma.InputJsonValue)
              : undefined,
            parseWarnings: source.parseWarnings.length
              ? (source.parseWarnings as Prisma.InputJsonValue)
              : undefined,
            normalized: JSON.parse(
              JSON.stringify(normalized.envelope),
            ) as Prisma.InputJsonValue,
            productId,
            variantId,
          },
        });
      }

      await tx.supplierImport.update({
        where: { id: importRecord.id },
        data: {
          status: "COMPLETED",
          parsedCount,
          errorCount,
          completedAt: new Date(),
        },
      });
    },
    { timeout: 30_000 },
  );

  return {
    importId: importRecord.id,
    version,
    rowCount,
    parsedCount,
    skippedCount,
    errorCount,
  };
}
