/**
 * Domain events for the CPQ platform.
 *
 * Domain events are immutable facts about things that happened.
 * Each event carries:
 *   - type: discriminated union literal
 *   - aggregateId: the entity that changed (quoteId, supplierId, etc.)
 *   - aggregateType: "Quote", "Supplier", "WorkflowInstance", etc.
 *   - payload: event-specific data (strongly typed)
 *   - metadata: cross-cutting concerns (userId, correlationId, retry info)
 *
 * Design:
 *   - Events are append-only: never updated, never deleted
 *   - Events are self-describing: the type + payload tell the full story
 *   - Events enable deterministic replay: given the same events, any
 *     projection / aggregate can be recomputed to the same result
 *   - AI seam: each event is designed for LLM function-call / tool output ingestion
 */
import { randomUUID } from "node:crypto";

// ── Base event infrastructure ──────────────────────────────────────────────

export interface DomainEventMetadata {
  /** Unique ID for this event instance. */
  eventId: string;
  /** ISO timestamp when the event occurred. */
  occurredAt: string;
  /** Tenant (organization) in which this event occurred. */
  organizationId?: string;
  /** Links events that belong to the same user request. */
  correlationId?: string;
  /** The eventId that caused this event (for causal chains). */
  causationId?: string;
  /** UserId of the operator who triggered the action. */
  userId?: string;
  /** Module/service that published this event. */
  source?: string;
  /** Retry attempt number (0 = first attempt). */
  retryCount?: number;
  /** Environment: production | staging | development */
  environment?: string;
}

export interface DomainEvent<
  TType extends string = string,
  TPayload = unknown,
> {
  type: TType;
  aggregateId: string;
  aggregateType: string;
  payload: TPayload;
  metadata: DomainEventMetadata;
}

// ── Factory helper ─────────────────────────────────────────────────────────

export function createEvent<TType extends string, TPayload>(
  type: TType,
  aggregateId: string,
  aggregateType: string,
  payload: TPayload,
  meta: Omit<DomainEventMetadata, "eventId" | "occurredAt"> = {},
): DomainEvent<TType, TPayload> {
  return {
    type,
    aggregateId,
    aggregateType,
    payload,
    metadata: {
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      ...meta,
    },
  };
}

// ── Specific domain events ─────────────────────────────────────────────────

// Quote lifecycle
export type QuoteCreatedEvent = DomainEvent<
  "QuoteCreated",
  { reference: string; currency: string; ownerId?: string; channel?: string }
>;

export type QuotePricedEvent = DomainEvent<
  "QuotePriced",
  {
    pricingCalculationId: string;
    variantSku: string;
    totalCostUSD: number;
    finalUnitPrice: number;
    marginPct: number;
    appliedRulesCount: number;
    engineVersion?: string;
  }
>;

export type QuoteEvaluatedEvent = DomainEvent<
  "QuoteEvaluated",
  {
    evaluationId: string;
    totalRevenue: number;
    totalCost: number;
    overallMarginPct: number;
    nodeCount: number;
    violationCount: number;
    recommendationCount: number;
    confidence: number;
  }
>;

export type QuoteWonEvent = DomainEvent<
  "QuoteWon",
  {
    realizedRevenue: number;
    realizedMarginPct: number;
    quotedMarginPct: number;
    marginRetained: number;
    strategy?: string;
    cycleDays?: number;
    customerId?: string;
  }
>;

export type QuoteLostEvent = DomainEvent<
  "QuoteLost",
  {
    lossReason?: string;
    competitorPrice?: number;
    quotedRevenue: number;
    quotedMarginPct: number;
    strategy?: string;
    cycleDays?: number;
    customerId?: string;
  }
>;

// Workflow
export type WorkflowTransitionedEvent = DomainEvent<
  "WorkflowTransitioned",
  {
    workflowId: string;
    fromState: string;
    toState: string;
    trigger: string;
    reasoning: string;
    actionsTriggered: string[];
    initiatedBy?: string;
  }
>;

export type ApprovalRequestedEvent = DomainEvent<
  "ApprovalRequested",
  {
    approvalId: string;
    workflowId: string;
    kind: string;
    requiredRole: string;
    stage: number;
  }
>;

export type ApprovalDecidedEvent = DomainEvent<
  "ApprovalDecided",
  {
    approvalId: string;
    decision: "APPROVED" | "REJECTED" | "ESCALATED";
    decidedBy: string;
    note?: string;
  }
>;

// Supplier
export type SupplierDelayedEvent = DomainEvent<
  "SupplierDelayed",
  {
    supplierId: string;
    variantSku?: string;
    delayDays: number;
    riskLevel: string;
    quoteId?: string;
  }
>;

export type SupplierImportedEvent = DomainEvent<
  "SupplierImported",
  {
    importId: string;
    rowCount: number;
    variantCount: number;
    errorCount: number;
    engineVersion?: string;
  }
>;

// Simulation
export type SimulationExecutedEvent = DomainEvent<
  "SimulationExecuted",
  {
    runId: string;
    strategy: string;
    scenarioCount: number;
    bestMarginPct: number;
    bestCompositeScore: number;
    durationMs: number;
    engineVersion?: string;
  }
>;

// Governance
export type GovernanceOverrideEvent = DomainEvent<
  "GovernanceOverride",
  {
    auditRecordId: string;
    kind: string;
    entityId: string;
    performedBy: string;
    riskLevel: string;
    justification: string;
  }
>;

// ── Union type of all events ───────────────────────────────────────────────

export type AnyDomainEvent =
  | QuoteCreatedEvent
  | QuotePricedEvent
  | QuoteEvaluatedEvent
  | QuoteWonEvent
  | QuoteLostEvent
  | WorkflowTransitionedEvent
  | ApprovalRequestedEvent
  | ApprovalDecidedEvent
  | SupplierDelayedEvent
  | SupplierImportedEvent
  | SimulationExecutedEvent
  | GovernanceOverrideEvent;

export type DomainEventType = AnyDomainEvent["type"];
