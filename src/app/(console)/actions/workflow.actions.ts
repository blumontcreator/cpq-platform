"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { submitApprovalDecision, manualAdvance } from "@/modules/workflow";

export async function submitApproval(quoteId: string, formData: FormData): Promise<void> {
  const approvalId = formData.get("approvalId") as string;
  const decision = formData.get("decision") as "APPROVED" | "REJECTED";
  const note = formData.get("note") as string | undefined;
  const decidedBy = "operator@cpq.internal";

  if (!approvalId || !decision) return;

  await submitApprovalDecision(prisma, quoteId, {
    approvalRequestId: approvalId,
    decision,
    decidedBy,
    note: note || undefined,
  });

  revalidatePath(`/quotes/${quoteId}/workflow`);
}

export async function advanceWorkflow(quoteId: string, formData: FormData): Promise<void> {
  const note = (formData.get("note") as string) || "Manual advance from console";
  await manualAdvance(prisma, quoteId, "operator@cpq.internal", note);
  revalidatePath(`/quotes/${quoteId}/workflow`);
}
