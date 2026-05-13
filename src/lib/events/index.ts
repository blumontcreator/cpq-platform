// Domain events
export type {
  DomainEvent,
  DomainEventMetadata,
  AnyDomainEvent,
  DomainEventType,
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
export { createEvent } from "./domain-events";

// Serializer (Prisma ↔ domain boundary)
export type { RawEventRecord } from "./event-serializer";
export {
  serializeDomainEvent,
  deserializeEventRecord,
  deserializeEventRecords,
  nullToUndefined,
} from "./event-serializer";

// Event store
export type { StoredEvent } from "./event-store";
export {
  appendEvent,
  appendBatch,
  getEventsForAggregate,
  getUnprocessedEvents,
  markEventProcessed,
  markBatchProcessed,
  replayEventsForAggregate,
  hydrateDomainEvent,
} from "./event-store";

// Event bus
export type { EventHandler } from "./event-bus";
export {
  EventBus,
  eventBus,
  emitQuoteCreated,
  emitQuotePriced,
  emitQuoteEvaluated,
  emitQuoteWon,
  emitQuoteLost,
  emitWorkflowTransitioned,
  emitApprovalRequested,
  emitApprovalDecided,
  emitSupplierDelayed,
  emitSupplierImported,
  emitSimulationExecuted,
  emitGovernanceOverride,
} from "./event-bus";
