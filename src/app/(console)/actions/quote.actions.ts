"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import type { Prisma } from "@prisma/client";
import type { QuoteGraph, QuoteNode } from "@/modules/quoting/types/graph.types";
import { withNotice } from "@/lib/ui/url-notice";

export async function createQuote(formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const reference = (formData.get("reference") as string)?.trim();
  const currency = (formData.get("currency") as string) || "USD";
  if (!reference) {
    redirect(
      withNotice(
        "/quotes",
        "error",
        "Enter a quote reference (your quote number or name).",
      ),
    );
  }

  const q = await scoped.quotes.create({ data: { reference, currency } });
  revalidatePath("/quotes");
  redirect(
    withNotice(
      `/quotes/${q.id}`,
      "success",
      "Quote created. Add catalog lines on this screen, then run pricing.",
    ),
  );
}

export async function addVariantToGraph(quoteId: string, formData: FormData): Promise<void> {
  const scoped = await requireScopedPrisma();
  const sku = (formData.get("sku") as string)?.trim();
  const qty = parseFloat(formData.get("quantity") as string) || 1;
  if (!sku) {
    redirect(
      withNotice(
        `/quotes/${quoteId}`,
        "error",
        "Enter a catalog SKU to add a line.",
      ),
    );
  }

  const variant = await scoped.productVariants.findUnique({
    where: { sku },
    include: {
      prices: { where: { priceType: "LIST" }, orderBy: { createdAt: "desc" }, take: 1 },
      calculations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!variant) {
    redirect(
      withNotice(
        `/quotes/${quoteId}`,
        "error",
        `No catalog match for “${sku}”. Check spelling, or add the product under Imports first.`,
      ),
    );
  }

  const latestCalc = variant.calculations[0];
  const listPrice = variant.prices[0];

  const unitCost = latestCalc
    ? (latestCalc.result as Record<string, unknown>)["totalCostUSD"] as number || 0
    : Number(listPrice?.amount ?? 0) * 0.6;

  const unitPrice = latestCalc
    ? (latestCalc.result as Record<string, unknown>)["finalUnitPrice"] as number || 0
    : Number(listPrice?.amount ?? 0);

  const quote = await scoped.quotes.findUnique({ where: { id: quoteId } });
  if (!quote) {
    redirect(withNotice("/quotes", "error", "That quote no longer exists."));
  }

  const existingGraph = (quote.graph as unknown as QuoteGraph) ?? null;
  const newNode: QuoteNode = {
    id: randomUUID(),
    kind: "PRODUCT_VARIANT",
    label: variant.label ?? sku,
    variantSku: sku,
    quantity: qty,
    unitCost: unitCost,
    unitPrice: unitPrice,
    currency: quote.currency,
    isRequired: false,
    isOptional: false,
    isMandatoryService: false,
  };

  const newGraph: QuoteGraph = existingGraph
    ? { ...existingGraph, nodes: [...existingGraph.nodes, newNode] }
    : {
        id: randomUUID(),
        quoteId,
        nodes: [newNode],
        edges: [],
        context: { currency: quote.currency, channel: "DIRECT" as const, pricingDate: new Date() },
      };

  await scoped.quotes.update({
    where: { id: quoteId },
    data: { graph: newGraph as unknown as Prisma.InputJsonValue },
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(
    withNotice(
      `/quotes/${quoteId}`,
      "success",
      "Line added. Run pricing to refresh margin and totals.",
    ),
  );
}

export async function runQuoteEvaluation(quoteId: string): Promise<void> {
  const scoped = await requireScopedPrisma();
  const quote = await scoped.quotes.findUnique({ where: { id: quoteId } });
  if (!quote?.graph) {
    redirect(
      withNotice(
        `/quotes/${quoteId}`,
        "error",
        "Add at least one catalog line before running pricing.",
      ),
    );
  }

  const { runQuoteEngine } = await import("@/modules/quoting");
  await runQuoteEngine({
    graph: quote.graph as unknown as QuoteGraph,
    persist: true,
    prisma: scoped.prisma,
  });

  revalidatePath(`/quotes/${quoteId}`);
  redirect(
    withNotice(
      `/quotes/${quoteId}`,
      "success",
      "Pricing updated. Open Workflow if this quote needs approval, or Negotiation when you are talking to the customer.",
    ),
  );
}
