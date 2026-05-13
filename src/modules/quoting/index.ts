// ── Public API ────────────────────────────────────────────────────────────────

// Engine (main entry point)
export { runQuoteEngine } from "./quote-engine";
export type { RunQuoteEngineInput, RunQuoteEngineResult } from "./quote-engine";

// Graph building
export { GraphBuilder } from "./graph";
export { validateGraphStructure, criticalPathDays } from "./graph";
export type { GraphValidationError } from "./graph";

// Evaluation
export { evaluateGraph, EVALUATION_ENGINE_VERSION } from "./evaluation";

// Constraints
export { evaluateConstraints } from "./constraints";
export {
  requiredDependencyConstraint,
  incompatibleConstraint,
  minimumMarginConstraint,
  mandatoryServiceConstraint,
  bundleEligibilityConstraint,
  quantityBoundsConstraint,
} from "./constraints";

// Recommendations
export { generateRecommendations } from "./recommendations";

// Repository
export {
  saveQuoteGraph,
  loadQuoteGraph,
  createQuoteWithGraph,
  saveEvaluation,
  getEvaluationHistory,
  getLatestEvaluation,
  getEvaluationSummaries,
} from "./repository";
export type { QuoteEvaluationSummary } from "./repository";

// Types
export {
  QUOTE_NODE_KINDS,
  QUOTE_EDGE_KINDS,
} from "./types";
export type {
  QuoteNodeKind,
  QuoteEdgeKind,
  QuoteNode,
  QuoteEdge,
  QuoteGraph,
  QuoteGraphContext,
  QuoteEvaluation,
  GraphMetrics,
  NodeEvaluation,
  FreightGroup,
  EvaluationTrace,
  QuoteConstraint,
  ConstraintViolation,
  ConstraintKind,
  QuoteRecommendation,
  RecommendationKind,
  RecommendationPriority,
} from "./types";
