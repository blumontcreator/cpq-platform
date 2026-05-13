import { z } from "zod";
import type { ImportProfile } from "../../imports/profiles/profile.types";
import { coerceNumber, coerceString } from "../../imports/parsers/tabular-helpers";
import { buildExtractionInput } from "../extraction/tokenizer";
import { ruleBasedExtractionProvider } from "../extraction/pipeline";
import type { AttributeEnvelope, ExtractionProvider } from "../extraction/types";

// ── Column mapping ────────────────────────────────────────────────────────────

export const mappedImportRowSchema = z.object({
  supplierSku: z.string().min(1),
  supplierName: z.string().optional(),
  rawDescription: z.string().optional(),
  listPrice: z.number().finite().nonnegative().optional(),
});

export type MappedImportRow = z.infer<typeof mappedImportRowSchema>;

function pickFromRaw(
  raw: Record<string, unknown>,
  aliases: readonly string[] | undefined,
): unknown {
  if (!aliases?.length) return undefined;
  const keys = Object.keys(raw);
  for (const alias of aliases) {
    const target = alias.trim().toLowerCase();
    const hit = keys.find((k) => k.trim().toLowerCase() === target);
    if (hit !== undefined) return raw[hit];
  }
  return undefined;
}

export function mapRawToFields(
  raw: Record<string, unknown>,
  profile: ImportProfile,
): { ok: true; value: MappedImportRow } | { ok: false; errors: string[] } {
  const sku = coerceString(pickFromRaw(raw, profile.columnAliases.supplierSku));
  const name = coerceString(pickFromRaw(raw, profile.columnAliases.supplierName));
  const desc = coerceString(pickFromRaw(raw, profile.columnAliases.description));
  const listPrice = coerceNumber(pickFromRaw(raw, profile.columnAliases.listPrice));

  const parsed = mappedImportRowSchema.safeParse({
    supplierSku: sku,
    supplierName: name,
    rawDescription: desc,
    listPrice,
  });

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}:${i.message}`),
    };
  }
  return { ok: true, value: parsed.data };
}

// ── Semantic normalization ────────────────────────────────────────────────────

/**
 * The shape stored in Product.attributes and ProductVariant.attributes.
 * Replaces the previous opaque Record<string, unknown>.
 */
export type NormalizedCatalogRow = {
  canonicalName: string;
  variantLabel?: string;
  /** Full attribute envelope (serialisable to Prisma Json). */
  envelope: AttributeEnvelope;
};

/**
 * Normalizes one mapped row by running the extraction pipeline.
 *
 * The `provider` parameter is the seam for LLM injection:
 * - Pass `ruleBasedExtractionProvider` (default) for the rule-based pipeline.
 * - Pass any object implementing `ExtractionProvider` for LLM-assisted extraction.
 */
export async function normalizeMappedRow(
  mapped: MappedImportRow,
  profile: ImportProfile,
  provider: ExtractionProvider = ruleBasedExtractionProvider,
): Promise<NormalizedCatalogRow> {
  // Build text corpus from all available text fields
  const corpusParts = [
    mapped.supplierSku,
    mapped.supplierName,
    mapped.rawDescription,
  ].filter(Boolean);
  const corpus = corpusParts.join(" ");

  const extractionInput = buildExtractionInput(corpus, profile.extractionHints);
  const { attributes, meta } = await provider.run(extractionInput);

  // Derive canonical name: prefer supplier name; fall back to series + material or SKU
  const baseName =
    mapped.supplierName?.trim() ||
    [attributes.series?.value, attributes.material?.value]
      .filter(Boolean)
      .join(" ") ||
    mapped.rawDescription?.trim() ||
    mapped.supplierSku;

  const canonicalName = baseName.replace(/\s+/g, " ").trim();

  const envelope: AttributeEnvelope = {
    import: {
      profileKey: profile.profileKey,
      supplierCode: profile.supplierCode,
    },
    supplier: {
      originalSku: mapped.supplierSku,
      originalName: mapped.supplierName ?? null,
      originalDescription: mapped.rawDescription ?? null,
    },
    pricing: {
      listPrice: mapped.listPrice ?? null,
      currency: profile.defaultCurrency,
    },
    extracted: attributes,
    meta,
  };

  return {
    canonicalName,
    variantLabel: mapped.supplierSku,
    envelope,
  };
}
