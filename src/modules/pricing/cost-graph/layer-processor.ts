/**
 * Base contract for a cost layer processor.
 *
 * Each processor is stateless and pure. It receives the running total from the
 * previous layer plus the layer configuration and emits a `CostLayerResult`.
 *
 * Implementing a new cost layer means adding one file here and registering it
 * in the registry — nothing else changes.
 */
import type { CostLayer, CostLayerResult } from "../types/cost-layer.types";
import type { PricingContext } from "../types/pricing-context.types";

export interface LayerProcessorInput {
  layer: CostLayer;
  runningTotal: number;
  supplierCost: number;
  context: PricingContext;
}

export interface LayerProcessor {
  readonly kind: import("../types/cost-layer.types").CostLayerKind;
  process(input: LayerProcessorInput): CostLayerResult;
}

// ── Shared utilities ──────────────────────────────────────────────────────────

export function applyValueKind(
  runningTotal: number,
  layer: CostLayer,
  fallbackAbsolute?: number,
): number {
  switch (layer.valueKind) {
    case "absolute":
      return layer.value;
    case "percentage":
      return runningTotal * (layer.value / 100);
    case "factor":
      return runningTotal * layer.value - runningTotal;
    case "override":
      return fallbackAbsolute ?? layer.value;
  }
}

export function evaluateConditions(
  layer: CostLayer,
  context: PricingContext,
): { pass: boolean; reason?: string } {
  if (!layer.conditions?.length) return { pass: true };

  for (const cond of layer.conditions) {
    const val = resolveContextValue(cond.attribute, context);
    if (!checkConditionOperator(cond.operator, val, cond.value)) {
      return {
        pass: false,
        reason: `condition_failed:${cond.attribute} ${cond.operator} ${JSON.stringify(cond.value)}`,
      };
    }
  }
  return { pass: true };
}

function resolveContextValue(path: string, context: PricingContext): unknown {
  const parts = path.split(".");
  let cursor: unknown = context;
  for (const p of parts) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[p];
  }
  return cursor;
}

function checkConditionOperator(
  op: string,
  actual: unknown,
  expected: unknown,
): boolean {
  switch (op) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "exists": return actual !== undefined && actual !== null;
    case "gt": return Number(actual) > Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "in": return Array.isArray(expected) && expected.includes(actual);
    default: return true;
  }
}
