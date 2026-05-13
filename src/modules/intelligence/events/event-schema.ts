/**
 * Event schema validation.
 *
 * Each event kind has a Zod schema for its payload.
 * Validation is enforced at ingestion time so the event log
 * is always structurally sound.
 */
import { z } from "zod";
import type { EventKind } from "../types/event.types";

// ── Payload schemas ────────────────────────────────────────────────────────

const quoteCreatedSchema = z.object({
  quotedRevenue:   z.number().nonnegative(),
  quotedMarginPct: z.number(),
  strategy:        z.string().optional(),
  channel:         z.string().optional(),
  nodeCount:       z.number().int().nonnegative(),
  currency:        z.string().default("USD"),
});

const quoteSentSchema = z.object({
  quotedRevenue:   z.number().nonnegative(),
  quotedMarginPct: z.number(),
  recipientEmail:  z.string().optional(),
});

const quoteViewedSchema = z.object({
  viewCount:    z.number().int().nonnegative().optional(),
  lastViewedAt: z.string().optional(),
});

const quoteNegotiatedSchema = z.object({
  originalRevenue:    z.number().nonnegative(),
  negotiatedRevenue:  z.number().nonnegative(),
  discountRequested:  z.number().min(0).max(100),
  discountGranted:    z.number().min(0).max(100),
  negotiationRound:   z.number().int().positive(),
  customerNote:       z.string().optional(),
});

const quoteWonSchema = z.object({
  finalRevenue:    z.number().nonnegative(),
  finalMarginPct:  z.number(),
  finalDiscount:   z.number().min(0).max(100),
  cycleDays:       z.number().int().nonnegative(),
  strategy:        z.string().optional(),
  channel:         z.string().optional(),
});

const quoteLostSchema = z.object({
  lossReason:       z.enum(["PRICE_TOO_HIGH", "COMPETITOR_WON", "NO_DECISION", "BUDGET_CUT", "REQUIREMENT_CHANGED", "RELATIONSHIP", "OTHER"]),
  competitorPrice:  z.number().nonnegative().optional(),
  customerFeedback: z.string().optional(),
  strategy:         z.string().optional(),
  quotedRevenue:    z.number().nonnegative(),
});

const quoteExpiredSchema = z.object({
  quotedRevenue:          z.number().nonnegative(),
  daysSinceLastActivity:  z.number().int().nonnegative().optional(),
});

const supplierDelaySchema = z.object({
  supplierId:       z.string(),
  variantSku:       z.string().optional(),
  promisedLeadDays: z.number().int().nonnegative(),
  actualLeadDays:   z.number().int().nonnegative(),
  delayDays:        z.number().int(),
  reason:           z.string().optional(),
});

const installationIssueSchema = z.object({
  supplierId:       z.string().optional(),
  variantSku:       z.string().optional(),
  issueKind:        z.enum(["DEFECTIVE", "INCORRECT", "MISSING_PARTS", "DAMAGE", "OTHER"]),
  issueDescription: z.string().optional(),
  resolutionDays:   z.number().int().nonnegative().optional(),
});

const paymentDelaySchema = z.object({
  customerId:    z.string(),
  invoiceAmount: z.number().nonnegative(),
  dueDays:       z.number().int().nonnegative(),
  delayDays:     z.number().int().nonnegative(),
});

const customerChangeRequestSchema = z.object({
  customerId:     z.string(),
  changeKind:     z.enum(["ADD_ITEM", "REMOVE_ITEM", "PRICE_CHANGE", "SCOPE_CHANGE", "OTHER"]),
  impactEstimate: z.number().optional(),
  description:    z.string().optional(),
});

// ── Schema registry ────────────────────────────────────────────────────────

const PAYLOAD_SCHEMAS: Record<EventKind, z.ZodTypeAny> = {
  quote_created:          quoteCreatedSchema,
  quote_sent:             quoteSentSchema,
  quote_viewed:           quoteViewedSchema,
  quote_negotiated:       quoteNegotiatedSchema,
  quote_won:              quoteWonSchema,
  quote_lost:             quoteLostSchema,
  quote_expired:          quoteExpiredSchema,
  supplier_delay:         supplierDelaySchema,
  installation_issue:     installationIssueSchema,
  payment_delay:          paymentDelaySchema,
  customer_change_request: customerChangeRequestSchema,
};

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  parsed?: Record<string, unknown>;
}

export function validateEventPayload(kind: EventKind, payload: unknown): ValidationResult {
  const schema = PAYLOAD_SCHEMAS[kind];
  if (!schema) {
    return { valid: false, errors: [`Unknown event kind: ${kind}`] };
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  }
  return { valid: true, parsed: result.data as Record<string, unknown> };
}
