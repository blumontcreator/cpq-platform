import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import type { WorkflowInstance, WorkflowContext, WorkflowTransitionRecord, QuoteLifecycleState } from "../types/workflow.types";

function toInstance(row: {
  id: string;
  quoteId: string;
  currentState: string;
  previousState: string | null;
  status: string;
  context: Prisma.JsonValue;
  history: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowInstance {
  return {
    id: row.id,
    quoteId: row.quoteId,
    currentState: row.currentState as QuoteLifecycleState,
    previousState: row.previousState as QuoteLifecycleState | undefined,
    status: row.status as WorkflowInstance["status"],
    context: row.context as unknown as WorkflowContext,
    history: (row.history as unknown as WorkflowTransitionRecord[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function loadWorkflowInstance(
  prisma: PrismaClient,
  quoteId: string,
): Promise<WorkflowInstance | null> {
  const row = await prisma.workflowInstance.findUnique({ where: { quoteId } });
  return row ? toInstance(row) : null;
}

export async function createWorkflowInstance(
  prisma: PrismaClient,
  quoteId: string,
  context: Partial<WorkflowContext>,
): Promise<WorkflowInstance> {
  const fullContext: WorkflowContext = { quoteId, ...context };
  const row = await prisma.workflowInstance.create({
    data: {
      id: randomUUID(),
      quoteId,
      currentState: "DRAFT",
      status: "ACTIVE",
      context: fullContext as unknown as Prisma.InputJsonValue,
      history: [] as unknown as Prisma.InputJsonValue,
    },
  });
  return toInstance(row);
}

export async function saveWorkflowInstance(
  prisma: PrismaClient,
  instance: WorkflowInstance,
): Promise<void> {
  await prisma.workflowInstance.update({
    where: { id: instance.id },
    data: {
      currentState: instance.currentState,
      previousState: instance.previousState,
      status: instance.status,
      context: instance.context as unknown as Prisma.InputJsonValue,
      history: instance.history as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getWorkflowsByState(
  prisma: PrismaClient,
  state: QuoteLifecycleState,
): Promise<WorkflowInstance[]> {
  const rows = await prisma.workflowInstance.findMany({
    where: { currentState: state, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toInstance);
}

export async function getWorkflowHistory(
  prisma: PrismaClient,
  quoteId: string,
): Promise<WorkflowTransitionRecord[]> {
  const row = await prisma.workflowInstance.findUnique({ where: { quoteId }, select: { history: true } });
  return (row?.history as unknown as WorkflowTransitionRecord[]) ?? [];
}
