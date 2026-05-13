/**
 * Platform Reliability & Governance — demo script.
 *
 * Exercises every subsystem end-to-end:
 *   1. RBAC: create an operator context, check permissions, test authorization
 *   2. Snapshot: create a quote graph snapshot, diff two snapshots
 *   3. Event Bus: publish domain events, subscribe to them, verify persistence
 *   4. Concurrency: simulate an optimistic locking conflict
 *   5. Governance Audit: record a pricing override with justification
 *   6. Reliability: test retry on transient failure, idempotency, replay
 *   7. Observability: flush metrics summary
 *
 * Run:  npx tsx src/scripts/governance-demo.ts
 */
import { prisma } from "@/lib/prisma";
import { eventBus, createEvent } from "@/lib/events";
import { MetricsCollector } from "@/lib/observability/metrics";
import { rootLogger } from "@/lib/observability/logger";
import {
  // RBAC
  hasPermission,
  requirePermission,
  canApprove,
  getEffectivePermissions,
  AuthorizationError,
  // Snapshot
  snapshotQuoteGraph,
  diffSnapshots,
  // Concurrency
  ConcurrencyConflictError,
  updateQuoteWithVersion,
  // Governance Audit
  recordOverride,
  getAuditTrail,
  buildAuditSummary,
  // Reliability
  withRetry,
  withIdempotency,
  assessRecovery,
  DB_RETRY_POLICY,
} from "@/modules/governance";

const log = rootLogger.child("demo");

