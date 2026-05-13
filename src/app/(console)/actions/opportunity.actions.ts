"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import { requireConsoleAuth } from "@/lib/auth/guards";
import { createOpportunity, closeOpportunity } from "@/modules/opportunity";
import { executeCommercialLifecycle } from "@/modules/lifecycle";
import { eventBus } from "@/lib/events";

// Attach event bus persistence once (server-side singleton)
eventBus.attachPersistence(prisma);

export async function createOpportunityAction(formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const operator = await requireConsoleAuth();
  const customerName    = (formData.get("customerName") as string)?.trim();
  const customerId      = (formData.get("customerId")   as string)?.trim() || `CUS-${Date.now()}`;
  const salesOwnerIdRaw = (formData.get("salesOwnerId") as string)?.trim();
  const salesOwnerId    = salesOwnerIdRaw || operator.userId;
  const channel         = (formData.get("channel")      as string) || "DIRECT";
  const targetMarginPct = parseFloat(formData.get("targetMarginPct") as string) / 100;
  const estimatedRevenue = formData.get("estimatedRevenue")
    ? parseFloat(formData.get("estimatedRevenue") as string)
    : undefined;
  const strategicPriority = (formData.get("strategicPriority") as string) || "STANDARD";
  const notes           = formData.get("notes") as string | undefined;

  if (!customerName) return;

  await createOpportunity(scoped.prisma, {
    customerName,
    customerId,
    salesOwnerId,
    channel,
    targetMarginPct: isNaN(targetMarginPct) ? 0.3 : targetMarginPct,
    estimatedRevenue,
    strategicPriority: strategicPriority as Parameters<typeof createOpportunity>[1]["strategicPriority"],
    notes: notes ?? undefined,
  });

  revalidatePath("/opportunities");
}

export async function executeLifecycleAction(formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const operator = await requireConsoleAuth();
  const opportunityId = formData.get("opportunityId") as string;
  const skusRaw       = (formData.get("skus") as string)?.split(",").map((s) => s.trim()).filter(Boolean);

  if (!opportunityId || !skusRaw?.length) return;

  await executeCommercialLifecycle({
    opportunityId,
    items: skusRaw.map((sku) => ({ sku, quantity: 1 })),
    operatorUserId: operator.userId,
    organizationId: scoped.organizationId,
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/quotes");
}

export async function closeOpportunityAction(formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const id      = formData.get("opportunityId") as string;
  const outcome = formData.get("outcome") as "WON" | "LOST" | "ABANDONED";
  if (!id || !outcome) return;
  await closeOpportunity(scoped.prisma, id, outcome);
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/opportunities");
}
