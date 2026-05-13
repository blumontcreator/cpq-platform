/**
 * Quote lifecycle state machine definition.
 *
 * This is the declarative specification of the full commercial state machine.
 * It is PURELY DATA — no I/O, no DB, no side effects.
 *
 * Structure:
 *   STATE_DEFINITIONS   — description + allowed outbound transitions
 *   Each transition has:
 *     target      — the destination state
 *     triggers    — which TriggerKind(s) can fire this edge
 *     guard       — pure predicate that must return true for the transition to proceed
 *     actions     — ActionKind[] that fire when crossing this edge
 *     reasoning   — template string explaining why this transition makes sense
 *
 * State flow:
 *
 *   DRAFT
 *     ↓ (manual / quote_created)
 *   PRICING
 *     ↓ (evaluation completed)
 *   REVIEW ←──────────────────── APPROVAL (rejected)
 *     ↓           ↓               ↘
 *   APPROVAL  NEGOTIATION    WON (direct win from REVIEW)
 *     ↓           ↓
 *   NEGOTIATION  WON
 *     ↓
 *   WON
 *     ↓ (auto-advance)
 *   PROCUREMENT
 *     ↓
 *   LOGISTICS
 *     ↓
 *   INSTALLATION
 *     ↓
 *   COMPLETED
 *     ↓ (support request)
 *   SUPPORT
 *
 *   Any state → STALLED  (supplier_delay or operational risk CRITICAL)
 *   Any state → CANCELLED (quote_expired or quote_lost or manual)
 */
import type { QuoteLifecycleState, TriggerKind, WorkflowContext } from "../types/workflow.types";
import type { ActionKind } from "../types/action.types";

// ── Transition definition ──────────────────────────────────────────────────

export interface TransitionDef {
  target: QuoteLifecycleState;
  triggers: TriggerKind[];
  guard: (ctx: WorkflowContext) => boolean;
  actions: ActionKind[];
  reasoning: string;
}

// ── State definition ───────────────────────────────────────────────────────

