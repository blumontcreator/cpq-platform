/**
 * Tokenizer utilities.
 *
 * Responsible for breaking raw supplier text into typed tokens that extractors consume.
 * All functions are pure and side-effect-free.
 */

export const EXTRACTOR_VERSION = 1;

// ── Numeric helpers ───────────────────────────────────────────────────────────

const FRACTION_RE = /(\d+)-(\d+)\/(\d+)/g;

/** Convert mixed-number fractions like "2-3/4" to 2.75. */
export function parseMixedFraction(text: string): string {
  return text.replace(FRACTION_RE, (_m, whole, num, den) =>
    String(Number(whole) + Number(num) / Number(den)),
  );
}

/** Extract all numeric values in order from text (after fraction normalisation). */
export function extractNumbers(text: string): number[] {
  const normalised = parseMixedFraction(text);
  const matches = normalised.match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.map(Number);
}

/** Extract the first finite positive number from text, or undefined. */
export function extractFirstNumber(text: string): number | undefined {
  const nums = extractNumbers(text);
  return nums.find((n) => n > 0 && Number.isFinite(n));
}

// ── Unit helpers ──────────────────────────────────────────────────────────────

const UNIT_SYNONYMS: Record<string, string> = {
  '"': "in",
  "''": "in",
  "inch": "in",
  "inches": "in",
  "in": "in",
  "foot": "ft",
  "feet": "ft",
  "ft": "ft",
  "centimeter": "cm",
  "centimeters": "cm",
  "cm": "cm",
  "millimeter": "mm",
  "millimeters": "mm",
  "mm": "mm",
};

export type DimensionUnit = "in" | "ft" | "cm" | "mm";

export function resolveUnit(raw: string): DimensionUnit | undefined {
  return (UNIT_SYNONYMS[raw.trim().toLowerCase()] as DimensionUnit) ?? undefined;
}

// ── Dimension pattern matching ───────────────────────────────────────────────

// Patterns: "84x48", "84 x 48", '84"x48"', "84W x 48H", "84.5 x 48", "2-3/4 x 5"
const DIM_RE =
  /(\d+(?:[-.\/]\d+)*)(?:"|\s*)(?:W|w)?\s*[xX×]\s*(\d+(?:[-.\/]\d+)*)(?:"|\s*)(?:H|h)?(?:\s*[xX×]\s*(\d+(?:[-.\/]\d+)*)(?:"|\s*)(?:D|d)?)?/;

export interface RawDimension {
  first: number;
  second: number;
  third?: number;
  raw: string;
  /** Explicit unit found inline, if any. */
  unit?: DimensionUnit;
}

export function parseDimensions(text: string): RawDimension | undefined {
  const normalised = parseMixedFraction(text);
  const match = normalised.match(DIM_RE);
  if (!match) return undefined;
  const [raw, a, b, c] = match;
  const unit = resolveUnit(raw.match(/[a-z'"]+$/i)?.[0] ?? "in");
  return {
    first: Number(a),
    second: Number(b),
    third: c ? Number(c) : undefined,
    raw: raw.trim(),
    unit: unit ?? "in",
  };
}

// ── Boolean flag helpers ──────────────────────────────────────────────────────

export function containsWord(text: string, words: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => {
    const boundary = new RegExp(`(?<![a-z])${w.toLowerCase()}(?![a-z])`);
    return boundary.test(lower);
  });
}

export function containsAny(corpus: string, terms: readonly string[]): string | undefined {
  const lower = corpus.toLowerCase();
  for (const term of terms) {
    const boundary = new RegExp(`(?<![a-z])${escapeRegex(term.toLowerCase())}(?![a-z])`);
    if (boundary.test(lower)) return term;
  }
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Synonym resolution ────────────────────────────────────────────────────────

/** Resolves a raw token against a synonym dictionary. Returns the canonical form or the original. */
export function resolveSynonym(
  token: string,
  dict: Record<string, string>,
  supplierOverrides: Record<string, string> = {},
): string | undefined {
  const key = token.trim().toLowerCase();
  return supplierOverrides[key] ?? dict[key] ?? undefined;
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

/** Splits text into word-level tokens (preserves alphanumerics and internal hyphens). */
export function tokenise(text: string): string[] {
  return text
    .replace(/["""''']/g, " ")
    .split(/[\s,;:!?()[\]{}<>|@#$%^&*+=~`\\.]+/)
    .map((t) => t.replace(/^[-]+|[-]+$/g, "").trim()) // strip leading/trailing hyphens
    .filter((t) => t.length > 0);
}

/**
 * Build an `ExtractionInput` from raw text + optional supplier overrides.
 * Exported for use in the pipeline and in tests.
 */
export function buildExtractionInput(
  corpus: string,
  supplierSynonyms: Record<string, string> = {},
): import("./types").ExtractionInput {
  const normalised = corpus.replace(/\s+/g, " ").trim();
  return {
    corpus: normalised,
    corpusLower: normalised.toLowerCase(),
    tokens: tokenise(normalised),
    claimedTokens: new Set(),
    supplierSynonyms,
  };
}
