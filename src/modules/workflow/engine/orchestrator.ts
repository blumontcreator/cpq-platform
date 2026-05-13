/**
 * Workflow orchestrator.
 *
 * The orchestrator is the single entry point for all workflow mutations.
 * It composes the pure state machine, action executor, and repository
 * to process a trigger end-to-end:
 *
 *   1. Load or create the WorkflowInstance
 *   2. Call the pure state machine to compute the TransitionResult
 *   3. Persist the updated instance (new state + appended history)
 *   4. Execute the scheduled actions
 *   5. Return the full OrchestratorResult for observability
 *
 * The orchestrator is NOT pure — it has I/O, DB access, and action execution.
 * The state machine remains pure so it can be unit tested without mocks.
 */
import type { PrismaClient } from "@prisma/client";
import { transition } from "./state-machine";
import { executeActions } from "../actions/action-registry";
import { saveWorkflowInstance, loadWorkflowInstance, createWorkflowInstance } from "../repository/workflow.repo";
import type {
  WorkflowInstance,
  WorkflowTrigger,
  WorkflowContext,
  TransitionResult,
} from "../types/workflow.types";
import type { ActionExecutionReport } from "../types/action.types";

export interface OrchestratorInput {
  quoteId: string;
  trigger: WorkflowTrigger;
  contextUpdate?: Partial<WorkflowContext>;
  /** If true, executes actions immediately. Default: true. */
  executeActionsNow?: boolean;
}

export interface OrchestratorResult {
  instance: WorkflowInstance;
  transitionResult: TransitionResult;
  actionReport?: ActionExecutionReport;
  warnings: string[];
}

export async function processWorkflowTrigger(
  prisma: PrismaClient,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const { quoteId, trigger, contextUpdate, executeActionsNow = true } = input;
  const warnings: string[] = [];

  // 1. Load or auto-create workflow instance
  let instance = await loadWorkflowInstance(prisma, quoteId);
  if (!instance) {
    instance = await createWorkflowInstance(prisma, quoteId, contextUpdate ?? { quoteId });
  }

  // 2. Compute transition (pure) — inject instance state into context so guards can read it
  const stateContextUpdate: Partial<WorkflowContext> = {
    ...contextUpdate,
    previousState: instance.previousState,
    currentState: instance.currentState,
    metadata: { ...instance.context.metadata, ...contextUpdate?.metadata },
  };
  const transitionResult = transition(instance, trigger, stateContextUpdate);

  if (!transitionResult.success || !transitionResult.newState) {
    warnings.push(...(transitionResult.warnings ?? []));
    return { instance, transitionResult, warnings: [...warnings, ...transitionResult.blockReasons] };
  }

  // 3. Persist updated instance
  const newHistory = [...instance.history, transitionResult.transitionRecord!];
  const updatedInstance: WorkflowInstance = {
    ...instance,
    previousState: instance.currentState,
    currentState: transitionResult.newState,
    status: transitionResult.newStatus ?? instance.status,
    context: {
      ...instance.context,
      ...contextUpdate,
      previousState: instance.currentState,
      currentState: transitionResult.newState,
      metadata: {
        ...instance.context.metadata,
        ...contextUpdate?.metadata,
      },
    },
    history: newHistory,
    updatedAt: new Date(),
  };

  await saveWorkflowInstance(prisma, updatedInstance);

  // 4. Execute actions
  let actionReport: ActionExecutionReport | undefined;
  if (executeActionsNow && transitionResult.actionsToExecute.length > 0) {
    actionReport = await executeActions(
      prisma,
      transitionResult.actionsToExecute,
      updatedInstance,
    );
    if (actionReport.failed > 0) {
      warnings.push(`${actionReport.failed} action(s) failed during execution`);
    }
  }

  return {
    instance: updatedInstance,
    transitionResult,
    actionReport,
    warnings,
  };
}

// ── Create a new workflow for a quote ────────────────────────────────────

export async function initWorkflow(
  prisma: PrismaClient,
  quoteId: string,
  context: WorkflowContext,
): Promise<WorkflowInstance> {
  const existing = await loadWorkflowInstance(prisma, quoteId);
  if (existing) return existing;
  return createWorkflowInstance(prisma, quoteId, context);
}
