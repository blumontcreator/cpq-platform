export type {
  NegotiationEventKind,
  QuoteRevisionReason,
  NegotiationEvent,
  RecordNegotiationEventInput,
  QuoteRevision,
  CreateRevisionInput,
  ConcessionSummary,
  NegotiationGuidance,
} from "./types";

export {
  createRevision,
  getRevisions,
  getRevision,
  recordNegotiationEvent,
  getNegotiationTimeline,
  buildConcessionSummary,
  buildNegotiationGuidance,
} from "./service";
