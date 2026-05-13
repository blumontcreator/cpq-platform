/**
 * In-process event bus with optional persistence.
 *
 * Architecture:
 *   - Synchronous dispatch: handlers run before control returns to caller
 *   - Wildcard subscriptions: subscribe to "*" to receive every event
 *   - Persistence-backed: if a PrismaClient is attached, events are stored
 *   - Error isolation: a failing handler does NOT block other handlers or re-throw
 *   - AI seam: the bus can be swapped for a message queue (SQS, RabbitMQ) by
 *     replacing the `emit` implementation without changing the public API
 *
 * Usage:
 *   eventBus.on("QuoteCreated", (event) => { ... });
 *   await eventBus.emit(createEvent("QuoteCreated", quoteId, "Quote", { ... }));
 */
import type { DomainEvent } from "./domain-events";
import { appendEvent } from "./event-store";
import type { PrismaClient } from "@prisma/client";
import { eventBusLogger as log } from "../observability/logger";
import { metrics } from "../observability/metrics";

export type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private prisma?: PrismaClient;

  /** Attach a PrismaClient to persist events to the event store. */
  attachPersistence(prisma: PrismaClient): void {
    this.prisma = prisma;
  }

  /** Subscribe to a specific event type. Use "*" for all events. */
  on<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => this.off(eventType, handler as EventHandler);
  }

  /** Unsubscribe a handler. */
  off(eventType: string, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  /**
   * Emit an event:
   *   1. Persist to event store (if prisma is attached)
   *   2. Dispatch to all matching handlers (error-isolated)
   *   3. Dispatch to wildcard handlers
   */
  async emit(event: DomainEvent): Promise<void> {
    const start = Date.now();

    // Persist
    if (this.prisma) {
      try {
        await appendEvent(this.prisma, event, { markProcessed: false });
      } catch (err) {
        log.error("Failed to persist domain event", err, { eventType: event.type });
      }
    }

    // Collect handlers
    const specific  = [...(this.handlers.get(event.type) ?? [])];
    const wildcard  = [...(this.handlers.get("*") ?? [])];
    const allHandlers = [...specific, ...wildcard];

    // Dispatch — errors are caught per handler to avoid partial dispatch failure
    const results = await Promise.allSettled(
      allHandlers.map((h) => Promise.resolve(h(event))),
    );

    let errors = 0;
    for (const r of results) {
      if (r.status === "rejected") {
        errors++;
        log.error("Event handler error", r.reason, { eventType: event.type });
      }
    }

    const durationMs = Date.now() - start;
    metrics.recordTiming("event_bus.emit", durationMs, { eventType: event.type });
    metrics.increment("event_bus.emitted", 1, { eventType: event.type });
    if (errors > 0) {
      metrics.increment("event_bus.handler_errors", errors, { eventType: event.type });
    }

    log.debug("Event emitted", {
      eventType: event.type,
      aggregateId: event.aggregateId,
      handlerCount: allHandlers.length,
      durationMs,
    });
  }

  /** Emit multiple events in sequence. */
  async emitBatch(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.emit(event);
    }
  }

  /** Returns handler count for a given event type (useful for testing). */
  handlerCount(eventType: string): number {
    return (this.handlers.get(eventType)?.size ?? 0) +
           (this.handlers.get("*")?.size ?? 0);
  }

  /** Remove all handlers (use in tests). */
  clear(): void {
    this.handlers.clear();
  }
}

// ── Singleton event bus ────────────────────────────────────────────────────

export const eventBus = new EventBus();

// ── Typed emit helpers ─────────────────────────────────────────────────────
// These ensure the event bus is called with the correct payload types.

import type {
  QuoteCreatedEvent,
  QuotePricedEvent,
  QuoteEvaluatedEvent,
  QuoteWonEvent,
  QuoteLostEvent,
  WorkflowTransitionedEvent,
  ApprovalRequestedEvent,
  ApprovalDecidedEvent,
  SupplierDelayedEvent,
  SupplierImportedEvent,
  SimulationExecutedEvent,
  GovernanceOverrideEvent,
} from "./domain-events";

export async function emitQuoteCreated(e: QuoteCreatedEvent) { return eventBus.emit(e); }
export async function emitQuotePriced(e: QuotePricedEvent)   { return eventBus.emit(e); }
export async function emitQuoteEvaluated(e: QuoteEvaluatedEvent) { return eventBus.emit(e); }
export async function emitQuoteWon(e: QuoteWonEvent)         { return eventBus.emit(e); }
export async function emitQuoteLost(e: QuoteLostEvent)       { return eventBus.emit(e); }
export async function emitWorkflowTransitioned(e: WorkflowTransitionedEvent) { return eventBus.emit(e); }
export async function emitApprovalRequested(e: ApprovalRequestedEvent)  { return eventBus.emit(e); }
export async function emitApprovalDecided(e: ApprovalDecidedEvent)      { return eventBus.emit(e); }
export async function emitSupplierDelayed(e: SupplierDelayedEvent)      { return eventBus.emit(e); }
export async function emitSupplierImported(e: SupplierImportedEvent)    { return eventBus.emit(e); }
export async function emitSimulationExecuted(e: SimulationExecutedEvent){ return eventBus.emit(e); }
export async function emitGovernanceOverride(e: GovernanceOverrideEvent){ return eventBus.emit(e); }
