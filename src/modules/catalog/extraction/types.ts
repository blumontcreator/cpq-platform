/**
 * Extraction types.
 *
 * Design contract for AI-readiness:
 * - `ExtractionProvider` is the single seam for swapping rule-based → LLM-backed extraction.
 * - The persistence layer only ever calls `provider.run(input)` and receives `AttributeEnvelope`.
 * - No extractor is ever called directly from outside this module.
 */

// ── Primitive result wrapper ────────────────────────────────────────────────

/** Wraps a single extracted value with confidence and provenance. */
export interface ExtractionResult<T> {
  value: T;
  /** 0–1 confidence score produced by the extractor. */
  confidence: number;
  /** Tokens / patterns that produced this result (for tracing + LLM prompt construction). */
  evidence: string[];
}

// ── Structured attribute types ───────────────────────────────────────────────

export interface DimensionValue {
  /** Numeric value as stored (may be fractional). */
  value: number;
  unit: "in" | "cm" | "mm" | "ft";
}

export interface DimensionSet {
  width?: DimensionValue;
  height?: DimensionValue;
  depth?: DimensionValue;
  /** Raw dimension string before parsing (e.g. "84 x 48"). */
  raw: string;
}

export interface MotorizationInfo {
  motorized: boolean;
  /** e.g. "cordless", "RTS", "Z-Wave", "corded", "spring" */
  kind?: string;
}

export interface VoltageInfo {
  min: number;
  max: number;
  unit: "V" | "VAC" | "VDC";
  raw: string;
}

export interface PackagingInfo {
  quantity: number;
  unit: string;
  raw: string;
}

// ── Full extracted attribute bag ─────────────────────────────────────────────

export interface ExtractedAttributes {
  series?: ExtractionResult<string>;
  color?: ExtractionResult<string>;
  finish?: ExtractionResult<string>;
  material?: ExtractionResult<string>;
  motorization?: ExtractionResult<MotorizationInfo>;
  mounting?: ExtractionResult<string>;
  dimensions?: ExtractionResult<DimensionSet>;
  size?: ExtractionResult<string>;
  voltage?: ExtractionResult<VoltageInfo>;
  region?: ExtractionResult<string>;
  tier?: ExtractionResult<string>;
  packaging?: ExtractionResult<PackagingInfo>;
  accessories?: ExtractionResult<string[]>;
}

// ── Extraction metadata ───────────────────────────────────────────────────────

export interface ExtractionMeta {
  /** Mean confidence across all successfully extracted fields. */
  overallConfidence: number;
  /** Attribute-level warnings (e.g. ambiguous color match). */
  warnings: string[];
  /** Input tokens that no extractor claimed. Useful for gap analysis / LLM prompts. */
  unresolvedTokens: string[];
  extractorVersion: number;
  /** True when extracted by a rule-based pipeline; false when LLM-assisted. */
  rulesBased: boolean;
}

// ── Full attribute envelope (persisted to Product / ProductVariant JSON) ──────

export interface AttributeEnvelope {
  import: {
    profileKey: string;
    supplierCode: string;
  };
  supplier: {
    originalSku: string;
    originalName: string | null;
    originalDescription: string | null;
  };
  pricing: {
    listPrice: number | null;
    currency: string;
  };
  extracted: ExtractedAttributes;
  meta: ExtractionMeta;
}

// ── Extractor contract ────────────────────────────────────────────────────────

export interface ExtractionInput {
  /** Full text corpus for pattern matching (name + description). */
  corpus: string;
  /** Lowercased, whitespace-normalised corpus. */
  corpusLower: string;
  /** Individual tokens from corpus. */
  tokens: string[];
  /** Tokens already claimed by a previous extractor (for deduplication). */
  claimedTokens: Set<string>;
  /** Supplier-specific synonyms injected from ImportProfile.extractionHints. */
  supplierSynonyms: Record<string, string>;
}

/**
 * One extractor per attribute type. Stateless; returns undefined when it cannot
 * find evidence for the attribute.
 */
export interface Extractor<T> {
  readonly name: string;
  extract(input: ExtractionInput): ExtractionResult<T> | undefined;
}

// ── Provider seam (LLM slot) ──────────────────────────────────────────────────

/**
 * The pipeline calls `provider.run(input)` exclusively.
 * Swap the rule-based implementation for an LLM-backed one by swapping this interface.
 */
export interface ExtractionProvider {
  run(input: ExtractionInput): Promise<{
    attributes: ExtractedAttributes;
    meta: ExtractionMeta;
  }>;
}
