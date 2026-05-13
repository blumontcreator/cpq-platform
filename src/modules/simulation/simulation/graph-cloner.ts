/**
 * Graph cloner.
 *
 * Produces a deep, structurally independent clone of a QuoteGraph.
 * Mutations are always applied to clones so the baseline is never modified.
 *
 * Uses JSON round-trip for simplicity and correctness — the graph contains
 * no non-serializable values (all Dates are on QuoteGraphContext which the
 * quoting module handles as ISO strings when serialized).
 */
import type { QuoteGraph } from "../../quoting/types/graph.types";

export function cloneGraph(graph: QuoteGraph): QuoteGraph {
  return JSON.parse(JSON.stringify(graph)) as QuoteGraph;
}

/** Clone and assign a new id to distinguish the mutated copy. */
export function cloneGraphWithId(graph: QuoteGraph, newId: string): QuoteGraph {
  return { ...cloneGraph(graph), id: newId };
}
