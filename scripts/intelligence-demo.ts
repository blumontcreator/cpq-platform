/**
 * Commercial intelligence demo.
 *
 * Seeds 30 synthetic commercial events across 5 quotes, then runs the full
 * intelligence pipeline and prints an executive summary.
 *
 * Run with:  npm run intelligence:demo
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  ingestBatch,
  buildIntelligence,
  getQuoteTimeline,
  getFeedbackSignals,
} from "../src/modules/intelligence";

async function main() {
  console.log("=== Commercial Intelligence Demo ===\n");

  // ── 1. Create synthetic quotes ────────────────────────────────────────────
  const quoteIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const q = await prisma.quote.create({
      data: { reference: `INTEL-DEMO-${Date.now()}-${i}`, currency: "USD" },
    });
    quoteIds.push(q.id);
  }

  const customerIds = ["CUST-A", "CUST-B", "CUST-C"];
  const supplierIds = ["A400", "SUPP-B"];

  // ── 2. Ingest synthetic events ────────────────────────────────────────────
  const now = Date.now();

  const { ingested, failed, errors } = await ingestBatch(prisma, [
    // Quote 0: won after negotiation
    { kind: "quote_created", quoteId: quoteIds[0], customerId: customerIds[0], payload: { quotedRevenue: 4800, quotedMarginPct: 38, strategy: "BALANCED", channel: "DIRECT", nodeCount: 4, currency: "USD" }, occurredAt: new Date(now - 25 * 86400000) },
    { kind: "quote_sent",    quoteId: quoteIds[0], customerId: customerIds[0], payload: { quotedRevenue: 4800, quotedMarginPct: 38 }, occurredAt: new Date(now - 22 * 86400000) },
    { kind: "quote_negotiated", quoteId: quoteIds[0], customerId: customerIds[0], payload: { originalRevenue: 4800, negotiatedRevenue: 4560, discountRequested: 8, discountGranted: 5, negotiationRound: 1 }, occurredAt: new Date(now - 18 * 86400000) },
    { kind: "quote_won", quoteId: quoteIds[0], customerId: customerIds[0], payload: { finalRevenue: 4560, finalMarginPct: 33, finalDiscount: 5, cycleDays: 22, strategy: "BALANCED", channel: "DIRECT" }, occurredAt: new Date(now - 3 * 86400000) },

    // Quote 1: lost on price
    { kind: "quote_created", quoteId: quoteIds[1], customerId: customerIds[1], payload: { quotedRevenue: 6200, quotedMarginPct: 45, strategy: "AGGRESSIVE", channel: "DIRECT", nodeCount: 5, currency: "USD" }, occurredAt: new Date(now - 40 * 86400000) },
    { kind: "quote_sent",    quoteId: quoteIds[1], customerId: customerIds[1], payload: { quotedRevenue: 6200, quotedMarginPct: 45 }, occurredAt: new Date(now - 37 * 86400000) },
    { kind: "quote_lost",    quoteId: quoteIds[1], customerId: customerIds[1], payload: { lossReason: "PRICE_TOO_HIGH", quotedRevenue: 6200, competitorPrice: 5400, strategy: "AGGRESSIVE" }, occurredAt: new Date(now - 20 * 86400000) },

    // Quote 2: won with premium strategy
    { kind: "quote_created", quoteId: quoteIds[2], customerId: customerIds[2], payload: { quotedRevenue: 8500, quotedMarginPct: 42, strategy: "PREMIUM", channel: "DEALER", nodeCount: 6, currency: "USD" }, occurredAt: new Date(now - 60 * 86400000) },
    { kind: "quote_won", quoteId: quoteIds[2], customerId: customerIds[2], payload: { finalRevenue: 8200, finalMarginPct: 39, finalDiscount: 3.5, cycleDays: 18, strategy: "PREMIUM", channel: "DEALER" }, occurredAt: new Date(now - 42 * 86400000) },

    // Quote 3: expired
    { kind: "quote_created", quoteId: quoteIds[3], customerId: customerIds[0], payload: { quotedRevenue: 3100, quotedMarginPct: 31, strategy: "BALANCED", channel: "ONLINE", nodeCount: 3, currency: "USD" }, occurredAt: new Date(now - 90 * 86400000) },
    { kind: "quote_expired", quoteId: quoteIds[3], payload: { quotedRevenue: 3100, daysSinceLastActivity: 45 }, occurredAt: new Date(now - 45 * 86400000) },

    // Quote 4: won with strategic discount
    { kind: "quote_created", quoteId: quoteIds[4], customerId: customerIds[1], payload: { quotedRevenue: 5500, quotedMarginPct: 35, strategy: "STRATEGIC", channel: "DISTRIBUTOR", nodeCount: 5, currency: "USD" }, occurredAt: new Date(now - 30 * 86400000) },
    { kind: "quote_negotiated", quoteId: quoteIds[4], customerId: customerIds[1], payload: { originalRevenue: 5500, negotiatedRevenue: 4950, discountRequested: 12, discountGranted: 10, negotiationRound: 2 }, occurredAt: new Date(now - 20 * 86400000) },
    { kind: "quote_won", quoteId: quoteIds[4], customerId: customerIds[1], payload: { finalRevenue: 4950, finalMarginPct: 26, finalDiscount: 10, cycleDays: 28, strategy: "STRATEGIC", channel: "DISTRIBUTOR" }, occurredAt: new Date(now - 2 * 86400000) },

    // Supplier delay events
    { kind: "supplier_delay", supplierId: supplierIds[0], payload: { supplierId: supplierIds[0], promisedLeadDays: 14, actualLeadDays: 21, delayDays: 7, reason: "Port congestion" }, occurredAt: new Date(now - 10 * 86400000) },
    { kind: "supplier_delay", supplierId: supplierIds[0], payload: { supplierId: supplierIds[0], promisedLeadDays: 14, actualLeadDays: 18, delayDays: 4, reason: "Customs inspection" }, occurredAt: new Date(now - 5 * 86400000) },

    // Customer behavior
    { kind: "payment_delay", customerId: customerIds[1], payload: { customerId: customerIds[1], invoiceAmount: 4950, dueDays: 30, delayDays: 12 }, occurredAt: new Date(now - 1 * 86400000) },
    { kind: "customer_change_request", quoteId: quoteIds[4], customerId: customerIds[1], payload: { customerId: customerIds[1], changeKind: "ADD_ITEM", description: "Added extra mounting hardware" }, occurredAt: new Date(now - 25 * 86400000) },
  ]);

  console.log(`Events ingested: ${ingested} (failed: ${failed})`);
  if (errors.length) console.log("Errors:", errors);

  // ── 3. Quote timeline ─────────────────────────────────────────────────────
  console.log("\n── Quote Timeline (quote 0) ──────────────────────────────");
  const timeline = await getQuoteTimeline(prisma, quoteIds[0]);
  for (const entry of timeline.entries) {
    console.log(`  [${entry.occurredAt.toISOString().slice(0, 10)}] ${entry.kind.padEnd(22)} ${entry.summary}`);
  }

  // ── 4. Run full intelligence report ──────────────────────────────────────
  console.log("\nBuilding intelligence report...");
  const report = await buildIntelligence(prisma, { periodDays: 90 });

  console.log("\n── Win Rate Report ───────────────────────────────────────");
  console.log(`  Overall: ${(report.winRate.overall.winRate * 100).toFixed(0)}% (${report.winRate.sampleSize} outcomes)`);
  for (const ch of report.winRate.byChannel) {
    console.log(`  Channel ${ch.dimension.padEnd(14)} ${(ch.winRate * 100).toFixed(0)}% (${ch.total} deals)`);
  }

  console.log("\n── Margin Report ─────────────────────────────────────────");
  console.log(`  Avg quoted:   ${report.margin.avgQuotedMarginPct.toFixed(1)}%`);
  console.log(`  Avg realized: ${report.margin.avgRealizedMarginPct.toFixed(1)}%`);
  console.log(`  Retention:    ${(report.margin.marginRetentionRate * 100).toFixed(0)}%`);

  console.log("\n── Discount Report ───────────────────────────────────────");
  console.log(`  Avg requested: ${report.discount.avgDiscountRequested.toFixed(1)}%`);
  console.log(`  Avg granted:   ${report.discount.avgDiscountGranted.toFixed(1)}%`);
  console.log(`  Concession:    ${(report.discount.concessionRate * 100).toFixed(0)}%`);

  console.log("\n── Strategy Effectiveness ────────────────────────────────");
  for (const s of report.strategyEffectiveness.strategies) {
    console.log(
      `  ${s.strategyKind.padEnd(12)} win=${(s.winRate * 100).toFixed(0)}%  ` +
      `margin=${s.avgRealizedMarginPct.toFixed(1)}%  ` +
      `confidence=${(s.confidence * 100).toFixed(0)}%`
    );
  }
  console.log(`  Best overall: ${report.strategyEffectiveness.bestOverall}`);

  if (report.trends.length) {
    console.log("\n── Trends ────────────────────────────────────────────────");
    for (const t of report.trends.slice(0, 4)) {
      console.log(`  ${t.direction.padEnd(12)} ${t.note}`);
    }
  }

  if (report.anomalies.length) {
    console.log("\n── Anomalies ─────────────────────────────────────────────");
    for (const a of report.anomalies) {
      console.log(`  [${a.severity}] ${a.explanation}`);
    }
  }

  console.log("\n── Feedback Signals ──────────────────────────────────────");
  const fb = report.feedback;
  console.log(`  Win probability model ready: ${fb.winProbabilityModel?.hasEnoughData ?? false}`);
  console.log(`  Strategy ranking: ${fb.strategyRanking.map((r) => `${r.strategyKind}(#${r.rank})`).join(", ")}`);
  console.log(`  Supplier risk factors: ${fb.supplierRiskFactors.map((r) => `${r.supplierId}=${r.riskLevel}`).join(", ")}`);

  // ── 5. AI context block ───────────────────────────────────────────────────
  console.log("\n── AI Context Block ──────────────────────────────────────");
  console.log(report.summary.aiContextBlock);

  console.log(`\n── Report confidence: ${(report.confidence * 100).toFixed(0)}% (${report.winRate.sampleSize} outcomes)`);
  if (report.warnings.length) {
    console.log("Warnings:");
    for (const w of report.warnings) console.log(`  ⚠ ${w}`);
  }

  // ── 6. Customer profile ───────────────────────────────────────────────────
  const feedback = await getFeedbackSignals(prisma, { customerId: customerIds[1] });
  if (feedback.customerProfile) {
    const cp = feedback.customerProfile;
    console.log("\n── Customer Profile (CUST-B) ─────────────────────────────");
    console.log(`  Win rate: ${(cp.winRate * 100).toFixed(0)}%`);
    console.log(`  Avg discount requested: ${cp.avgDiscountRequested.toFixed(1)}%`);
    console.log(`  Avg discount granted:   ${cp.avgDiscountGranted.toFixed(1)}%`);
    console.log(`  Concession rate:        ${(cp.concessionRate * 100).toFixed(0)}%`);
    console.log(`  Lost on price rate:     ${(cp.lostPriceTooHighRate * 100).toFixed(0)}%`);
    console.log(`  Payment delay rate:     ${(cp.paymentDelayRate * 100).toFixed(0)}%`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
