"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import { requireConsoleAuth } from "@/lib/auth/guards";
import { createOpportunity, closeOpportunity } from "@/modules/opportunity";
import { executeCommercialLifecycle } from "@/modules/lifecycle";
import { eventBus } from "@/lib/events";
import { withNotice } from "@/lib/ui/url-notice";
import { rootLogger } from "@/lib/observability/logger";

const log = rootLogger.child("opportunity.actions");

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

  if (!customerName) {
    redirect(
      withNotice(
        "/opportunities",
        "error",
        "Customer name is required. Enter the account name and try again.",
      ),
    );
  }

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
  redirect(
    withNotice(
      "/opportunities",
      "success",
      "Opportunity added. Open it to build a priced quote from your catalog.",
    ),
  );
}

function parseLineItemsFromForm(formData: FormData): { sku: string; quantity: number }[] {
  const linesJson = (formData.get("linesJson") as string | null)?.trim();
  if (linesJson) {
    try {
      const parsed = JSON.parse(linesJson) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const out: { sku: string; quantity: number }[] = [];
        for (const row of parsed) {
          if (!row || typeof row !== "object") continue;
          const r = row as { sku?: unknown; quantity?: unknown };
          const sku = String(r.sku ?? "").trim();
          if (!sku) continue;
          const qty = Number(r.quantity);
          const quantity = Number.isFinite(qty)
            ? Math.max(1, Math.min(9999, Math.floor(qty)))
            : 1;
          out.push({ sku, quantity });
        }
        const trimmed = out.slice(0, 500);
        if (trimmed.length > 0) return trimmed;
      }
    } catch {
      /* fall through */
    }
  }
  const skusRaw =
    (formData.get("skus") as string)?.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) ?? [];
  return skusRaw.map((sku) => ({ sku, quantity: 1 }));
}

export async function executeLifecycleAction(formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const operator = await requireConsoleAuth();
  const opportunityId = formData.get("opportunityId") as string;
  const items = parseLineItemsFromForm(formData);

  if (!opportunityId) {
    redirect(
      withNotice(
        "/opportunities",
        "error",
        "This form expired or the opportunity is missing. Go back to opportunities and try again.",
      ),
    );
  }
  if (items.length === 0) {
    redirect(
      withNotice(
        `/opportunities/${opportunityId}`,
        "error",
        "Add at least one product from the catalog, or paste SKUs in the advanced field, before creating the quote.",
      ),
    );
  }

  try {
    const result = await executeCommercialLifecycle({
      opportunityId,
      items,
      operatorUserId: operator.userId,
      organizationId: scoped.organizationId,
    });

    revalidatePath(`/opportunities/${opportunityId}`);
    revalidatePath("/quotes");
    redirect(
      withNotice(
        `/quotes/${result.quoteId}`,
        "success",
        "Quote created and priced. Review totals, then resolve any open approvals before sending to the customer.",
      ),
    );
  } catch (e) {
    log.error("executeCommercialLifecycle failed", e, { opportunityId });
    const msg =
      e instanceof Error
        ? e.message
        : "Pricing could not complete. Confirm SKUs exist in the catalog and try again.";
    redirect(withNotice(`/opportunities/${opportunityId}`, "error", msg));
  }
}

export async function closeOpportunityAction(formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const id      = formData.get("opportunityId") as string;
  const outcome = formData.get("outcome") as "WON" | "LOST" | "ABANDONED";
  if (!id || !outcome) {
    redirect(
      withNotice(
        id ? `/opportunities/${id}` : "/opportunities",
        "error",
        "Pick an outcome (won, lost, or abandoned) before closing.",
      ),
    );
  }
  await closeOpportunity(scoped.prisma, id, outcome);
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/opportunities");
  redirect(
    withNotice(
      `/opportunities/${id}`,
      "success",
      "Opportunity status updated.",
    ),
  );
}