async function main() {
  log.info("=== Platform Reliability & Governance Demo ===");

  // ── 1. RBAC ─────────────────────────────────────────────────────────────
  log.info("--- 1. RBAC ---");

  const salesOp = {
    userId: "user-sales-001",
    role: "SALES" as const,
    email: "alice@cpq.example",
    name: "Alice",
  };

  const managerOp = {
    userId: "user-mgr-001",
    role: "MANAGER" as const,
    email: "bob@cpq.example",
    name: "Bob",
  };

  const financeOp = {
    userId: "user-fin-001",
    role: "FINANCE" as const,
    email: "carol@cpq.example",
    name: "Carol",
  };

  // Permission checks
  console.log("Sales can CREATE_QUOTE:", hasPermission(salesOp, "QUOTE_CREATE"));
  console.log("Sales can APPROVE_MARGIN:", hasPermission(salesOp, "APPROVE_MARGIN"));
  console.log("Manager can APPROVE_MARGIN:", canApprove(managerOp, "MARGIN"));
  console.log("Finance can APPROVE_MARGIN:", canApprove(financeOp, "MARGIN"));

  const salesPerms = getEffectivePermissions(salesOp);
  console.log(`Sales has ${salesPerms.length} permissions:`, salesPerms.slice(0, 5), "...");

  // Authorization guard
  try {
    requirePermission(salesOp, "APPROVE_MARGIN");
    console.log("ERROR: Should have thrown AuthorizationError");
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.log("Authorization correctly denied:", err.message);
    }
  }

  // Manager can override
  try {
    requirePermission(managerOp, "PRICING_OVERRIDE");
    console.log("Manager override permitted");
  } catch {
    console.log("ERROR: Manager should have PRICING_OVERRIDE");
  }

  // ── 2. Snapshot ─────────────────────────────────────────────────────────
  log.info("--- 2. Snapshot ---");

  // Find or create a quote for testing
  let testQuote = await prisma.quote.findFirst({ orderBy: { createdAt: "desc" } });

  if (!testQuote) {
    testQuote = await prisma.quote.create({
      data: {
        reference: `GOV-DEMO-${Date.now()}`,
        status: "DRAFT",
        currency: "USD",
      },
    });
    log.info("Created test quote", { id: testQuote.id });
  }

  const fakeGraph = {
    id: testQuote.id,
    nodes: [
      { id: "n1", sku: "A400-BK-001", quantity: 10, unitCost: 45.00, unitPrice: 89.00 },
      { id: "n2", sku: "A400-BK-002", quantity: 5,  unitCost: 120.00, unitPrice: 210.00 },
    ],
    context: { currency: "USD", priceDate: new Date().toISOString() },
  };

  const snap1 = await snapshotQuoteGraph(prisma, testQuote.id, fakeGraph, {
    createdBy: managerOp.userId,
    reason: "pre-approval-snapshot",
    engineVersion: "1.0.0",
  });
  log.info("Snapshot 1 created", { id: snap1.id, rulesetHash: snap1.rulesetHash });

  // Simulate a modification then snapshot again
  const modifiedGraph = {
    ...fakeGraph,
    nodes: [
      ...fakeGraph.nodes,
      { id: "n3", sku: "A400-BK-003", quantity: 2, unitCost: 300.00, unitPrice: 520.00 },
    ],
    context: { ...fakeGraph.context, promotionCode: "Q2-2026" },
  };

  const snap2 = await snapshotQuoteGraph(prisma, testQuote.id, modifiedGraph, {
    createdBy: managerOp.userId,
    reason: "post-line-addition",
    engineVersion: "1.0.0",
  });
  log.info("Snapshot 2 created", { id: snap2.id });

  const diff = diffSnapshots(snap1, snap2);
  console.log("Snapshot diff:", diff.summary);
  console.log("  Added paths:", diff.addedPaths);
  console.log("  Changed paths:", diff.changedPaths);

  // ── 3. Event Bus ────────────────────────────────────────────────────────
  log.info("--- 3. Event Bus ---");

  // Attach persistence
  eventBus.attachPersistence(prisma);

  const received: string[] = [];

  const unsubQuoteCreated = eventBus.on("QuoteCreated", (e) => {
    received.push(`QuoteCreated: ${e.aggregateId}`);
  });

  const unsubWildcard = eventBus.on("*", (e) => {
    log.debug("Wildcard handler", { type: e.type, aggregateId: e.aggregateId });
  });

  await eventBus.emit(
    createEvent("QuoteCreated", testQuote.id, "Quote", {
      reference: testQuote.reference,
      currency: "USD",
      ownerId: salesOp.userId,
    }, { userId: salesOp.userId, source: "governance-demo" }),
  );

  await eventBus.emit(
    createEvent("SimulationExecuted", testQuote.id, "Quote", {
      runId: "sim-demo-001",
      strategy: "BALANCED",
      scenarioCount: 12,
      bestMarginPct: 0.32,
      bestCompositeScore: 0.78,
      durationMs: 145,
      engineVersion: "1.0.0",
    }, { userId: managerOp.userId }),
  );

  console.log("Events received by QuoteCreated handler:", received);

  unsubQuoteCreated();
  unsubWildcard();

  // ── 4. Concurrency Control ──────────────────────────────────────────────
  log.info("--- 4. Concurrency Control ---");

  // Simulate a version conflict
  const currentVersion = testQuote.version ?? 1;

  // First update should succeed
  try {
    const result = await updateQuoteWithVersion(
      prisma,
      testQuote.id,
      currentVersion,
      { notes: "Updated by governance demo" },
    );
    console.log("First update succeeded. New version:", result.newVersion);

    // Second update with stale version should fail
    await updateQuoteWithVersion(
      prisma,
      testQuote.id,
      currentVersion, // stale — still the old version
      { notes: "Stale update should fail" },
    );
    console.log("ERROR: Stale update should have thrown ConcurrencyConflictError");
  } catch (err) {
    if (err instanceof ConcurrencyConflictError) {
      console.log("Concurrency conflict correctly detected:", err.message);
    } else {
      throw err;
    }
  }

  // ── 5. Governance Audit ─────────────────────────────────────────────────
  log.info("--- 5. Governance Audit ---");

  const overrideRecord = await recordOverride(prisma, {
    kind: "PRICING_OVERRIDE",
    entityId: testQuote.id,
    entityType: "Quote",
    performedBy: managerOp.userId,
    justification: "Customer is a strategic account — approved 8% below standard floor by VP Sales Q2-2026",
    previousValue: { unitPrice: 89.00, margin: 0.49 },
    newValue: { unitPrice: 81.88, margin: 0.45 },
    impact: {
      revenueChange: -71.20,
      marginPctChange: -0.04,
      currency: "USD",
      description: "4pp margin reduction on 10 units to close strategic account",
    },
    riskLevel: "HIGH",
  });
  console.log("Override recorded:", overrideRecord.id, "| Risk:", overrideRecord.riskLevel);

  // Record a margin exception too
  await recordOverride(prisma, {
    kind: "MARGIN_EXCEPTION",
    entityId: testQuote.id,
    entityType: "Quote",
    performedBy: financeOp.userId,
    justification: "Finance approved margin exception for Q2 target attainment",
    riskLevel: "HIGH",
  });

  // Query audit trail
  const trail = await getAuditTrail(prisma, {
    entityId: testQuote.id,
    limit: 10,
  });
  console.log(`Audit trail for quote: ${trail.length} records`);
  for (const rec of trail) {
    console.log(`  [${rec.riskLevel}] ${rec.kind} by ${rec.performedBy}`);
  }

  // Summary
  const summary = await buildAuditSummary(prisma, 30);
  console.log("Audit summary (30d):", {
    total: summary.totalOverrides,
    critical: summary.byCriticalRisk,
    high: summary.byHighRisk,
    unapproved: summary.unapprovedCount,
  });

  // ── 6. Reliability ──────────────────────────────────────────────────────
  log.info("--- 6. Reliability ---");

  // withRetry: simulate a flaky operation that succeeds on attempt 3
  let attempt = 0;
  const result = await withRetry(
    async () => {
      attempt++;
      if (attempt < 3) throw new Error("connection timeout");
      return { value: "success on attempt " + attempt };
    },
    { ...DB_RETRY_POLICY, baseDelayMs: 10, maxDelayMs: 50 },
  );
  console.log("Retry result:", result.value);
  console.log("Total attempts:", attempt);

  // withIdempotency: same key should return cached result on second call
  const iKey = `demo-idempotency-${testQuote.id}-${Date.now()}`;
  let callCount = 0;

  const r1 = await withIdempotency(prisma, iKey, async () => {
    callCount++;
    return { computed: callCount };
  });

  const r2 = await withIdempotency(prisma, iKey, async () => {
    callCount++;
    return { computed: callCount };
  });

  console.log("Idempotency r1:", r1.result, "isDuplicate:", r1.isDuplicate);
  console.log("Idempotency r2:", r2.result, "isDuplicate:", r2.isDuplicate);
  console.log("Operation called", callCount, "time(s) — should be 1");

  // assessRecovery
  const recovery = await assessRecovery(prisma, testQuote.id);
  console.log("Recovery assessment:", {
    canAutoRecover: recovery.canAutoRecover,
    snapshotAvailable: recovery.snapshotAvailable,
    eventCount: recovery.eventCount,
    actions: recovery.recommendedActions,
  });

  // ── 7. Observability ────────────────────────────────────────────────────
  log.info("--- 7. Observability ---");

  const testMetrics = new MetricsCollector();
  testMetrics.recordTiming("pricing.calculate", 42);
  testMetrics.recordTiming("pricing.calculate", 55);
  testMetrics.recordTiming("simulation.run", 1200);
  testMetrics.increment("events.emitted", 3);
  testMetrics.increment("idempotency.duplicate", 1);
  testMetrics.gauge("active_workflows", 7);
  testMetrics.gauge("open_quotes", 23);

  const summary2 = testMetrics.flush();
  console.log("Metrics summary:");
  for (const t of summary2.timings) {
    console.log(`  ${t.operation}: count=${t.count}, avg=${t.avgMs.toFixed(1)}ms, p95=${t.p95Ms}ms`);
  }
  for (const c of summary2.counters) {
    console.log(`  ${c.metric}: total=${c.total}`);
  }
  console.log("  Gauges:", summary2.gauges);

  log.info("=== Demo completed successfully ===");
}

main()
  .catch((err) => {
    console.error("Demo failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
