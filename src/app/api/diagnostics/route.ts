/**
 * Diagnostics endpoint.
 *
 * Returns a detailed platform state snapshot for operators and CI pipelines.
 * NOT suitable for public exposure — protect with auth middleware in production.
 *
 * GET /api/diagnostics → 200 { platform state }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEnv } from "@/lib/env";
import { metrics } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const start = Date.now();

  // Protect with DIAGNOSTICS_SECRET env var (set in production deployment).
  // If not configured, falls back to "open" in development only.
  const secret = process.env.DIAGNOSTICS_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") ?? "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (provided !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (process.env.NODE_ENV === "production") {
    // In production without a secret configured, block entirely
    return new Response(JSON.stringify({ error: "DIAGNOSTICS_SECRET not configured" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [
    env,
    counts,
    recentEvents,
    recentImports,
    pendingApprovals,
    metricsSummary,
  ] = await Promise.all([
    Promise.resolve(validateEnv()),
    // Entity counts
    Promise.all([
      prisma.supplier.count(),
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.quote.count(),
      prisma.opportunity.count(),
      prisma.workflowInstance.count(),
      prisma.approvalRequest.count({ where: { status: "PENDING" } }),
      prisma.domainEventRecord.count(),
      prisma.snapshot.count(),
      prisma.governanceAuditRecord.count(),
      prisma.negotiationEvent.count(),
      prisma.quoteRevision.count(),
      prisma.importDiff.count(),
    ]).then(([
      suppliers, products, variants, quotes, opportunities,
      workflows, pendingApprovals, events, snapshots,
      governanceRecords, negotiationEvents, revisions, importDiffs,
    ]) => ({
      suppliers, products, variants, quotes, opportunities,
      workflows, pendingApprovals, events, snapshots,
      governanceRecords, negotiationEvents, revisions, importDiffs,
    })),
    // Recent domain events
    prisma.domainEventRecord.findMany({
      orderBy: { occurredAt: "desc" },
      take: 5,
      select: { eventType: true, aggregateType: true, occurredAt: true },
    }),
    // Recent import runs
    prisma.supplierImport.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
      select: { sourceKey: true, status: true, parsedCount: true, errorCount: true, startedAt: true },
    }),
    // Pending approvals
    prisma.approvalRequest.findMany({
      where:   { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { kind: true, requiredRole: true, createdAt: true },
    }),
    Promise.resolve(metrics.flush()),
  ]);

  // Quote outcome distribution
  const outcomeRows = await prisma.quoteOutcome.groupBy({
    by:     ["outcome"],
    _count: { outcome: true },
  });
  const outcomeDistribution = Object.fromEntries(
    outcomeRows.map((r) => [r.outcome, r._count.outcome]),
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    latencyMs:   Date.now() - start,

    environment: {
      valid:    env.valid,
      errors:   env.errors,
      warnings: env.warnings,
      vars:     env.summary.map((s) => ({ name: s.name, status: s.status })),
    },

    platform: {
      counts,
      outcomeDistribution,
    },

    recentActivity: {
      domainEvents:  recentEvents,
      imports:       recentImports,
      pendingApprovals,
    },

    observability: {
      timings:  metricsSummary.timings.map((t) => ({
        operation: t.operation,
        count:     t.count,
        avgMs:     t.avgMs,
        p95Ms:     t.p95Ms,
      })),
      counters: metricsSummary.counters,
    },
  });
}
