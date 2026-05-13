/**
 * Snapshot domain types.
 *
 * A Snapshot is a complete, immutable capture of a domain entity at a specific
 * point in time. It enables:
 *   - Exact historical replay: re-run an engine with the exact inputs it had
 *   - Audit restoration: restore a previous state for investigation
 *   - Reproducibility: prove that a quoted price is traceable to a specific rule version
 *   - Forensics: understand what changed between two evaluation runs
 */

export type SnapshotKind =
  | "PRICING_CALCULATION"
  | "QUOTE_EVALUATION"
  | "WORKFLOW_STATE"
  | "SIMULATION_RUN"
  | "SUPPLIER_IMPORT"
  | "QUOTE_GRAPH";

export interface SnapshotRecord {
  id: string;
  kind: SnapshotKind;
  entityId: string;
  entityType: string;
  data: unknown;
  engineVersion?: string;
  rulesetHash?: string;
  createdBy?: string;
  createdAt: Date;
  tags?: Record<string, string>;
}

export interface CreateSnapshotInput {
  kind: SnapshotKind;
  entityId: string;
  entityType: string;
  data: unknown;
  engineVersion?: string;
  rulesetHash?: string;
  createdBy?: string;
  /** Context tags: reason, quoteRef, triggeredBy, etc. */
  tags?: Record<string, string>;
}

export interface SnapshotQuery {
  kind?: SnapshotKind;
  entityId?: string;
  entityType?: string;
  createdBy?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

/**
 * Diff between two snapshots of the same entity.
 * Used for forensic comparison and change tracing.
 */
export interface SnapshotDiff {
  snapshotAId: string;
  snapshotBId: string;
  entityId: string;
  kind: SnapshotKind;
  changedPaths: string[];
  addedPaths: string[];
  removedPaths: string[];
  summary: string;
}
