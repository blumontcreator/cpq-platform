/**
 * Pricing rule types.
 *
 * Rules modify the price AFTER the cost graph has produced a base price.
 * They operate on the PricingContext and can apply discounts, premiums,
 * or hard overrides.
 *
 * Rule evaluation is ordered by priority (lower = higher priority).
 * Rules can be exclusive (first match wins) or cumulative (all matching apply).
 */

export type RuleKind =
  | "MARGIN_FLOOR"          // enforce minimum margin; reject or warn if breached
  | "CUSTOMER_DISCOUNT"     // customer-specific flat or pct discount
  | "CHANNEL_DISCOUNT"      // channel-specific discount
  | "PROJECT_DISCOUNT"      // project-specific discount
  | "ATTRIBUTE_MODIFIER"    // modify price based on extracted product attributes
  | "QUANTITY_BREAK"        // tiered pricing at quantity thresholds
  | "MANUAL_OVERRIDE";      // explicit price override (bypasses all rules below it)

export type RuleEffectKind =
  | "discount_pct"      // reduce price by X%
  | "discount_abs"      // reduce price by fixed amount
  | "surcharge_pct"     // increase price by X%
  | "surcharge_abs"     // increase price by fixed amount
  | "set_price"         // hard set to this amount
  | "floor_price"       // price cannot go below this
  | "ceil_price";       // price cannot exceed this

export interface RuleCondition {
  field: "channel" | "customerId" | "projectId" | "quantity" | "attribute" | "sku" | "familyKey";
  operator: "eq" | "neq" | "in" | "not_in" | "gte" | "lte" | "contains" | "exists";
  value?: unknown;
  /** For field=attribute: dot-notation attribute path */
  attributePath?: string;
}

export interface RuleEffect {
  kind: RuleEffectKind;
  value: number;
  /** Optional: apply only to specific cost layer output (e.g. only affect LIST price) */
  targetLayer?: string;
  note?: string;
}

export interface PricingRule {
  id: string;
  kind: RuleKind;
  name: string;
  description?: string;
  /** Lower number = applied first. */
  priority: number;
  /** When true: if this rule matches, no lower-priority rules of the same kind run. */
  exclusive: boolean;
  enabled: boolean;
  conditions: RuleCondition[];
  effects: RuleEffect[];
  metadata?: Record<string, unknown>;
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  kind: RuleKind;
  /** Price before this rule. */
  priceIn: number;
  /** Price after this rule. */
  priceOut: number;
  effectsApplied: RuleEffect[];
  note?: string;
}
