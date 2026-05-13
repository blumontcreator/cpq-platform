/**
 * Constraint engine.
 *
 * Evaluates all QuoteConstraints against a QuoteGraph and produces
 * a list of ConstraintViolations.
 *
 * Design:
 *   - Pure function — no side effects, no DB calls
 *   - Each constraint kind is evaluated by a dedicated checker function
 *   - Disabled constraints are skipped
 *   - Each violation carries a suggestedFix for explainability / LLM
 */
import type { QuoteGraph } from "../types/graph.types";
import type { QuoteConstraint, ConstraintViolation } from "../types/constraint.types";
import type { QuoteEvaluation } from "../types/evaluation.types";

export function evaluateConstraints(
  graph: QuoteGraph,
  constraints: QuoteConstraint[],
  evaluation?: QuoteEvaluation,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const evalByNodeId = new Map(
    (evaluation?.nodeEvaluations ?? []).map((e) => [e.nodeId, e]),
  );

  for (const constraint of constraints) {
    if (!constraint.enabled) continue;

    switch (constraint.kind) {
      case "REQUIRED_DEPENDENCY": {
        const { requiredNodeId, requiringNodeId } = constraint.params as {
          requiredNodeId: string;
          requiringNodeId: string;
        };
        if (!nodeIds.has(requiredNodeId)) {
          violations.push({
            constraintId: constraint.id,
            constraintName: constraint.name,
            kind: constraint.kind,
            severity: constraint.severity,
            involvedNodeIds: [requiringNodeId],
            message: `Required node "${requiredNodeId}" is missing from the quote`,
            suggestedFix: `Add the required product/service (id: ${requiredNodeId}) to the quote`,
          });
        }
        break;
      }

      case "INCOMPATIBLE_COMBINATION": {
        const { nodeIdA, nodeIdB } = constraint.params as { nodeIdA: string; nodeIdB: string };
        if (nodeIds.has(nodeIdA) && nodeIds.has(nodeIdB)) {
          const labelA = nodeById.get(nodeIdA)?.label ?? nodeIdA;
          const labelB = nodeById.get(nodeIdB)?.label ?? nodeIdB;
          violations.push({
            constraintId: constraint.id,
            constraintName: constraint.name,
            kind: constraint.kind,
            severity: constraint.severity,
            involvedNodeIds: [nodeIdA, nodeIdB],
            message: `"${labelA}" and "${labelB}" are incompatible — they cannot both appear on the same quote`,
            suggestedFix: `Remove one of "${labelA}" or "${labelB}"`,
          });
        }
        break;
      }

      case "MINIMUM_MARGIN": {
        const { minimumPct, targetNodeId } = constraint.params as {
          minimumPct: number;
          targetNodeId?: string;
        };

        if (targetNodeId) {
          const ne = evalByNodeId.get(targetNodeId);
          if (ne && ne.effectiveMarginPct < minimumPct) {
            violations.push({
              constraintId: constraint.id,
              constraintName: constraint.name,
              kind: constraint.kind,
              severity: constraint.severity,
              involvedNodeIds: [targetNodeId],
              message: `Node "${ne.label}" margin is ${ne.effectiveMarginPct.toFixed(1)}% — below the ${minimumPct}% floor`,
              suggestedFix: `Increase the unit price of "${ne.label}" or apply a cross-subsidy`,
            });
          }
        } else if (evaluation && evaluation.metrics.overallMarginPct < minimumPct) {
          violations.push({
            constraintId: constraint.id,
            constraintName: constraint.name,
            kind: constraint.kind,
            severity: constraint.severity,
            involvedNodeIds: [],
            message: `Overall quote margin is ${evaluation.metrics.overallMarginPct.toFixed(1)}% — below the ${minimumPct}% floor`,
            suggestedFix: `Review low-margin lines or increase prices to meet the ${minimumPct}% floor`,
          });
        }
        break;
      }

      case "MANDATORY_SERVICE": {
        const { serviceNodeId } = constraint.params as { serviceNodeId: string };
        if (!nodeIds.has(serviceNodeId)) {
          violations.push({
            constraintId: constraint.id,
            constraintName: constraint.name,
            kind: constraint.kind,
            severity: constraint.severity,
            involvedNodeIds: [],
            message: `Mandatory service node "${serviceNodeId}" is absent from the quote`,
            suggestedFix: `Add the mandatory service (id: ${serviceNodeId}) to the quote`,
          });
        }
        break;
      }

      case "BUNDLE_ELIGIBILITY": {
        const { bundleNodeId, requiredMemberIds } = constraint.params as {
          bundleNodeId: string;
          requiredMemberIds: string[];
        };
        if (nodeIds.has(bundleNodeId)) {
          const missing = requiredMemberIds.filter((id) => !nodeIds.has(id));
          if (missing.length) {
            violations.push({
              constraintId: constraint.id,
              constraintName: constraint.name,
              kind: constraint.kind,
              severity: constraint.severity,
              involvedNodeIds: [bundleNodeId, ...missing],
              message: `Bundle "${nodeById.get(bundleNodeId)?.label}" is missing required members: ${missing.join(", ")}`,
              suggestedFix: `Add missing bundle members (${missing.join(", ")}) or remove the bundle node`,
            });
          }
        }
        break;
      }

      case "QUANTITY_BOUNDS": {
        const { targetNodeId: qNodeId, minQty, maxQty } = constraint.params as {
          targetNodeId: string;
          minQty?: number;
          maxQty?: number;
        };
        const node = nodeById.get(qNodeId);
        if (!node) break;
        if (minQty != null && node.quantity < minQty) {
          violations.push({
            constraintId: constraint.id,
            constraintName: constraint.name,
            kind: constraint.kind,
            severity: constraint.severity,
            involvedNodeIds: [qNodeId],
            message: `"${node.label}" quantity ${node.quantity} is below minimum ${minQty}`,
            suggestedFix: `Increase quantity to at least ${minQty}`,
          });
        }
        if (maxQty != null && node.quantity > maxQty) {
          violations.push({
            constraintId: constraint.id,
            constraintName: constraint.name,
            kind: constraint.kind,
            severity: constraint.severity,
            involvedNodeIds: [qNodeId],
            message: `"${node.label}" quantity ${node.quantity} exceeds maximum ${maxQty}`,
            suggestedFix: `Reduce quantity to at most ${maxQty}`,
          });
        }
        break;
      }
    }
  }

  return violations;
}
