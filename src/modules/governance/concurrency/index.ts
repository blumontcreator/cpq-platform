export type { QuoteUpdateResult, EditSession } from "./optimistic-lock";
export {
  ConcurrencyConflictError,
  updateQuoteWithVersion,
  updateWorkflowWithVersion,
  assertVersion,
  editSessionStore,
} from "./optimistic-lock";
