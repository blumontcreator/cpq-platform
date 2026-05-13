import type { WorkflowInstance } from "../../types/workflow.types";
import type { NotifyStakeholderParams, ActionResult } from "../../types/action.types";
import { workflowLogger } from "@/lib/observability/logger";

/**
 * Notification handler.
 *
 * Writes a structured notification record to stdout/log.
 * In production this would dispatch to email, Slack, webhook, or an
 * internal notification service. The interface is identical — swap the
 * delivery mechanism without changing callers.
 */
export async function handleNotifyStakeholder(
  params: NotifyStakeholderParams,
  instance: WorkflowInstance,
  actionId: string,
): Promise<ActionResult> {
  const notification = {
    role: params.role,
    message: params.message,
    urgency: params.urgency,
    actionRequired: params.actionRequired ?? false,
    quoteId: instance.quoteId,
    currentState: instance.currentState,
    timestamp: new Date().toISOString(),
  };

  workflowLogger.info("Stakeholder notification dispatched", {
    quoteId:  instance.quoteId,
    role:     params.role,
    urgency:  params.urgency,
    message:  params.message,
  });

  return {
    actionId,
    kind: "notify_stakeholder",
    success: true,
    output: notification,
    executedAt: new Date().toISOString(),
  };
}
