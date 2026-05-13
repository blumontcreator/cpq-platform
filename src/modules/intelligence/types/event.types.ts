/**
 * Commercial event domain types.
 *
 * CommercialEvent is the immutable fact of record for the entire intelligence layer.
 * All analytics, profiles, and learning signals are derived from this event log.
 *
 * The event log is append-only — events are never mutated or deleted.
 */

// ── Event kinds ────────────────────────────────────────────────────────────

export const COMMERCIAL_EVENT_KINDS = [
  "quote_created",
  "quote_sent",
  "quote_viewed",
  "quote_negotiated",
  "quote_won",
  "quote_lost",
  "quote_expired",
  "supplier_delay",
  "installation_issue",
  "payment_delay",
  "customer_change_request",
] as const;

export type EventKind = (typeof COMMERCIAL_EVENT_KINDS)[number];

// ── Payload types (discriminated by kind) ─────────────────────────────────

export interface QuoteCreatedPayload {
  quotedRevenue: number;
  quotedMarginPct: number;
  strategy?: string;
  channel?: string;
  nodeCount: number;
  currency: string;
}

export interface QuoteSentPayload {
  quotedRevenue: number;
  quotedMarginPct: number;
  recipientEmail?: string;
}

export interface QuoteViewedPayload {
  viewCount?: number;
  lastViewedAt?: string;
}

export interface QuoteNegotiatedPayload {
  originalRevenue: number;
  negotiatedRevenue: number;
  discountRequested: number;  // pct
  discountGranted: number;    // pct
  negotiationRound: number;
  customerNote?: string;
}

export interface QuoteWonPayload {
  finalRevenue: number;
  finalMarginPct: number;
  finalDiscount: number;
  cycleDays: number;
  strategy?: string;
  channel?: string;
}

export interface QuoteLostPayload {
  lossReason: LossReason;
  competitorPrice?: number;
  customerFeedback?: string;
  strategy?: string;
  quotedRevenue: number;
}

export type LossReason =
  | "PRICE_TOO_HIGH"
  | "COMPETITOR_WON"
  | "NO_DECISION"
  | "BUDGET_CUT"
  | "REQUIREMENT_CHANGED"
  | "RELATIONSHIP"
  | "OTHER";

export interface QuoteExpiredPayload {
  quotedRevenue: number;
  daysSinceLastActivity?: number;
}

export interface SupplierDelayPayload {
  supplierId: string;
  variantSku?: string;
  promisedLeadDays: number;
  actualLeadDays: number;
  delayDays: number;
  reason?: string;
}

export interface InstallationIssuePayload {
  supplierId?: string;
  variantSku?: string;
  issueKind: "DEFECTIVE" | "INCORRECT" | "MISSING_PARTS" | "DAMAGE" | "OTHER";
  issueDescription?: string;
  resolutionDays?: number;
}

export interface PaymentDelayPayload {
  customerId: string;
  invoiceAmount: number;
  dueDays: number;
  delayDays: number;
}

export interface CustomerChangeRequestPayload {
  customerId: string;
  changeKind: "ADD_ITEM" | "REMOVE_ITEM" | "PRICE_CHANGE" | "SCOPE_CHANGE" | "OTHER";
  impactEstimate?: number;
  description?: string;
}

export type EventPayload =
  | QuoteCreatedPayload
  | QuoteSentPayload
  | QuoteViewedPayload
  | QuoteNegotiatedPayload
  | QuoteWonPayload
  | QuoteLostPayload
  | QuoteExpiredPayload
  | SupplierDelayPayload
  | InstallationIssuePayload
  | PaymentDelayPayload
  | CustomerChangeRequestPayload;

// ── Core event type ────────────────────────────────────────────────────────

export interface CommercialEvent {
  id: string;
  kind: EventKind;
  quoteId?: string;
  customerId?: string;
  supplierId?: string;
  variantSku?: string;
  payload: EventPayload;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

// ── Timeline ───────────────────────────────────────────────────────────────

export interface TimelineEntry {
  eventId: string;
  kind: EventKind;
  occurredAt: Date;
  summary: string;
}

export interface EventTimeline {
  quoteId: string;
  entries: TimelineEntry[];
  firstEventAt?: Date;
  lastEventAt?: Date;
}
