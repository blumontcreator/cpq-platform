/**
 * Negotiation guidance builder.
 *
 * Computes per-node and quote-level negotiation ranges:
 *   - Walk-away price: the price at which margin = minimumMarginPct
 *   - Safe discount ceiling: max total discount without breaking the floor
 *   - Recommended negotiation opening: conservative concession (~40% of headroom)
 *
 * Also builds a structured aiContextPrompt for injection into an LLM system prompt.
 * This is the primary AI integration seam for negotiation assistance.
 */
import type { QuoteGraph } from "../../quoting/types/graph.types";
import type { QuoteEvaluation } from "../../quoting/types/evaluation.types";
import type { NegotiationGuidance, NodeNegotiationGuidance } from "../types/intelligence.types";

const DEFAULT_MARGIN_FLOOR = 20;

function walkAwayUnitPrice(unitCost: number, minMarginPct: number): number {
  if (minMarginPct >= 100) return unitCost;
  return unitCost / (1 - minMarginPct / 100);
}

export function buildNegotiationGuidance(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
): NegotiationGuidance {
  const floor = graph.context.minimumMarginPct ?? DEFAULT_MARGIN_FLOOR;
  const currency = graph.context.currency;

  const perNodeGuidance: NodeNegotiationGuidance[] = graph.nodes
    .filter((n) => n.kind !== "DISCOUNT" && n.kind !== "SURCHARGE")
    .map((node) => {
      const walkAway = walkAwayUnitPrice(node.unitCost, floor);
      const headroom = Math.max(0, node.unitPrice - walkAway);
      const maxDiscountAmount = headroom * node.quantity;
      const maxDiscountPct =
        node.unitPrice > 0 ? (headroom / node.unitPrice) * 100 : 0;

      return {
        nodeId: node.id,
        nodeLabel: node.label,
        currentUnitPrice: node.unitPrice,
        walkAwayUnitPrice: walkAway,
        maxDiscountPct,
        maxDiscountAmount,
        flexible: !node.isRequired && !node.isMandatoryService,
      };
    });

  const currentTotalPrice = perNodeGuidance.reduce(
    (s, n) => s + n.currentUnitPrice * (graph.nodes.find((gn) => gn.id === n.nodeId)?.quantity ?? 1),
    0,
  );
  const walkAwayTotalPrice = perNodeGuidance.reduce(
    (s, n) => s + n.walkAwayUnitPrice * (graph.nodes.find((gn) => gn.id === n.nodeId)?.quantity ?? 1),
    0,
  );
  const safeDiscountCeiling = Math.max(0, currentTotalPrice - walkAwayTotalPrice);
  const safeDiscountPct =
    currentTotalPrice > 0 ? (safeDiscountCeiling / currentTotalPrice) * 100 : 0;

  // Recommended target: open concession at ~40% of headroom (leaves room to negotiate down)
  const recommendedTarget = currentTotalPrice - safeDiscountCeiling * 0.4;

  const aiContextPrompt = buildAiContextPrompt(
    graph,
    evaluation,
    currentTotalPrice,
    walkAwayTotalPrice,
    safeDiscountPct,
    floor,
    currency,
    perNodeGuidance,
  );

  return {
    currency,
    currentTotalPrice,
    walkAwayTotalPrice,
    safeDiscountCeiling,
    safeDiscountPct,
    targetNegotiationRange: {
      min: walkAwayTotalPrice,
      max: currentTotalPrice,
      recommended: recommendedTarget,
    },
    perNodeGuidance,
    aiContextPrompt,
  };
}

function buildAiContextPrompt(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
  totalPrice: number,
  walkAwayPrice: number,
  safeDiscountPct: number,
  floor: number,
  currency: string,
  nodeGuidance: NodeNegotiationGuidance[],
): string {
  const flexibleNodes = nodeGuidance.filter((n) => n.flexible && n.maxDiscountPct > 0);
  const nodeLines = flexibleNodes
    .slice(0, 5)
    .map((n) => `  - ${n.nodeLabel}: up to ${n.maxDiscountPct.toFixed(1)}% discount (walk-away: ${currency} ${n.walkAwayUnitPrice.toFixed(2)}/unit)`)
    .join("\n");

  return `[NEGOTIATION CONTEXT — CPQ Platform]
Quote total: ${currency} ${totalPrice.toFixed(2)}
Walk-away price (${floor}% margin floor): ${currency} ${walkAwayPrice.toFixed(2)}
Maximum safe discount: ${safeDiscountPct.toFixed(1)}% (${currency} ${(totalPrice - walkAwayPrice).toFixed(2)})
Overall margin: ${evaluation.metrics.overallMarginPct.toFixed(1)}%
Channel: ${graph.context.channel}

Flexible line items (can be discounted):
${nodeLines || "  (no flexible items identified)"}

Instructions for AI negotiation assistant:
1. Do not offer discounts beyond the walk-away price without escalation.
2. Prioritise bundling and value-add over pure price reduction.
3. If the customer pushes below walk-away, offer lead-time extensions or service removals instead.
4. Always anchor first to the current total price.
5. Use the margin data to counsel the rep — do not reveal cost data to the customer.`;
}
