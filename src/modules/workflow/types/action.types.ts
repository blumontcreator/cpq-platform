/**
 * Action types.
 *
 * A WorkflowAction is a pure descriptor of work to be done.
 * The ActionExecutor dispatches to handlers that perform the actual I/O.
 * This separates the pure state machine from side effects.
 */

export const ACTION_KINDS = [
  "require_approval",
  "notify_stakeholder",
  "trigger_repricing",
  "suggest_alternatives",
  "escalate_issue",
  "split_workflow",
  "create_procurement_task",
  "create_installation_task",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

// ── Action parameter types ─────────────────────────────────────────────────

export interface RequireApprovalParams {
  stage: number;
  kind: "MARGIN" | "DISCOUNT" | "STRATEGIC_CUSTOMER" | "HIGH_VALUE" | "OVERRIDE";
  requiredRole: string;
  reason: string;
  expiresInHours?: number;
}

export interface NotifyStakeholderParams {
  role: string;
  message: string;
  urgency: "INFO" | "WARNING" | "CRITICAL";
  actionRequired?: boolean;
}

export interface TriggerRepricingParams {
  strategyKind?: string;
  targetMarginPct?: number;
  reason: string;
}

export interface SuggestAlternativesParams {
  reason: string;
  alternativeTypes: string[];
}

export interface EscalateIssueParams {
  escalateTo: string;
  slaHours: number;
  reason: string;
  riskLevel: "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface SplitWorkflowParams {
  childWorkflowKind: string;
  reason: string;
}

export interface CreateProcurementTaskParams {
  supplierIds: string[];
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  notes?: string;
  requiredByDate?: string;
}

export interface CreateInstallationTaskParams {
  estimatedDays: number;
  complexity: "LOW" | "MEDIUM" | "HIGH";
  notes?: string;
  requiredByDate?: string;
}

export type ActionParams =
  | RequireApprovalParams
  | NotifyStakeholderParams
  | TriggerRepricingParams
  | SuggestAlternativesParams
  | EscalateIssueParams
  | SplitWorkflowParams
  | CreateProcurementTaskParams
  | CreateInstallationTaskParams;

// ── Action ─────────────────────────────────────────────────────────────────

export interface WorkflowAction {
  id: string;
  kind: ActionKind;
  params: ActionParams;
  /** Why this action was created. */
  reason: string;
  /** Priority for execution ordering. */
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
}

// ── Action result ──────────────────────────────────────────────────────────

export interface ActionResult {
  actionId: string;
  kind: ActionKind;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  executedAt: string;
}

export interface ActionExecutionReport {
  totalActions: number;
  succeeded: number;
  failed: number;
  results: ActionResult[];
}
