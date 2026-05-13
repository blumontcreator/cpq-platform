/** Supplier-specific column resolution; keeps parsing supplier-agnostic. */
export interface ColumnAliasMap {
  supplierSku: readonly string[];
  supplierName: readonly string[];
  /** Free-text description / marketing copy from supplier file. */
  description?: readonly string[];
  listPrice?: readonly string[];
}

/**
 * Supplier-specific extraction overrides.
 *
 * Key format:
 *   `<attributeType>:<raw_token>` → canonical value
 *
 * Examples:
 *   "series:wb-240"  → "WB-240"
 *   "color:antique"  → "Antique White"
 *   "tier:contract"  → "Commercial"
 *
 * These feed directly into ExtractionInput.supplierSynonyms so they apply
 * before the generic dictionaries — no branching in the pipeline.
 */
export type ExtractionHints = Record<string, string>;

export interface ImportProfile {
  readonly profileKey: string;
  readonly supplierCode: string;
  readonly supplierDisplayName: string;
  readonly columnAliases: ColumnAliasMap;
  readonly defaultCurrency: string;
  /**
   * Optional supplier-specific synonym overrides for the extraction pipeline.
   * Empty object if the supplier needs no overrides.
   */
  readonly extractionHints: ExtractionHints;
}