export interface StateDef {
  description: string;
  /** Actions that fire automatically upon entering this state. */
  entryActions: ActionKind[];
  transitions: TransitionDef[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const always = () => true;
const hasMarginBelow = (threshold: number) => (ctx: WorkflowContext) =>
  ctx.marginPct != null && ctx.marginPct < threshold;
const hasNoConstraintViolations = (ctx: WorkflowContext) =>
  !ctx.constraintViolationIds?.length;
const approvalApproved = (ctx: WorkflowContext) =>
  ctx.approvalStatus === "APPROVED";
const approvalRejected = (ctx: WorkflowContext) =>
  ctx.approvalStatus === "REJECTED";

// ── State machine definition ───────────────────────────────────────────────

export const STATE_DEFINITIONS: Record<QuoteLifecycleState, StateDef> = {

  DRAFT: {
    description: "Quote is being built. Graph is incomplete or not yet priced.",
    entryActions: [],
    transitions: [
      {
        target: "PRICING",
        triggers: ["MANUAL_ADVANCE", "COMMERCIAL_EVENT"],
        guard: always,
        actions: ["notify_stakeholder"],
        reasoning: "Quote is ready for pricing — advancing to PRICING state.",
      },
      {
        target: "CANCELLED",
        triggers: ["COMMERCIAL_EVENT", "MANUAL_ADVANCE"],
        guard: (ctx) => ctx.metadata?.["reason"] === "quote_lost" || ctx.metadata?.["reason"] === "quote_expired",
        actions: ["notify_stakeholder"],
        reasoning: "Quote was lost or expired before pricing began.",
      },
    ],
  },

  PRICING: {
    description: "Pricing engine is computing layered costs, margins, and strategies.",
    entryActions: ["trigger_repricing"],
    transitions: [
      {
        target: "REVIEW",
        triggers: ["EVALUATION_RESULT", "MANUAL_ADVANCE"],
        guard: hasNoConstraintViolations,
        actions: ["notify_stakeholder"],
        reasoning: "Pricing complete and no structural violations — ready for commercial review.",
      },
      {
        target: "STALLED",
        triggers: ["CONSTRAINT_VIOLATION"],
        guard: always,
        actions: ["notify_stakeholder", "suggest_alternatives"],
        reasoning: "Critical constraint violations prevent pricing from completing — quote stalled.",
      },
      {
        target: "CANCELLED",
        triggers: ["COMMERCIAL_EVENT", "MANUAL_ADVANCE"],
        guard: (ctx) => !!ctx.metadata?.["cancelled"],
        actions: ["notify_stakeholder"],
        reasoning: "Quote was cancelled during pricing.",
      },
    ],
  },

  REVIEW: {
    description: "Commercial review — evaluating profitability, risk, and readiness to send.",
    entryActions: ["notify_stakeholder"],
    transitions: [
      {
        target: "APPROVAL",
        triggers: ["EVALUATION_RESULT", "MARGIN_ALERT"],
        guard: hasMarginBelow(25),
        actions: ["require_approval", "notify_stakeholder"],
        reasoning: "Margin below 25% threshold — approval required before sending to customer.",
      },
      {
        target: "NEGOTIATION",
        triggers: ["COMMERCIAL_EVENT"],
        guard: (ctx) => ctx.metadata?.["eventKind"] === "quote_negotiated",
        actions: ["notify_stakeholder"],
        reasoning: "Customer has initiated negotiation — transitioning to active negotiation.",
      },
      {
        target: "WON",
        triggers: ["COMMERCIAL_EVENT"],
        guard: (ctx) => ctx.metadata?.["eventKind"] === "quote_won",
        actions: ["notify_stakeholder", "create_procurement_task"],
        reasoning: "Quote accepted directly from review — advancing to WON.",
      },
      {
        target: "CANCELLED",
        triggers: ["COMMERCIAL_EVENT"],
        guard: (ctx) =>
          ctx.metadata?.["eventKind"] === "quote_lost" ||
          ctx.metadata?.["eventKind"] === "quote_expired",
        actions: ["notify_stakeholder"],
        reasoning: "Quote lost or expired during review.",
      },
    ],
  },

  APPROVAL: {
    description: "Awaiting one or more manager approvals before the quote can be sent.",
    entryActions: [],
    transitions: [
      {
        target: "NEGOTIATION",
        triggers: ["APPROVAL_DECISION"],
        guard: (ctx) => approvalApproved(ctx) && ctx.pendingApprovalStage == null,
        actions: ["notify_stakeholder"],
        reasoning: "All approval stages cleared — advancing to negotiation.",
      },
      {
        target: "REVIEW",
        triggers: ["APPROVAL_DECISION"],
        guard: approvalRejected,
        actions: ["notify_stakeholder", "trigger_repricing"],
        reasoning: "Approval rejected — returning to review for repricing or scope changes.",
      },
      {
        target: "STALLED",
        triggers: ["TIMEOUT"],
        guard: always,
        actions: ["escalate_issue", "notify_stakeholder"],
        reasoning: "Approval SLA expired without a decision — escalating and stalling.",
      },
    ],
  },

  NEGOTIATION: {
    description: "Active commercial negotiation with the customer.",
    entryActions: ["notify_stakeholder"],
    transitions: [
      {
        target: "APPROVAL",
        triggers: ["COMMERCIAL_EVENT", "MARGIN_ALERT"],
        guard: (ctx) => hasMarginBelow(20)(ctx) && ctx.metadata?.["eventKind"] === "quote_negotiated",
        actions: ["require_approval", "notify_stakeholder"],
        reasoning: "Negotiated price dropped margin below 20% — re-approval required.",
      },
      {
        target: "WON",
        triggers: ["COMMERCIAL_EVENT"],
        guard: (ctx) => ctx.metadata?.["eventKind"] === "quote_won",
        actions: ["notify_stakeholder", "create_procurement_task"],
        reasoning: "Negotiation concluded successfully — quote WON.",
      },
      {
        target: "CANCELLED",
        triggers: ["COMMERCIAL_EVENT"],
        guard: (ctx) =>
          ctx.metadata?.["eventKind"] === "quote_lost" ||
          ctx.metadata?.["eventKind"] === "quote_expired",
        actions: ["notify_stakeholder"],
        reasoning: "Quote lost or expired during negotiation.",
      },
    ],
  },

  WON: {
    description: "Quote accepted. Transitioning to operational fulfillment.",
    entryActions: ["create_procurement_task", "notify_stakeholder"],
    transitions: [
      {
        target: "PROCUREMENT",
        triggers: ["MANUAL_ADVANCE", "COMMERCIAL_EVENT"],
        guard: always,
        actions: ["notify_stakeholder"],
        reasoning: "Advancing to procurement to fulfill the won order.",
      },
    ],
  },

  PROCUREMENT: {
    description: "Coordinating supplier orders and purchase confirmations.",
    entryActions: ["create_procurement_task"],
    transitions: [
      {
        target: "LOGISTICS",
        triggers: ["MANUAL_ADVANCE", "COMMERCIAL_EVENT"],
        guard: always,
        actions: ["notify_stakeholder"],
        reasoning: "Procurement confirmed — advancing to logistics.",
      },
      {
        target: "STALLED",
        triggers: ["SUPPLIER_SIGNAL"],
        guard: (ctx) => (ctx.operationalRiskScore ?? 0) >= 70,
        actions: ["escalate_issue", "notify_stakeholder"],
        reasoning: "Supplier risk is CRITICAL — procurement stalled pending resolution.",
      },
    ],
  },

  LOGISTICS: {
    description: "Goods in transit. Tracking delivery and freight coordination.",
    entryActions: ["notify_stakeholder"],
    transitions: [
      {
        target: "INSTALLATION",
        triggers: ["MANUAL_ADVANCE", "COMMERCIAL_EVENT"],
        guard: always,
        actions: ["create_installation_task", "notify_stakeholder"],
        reasoning: "Delivery confirmed — scheduling installation.",
      },
      {
        target: "STALLED",
        triggers: ["SUPPLIER_SIGNAL"],
        guard: (ctx) => (ctx.operationalRiskScore ?? 0) >= 80,
        actions: ["escalate_issue", "notify_stakeholder"],
        reasoning: "Severe logistics delay — workflow stalled for intervention.",
      },
    ],
  },

  INSTALLATION: {
    description: "On-site installation and commissioning in progress.",
    entryActions: ["create_installation_task", "notify_stakeholder"],
    transitions: [
      {
        target: "COMPLETED",
        triggers: ["MANUAL_ADVANCE", "COMMERCIAL_EVENT"],
        guard: always,
        actions: ["notify_stakeholder"],
        reasoning: "Installation and commissioning completed successfully.",
      },
      {
        target: "STALLED",
        triggers: ["COMMERCIAL_EVENT"],
        guard: (ctx) => ctx.metadata?.["eventKind"] === "installation_issue",
        actions: ["escalate_issue", "notify_stakeholder"],
        reasoning: "Installation issue detected — stalling for resolution.",
      },
    ],
  },

  COMPLETED: {
    description: "All commercial and operational steps successfully completed.",
    entryActions: ["notify_stakeholder"],
    transitions: [
      {
        target: "SUPPORT",
        triggers: ["COMMERCIAL_EVENT", "MANUAL_ADVANCE"],
        guard: always,
        actions: ["notify_stakeholder"],
        reasoning: "Post-installation support request received.",
      },
    ],
  },

  SUPPORT: {
    description: "Active support engagement following project completion.",
    entryActions: ["notify_stakeholder"],
    transitions: [],
  },

  STALLED: {
    description: "Workflow blocked pending manual intervention or issue resolution.",
    entryActions: ["escalate_issue", "notify_stakeholder"],
    transitions: [
      {
        target: "PROCUREMENT",
        triggers: ["MANUAL_ADVANCE"],
        guard: (ctx) => ctx.previousState === "PROCUREMENT" || ctx.previousState === "LOGISTICS",
        actions: ["notify_stakeholder"],
        reasoning: "Issue resolved — resuming from PROCUREMENT.",
      },
      {
        target: "REVIEW",
        triggers: ["MANUAL_ADVANCE"],
        guard: (ctx) => ctx.previousState === "REVIEW" || ctx.previousState === "PRICING",
        actions: ["notify_stakeholder"],
        reasoning: "Issue resolved — resuming from REVIEW.",
      },
      {
        target: "CANCELLED",
        triggers: ["MANUAL_ADVANCE", "COMMERCIAL_EVENT"],
        guard: always,
        actions: ["notify_stakeholder"],
        reasoning: "Stalled quote was cancelled.",
      },
    ],
  },

  CANCELLED: {
    description: "Quote was lost, expired, or manually cancelled. Terminal state.",
    entryActions: ["notify_stakeholder"],
    transitions: [],
  },
};

// ── Helper: get state definition ──────────────────────────────────────────

export function getStateDef(state: QuoteLifecycleState): StateDef {
  return STATE_DEFINITIONS[state];
}

export function isTerminalState(state: QuoteLifecycleState): boolean {
  return state === "COMPLETED" || state === "CANCELLED";
}

export function getEntryActions(state: QuoteLifecycleState): ActionKind[] {
  return STATE_DEFINITIONS[state].entryActions;
}
