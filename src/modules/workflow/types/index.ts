export { QUOTE_LIFECYCLE_STATES, TRIGGER_KINDS, TERMINAL_STATES, OPERATIONAL_STATES } from "./workflow.types";
export type {
  QuoteLifecycleState,
  TriggerKind,
  WorkflowTrigger,
  WorkflowContext,
  WorkflowTransitionRecord,
  WorkflowInstance,
  TransitionResult,
  WorkflowInsight,
} from "./workflow.types";

export { ACTION_KINDS } from "./action.types";
export type {
  ActionKind,
  ActionParams,
  RequireApprovalParams,
  NotifyStakeholderParams,
  TriggerRepricingParams,
  SuggestAlternativesParams,
  EscalateIssueParams,
  SplitWorkflowParams,
  CreateProcurementTaskParams,
  CreateInstallationTaskParams,
  WorkflowAction,
  ActionResult,
  ActionExecutionReport,
} from "./action.types";

export type {
  ApprovalKind,
  ApprovalRule,
  ApprovalRequirement,
  ApprovalDecision,
  ApprovalStatus,
  EscalationPolicy,
  ApprovalEvaluationResult,
} from "./approval.types";
