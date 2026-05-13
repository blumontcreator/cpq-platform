/**
 * Built-in constraint factories.
 *
 * Each factory creates a QuoteConstraint from a compact set of parameters.
 * Constraints are evaluated by the ConstraintEngine — they are not active
 * rules themselves; they carry declarative params interpreted by the engine.
 */
import { randomUUID } from "node:crypto";
import type { QuoteConstraint } from "../types/constraint.types";

/** A must-have REQUIRES target that must be in the graph. */
export function requiredDependencyConstraint(
  requiringNodeId: string,
  requiredNodeId: string,
  severity: QuoteConstraint["severity"] = "ERROR",
): QuoteConstraint {
  return {
    id: randomUUID(),
    kind: "REQUIRED_DEPENDENCY",
    name: `Required dependency: ${requiredNodeId}`,
    severity,
    targetNodeId: requiringNodeId,
    params: { requiringNodeId, requiredNodeId },
    enabled: true,
  };
}

/** Two nodes that cannot coexist on the same quote. */
export function incompatibleConstraint(
  nodeIdA: string,
  nodeIdB: string,
  reason?: string,
): QuoteConstraint {
  return {
    id: randomUUID(),
    kind: "INCOMPATIBLE_COMBINATION",
    name: `Incompatible: ${nodeIdA} + ${nodeIdB}`,
    description: reason,
    severity: "ERROR",
    params: { nodeIdA, nodeIdB },
    enabled: true,
  };
}

/** Graph or node-level margin floor. */
export function minimumMarginConstraint(
  minimumPct: number,
  targetNodeId?: string,
  severity: QuoteConstraint["severity"] = "WARNING",
): QuoteConstraint {
  return {
    id: randomUUID(),
    kind: "MINIMUM_MARGIN",
    name: targetNodeId
      ? `Minimum margin ${minimumPct}% on node ${targetNodeId}`
      : `Minimum graph margin ${minimumPct}%`,
    severity,
    targetNodeId,
    params: { minimumPct, targetNodeId },
    enabled: true,
  };
}

/** A specific service node must be present on the quote. */
export function mandatoryServiceConstraint(
  serviceNodeId: string,
  reason?: string,
  severity: QuoteConstraint["severity"] = "ERROR",
): QuoteConstraint {
  return {
    id: randomUUID(),
    kind: "MANDATORY_SERVICE",
    name: `Mandatory service: ${serviceNodeId}`,
    description: reason,
    severity,
    targetNodeId: serviceNodeId,
    params: { serviceNodeId },
    enabled: true,
  };
}

/** A BUNDLE node's required members must all be present. */
export function bundleEligibilityConstraint(
  bundleNodeId: string,
  requiredMemberIds: string[],
  severity: QuoteConstraint["severity"] = "WARNING",
): QuoteConstraint {
  return {
    id: randomUUID(),
    kind: "BUNDLE_ELIGIBILITY",
    name: `Bundle eligibility: ${bundleNodeId}`,
    severity,
    targetNodeId: bundleNodeId,
    params: { bundleNodeId, requiredMemberIds },
    enabled: true,
  };
}

/** A node's quantity must be within [min, max]. */
export function quantityBoundsConstraint(
  targetNodeId: string,
  minQty?: number,
  maxQty?: number,
  severity: QuoteConstraint["severity"] = "ERROR",
): QuoteConstraint {
  return {
    id: randomUUID(),
    kind: "QUANTITY_BOUNDS",
    name: `Quantity bounds on ${targetNodeId}`,
    severity,
    targetNodeId,
    params: { targetNodeId, minQty, maxQty },
    enabled: true,
  };
}
