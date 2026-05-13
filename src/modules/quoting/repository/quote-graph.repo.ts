/**
 * Quote graph repository.
 *
 * Handles serialisation, persistence, and loading of QuoteGraph instances
 * against the Quote Prisma model's `graph Json?` field.
 *
 * Separation of concerns:
 *   - This file owns all DB interaction for the graph itself.
 *   - QuoteEvaluation persistence lives in quote-evaluation.repo.ts.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import type { QuoteGraph } from "../types/graph.types";

// ── Serialisation ─────────────────────────────────────────────────────────────

export function serializeGraph(graph: QuoteGraph): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(graph)) as Prisma.InputJsonValue;
}

export function deserializeGraph(raw: unknown): QuoteGraph {
  return raw as QuoteGraph;
}

// ── Persistence ───────────────────────────────────────────────────────────────

/** Saves (or replaces) the graph JSON on an existing Quote row. */
export async function saveQuoteGraph(
  prisma: PrismaClient,
  quoteId: string,
  graph: QuoteGraph,
): Promise<void> {
  await prisma.quote.update({
    where: { id: quoteId },
    data: { graph: serializeGraph({ ...graph, quoteId }) },
  });
}

/** Loads the graph from a Quote row. Returns null if no graph is stored. */
export async function loadQuoteGraph(
  prisma: PrismaClient,
  quoteId: string,
): Promise<QuoteGraph | null> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { graph: true },
  });
  if (!quote?.graph) return null;
  return deserializeGraph(quote.graph);
}

/** Creates a new Quote row and saves the graph in a single transaction. */
export async function createQuoteWithGraph(
  prisma: PrismaClient,
  params: {
    reference: string;
    currency?: string;
    notes?: string;
    validUntil?: Date;
    graph: QuoteGraph;
  },
): Promise<{ quoteId: string; graph: QuoteGraph }> {
  const quote = await prisma.quote.create({
    data: {
      reference: params.reference,
      currency: params.currency ?? params.graph.context.currency,
      notes: params.notes,
      validUntil: params.validUntil,
      graph: serializeGraph({ ...params.graph, quoteId: undefined }),
    },
  });

  const persistedGraph = { ...params.graph, quoteId: quote.id };
  await prisma.quote.update({
    where: { id: quote.id },
    data: { graph: serializeGraph(persistedGraph) },
  });

  return { quoteId: quote.id, graph: persistedGraph };
}
