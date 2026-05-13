/**
 * Rule evaluator.
 *
 * Evaluates PricingRule conditions against a PricingContext.
 * Returns true when ALL conditions pass for a rule.
 */
import type { PricingRule, RuleCondition } from "../types/pricing-rule.types";
import type { PricingContext } from "../types/pricing-context.types";

function resolveField(field: RuleCondition["field"], context: PricingContext, attributePath?: string): unknown {
  switch (field) {
    case "channel": return context.channel;
    case "customerId": return context.customer?.customerId;
    case "projectId": return context.project?.projectId;
    case "quantity": return context.quantity;
    case "sku": return context.variantSku;
    case "familyKey": return context.familyKey;
    case "attribute": {
      if (!attributePath || !context.variantAttributes) return undefined;
      const parts = attributePath.split(".");
      let cursor: unknown = context.variantAttributes;
      for (const p of parts) {
        if (cursor == null || typeof cursor !== "object") return undefined;
        cursor = (cursor as Record<string, unknown>)[p];
      }
      return cursor;
    }
  }
}

function evalOperator(op: RuleCondition["operator"], actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "exists": return actual !== undefined && actual !== null;
    case "gte": return Number(actual) >= Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "in": return Array.isArray(expected) && expected.includes(actual);
    case "not_in": return Array.isArray(expected) && !expected.includes(actual);
    case "contains":
      return typeof actual === "string" && actual.includes(String(expected));
    default: return true;
  }
}

export function ruleMatchesContext(rule: PricingRule, context: PricingContext): boolean {
  if (!rule.enabled) return false;
  if (!rule.conditions.length) return true;
  return rule.conditions.every((cond) => {
    const actual = resolveField(cond.field, context, cond.attributePath);
    return evalOperator(cond.operator, actual, cond.value);
  });
}
