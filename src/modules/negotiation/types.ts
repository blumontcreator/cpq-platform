export type NegotiationEventKind =
  | "CUSTOMER_PRICE_REQUEST"
  | "DISCOUNT_REQUEST"
  | "SCOPE_CHANGE"
  | "COUNTER_OFFER"
  | "ACCEPTANCE"
  | "REJECTION"
  | "EXPIRY_EXTENSION";

export type QuoteRevisionReason =
  | "INITIAL"
  | "CUSTOMER_REQUEST"
  | "INTERNAL_REVISION"
  | "POST_APPROVAL"
  | "NEGOTIATION"
  | "SCOPE_CHANGE";

export interface NegotiationEvent {
  id: string;
  quoteId: string;
  revisionNo?: number;
  kind: NegotiationEventKind;
  requestedValue?: number;
  requestedDiscount?: number;
  grantedValue?: number;
  grantedDiscount?: number;
  concessionNote?: string;
  performedBy?: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

export interface RecordNegotiationEventInput {
  quoteId: string;
  revisionNo?: number;
  kind: NegotiationEventKind;
  requestedValue?: number;
  requestedDiscount?: number;
  grantedValue?: number;
  grantedDiscount?: number;
  concessionNote?: string;
  performedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface QuoteRevision {
  id: string;
  quoteId: string;
  revisionNo: number;
  reason: QuoteRevisionReason;
  snapshot: unknown;
  changedBy?: string;
  changeNote?: string;
  createdAt: Date;
}

export interface CreateRevisionInput {
  quoteId: string;
  reason: QuoteRevisionReason;
  snapshot: unknown;
  changedBy?: string;
  changeNote?: string;
}

/** Aggregated concession metrics for a negotiation cycle. */
export interface ConcessionSummary {
  quoteId: string;
  totalDiscountRequested: number;
  totalDiscountGranted: number;
  totalValueRequested: number;
  totalValueGranted: number;
  concessionRatio: number;     // granted / requested (0–1)
  eventCount: number;
  timeline: NegotiationEvent[];
  lastEventKind?: NegotiationEventKind;
  isClosed: boolean;           // true if ACCEPTANCE or REJECTION in timeline
}

/** Guidance produced by the simulated negotiation assistant. */
export interface NegotiationGuidance {
  suggestedFloor: number;           // minimum acceptable price
  suggestedCounterOffer: number;    // recommended counter-offer price
  maxConcessionPct: number;         // max discount to offer without approval
  winProbabilityAtCurrentPrice: number;
  winProbabilityAtFloor: number;
  marginAtCurrentPrice: number;
  marginAtFloor: number;
  tactics: string[];                // concrete negotiation moves
  risks: string[];                  // risks if concessions are made
  aiContextBlock: string;           // AI-seam: structured prompt block
}
