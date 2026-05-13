/**
 * Snapshot service.
 *
 * All writes produce immutable records — snapshots are never updated or deleted.
 * Queries return ordered lists (newest-first by default) to support audit trails.
 *
 * Prisma ↔ domain boundary:
 *   Prisma returns `string | null` for nullable columns; domain types use
 *   `string | undefined`. The `normaliseRecord` helper converts at the boundary
 *   so null never leaks into domain objects.
 */
import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import type {
  CreateSnapshotInput,
  SnapshotRecord,
  SnapshotQuery,
  SnapshotDiff,
  SnapshotKind,
} from "./types";

// ── Prisma → domain normalisation ─────────────────────────────────────────

interface PrismaSnapshotRow {
  id: string;
  kind: string;
  entityId: string;
  entityType: string;
  data: Prisma.JsonValue;
  engineVersion: string | null;
  rulesetHash: string | null;
  createdBy: string | null;
  createdAt: Date;
  tags: Prisma.JsonValue | null;
}

function normaliseRecord(r: PrismaSnapshotRow): SnapshotRecord {
  return {
    id:            r.id,
    kind:          r.kind as SnapshotKind,
    entityId:      r.entityId,
    entityType:    r.entityType,
    data:          r.data,
    engineVersion: r.engineVersion ?? undefined,
    rulesetHash:   r.rulesetHash   ?? undefined,
    createdBy:     r.createdBy     ?? undefined,
    createdAt:     r.createdAt,
    tags:          r.tags ? (r.tags as Record<string, string>) : undefined,
  };
}

// ── Hash helper ────────────────────────────────────────────────────────────

/**
 * Produces a deterministic SHA-256 hash of a JSON-serialisable value.
 * Used for rulesetHash when the caller does not provide one.
 */
export function hashRuleset(ruleset: unknown): string {
  const keys = typeof ruleset === "object" && ruleset !== null
    ? Object.keys(ruleset as object).sort()
    : [];
  const canonical = JSON.stringify(ruleset, keys);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

// ── Create ─────────────────────────────────────────────────────────────────

export async function createSnapshot(
  prisma: PrismaClient,
  input: CreateSnapshotInput,
): Promise<SnapshotRecord> {
  const record = await prisma.snapshot.create({
    data: {
      kind:          input.kind,
      entityId:      input.entityId,
      entityType:    input.entityType,
      data:          input.data as Prisma.InputJsonValue,
      engineVersion: input.engineVersion,
      rulesetHash:   input.rulesetHash,
      createdBy:     input.createdBy,
      tags:          input.tags ? (input.tags as Prisma.InputJsonValue) : undefined,
    },
  });
  return normaliseRecord(record);
}

/**
 * Snapshot a quote graph before a destructive or approvals-gated operation.
 * Automatically computes rulesetHash from the graph data.
 */
export async function snapshotQuoteGraph(
  prisma: PrismaClient,
  quoteId: string,
  graph: unknown,
  options: { createdBy?: string; reason?: string; engineVersion?: string } = {},
): Promise<SnapshotRecord> {
  return createSnapshot(prisma, {
    kind:          "QUOTE_GRAPH",
    entityId:      quoteId,
    entityType:    "Quote",
    data:          graph,
    engineVersion: options.engineVersion,
    rulesetHash:   hashRuleset(graph),
    createdBy:     options.createdBy,
    tags:          options.reason ? { reason: options.reason } : undefined,
  });
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getSnapshot(
  prisma: PrismaClient,
  snapshotId: string,
): Promise<SnapshotRecord | null> {
  const record = await prisma.snapshot.findUnique({ where: { id: snapshotId } });
  return record ? normaliseRecord(record) : null;
}

export async function getLatestSnapshot(
  prisma: PrismaClient,
  entityId: string,
  kind: SnapshotKind,
): Promise<SnapshotRecord | null> {
  const record = await prisma.snapshot.findFirst({
    where:   { entityId, kind },
    orderBy: { createdAt: "desc" },
  });
  return record ? normaliseRecord(record) : null;
}

export async function listSnapshots(
  prisma: PrismaClient,
  query: SnapshotQuery,
): Promise<SnapshotRecord[]> {
  const records = await prisma.snapshot.findMany({
    where: {
      kind:       query.kind,
      entityId:   query.entityId,
      entityType: query.entityType,
      createdBy:  query.createdBy,
      createdAt: {
        gte: query.fromDate,
        lte: query.toDate,
      },
    },
    orderBy: { createdAt: "desc" },
    take:    query.limit ?? 50,
  });
  return records.map(normaliseRecord);
}

// ── Diff ───────────────────────────────────────────────────────────────────

/**
 * Compares two snapshot payloads and returns a list of changed JSON paths.
 * Operates on top-level keys only; deep diffs are summarised as a single entry.
 */
export function diffSnapshots(a: SnapshotRecord, b: SnapshotRecord): SnapshotDiff {
  const aObj = a.data as Record<string, unknown>;
  const bObj = b.data as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);

  const changedPaths: string[] = [];
  const addedPaths:   string[] = [];
  const removedPaths: string[] = [];

  for (const key of allKeys) {
    const inA = Object.prototype.hasOwnProperty.call(aObj, key);
    const inB = Object.prototype.hasOwnProperty.call(bObj, key);
    if (!inA) { addedPaths.push(key);   continue; }
    if (!inB) { removedPaths.push(key); continue; }
    if (JSON.stringify(aObj[key]) !== JSON.stringify(bObj[key])) {
      changedPaths.push(key);
    }
  }

  const total = changedPaths.length + addedPaths.length + removedPaths.length;
  const summary = total === 0
    ? "No changes detected"
    : `${changedPaths.length} changed, ${addedPaths.length} added, ${removedPaths.length} removed`;

  return {
    snapshotAId:  a.id,
    snapshotBId:  b.id,
    entityId:     a.entityId,
    kind:         a.kind,
    changedPaths,
    addedPaths,
    removedPaths,
    summary,
  };
}

// ── Restore ────────────────────────────────────────────────────────────────

/**
 * Returns the data payload of a snapshot for engine replay.
 * Does NOT write to the database — the caller decides what to do with the data.
 */
export function extractSnapshotData<T>(snapshot: SnapshotRecord): T {
  return snapshot.data as T;
}
