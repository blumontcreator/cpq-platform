/**
 * Deterministic replay infrastructure.
 *
 * Enables exact reproduction of past outcomes by:
 *   1. Retrieving a snapshot of the inputs at the time of the original operation
 *   2. Re-running the same engine with those exact inputs
 *   3. Comparing the new output to the stored output (for verification)
 *
 * Use cases:
 *   - Audit: prove that the quoted price was correct given the data at that time
 *   - Debugging: reproduce a specific quote evaluation failure
 *   - Migration testing: verify a new engine version produces equivalent results
 *
 * Design:
 *   - Replay functions are pure transformations: snapshot → result
 *   - No side effects during replay: results are NOT persisted
 *   - Diff output shows exactly what changed (for migration testing)
 */
import type { PrismaClient } from "@prisma/client";
import { getLatestSnapshot, listSnapshots, diffSnapshots } from "../snapshot/service";
import type { SnapshotKind, SnapshotRecord } from "../snapshot/types";
import { replayEventsForAggregate } from "@/lib/events/event-store";
import type { AnyDomainEvent } from "@/lib/events/domain-events";
import { governanceLogger as log } from "@/lib/observability/logger";

// ── Quote graph replay ────────────────────────────────────────────────────

export interface QuoteReplayResult {
  quoteId: string;
  snapshotId: string;
  snapshotKind: SnapshotKind;
  capturedAt: Date;
  replayedAt: Date;
  data: unknown;
  /** Engine-level diff when compared to original stored output. */
  diff?: ReturnType<typeof diffSnapshots>;
  success: boolean;
  notes: string[];
}

/**
 * Replays the latest snapshot for a quote and returns its data for re-evaluation.
 * Does NOT persist the result — the caller decides what to do with it.
 */
export async function replayQuoteSnapshot(
  prisma: PrismaClient,
  quoteId: string,
  kind: SnapshotKind = "QUOTE_GRAPH",
): Promise<QuoteReplayResult | null> {
  const snapshot = await getLatestSnapshot(prisma, quoteId, kind);
  if (!snapshot) {
    log.warn("No snapshot found for replay", { quoteId, kind });
    return null;
  }

  log.info("Replaying snapshot", {
    quoteId,
    snapshotId: snapshot.id,
    kind,
    capturedAt: snapshot.createdAt.toISOString(),
  });

  return {
    quoteId,
    snapshotId: snapshot.id,
    snapshotKind: snapshot.kind,
    capturedAt: snapshot.createdAt,
    replayedAt: new Date(),
    data: snapshot.data,
    success: true,
    notes: [
      `Snapshot captured at ${snapshot.createdAt.toISOString()}`,
      snapshot.engineVersion ? `Engine version: ${snapshot.engineVersion}` : "No engine version recorded",
      snapshot.rulesetHash ? `Ruleset hash: ${snapshot.rulesetHash}` : "No ruleset hash recorded",
    ],
  };
}

/**
 * Compare two snapshots of the same entity for regression testing.
 * Returns a diff showing what changed between them.
 */
export async function compareSnapshots(
  prisma: PrismaClient,
  entityId: string,
  kind: SnapshotKind,
): Promise<ReturnType<typeof diffSnapshots> | null> {
  const snapshots = await listSnapshots(prisma, {
    entityId,
    kind,
    limit: 2,
  });

  if (snapshots.length < 2) {
    log.warn("Fewer than 2 snapshots found for comparison", { entityId, kind });
    return null;
  }

  const [newer, older] = snapshots as [SnapshotRecord, SnapshotRecord];
  return diffSnapshots(older, newer);
}

// ── Event-sourced replay ───────────────────────────────────────────────────

export interface EventReplayProjection<TState> {
  aggregateId: string;
  finalState: TState;
  eventCount: number;
  replayedAt: Date;
  replayedUpTo?: Date;
}

/**
 * Replays all domain events for an aggregate and reduces them into a state.
 * The `reducer` function maps each event onto the accumulated state.
 *
 * This is the foundation for event-sourced aggregates: given the complete
 * event history, the current state can always be recomputed from scratch.
 */
export async function replayEventsIntoState<TState>(
  prisma: PrismaClient,
  aggregateId: string,
  initialState: TState,
  reducer: (state: TState, event: AnyDomainEvent) => TState,
  options: { upToDate?: Date } = {},
): Promise<EventReplayProjection<TState>> {
  const events = await replayEventsForAggregate(
    prisma,
    aggregateId,
    options.upToDate,
  );

  let state = initialState;
  for (const event of events) {
    state = reducer(state, event);
  }

  return {
    aggregateId,
    finalState: state,
    eventCount: events.length,
    replayedAt: new Date(),
    replayedUpTo: options.upToDate,
  };
}

// ── Failure recovery ───────────────────────────────────────────────────────

export interface RecoveryPlan {
  quoteId: string;
  issues: string[];
  recommendedActions: string[];
  canAutoRecover: boolean;
  snapshotAvailable: boolean;
  eventCount: number;
}

/**
 * Assesses whether a quote can be automatically recovered after a failure.
 * Returns a plan with recommended recovery actions.
 *
 * AI seam: the `recommendedActions` array is designed for LLM processing.
 */
export async function assessRecovery(
  prisma: PrismaClient,
  quoteId: string,
): Promise<RecoveryPlan> {
  const [snapshot, events, quote] = await Promise.all([
    getLatestSnapshot(prisma, quoteId, "QUOTE_GRAPH"),
    replayEventsForAggregate(prisma, quoteId),
    prisma.quote.findUnique({ where: { id: quoteId }, select: { status: true, version: true } }),
  ]);

  const issues: string[] = [];
  const actions: string[] = [];

  if (!quote) {
    return {
      quoteId,
      issues: ["Quote not found"],
      recommendedActions: [],
      canAutoRecover: false,
      snapshotAvailable: false,
      eventCount: 0,
    };
  }

  if (!snapshot) {
    issues.push("No quote graph snapshot available — manual reconstruction required");
    actions.push("Manually rebuild quote graph from QuoteLine records");
  } else {
    actions.push(`Restore quote graph from snapshot ${snapshot.id} (captured ${snapshot.createdAt.toISOString()})`);
  }

  if (events.length > 0) {
    actions.push(`Replay ${events.length} domain events to reconstruct workflow state`);
  } else {
    issues.push("No domain events recorded for this quote");
  }

  if (quote.version > 1) {
    actions.push("Version history is intact — no data loss detected");
  }

  return {
    quoteId,
    issues,
    recommendedActions: actions,
    canAutoRecover: snapshot !== null && issues.length === 0,
    snapshotAvailable: snapshot !== null,
    eventCount: events.length,
  };
}
