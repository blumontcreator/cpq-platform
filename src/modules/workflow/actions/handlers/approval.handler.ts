import type { PrismaClient } from "@prisma/client";
import type { WorkflowInstance } from "../../types/workflow.types";
import type { RequireApprovalParams, ActionResult } from "../../types/action.types";

export async function handleRequireApproval(
  prisma: PrismaClient,
  params: RequireApprovalParams,
  instance: WorkflowInstance,
  actionId: string,
): Promise<ActionResult> {
  const expiresAt = params.expiresInHours
    ? new Date(Date.now() + params.expiresInHours * 3600000)
    : new Date(Date.now() + 48 * 3600000); // 48h default SLA

  const approval = await prisma.approvalRequest.create({
    data: {
      workflowId: instance.id,
      quoteId: instance.quoteId,
      stage: params.stage,
      kind: params.kind,
      requiredRole: params.requiredRole,
      status: "PENDING",
      expiresAt,
      context: {
        reason: params.reason,
        marginPct: instance.context.marginPct,
        revenueAmount: instance.context.revenueAmount,
        strategyKind: instance.context.strategyKind,
        customerId: instance.context.customerId,
      } as Parameters<typeof prisma.approvalRequest.create>[0]["data"]["context"],
    },
  });

  return {
    actionId,
    kind: "require_approval",
    success: true,
    output: { approvalRequestId: approval.id, stage: params.stage, requiredRole: params.requiredRole, expiresAt: expiresAt.toISOString() },
    executedAt: new Date().toISOString(),
  };
}
