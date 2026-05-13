"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { QuoteGraph } from "@/modules/quoting/types/graph.types";

export async function runOptimizationAction(quoteId: string, formData: FormData): Promise<void> {
  const strategy = (formData.get("strategy") as string) || "BALANCED";
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote?.graph) return;

  const { runOptimization } = await import("@/modules/simulation");
  await runOptimization({
    graph: quote.graph as unknown as QuoteGraph,
    strategyKind: strategy as "BALANCED" | "AGGRESSIVE" | "PREMIUM" | "STRATEGIC",
    persist: true,
    prisma,
  });

  revalidatePath(`/quotes/${quoteId}/simulation`);
}
