/**
 * Factory helpers for the five most common built-in rule shapes.
 *
 * These produce PricingRule objects ready to include in a policy.
 * They do NOT ship in any default policy — callers build policies explicitly.
 */
import type { PricingRule } from "../types/pricing-rule.types";
import type { ChannelKind } from "../types/pricing-context.types";

let _counter = 0;
function autoId(prefix: string): string {
  return `${prefix}-${++_counter}`;
}

/** Prevent the price from dropping below the margin floor. */
export function marginFloorRule(floorPct: number): PricingRule {
  return {
    id: autoId("margin-floor"),
    kind: "MARGIN_FLOOR",
    name: `Margin Floor ${floorPct}%`,
    description: `Price cannot produce less than ${floorPct}% gross margin`,
    priority: 1,
    exclusive: false,
    enabled: true,
    conditions: [],
    effects: [],  // enforced by the engine directly using floorPrice
    metadata: { floorPct },
  };
}

/** Flat percentage discount for a named customer. */
export function customerDiscountRule(customerId: string, discountPct: number): PricingRule {
  return {
    id: autoId("cust-disc"),
    kind: "CUSTOMER_DISCOUNT",
    name: `Customer Discount: ${customerId} (${discountPct}%)`,
    priority: 10,
    exclusive: true,
    enabled: true,
    conditions: [{ field: "customerId", operator: "eq", value: customerId }],
    effects: [{ kind: "discount_pct", value: discountPct }],
  };
}

/** Channel-specific discount. */
export function channelDiscountRule(channel: ChannelKind, discountPct: number): PricingRule {
  return {
    id: autoId("ch-disc"),
    kind: "CHANNEL_DISCOUNT",
    name: `Channel Discount: ${channel} (${discountPct}%)`,
    priority: 20,
    exclusive: true,
    enabled: true,
    conditions: [{ field: "channel", operator: "eq", value: channel }],
    effects: [{ kind: "discount_pct", value: discountPct }],
  };
}

/** Project-specific discount. */
export function projectDiscountRule(projectId: string, discountPct: number): PricingRule {
  return {
    id: autoId("proj-disc"),
    kind: "PROJECT_DISCOUNT",
    name: `Project Discount: ${projectId} (${discountPct}%)`,
    priority: 15,
    exclusive: true,
    enabled: true,
    conditions: [{ field: "projectId", operator: "eq", value: projectId }],
    effects: [{ kind: "discount_pct", value: discountPct }],
  };
}

/** Surcharge when a product attribute matches a value (e.g. motorized = +15%). */
export function attributeModifierRule(
  name: string,
  attributePath: string,
  matchValue: unknown,
  effectKind: "surcharge_pct" | "surcharge_abs" | "discount_pct" | "discount_abs",
  effectValue: number,
  priority = 30,
): PricingRule {
  return {
    id: autoId("attr-mod"),
    kind: "ATTRIBUTE_MODIFIER",
    name,
    priority,
    exclusive: false,
    enabled: true,
    conditions: [{ field: "attribute", operator: "eq", value: matchValue, attributePath }],
    effects: [{ kind: effectKind, value: effectValue }],
  };
}

/** Quantity-break discount: X% off when quantity ≥ threshold. */
export function quantityBreakRule(threshold: number, discountPct: number): PricingRule {
  return {
    id: autoId("qty-break"),
    kind: "QUANTITY_BREAK",
    name: `Qty Break: ≥${threshold} units → ${discountPct}% off`,
    priority: 25,
    exclusive: false,
    enabled: true,
    conditions: [{ field: "quantity", operator: "gte", value: threshold }],
    effects: [{ kind: "discount_pct", value: discountPct }],
  };
}
