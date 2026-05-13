/**
 * Action registry and dispatcher.
 *
 * Maps ActionKind → handler function.
 * Actions are executed in priority order: CRITICAL > HIGH > NORMAL > LOW.
 */
import type { PrismaClient } from "@prisma/client";
import type { WorkflowAction, ActionResult, ActionExecutionReport } from "../types/action.types";
import type { WorkflowInstance } from "../types/workflow.types";
import { handleRequireApproval } from "./handlers/approval.handler";
import { handleNotifyStakeholder } from "./handlers/notify.handler";
import { handleTriggerRepricing } from "./handlers/reprice.handler";
import { handleEscalateIssue } from "./handlers/escalate.handler";
import { handleCreateProcurementTask, handleCreateInstallationTask } from "./handlers/task.handler";
import type {
  RequireApprovalParams,
  NotifyStakeholderParams,
  TriggerRepricingParams,
  EscalateIssueParams,
  CreateProcurementTaskParams,
  CreateInstallationTaskParams,
} from "../types/action.types";

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export async function executeActions(
  prisma: PrismaClient,
  actions: WorkflowAction[],
  instance: WorkflowInstance,
): Promise<ActionExecutionReport> {
  const sorted = [...actions].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );

  const results: ActionResult[] = [];

  for (const action of sorted) {
    try {
      const result = await dispatchAction(prisma, action, instance);
      results.push(result);
    } catch (err) {
      results.push({
        actionId: action.id,
        kind: action.kind,
        success: false,
        error: (err as Error).message,
        executedAt: new Date().toISOString(),
      });
    }
  }

  return {
    totalActions: actions.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

async function dispatchAction(
  prisma: PrismaClient,
  action: WorkflowAction,
  instance: WorkflowInstance,
): Promise<ActionResult> {
  switch (action.kind) {
    case "require_approval":
      return handleRequireApproval(prisma, action.params as RequireApprovalParams, instance, action.id);

    case "notify_stakeholder":
      return handleNotifyStakeholder(action.params as NotifyStakeholderParams, instance, action.id);

    case "trigger_repricing":
      return handleTriggerRepricing(action.params as TriggerRepricingParams, instance, action.id);

    case "escalate_issue":
      return handleEscalateIssue(action.params as EscalateIssueParams, instance, action.id);

    case "create_procurement_task":
      return handleCreateProcurementTask(action.params as CreateProcurementTaskParams, instance, action.id);

    case "create_installation_task":
      return handleCreateInstallationTask(action.params as CreateInstallationTaskParams, instance, action.id);

    case "suggest_alternatives":
      return {
        actionId: action.id,
        kind: action.kind,
        success: true,
        output: { note: "Alternative suggestions logged", reason: (action.params as { reason: string }).reason },
        executedAt: new Date().toISOString(),
      };

    case "split_workflow":
      return {
        actionId: action.id,
        kind: action.kind,
        success: true,
        output: { note: "Split workflow registered", childKind: (action.params as { childWorkflowKind: string }).childWorkflowKind },
        executedAt: new Date().toISOString(),
      };
  }
}
