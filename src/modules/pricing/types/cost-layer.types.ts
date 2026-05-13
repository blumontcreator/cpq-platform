/**
 * Cost layer types.
 *
 * A pricing calculation is a pipeline of ordered cost layers.
 * Each layer takes the running total from the previous layer, applies its logic,
 * and emits a delta and a new running total.
 *
 * This layered model supports:
 *   - supplier cost → landed cost → fully-loaded cost
 *   - progressive percentage stacking (e.g. freight on top of supplier cost,
 *     customs on top of freight, warehousing on top of landed, …)
 *   - easy disable/enable of individual layers per policy
 *   - full auditability of every cent added
 */

export const COST_LAYER_KINDS = [
  "SUPPLIER_COST",
  "FX_CONVERSION",
  "FREIGHT",
  "CUSTOMS",
  "WAREHOUSING",
  "INSTALLATION",
  "ACCESSORIES",
  "COMMISSION",
  "WARRANTY",
  "RISK_BUFFER",
] as const;

export type CostLayerKind = (typeof COST_LAYER_KINDS)[number];

/** How the layer's value is interpreted against the running total. */
export type CostValueKind =
  | "absolute"      // add a fixed monetary amount
  | "percentage"    // add X% of the running total at this point
  | "factor"        // multiply running total by X (e.g. 1.05 = +5%)
  | "override";     // replace running total entirely (used for SUPPLIER_COST)

export interface CostLayerCondition {
  /** Attribute key to check (dot-notation, e.g. "extracted.motorization.value.motorized") */
  attribute: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists";
  value?: unknown;
}

/** Configuration for one cost layer inside a PricingPolicy. */
export interface CostLayer {
  kind: CostLayerKind;
  enabled: boolean;
  valueKind: CostValueKind;
  /** Absolute amount in `currency`, or percentage 0–100, or factor ≥ 1.0 */
  value: number;
  /** Currency for absolute amounts (defaults to policy default currency). */
  currency?: string;
  /** Human-readable label for traces. */
  label?: string;
  /** Only apply this layer when ALL conditions are met. */
  conditions?: CostLayerCondition[];
  metadata?: Record<string, unknown>;
}

/** Output from one layer processor during a calculation run. */
export interface CostLayerResult {
  kind: CostLayerKind;
  label: string;
  inputAmount: number;
  /** Amount added (or subtracted) by this layer. */
  addedAmount: number;
  outputAmount: number;
  /** True when conditions prevented this layer from running. */
  skipped: boolean;
  skipReason?: string;
  note?: string;
}
