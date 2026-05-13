/**
 * Governance audit service.
 *
 * Records, queries, and summarises governance override events.
 *
 * Prisma ↔ domain boundary:
 *   Prisma nullable columns (`string | null`) are converted to optional
 *   domain fields (`string | undefined`) by `normaliseRecord` at the boundary.
 *   Callers never see `null` in the returned domain types.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import type {
  CreateAuditRecordInput,
  GovernanceAuditRecord,
  AuditQuery,
  AuditSummary,
  GovernanceAuditKind,
  GovernanceRiskLevel,
  OverrideImpact,
} from "./types";
import { governanceLogger as log } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";
import { createEvent, emitGovernanceOverride } from "@/lib/events";

// ── Prisma → domain normalisation ─────────────────────────────────────────

interface PrismaAuditRow {
  id: string;
  kind: string;
  entityId: string;
  entityType: string;
  performedBy: string;
  performedAt: Date;
  justification: string;
  previousValue: Prisma.JsonValue | null;
  newValue: Prisma.JsonValue | null;
  impact: Prisma.JsonValue | null;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  riskLevel: string;
  metadata: Prisma.JsonValue | null;
}

function normaliseRecord(r: PrismaAuditRow): GovernanceAuditRecord {
  return {
    id:            r.id,
    kind:          r.kind as GovernanceAuditKind,
    entityId:      r.entityId,
    entityType:    r.entityType,
    performedBy:   r.performedBy,
    performedAt:   r.performedAt,
    justification: r.justification,
    previousValue: r.previousValue ?? undefined,
    newValue:      r.newValue      ?? undefined,
    impact:        r.impact        ? (r.impact as OverrideImpact) : undefined,
    approved:      r.approved,
    approvedBy:    r.approvedBy    ?? undefined,
    approvedAt:    r.approvedAt    ?? undefined,
    riskLevel:     r.riskLevel as GovernanceRiskLevel,
    metadata:      r.metadata      ? (r.metadata as Record<string, unknown>) : undefined,
  };
}

// ── Risk level auto-classification ────────────────────────────────────────

const KIND_DEFAULT_RISK: Record<GovernanceAuditKind, GovernanceRiskLevel> = {
  PRICING_OVERRIDE:  "MEDIUM",
  MARGIN_EXCEPTION:  "HIGH",
  DISCOUNT_EXCEPTION:"HIGH",
  WORKFLOW_OVERRIDE: "HIGH",
  APPROVAL_BYPASS:   "CRITICAL",
  QUOTE_UNLOCK:      "LOW",
  STATUS_ROLLBACK:   "MEDIUM",
  RULESET_OVERRIDE:  "CRITICAL",
};

// ── Record ────────────────────────────────────────────────────────────────

export async function recordOverride(
  prisma: PrismaClient,
  input: CreateAuditRecordInput,
): Promise<GovernanceAuditRecord> {
  if (!input.justification.trim()) {
    throw new Error("Governance override requires a non-empty justification");
  }

  const riskLevel = input.riskLevel ?? KIND_DEFAULT_RISK[input.kind] ?? "LOW";

  const record = await prisma.governanceAuditRecord.create({
    data: {
      kind:          input.kind,
      entityId:      input.entityId,
      entityType:    input.entityType,
      performedBy:   input.performedBy,
      justification: input.justification,
      previousValue: input.previousValue !== undefined
        ? (input.previousValue as Prisma.InputJsonValue)
        : undefined,
      newValue: input.newValue !== undefined
        ? (input.newValue as Prisma.InputJsonValue)
        : undefined,
      impact: input.impact !== undefined
        ? (input.impact as Prisma.InputJsonValue)
        : undefined,
      riskLevel,
      metadata: input.metadata
        ? (input.metadata as Prisma.InputJsonValue)
        : undefined,
    },
  });

  log.info("Governance override recorded", {
    id:          record.id,
    kind:        record.kind,
    entityId:    record.entityId,
    performedBy: record.performedBy,
    riskLevel:   record.riskLevel,
  });

  metrics.increment("governance.overrides", 1, {
    kind:      record.kind,
    riskLevel: record.riskLevel,
  });

  // Emit domain event (fire-and-forget; log failure but don't throw)
  emitGovernanceOverride(
    createEvent(
      "GovernanceOverride",
      record.entityId,
      record.entityType,
      {
        auditRecordId: record.id,
        kind:          record.kind,
        entityId:      record.entityId,
        performedBy:   record.performedBy,
        riskLevel:     record.riskLevel,
        justification: record.justification,
      },
      { userId: record.performedBy },
    ),
  ).catch((err) => log.error("Failed to emit GovernanceOverride event", err));

  return normaliseRecord(record);
}

// ── Approve a recorded override ────────────────────────────────────────────

export async function approveOverride(
  prisma: PrismaClient,
  auditRecordId: string,
  approvedBy: string,
): Promise<GovernanceAuditRecord> {
  const record = await prisma.governanceAuditRecord.update({
    where: { id: auditRecordId },
    data:  { approved: true, approvedBy, approvedAt: new Date() },
  });
  log.info("Governance override approved", { id: record.id, approvedBy });
  return normaliseRecord(record);
}

// ── Query ─────────────────────────────────────────────────────────────────

export async function getAuditTrail(
  prisma: PrismaClient,
  query: AuditQuery,
): Promise<GovernanceAuditRecord[]> {
  const records = await prisma.governanceAuditRecord.findMany({
    where: {
      kind:        query.kind,
      entityId:    query.entityId,
      entityType:  query.entityType,
      performedBy: query.performedBy,
      riskLevel:   query.riskLevel,
      approved:    query.approved,
      performedAt: {
        gte: query.fromDate,
        lte: query.toDate,
      },
    },
    orderBy: { performedAt: "desc" },
    take:    query.limit ?? 100,
  });
  return records.map(normaliseRecord);
}

// ── Summary ───────────────────────────────────────────────────────────────

export async function buildAuditSummary(
  prisma: PrismaClient,
  periodDays = 30,
): Promise<AuditSummary> {
  const since = new Date(Date.now() - periodDays * 24 * 3600 * 1000);

  const [total, critical, high, unapproved, kindCounts, userCounts] =
    await Promise.all([
      prisma.governanceAuditRecord.count({
        where: { performedAt: { gte: since } },
      }),
      prisma.governanceAuditRecord.count({
        where: { performedAt: { gte: since }, riskLevel: "CRITICAL" },
      }),
      prisma.governanceAuditRecord.count({
        where: { performedAt: { gte: since }, riskLevel: "HIGH" },
      }),
      prisma.governanceAuditRecord.count({
        where: { performedAt: { gte: since }, approved: false },
      }),
      prisma.governanceAuditRecord.groupBy({
        by:      ["kind"],
        where:   { performedAt: { gte: since } },
        _count:  { id: true },
        orderBy: { _count: { id: "desc" } },
        take:    5,
      }),
      prisma.governanceAuditRecord.groupBy({
        by:      ["performedBy"],
        where:   { performedAt: { gte: since } },
        _count:  { id: true },
        orderBy: { _count: { id: "desc" } },
        take:    5,
      }),
    ]);

  return {
    totalOverrides:  total,
    byCriticalRisk:  critical,
    byHighRisk:      high,
    unapprovedCount: unapproved,
    topKinds: kindCounts.map((k) => ({
      kind:  k.kind as GovernanceAuditKind,
      count: k._count.id,
    })),
    topPerformers: userCounts.map((u) => ({
      userId: u.performedBy,
      count:  u._count.id,
    })),
    period: `${periodDays}d`,
  };
}
