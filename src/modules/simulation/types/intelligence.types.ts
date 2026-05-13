/**
 * Intelligence types — negotiation guidance and AI-ready output structures.
 *
 * These types carry structured data specifically designed to feed into:
 *   1. Human sales representatives (readable guidance)
 *   2. LLM prompts for AI-assisted negotiation (aiContextPrompt / aiPrompt)
 *   3. Future reinforcement-learning pipelines (structured signals)
 */

// ── Per-node negotiation guidance ──────────────────────────────────────────

export interface NodeNegotiationGuidance {
  nodeId: string;
  nodeLabel: string;
  currentUnitPrice: number;
  walkAwayUnitPrice: number;
  maxDiscountPct: number;
  maxDiscountAmount: number;
  /** Whether this node has pricing flexibility (false = mandatory service etc.). */
  flexible: boolean;
}

// ── Quote-level negotiation guidance ──────────────────────────────────────

export interface NegotiationGuidance {
  currency: string;
  currentTotalPrice: number;
  walkAwayTotalPrice: number;
  safeDiscountCeiling: number;   // max total discount without violating margin floor
  safeDiscountPct: number;       // safeDiscountCeiling as pct of currentTotalPrice
  targetNegotiationRange: {
    min: number;         // walk-away price
    max: number;         // current price
    recommended: number; // recommended opening concession target
  };
  perNodeGuidance: NodeNegotiationGuidance[];
  /**
   * Pre-built prompt for LLM negotiation assistance.
   * Inject this into a system prompt alongside the customer's counter-offer.
   */
  aiContextPrompt: string;
}
