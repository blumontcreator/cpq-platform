/**
 * Pure state transition engine.
 *
 * Takes the current WorkflowInstance, a trigger, and context,
 * and returns a TransitionResult with the new state and actions to execute.
 *
 * PURE — no I/O, no randomness, no side effects.
 * The orchestrator is responsible for persisting results and executing actions.
 */
import { randomUUID } from "node:crypto";
import {
  STATE_DEFINITIONS,
  isTerminalState,
  getEntryActions,
} from "../states/quote-lifecycle";
import type {
  WorkflowInstance,
  WorkflowTrigger,
  QuoteLifecycleState,
  WorkflowContext,
  TransitionResult,
  WorkflowTransitionRecord,
} from "../types/workflow.types";
import type { WorkflowAction } from "../types/action.types";

function buildAction(kind: import("../types/action.types").ActionKind, reason: string, params?: Record<string, unknown>): WorkflowAction {
  return {
    id: randomUUID(),
    kind,
    params: { reason, ...params } as WorkflowAction["params"],
    reason,
    priority: kind === "escalate_issue" ? "HIGH" : kind === "require_approval" ? "HIGH" : "NORMAL",
  };
}

export function transition(
  instance: WorkflowInstance,
  trigger: WorkflowTrigger,
  contextUpdate?: Partial<WorkflowContext>,
): TransitionResult {
  const mergedContext: WorkflowContext = {
    ...instance.context,
    ...contextUpdate,
    metadata: {
      ...instance.context.metadata,
      ...contextUpdate?.metadata,
    },
  };

  // Terminal states have no outbound transitions
  if (isTerminalState(instance.currentState)) {
    return {
      success: false,
      blocked: true,
      blockReasons: [`State ${instance.currentState} is terminal — no transitions allowed`],
      actionsToExecute: [],
      warnings: [],
    };
  }

  const stateDef = STATE_DEFINITIONS[instance.currentState];
  const warnings: string[] = [];

  // Find matching transition
  const matchingTransition = stateDef.transitions.find((t) => {
    if (!t.triggers.includes(trigger.kind)) return false;
    return t.guard(mergedContext);
  });

  if (!matchingTransition) {
    return {
      success: false,
      blocked: true,
      blockReasons: [
        `No valid transition from ${instance.currentState} for trigger ${trigger.kind}${trigger.subKind ? `/${trigger.subKind}` : ""}`,
        `Context: margin=${mergedContext.marginPct}, approvalStatus=${mergedContext.approvalStatus}`,
      ],
      actionsToExecute: [],
      warnings,
    };
  }

  // Build transition actions from the transition edge + target state entry actions
  const transitionActions: WorkflowAction[] = matchingTransition.actions.map((kind) =>
    buildAction(kind, matchingTransition.reasoning),
  );

  const entryActions: WorkflowAction[] = getEntryActions(matchingTransition.target)
    .filter((kind) => !matchingTransition.actions.includes(kind)) // deduplicate
    .map((kind) => buildAction(kind, `Entering ${matchingTransition.target} state`));

  const allActions = [...transitionActions, ...entryActions];

  // Build the transition record
  const record: WorkflowTransitionRecord = {
    id: randomUUID(),
    fromState: instance.currentState,
    toState: matchingTransition.target,
    trigger: trigger.kind,
    triggerSubKind: trigger.subKind,
    triggerSignals: buildTriggerSignals(trigger, mergedContext),
    appliedRules: [`state:${instance.currentState}→${matchingTransition.target}`],
    reasoning: matchingTransition.reasoning,
    actionsTriggered: allActions.map((a) => a.kind),
    initiatedBy: trigger.initiatedBy,
    timestamp: (trigger.occurredAt ?? new Date()).toISOString(),
  };

  const newStatus = resolveStatus(matchingTransition.target);

  return {
    success: true,
    newState: matchingTransition.target,
    newStatus,
    transitionRecord: record,
    actionsToExecute: allActions,
    blocked: false,
    blockReasons: [],
    warnings,
  };
}

function resolveStatus(newState: QuoteLifecycleState): WorkflowInstance["status"] {
  if (newState === "COMPLETED") return "COMPLETED";
  if (newState === "CANCELLED") return "CANCELLED";
  if (newState === "STALLED") return "STALLED";
  return "ACTIVE";
}

function buildTriggerSignals(
  trigger: WorkflowTrigger,
  ctx: WorkflowContext,
): string[] {
  const signals: string[] = [];
  if (trigger.subKind) signals.push(`event:${trigger.subKind}`);
  if (ctx.marginPct != null) signals.push(`margin:${ctx.marginPct.toFixed(1)}%`);
  if (ctx.operationalRiskScore != null) signals.push(`risk:${ctx.operationalRiskScore}`);
  if (ctx.approvalStatus) signals.push(`approval:${ctx.approvalStatus}`);
  if (ctx.constraintViolationIds?.length) {
    signals.push(`violations:${ctx.constraintViolationIds.length}`);
  }
  return signals;
}

// ── Validate guard-only (without transitioning) ───────────────────────────

export function canTransition(
  instance: WorkflowInstance,
  trigger: WorkflowTrigger,
  contextUpdate?: Partial<WorkflowContext>,
): { canTransition: boolean; targetState?: QuoteLifecycleState; reason: string } {
  const result = transition(instance, trigger, contextUpdate);
  return {
    canTransition: result.success,
    targetState: result.newState,
    reason: result.blocked ? result.blockReasons.join("; ") : `Can advance to ${result.newState}`,
  };
}
