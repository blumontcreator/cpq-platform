"use server";

import { revalidatePath } from "next/cache";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import { requireConsoleAuth } from "@/lib/auth/guards";
import { submitApprovalDecision, manualAdvance } from "@/modules/workflow";

export async function submitApproval(quoteId: string, formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const operator = await requireConsoleAuth();
  const approvalId = formData.get("approvalId") as string;
  const decision = formData.get("decision") as "APPROVED" | "REJECTED";
  const note = formData.get("note") as string | undefined;

  if (!approvalId || !decision) return;

  await submitApprovalDecision(scoped.prisma, quoteId, {
    approvalRequestId: approvalId,
    decision,
    decidedBy: operator.email,
    note: note || undefined,
  });

  revalidatePath(`/quotes/${quoteId}/workflow`);
}

export async function advanceWorkflow(quoteId: string, formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const operator = await requireConsoleAuth();
  const note = (formData.get("note") as string) || "Manual advance from console";
  await manualAdvance(scoped.prisma, quoteId, operator.email, note);
  revalidatePath(`/quotes/${quoteId}/workflow`);
}
