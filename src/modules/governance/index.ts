/**
 * Governance module — public API.
 *
 * Exports all sub-modules in a flat, tree-shakable structure.
 * Import from "@/modules/governance" or directly from the sub-module path.
 */

// RBAC
export type {
  CpqRole,
  OrganizationMemberRole,
  Permission,
  OperatorContext,
  ApprovalKind,
  QuoteOwnership,
} from "./rbac";
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  APPROVAL_AUTHORITY,
  AuthorizationError,
  hasPermission,
  requirePermission,
  canApprove,
  canAccessQuote,
  canEditQuote,
  canOverride,
  getEffectivePermissions,
  satisfiesRequiredRole,
} from "./rbac";

// Snapshot
export type {
  SnapshotKind,
  SnapshotRecord,
  CreateSnapshotInput,
  SnapshotQuery,
  SnapshotDiff,
} from "./snapshot";
export {
  hashRuleset,
  createSnapshot,
  snapshotQuoteGraph,
  getSnapshot,
  getLatestSnapshot,
  listSnapshots,
  diffSnapshots,
  extractSnapshotData,
} from "./snapshot";

// Concurrency
export type { QuoteUpdateResult, EditSession } from "./concurrency";
export {
  ConcurrencyConflictError,
  updateQuoteWithVersion,
  updateWorkflowWithVersion,
  assertVersion,
  editSessionStore,
} from "./concurrency";

// Governance audit
export type {
  GovernanceAuditKind,
  GovernanceRiskLevel,
  OverrideImpact,
  GovernanceAuditRecord,
  CreateAuditRecordInput,
  AuditQuery,
  AuditSummary,
} from "./audit";
export {
  recordOverride,
  approveOverride,
  getAuditTrail,
  buildAuditSummary,
} from "./audit";

// Reliability
export type {
  RetryPolicy,
  IdempotencyResult,
  QuoteReplayResult,
  EventReplayProjection,
  RecoveryPlan,
} from "./reliability";
export {
  WORKFLOW_RETRY_POLICY,
  DB_RETRY_POLICY,
  ENGINE_RETRY_POLICY,
  LENIENT_RETRY_POLICY,
  MaxRetriesExceededError,
  withRetry,
  withIdempotency,
  isEventAlreadyProcessed,
  markEventProcessed,
  replayQuoteSnapshot,
  compareSnapshots,
  replayEventsIntoState,
  assessRecovery,
} from "./reliability";
