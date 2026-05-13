/**
 * Quote graph core types.
 *
 * A QuoteGraph is a directed graph of QuoteNodes connected by QuoteEdges.
 * Nodes represent economic entities; edges represent relationships between them.
 *
 * The graph is the canonical representation of a quote. It is:
 *   - Serialisable to JSON (stored in Quote.graph)
 *   - Evaluatable by the EvaluationEngine
 *   - Constrainable by the ConstraintEngine
 *   - Improvable by the RecommendationEngine
 *   - AI-ready: structured for LLM prompt injection
 */
import type { PricingResult } from "../../pricing/types/pricing-result.types";
import type { ChannelKind } from "../../pricing/types/pricing-context.types";

// ── Node kinds ────────────────────────────────────────────────────────────────

export const QUOTE_NODE_KINDS = [
  "PRODUCT_VARIANT",
  "ACCESSORY",
  "SERVICE",
  "INSTALLATION",
  "WARRANTY",
  "FREIGHT",
  "BUNDLE",
  "DISCOUNT",
  "SURCHARGE",
] as const;

export type QuoteNodeKind = (typeof QUOTE_NODE_KINDS)[number];

// ── Edge kinds ────────────────────────────────────────────────────────────────

export const QUOTE_EDGE_KINDS = [
  "REQUIRES",             // fromNode requires toNode to be present
  "COMPATIBLE_WITH",      // informational: these work well together
  "EXCLUDES",             // fromNode and toNode cannot coexist
  "BUNDLED_WITH",         // both nodes form a commercial bundle
  "SUBSIDIZES",           // fromNode reduces price of toNode (weight = subsidy amount)
  "SHARES_INSTALLATION",  // both nodes share an installation event
  "SHARES_FREIGHT",       // both nodes can be freight-consolidated
] as const;

export type QuoteEdgeKind = (typeof QUOTE_EDGE_KINDS)[number];

// ── Node ─────────────────────────────────────────────────────────────────────

export interface QuoteNode {
  /** Unique within the graph. */
  id: string;
  kind: QuoteNodeKind;
  label: string;

  /** Links to ProductVariant.sku for PRODUCT_VARIANT / ACCESSORY nodes. */
  variantSku?: string;

  quantity: number;

  // ── Pricing ──────────────────────────────────────────────────────────────
  unitCost: number;
  unitPrice: number;
  currency: string;

  /** Full pricing engine result attached for tracing. */
  pricingResult?: PricingResult;

  // ── Operational signals ──────────────────────────────────────────────────
  leadTimeDays?: number;
  /** Estimated installation labour (hours per unit). */
  installationHours?: number;
  /** NMFC class or freight tier string. */
  freightClass?: string;
  /** Gross weight in kg per unit. */
  weightKg?: number;

  // ── Commercial flags ─────────────────────────────────────────────────────
  /** Cannot be removed from this quote. */
  isRequired: boolean;
  /** Shown as an option the customer may accept/reject. */
  isOptional: boolean;
  /** A mandatory service that must accompany a product. */
  isMandatoryService: boolean;

  /** Extracted product attributes (from AttributeEnvelope.extracted). */
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ── Edge ─────────────────────────────────────────────────────────────────────

export interface QuoteEdge {
  id: string;
  kind: QuoteEdgeKind;
  fromNodeId: string;
  toNodeId: string;
  /**
   * Semantic weight by edge kind:
   *   SUBSIDIZES → amount subsidised (currency units)
   *   BUNDLED_WITH → bundle discount percentage (0–100)
   *   SHARES_FREIGHT → freight weight split factor (0–1)
   */
  weight?: number;
  label?: string;
  metadata?: Record<string, unknown>;
}

// ── Graph context ─────────────────────────────────────────────────────────────

export interface QuoteGraphContext {
  currency: string;
  channel: ChannelKind;
  customerId?: string;
  projectId?: string;
  pricingDate: Date;
  /** Minimum acceptable graph-level margin (0–100). */
  minimumMarginPct?: number;
  metadata?: Record<string, unknown>;
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export interface QuoteGraph {
  id: string;
  /** Links to Quote.id when persisted. */
  quoteId?: string;
  nodes: QuoteNode[];
  edges: QuoteEdge[];
  context: QuoteGraphContext;
  metadata?: Record<string, unknown>;
}
