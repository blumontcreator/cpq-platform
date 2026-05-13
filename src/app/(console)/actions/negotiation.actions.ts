"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireConsoleAuth } from "@/lib/auth/guards";
import {
  recordNegotiationEvent,
  createRevision,
} from "@/modules/negotiation";
import { closeQuoteOutcome } from "@/modules/lifecycle";
import type { NegotiationEventKind } from "@/modules/negotiation/types";

export async function recordNegotiationEventAction(
  quoteId: string,
  formData: FormData,
): Promise<void> {
  const kind             = formData.get("kind") as NegotiationEventKind;
  const requestedValue   = formData.get("requestedValue")   ? parseFloat(formData.get("requestedValue") as string) : undefined;
  const requestedDiscount = formData.get("requestedDiscount") ? parseFloat(formData.get("requestedDiscount") as string) / 100 : undefined;
  const grantedValue     = formData.get("grantedValue")     ? parseFloat(formData.get("grantedValue") as string) : undefined;
  const grantedDiscount  = formData.get("grantedDiscount")  ? parseFloat(formData.get("grantedDiscount") as string) / 100 : undefined;
  const concessionNote   = formData.get("concessionNote") as string | undefined;
  const performedBy      = formData.get("performedBy") as string | undefined;

  if (!quoteId || !kind) return;

  await recordNegotiationEvent(prisma, {
    quoteId, kind, requestedValue, requestedDiscount,
    grantedValue, grantedDiscount,
    concessionNote: concessionNote || undefined,
    performedBy: performedBy || undefined,
  });

  revalidatePath(`/quotes/${quoteId}/negotiate`);
}

export async function createRevisionAction(
  quoteId: string,
  formData: FormData,
): Promise<void> {
  const reason    = (formData.get("reason") as string) || "INTERNAL_REVISION";
  const changeNote = formData.get("changeNote") as string | undefined;
  const changedBy  = formData.get("changedBy") as string | undefined;

  const quote = await prisma.quote.findUnique({
    where:  { id: quoteId },
    select: { graph: true },
  });
  if (!quote) return;

  await createRevision(prisma, {
    quoteId,
    reason: reason as Parameters<typeof createRevision>[1]["reason"],
    snapshot: quote.graph ?? {},
    changedBy: changedBy || undefined,
    changeNote: changeNote || undefined,
  });

  revalidatePath(`/quotes/${quoteId}/revisions`);
}

export async function closeOutcomeAction(
  quoteId: string,
  formData: FormData,
): Promise<void> {
  const operator = await requireConsoleAuth();
  const outcome         = formData.get("outcome") as "WON" | "LOST" | "EXPIRED" | "PARTIALLY_WON";
  const realizedRevenue = formData.get("realizedRevenue")   ? parseFloat(formData.get("realizedRevenue") as string) : undefined;
  const realizedMarginPct = formData.get("realizedMarginPct") ? parseFloat(formData.get("realizedMarginPct") as string) / 100 : undefined;
  const lossReason      = formData.get("lossReason") as string | undefined;
  const competitorPrice = formData.get("competitorPrice")   ? parseFloat(formData.get("competitorPrice") as string) : undefined;

  if (!quoteId || !outcome) return;

  await closeQuoteOutcome({
    quoteId, outcome, realizedRevenue, realizedMarginPct,
    lossReason: lossReason || undefined,
    competitorPrice,
    operatorUserId: operator.userId,
  });

  revalidatePath(`/quotes/${quoteId}/outcome`);
  revalidatePath(`/quotes/${quoteId}`);
}
