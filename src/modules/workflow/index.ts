// ── Public API ────────────────────────────────────────────────────────────────

export {
  initWorkflow,
  processEvent,
  processEvaluationResult,
  processSupplierDelay,
  manualAdvance,
  submitApprovalDecision,
  getWorkflowStatus,
  getApprovalHistory,
  evaluateApprovalRules,
  canTransition,
  assessOperationalRisk,
} from "./workflow-engine";
export type {
  OrchestratorResult,
  EvaluationTriggerInput,
  DecisionResult,
  OperationalRisk,
  WorkflowStatus,
} from "./workflow-engine";

// Trigger builders (for external callers who want to build triggers manually)
export {
  triggerFromCommercialEvent,
  triggerFromEvaluation,
  triggerFromApprovalDecision,
  triggerManualAdvance,
  triggerFromSupplierDelay,
} from "./engine/trigger-evaluator";

// Approval & escalation
export { DEFAULT_APPROVAL_RULES, marginApprovalRule, discountApprovalRule, strategicCustomerRule, highValueRule } from "./approval/approval-rules";
export { DEFAULT_ESCALATION_POLICIES, evaluateEscalationPolicies } from "./approval/escalation-engine";
export { getApprovalAuditTrail } from "./approval/approval-engine";

// Intelligence
export { buildWorkflowInsight } from "./intelligence/risk-assessor";

// Repository
export {
  loadWorkflowInstance,
  getWorkflowsByState,
  getWorkflowHistory,
  getApprovalsByQuote,
  getPendingApprovalsByRole,
  getExpiredApprovals,
} from "./repository";

// Types
export { QUOTE_LIFECYCLE_STATES, TRIGGER_KINDS, TERMINAL_STATES, OPERATIONAL_STATES, ACTION_KINDS } from "./types";
export type {
  QuoteLifecycleState,
  TriggerKind,
  WorkflowTrigger,
  WorkflowContext,
  WorkflowTransitionRecord,
  WorkflowInstance,
  TransitionResult,
  WorkflowInsight,
  ActionKind,
  WorkflowAction,
  ActionResult,
  ActionExecutionReport,
  ApprovalKind,
  ApprovalRule,
  ApprovalRequirement,
  ApprovalDecision,
  ApprovalStatus,
  EscalationPolicy,
  ApprovalEvaluationResult,
} from "./types";
