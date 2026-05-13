/**
 * Constraint types.
 *
 * Constraints are declarative rules that must hold for a quote to be valid.
 * They are evaluated against the fully-built QuoteGraph and produce
 * ConstraintViolations when they fail.
 */

export type ConstraintKind =
  | "REQUIRED_DEPENDENCY"       // a REQUIRES target is missing from the graph
  | "INCOMPATIBLE_COMBINATION"  // two EXCLUDES nodes are both present
  | "MINIMUM_MARGIN"            // node or graph margin is below threshold
  | "MANDATORY_SERVICE"         // a required service is absent
  | "BUNDLE_ELIGIBILITY"        // BUNDLE node's required members are absent
  | "QUANTITY_BOUNDS";          // node quantity violates min/max

export type ConstraintSeverity = "ERROR" | "WARNING" | "INFO";

export interface QuoteConstraint {
  id: string;
  kind: ConstraintKind;
  name: string;
  description?: string;
  severity: ConstraintSeverity;
  /** Specific node id this constraint targets (undefined = graph-level). */
  targetNodeId?: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export interface ConstraintViolation {
  constraintId: string;
  constraintName: string;
  kind: ConstraintKind;
  severity: ConstraintSeverity;
  /** Node(s) involved. */
  involvedNodeIds: string[];
  message: string;
  /** Suggested fix for explainability / LLM prompts. */
  suggestedFix?: string;
}
