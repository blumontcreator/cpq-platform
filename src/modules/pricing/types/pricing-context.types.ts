/**
 * PricingContext — everything the engine needs to calculate a price.
 *
 * Contexts are immutable during a single engine run.
 * They carry commercial intent (who is buying, through which channel, how many)
 * alongside the product data needed for attribute-based rules.
 */

export type ChannelKind =
  | "DIRECT"        // direct B2B sale
  | "DISTRIBUTOR"   // through a distributor
  | "DEALER"        // through a dealer/retailer
  | "ONLINE"        // e-commerce / self-serve
  | "PROJECT"       // project/tender pricing
  | "EXPORT";       // export / international

export interface CustomerContext {
  customerId: string;
  customerName?: string;
  /** Customer tier drives rule matching. */
  tier?: "PLATINUM" | "GOLD" | "SILVER" | "BRONZE" | "STANDARD";
  /** Pre-negotiated discount ceiling (0–100). Engine will not exceed this. */
  maxDiscountPct?: number;
}

export interface ProjectContext {
  projectId: string;
  projectName?: string;
  /** A project-level discount budget (0–100). */
  discountBudgetPct?: number;
}

export interface PricingContext {
  /** The variant SKU being priced. */
  variantSku: string;
  /** Product family key (for family-level rules). */
  familyKey?: string;
  /** Raw extracted attributes envelope from the catalog (passed through for attribute rules). */
  variantAttributes?: Record<string, unknown>;

  // ── Order intent ──────────────────────────────────────────────────────────
  quantity: number;
  channel: ChannelKind;
  currency: string;
  pricingDate: Date;

  // ── Commercial context (optional) ─────────────────────────────────────────
  customer?: CustomerContext;
  project?: ProjectContext;

  // ── Overrides ─────────────────────────────────────────────────────────────
  /** Force a specific supplier cost instead of reading from ProductPrice. */
  supplierCostOverride?: number;
  /** Hard override: skip cost graph and rules, use this as the final price. */
  manualPriceOverride?: number;
  /** Optional FX rate from supplier currency to target currency. */
  fxRate?: number;

  metadata?: Record<string, unknown>;
}
