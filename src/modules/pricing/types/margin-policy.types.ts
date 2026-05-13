/**
 * MarginPolicy — defines acceptable margin bands for a pricing policy.
 *
 * All percentages are expressed as 0–100 values (e.g. 40 = 40%).
 * Margin is always calculated as: (price - cost) / price × 100.
 */
export interface MarginPolicy {
  /** Absolute minimum margin. Engine will not produce a price below this. */
  floorMarginPct: number;
  /** Target/desired margin. Strategies aim for this. */
  targetMarginPct: number;
  /** Warn in PricingResult.warnings when achieved margin drops below this. */
  warningThresholdPct?: number;
  /** When true: raising price to meet floor is automatic; when false: flag as error only. */
  autoEnforceFloor: boolean;
}

export function marginFromCostAndPrice(cost: number, price: number): number {
  if (price <= 0) return 0;
  return ((price - cost) / price) * 100;
}

export function priceFromCostAndMargin(cost: number, targetMarginPct: number): number {
  const m = Math.min(Math.max(targetMarginPct, 0), 99.99);
  return cost / (1 - m / 100);
}
