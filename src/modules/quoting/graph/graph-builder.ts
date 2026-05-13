/**
 * QuoteGraph fluent builder.
 *
 * Constructs a QuoteGraph in a readable, composable way.
 * All mutations return `this` for chaining.
 * Call `.build()` to produce the immutable graph.
 */
import { randomUUID } from "node:crypto";
import type { QuoteNode, QuoteEdge, QuoteGraph, QuoteGraphContext, QuoteNodeKind, QuoteEdgeKind } from "../types/graph.types";
import type { PricingResult } from "../../pricing/types/pricing-result.types";

type PartialNode = Omit<QuoteNode, "id" | "isRequired" | "isOptional" | "isMandatoryService"> &
  Partial<Pick<QuoteNode, "id" | "isRequired" | "isOptional" | "isMandatoryService">>;

export class GraphBuilder {
  private readonly nodes: QuoteNode[] = [];
  private readonly edges: QuoteEdge[] = [];

  constructor(
    private readonly id: string,
    private readonly context: QuoteGraphContext,
    private readonly quoteId?: string,
  ) {}

  // ── Static entry points ──────────────────────────────────────────────────

  static create(context: QuoteGraphContext, quoteId?: string): GraphBuilder {
    return new GraphBuilder(randomUUID(), context, quoteId);
  }

  static withId(id: string, context: QuoteGraphContext, quoteId?: string): GraphBuilder {
    return new GraphBuilder(id, context, quoteId);
  }

  // ── Node builders ────────────────────────────────────────────────────────

  addNode(node: PartialNode): this {
    this.nodes.push({
      ...node,
      id: node.id ?? randomUUID(),
      isRequired: node.isRequired ?? false,
      isOptional: node.isOptional ?? false,
      isMandatoryService: node.isMandatoryService ?? false,
    });
    return this;
  }

  addProductVariant(params: {
    id?: string;
    label: string;
    variantSku: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    pricingResult?: PricingResult;
    leadTimeDays?: number;
    weightKg?: number;
    freightClass?: string;
    installationHours?: number;
    attributes?: Record<string, unknown>;
  }): this {
    return this.addNode({
      kind: "PRODUCT_VARIANT",
      currency: this.context.currency,
      ...params,
    });
  }

  addAccessory(params: {
    id?: string;
    label: string;
    variantSku?: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    leadTimeDays?: number;
    weightKg?: number;
  }): this {
    return this.addNode({
      kind: "ACCESSORY",
      currency: this.context.currency,
      isOptional: true,
      ...params,
    });
  }

  addService(params: {
    id?: string;
    kind?: QuoteNodeKind;
    label: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    installationHours?: number;
    isMandatoryService?: boolean;
  }): this {
    return this.addNode({
      kind: params.kind ?? "SERVICE",
      currency: this.context.currency,
      ...params,
    });
  }

  addDiscount(params: {
    id?: string;
    label: string;
    /** Negative unit price = discount amount. */
    unitPrice: number;
    quantity?: number;
  }): this {
    return this.addNode({
      kind: "DISCOUNT",
      currency: this.context.currency,
      unitCost: 0,
      quantity: params.quantity ?? 1,
      ...params,
    });
  }

  addSurcharge(params: {
    id?: string;
    label: string;
    unitCost: number;
    unitPrice: number;
    quantity?: number;
  }): this {
    return this.addNode({
      kind: "SURCHARGE",
      currency: this.context.currency,
      quantity: params.quantity ?? 1,
      ...params,
    });
  }

  addBundle(params: {
    id?: string;
    label: string;
    unitCost: number;
    unitPrice: number;
    quantity?: number;
  }): this {
    return this.addNode({
      kind: "BUNDLE",
      currency: this.context.currency,
      quantity: params.quantity ?? 1,
      ...params,
    });
  }

  // ── Edge builders ────────────────────────────────────────────────────────

  addEdge(kind: QuoteEdgeKind, fromNodeId: string, toNodeId: string, weight?: number, label?: string): this {
    this.edges.push({
      id: randomUUID(),
      kind,
      fromNodeId,
      toNodeId,
      weight,
      label,
    });
    return this;
  }

  requires(fromNodeId: string, toNodeId: string): this {
    return this.addEdge("REQUIRES", fromNodeId, toNodeId);
  }

  excludes(nodeIdA: string, nodeIdB: string): this {
    return this.addEdge("EXCLUDES", nodeIdA, nodeIdB);
  }

  bundledWith(nodeIdA: string, nodeIdB: string, bundleDiscountPct?: number): this {
    return this.addEdge("BUNDLED_WITH", nodeIdA, nodeIdB, bundleDiscountPct);
  }

  subsidizes(fromNodeId: string, toNodeId: string, subsidyAmount: number): this {
    return this.addEdge("SUBSIDIZES", fromNodeId, toNodeId, subsidyAmount);
  }

  sharesInstallation(nodeIdA: string, nodeIdB: string): this {
    return this.addEdge("SHARES_INSTALLATION", nodeIdA, nodeIdB);
  }

  sharesFreight(nodeIdA: string, nodeIdB: string, weightSplitFactor?: number): this {
    return this.addEdge("SHARES_FREIGHT", nodeIdA, nodeIdB, weightSplitFactor);
  }

  compatibleWith(nodeIdA: string, nodeIdB: string): this {
    return this.addEdge("COMPATIBLE_WITH", nodeIdA, nodeIdB);
  }

  // ── Build ────────────────────────────────────────────────────────────────

  build(): QuoteGraph {
    return {
      id: this.id,
      quoteId: this.quoteId,
      nodes: [...this.nodes],
      edges: [...this.edges],
      context: this.context,
    };
  }
}
