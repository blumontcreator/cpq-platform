import type { AttributeEnvelope } from "../extraction/types";

export interface CatalogCandidate {
  supplierSku: string;
  canonicalName: string;
  envelope: AttributeEnvelope;
}

/**
 * A product family groups sibling variants that share the same series + material + category.
 * One family may produce one `Product` with multiple `ProductVariant` rows.
 */
export interface ProductFamily {
  /** Derived key: `<series>|<material>|<tier>` or a hash of the canonical name stem. */
  familyKey: string;
  /** Display label for the family (used as canonicalName on the Product record). */
  familyName: string;
  /**
   * Configurable attributes — dimensions where variants differ (e.g. width, height, color).
   * These drive CPQ configuration axes.
   */
  configurableAxes: string[];
  /**
   * All candidates belonging to this family, sorted by SKU.
   * Each becomes one `ProductVariant`.
   */
  members: CatalogCandidate[];
}
