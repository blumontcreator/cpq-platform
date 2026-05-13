"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { QuoteGraph, QuoteNode } from "@/modules/quoting/types/graph.types";

export async function createQuote(formData: FormData): Promise<void> {
  const reference = (formData.get("reference") as string)?.trim();
  const currency = (formData.get("currency") as string) || "USD";
  if (!reference) return;

  await prisma.quote.create({ data: { reference, currency } });
  revalidatePath("/quotes");
}

export async function addVariantToGraph(quoteId: string, formData: FormData): Promise<void> {
  const sku = (formData.get("sku") as string)?.trim();
  const qty = parseFloat(formData.get("quantity") as string) || 1;
  if (!sku) return;

  const variant = await prisma.productVariant.findUnique({
    where: { sku },
    include: {
      prices: { where: { priceType: "LIST" }, orderBy: { createdAt: "desc" }, take: 1 },
      calculations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!variant) return;

  const latestCalc = variant.calculations[0];
  const listPrice = variant.prices[0];

  const unitCost = latestCalc
    ? (latestCalc.result as Record<string, unknown>)["totalCostUSD"] as number || 0
    : Number(listPrice?.amount ?? 0) * 0.6;

  const unitPrice = latestCalc
    ? (latestCalc.result as Record<string, unknown>)["finalUnitPrice"] as number || 0
    : Number(listPrice?.amount ?? 0);

  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) return;

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

  await prisma.quote.update({
    where: { id: quoteId },
    data: { graph: newGraph as unknown as Parameters<typeof prisma.quote.update>[0]["data"]["graph"] },
  });

  revalidatePath(`/quotes/${quoteId}`);
}

export async function runQuoteEvaluation(quoteId: string): Promise<void> {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote?.graph) return;

  const { runQuoteEngine } = await import("@/modules/quoting");
  await runQuoteEngine({
    graph: quote.graph as unknown as QuoteGraph,
    persist: true,
    prisma,
  });

  revalidatePath(`/quotes/${quoteId}`);
}
