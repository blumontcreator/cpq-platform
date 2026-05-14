"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import { requireConsoleAuth } from "@/lib/auth/guards";
import { submitApprovalDecision, manualAdvance } from "@/modules/workflow";
import { withNotice } from "@/lib/ui/url-notice";

export async function submitApproval(quoteId: string, formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const operator = await requireConsoleAuth();
  const approvalId = formData.get("approvalId") as string;
  const decision = formData.get("decision") as "APPROVED" | "REJECTED";
  const note = formData.get("note") as string | undefined;

  if (!approvalId || !decision) {
    redirect(
      withNotice(
        `/quotes/${quoteId}/workflow`,
        "error",
        "Choose approve or reject before submitting.",
      ),
    );
  }

  await submitApprovalDecision(scoped.prisma, quoteId, {
    approvalRequestId: approvalId,
    decision,
    decidedBy: operator.email,
    note: note || undefined,
  });

  revalidatePath(`/quotes/${quoteId}/workflow`);
  revalidatePath("/approvals");
  redirect(
    withNotice(
      `/quotes/${quoteId}/workflow`,
      "success",
      "Decision saved. Continue with negotiation or record the outcome when the customer decides.",
    ),
  );
}

export async function advanceWorkflow(quoteId: string, formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const operator = await requireConsoleAuth();
  const note = (formData.get("note") as string) || "Manual advance from console";
  await manualAdvance(scoped.prisma, quoteId, operator.email, note);
  revalidatePath(`/quotes/${quoteId}/workflow`);
  redirect(
    withNotice(
      `/quotes/${quoteId}/workflow`,
      "success",
      "Workflow moved to the next step.",
    ),
  );
}
