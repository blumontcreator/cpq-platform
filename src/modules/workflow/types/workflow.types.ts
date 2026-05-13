/**
 * Workflow domain types.
 *
 * The workflow engine is a deterministic, event-driven state machine.
 * Each quote has exactly one WorkflowInstance that tracks its operational lifecycle.
 *
 * Design principles:
 *   - State transitions are PURE: same trigger + context → same result, always
 *   - History is IMMUTABLE: transitions are appended, never mutated
 *   - Explainability is MANDATORY: every transition records its reasoning
 *   - AI seams are EXPLICIT: WorkflowInsight and aiContextBlock are ready for LLM injection
 */

// ── Lifecycle states ───────────────────────────────────────────────────────

export const QUOTE_LIFECYCLE_STATES = [
  "DRAFT",
  "PRICING",
  "REVIEW",
  "APPROVAL",
  "NEGOTIATION",
  "WON",
  "PROCUREMENT",
  "LOGISTICS",
  "INSTALLATION",
  "COMPLETED",
  "SUPPORT",
  "STALLED",
  "CANCELLED",
] as const;

export type QuoteLifecycleState = (typeof QUOTE_LIFECYCLE_STATES)[number];

export const TERMINAL_STATES: QuoteLifecycleState[] = [
  "COMPLETED", "CANCELLED",
];

export const OPERATIONAL_STATES: QuoteLifecycleState[] = [
  "PROCUREMENT", "LOGISTICS", "INSTALLATION", "SUPPORT",
];

// ── Triggers ───────────────────────────────────────────────────────────────

export const TRIGGER_KINDS = [
  "COMMERCIAL_EVENT",      // quote_won, quote_lost, supplier_delay, etc.
  "EVALUATION_RESULT",     // QuoteEvaluation completed
  "CONSTRAINT_VIOLATION",  // ConstraintEngine flagged a violation
  "APPROVAL_DECISION",     // Approval approved, rejected, or escalated
  "MARGIN_ALERT",          // Margin fell below a configured threshold
  "SUPPLIER_SIGNAL",       // Supplier delay or reliability alert
  "MANUAL_ADVANCE",        // User/admin explicitly advances state
  "TIMEOUT",               // SLA or approval expiry
] as const;

export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export interface WorkflowTrigger {
  kind: TriggerKind;
  /** Specific sub-type, e.g. "quote_won" for COMMERCIAL_EVENT. */
  subKind?: string;
  payload?: Record<string, unknown>;
  initiatedBy?: string;
  occurredAt?: Date;
}

// ── Workflow context ───────────────────────────────────────────────────────

export interface WorkflowContext {
  quoteId: string;
  marginPct?: number;
  revenueAmount?: number;
  quotedDiscount?: number;
  customerId?: string;
  strategyKind?: string;
  channel?: string;
  /** Composite evaluation score from QuoteEvaluationEngine (0-1). */
  evaluationScore?: number;
  /** Constraint violations currently blocking advancement. */
  constraintViolationIds?: string[];
  /** Current pending approval stage (1-based). */
  pendingApprovalStage?: number;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED";
  /** Operational risk score from risk assessor (0-100). */
  operationalRiskScore?: number;
  /** Supplier ids involved in this quote. */
  supplierIds?: string[];
  /**
   * Populated by the orchestrator when merging instance state into context
   * so that state-machine guards in STALLED can read the previous state.
   */
  previousState?: QuoteLifecycleState;
  /** Populated by the orchestrator so escalation policies can filter by state. */
  currentState?: QuoteLifecycleState;
  /** Custom metadata — open-ended for future signals. */
  metadata?: Record<string, unknown>;
}

// ── Transition record (immutable audit entry) ─────────────────────────────

export interface WorkflowTransitionRecord {
  id: string;
  fromState: QuoteLifecycleState;
  toState: QuoteLifecycleState;
  trigger: TriggerKind;
  triggerSubKind?: string;
  /** Human-readable signals that caused this transition. */
  triggerSignals: string[];
  /** Identifiers of the rules that fired during this transition. */
  appliedRules: string[];
  /** Plain-English explanation of why this transition occurred. */
  reasoning: string;
  /** Actions that were scheduled as a result of this transition. */
  actionsTriggered: string[];
  initiatedBy?: string;
  timestamp: string;
}

// ── Workflow instance ──────────────────────────────────────────────────────

export interface WorkflowInstance {
  id: string;
  quoteId: string;
  currentState: QuoteLifecycleState;
  previousState?: QuoteLifecycleState;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "STALLED";
  context: WorkflowContext;
  history: WorkflowTransitionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

// ── State machine result ───────────────────────────────────────────────────

export interface TransitionResult {
  success: boolean;
  newState?: QuoteLifecycleState;
  newStatus?: WorkflowInstance["status"];
  transitionRecord?: WorkflowTransitionRecord;
  actionsToExecute: import("./action.types").WorkflowAction[];
  blocked: boolean;
  blockReasons: string[];
  warnings: string[];
}

// ── AI-ready workflow insight ──────────────────────────────────────────────

export interface WorkflowInsight {
  /** Most likely next state based on current signals. */
  predictedNextState?: QuoteLifecycleState;
  predictedNextStateProbability?: number;
  suggestedActions: string[];
  operationalRiskScore: number;
  confidence: number;
  reasoning: string;
  /** Structured context block for LLM injection. */
  aiContextBlock: string;
}
