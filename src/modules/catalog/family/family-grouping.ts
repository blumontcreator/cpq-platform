/**
 * Family grouping service.
 *
 * Groups a flat list of catalog candidates (one per supplier SKU) into product families.
 * A family represents a configurable entity; its members are the sellable variants.
 *
 * Design:
 * - Grouping key is derived from extracted series + material + tier.
 * - If none of those are present, the canonical name stem (first 3 significant words) is used.
 * - Configurable axes are inferred by finding attributes that differ across siblings.
 * - This service is stateless and supplier-agnostic.
 */
import type { CatalogCandidate, ProductFamily } from "./types";
import type { ExtractedAttributes } from "../extraction/types";

// ── Grouping key construction ────────────────────────────────────────────────

function extractGroupKey(candidate: CatalogCandidate): string {
  const { extracted } = candidate.envelope;

  const parts: string[] = [];

  if (extracted.series?.value) parts.push(`series:${extracted.series.value}`);
  if (extracted.material?.value) parts.push(`mat:${extracted.material.value}`);
  if (extracted.tier?.value) parts.push(`tier:${extracted.tier.value}`);

  if (parts.length > 0) return parts.join("|");

  // Fallback: first 3 significant words of the canonical name
  const words = candidate.canonicalName
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3);
  return `name:${words.join(" ").toLowerCase()}`;
}

function deriveFamilyName(members: CatalogCandidate[]): string {
  const first = members[0]!;
  const { extracted } = first.envelope;

  const parts: string[] = [];
  if (extracted.series?.value) parts.push(extracted.series.value);
  if (extracted.material?.value) parts.push(extracted.material.value);
  if (extracted.tier?.value) parts.push(`(${extracted.tier.value})`);

  if (parts.length) return parts.join(" ");

  // Use the stem of the canonical name from the most common prefix across siblings
  return longestCommonPrefix(members.map((m) => m.canonicalName)).trim() || first.canonicalName;
}

function longestCommonPrefix(strings: string[]): string {
  if (!strings.length) return "";
  let prefix = strings[0]!;
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i]!.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return "";
    }
  }
  // Trim to last word boundary
  const lastSpace = prefix.lastIndexOf(" ");
  return lastSpace > 0 ? prefix.slice(0, lastSpace) : prefix;
}

// ── Configurable axes detection ──────────────────────────────────────────────

/**
 * Attributes that, when they differ across siblings, define configuration axes.
 * Order matters — listed roughly in descending CPQ priority.
 */
const AXIS_FIELDS: Array<keyof ExtractedAttributes> = [
  "dimensions",
  "color",
  "finish",
  "motorization",
  "mounting",
  "material",
  "size",
  "voltage",
  "packaging",
];

function detectConfigurableAxes(members: CatalogCandidate[]): string[] {
  if (members.length < 2) return [];

  return AXIS_FIELDS.filter((field) => {
    const values = members
      .map((m) => {
        const r = m.envelope.extracted[field];
        if (!r) return null;
        const v = r.value;
        // Normalize to a comparable string
        return JSON.stringify(v);
      })
      .filter(Boolean);

    const unique = new Set(values);
    return unique.size > 1;
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export function groupIntoFamilies(candidates: CatalogCandidate[]): ProductFamily[] {
  const buckets = new Map<string, CatalogCandidate[]>();

  for (const c of candidates) {
    const key = extractGroupKey(c);
    const bucket = buckets.get(key) ?? [];
    bucket.push(c);
    buckets.set(key, bucket);
  }

  const families: ProductFamily[] = [];

  for (const [familyKey, members] of buckets) {
    const sorted = [...members].sort((a, b) => a.supplierSku.localeCompare(b.supplierSku));
    families.push({
      familyKey,
      familyName: deriveFamilyName(sorted),
      configurableAxes: detectConfigurableAxes(sorted),
      members: sorted,
    });
  }

  return families.sort((a, b) => a.familyKey.localeCompare(b.familyKey));
}

/**
 * Utility: returns true when a product with multiple variants should be treated
 * as a configurable product (CPQ rule option) rather than a simple sellable item.
 */
export function isConfigurableFamily(family: ProductFamily): boolean {
  return family.members.length > 1 && family.configurableAxes.length > 0;
}
