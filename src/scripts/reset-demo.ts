/**
 * Demo environment reset script.
 *
 * Removes all DEMO_-prefixed data created by seed-demo.ts.
 * Leaves schema intact. Safe for CI/staging environments.
 *
 * Run:         npx tsx src/scripts/reset-demo.ts
 * Full wipe:   npx tsx src/scripts/reset-demo.ts --full
 */
import { prisma } from "@/lib/prisma";
import { rootLogger } from "@/lib/observability/logger";

const log = rootLogger.child("reset");
const FULL_WIPE = process.argv.includes("--full");

async function resetDemo() {
  log.info(FULL_WIPE ? "Starting FULL wipe..." : "Starting demo reset...");

  if (FULL_WIPE) {
    // Hard delete all data in safe FK order
    await prisma.negotiationEvent.deleteMany();
    await prisma.quoteRevision.deleteMany();
    await prisma.quoteOutcome.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.quoteEvaluationRecord.deleteMany();
    await prisma.scenarioRun.deleteMany();
    await prisma.quoteLine.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.importDiff.deleteMany();
    await prisma.supplierImportRow.deleteMany();
    await prisma.supplierImport.deleteMany();
    await prisma.productPrice.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.domainEventRecord.deleteMany();
    await prisma.snapshot.deleteMany();
    await prisma.governanceAuditRecord.deleteMany();
    await prisma.customerBehaviorRecord.deleteMany();
    log.info("Full wipe complete");
    return;
  }

  // ── Scoped demo reset (DEMO_-prefixed only) ───────────────────────────

  // Find demo quotes via reference prefix and DEMO opportunities
  const demoOpps = await prisma.opportunity.findMany({
    where: { OR: [
      { reference: { startsWith: "DEMO-OPP" } },
      { reference: { startsWith: "DEMO_OPP" } },
    ]},
    select: { id: true },
  });
  const demoOppIds = demoOpps.map((o) => o.id);

  const demoQuotes = await prisma.quote.findMany({
    where: { OR: [
      { reference: { startsWith: "DEMO-Q" } },
      { reference: { startsWith: "DEMO_Q" } },
      ...(demoOppIds.length > 0 ? [{ opportunityId: { in: demoOppIds } }] : []),
    ]},
    select: { id: true },
  });
  const demoQuoteIds = demoQuotes.map((q) => q.id);

  if (demoQuoteIds.length > 0) {
    await prisma.negotiationEvent.deleteMany({ where: { quoteId: { in: demoQuoteIds } } });
    await prisma.quoteRevision.deleteMany({ where: { quoteId: { in: demoQuoteIds } } });
    await prisma.quoteOutcome.deleteMany({ where: { quoteId: { in: demoQuoteIds } } });

    const demoWorkflows = await prisma.workflowInstance.findMany({
      where: { quoteId: { in: demoQuoteIds } },
      select: { id: true },
    });
    const demoWorkflowIds = demoWorkflows.map((w) => w.id);

    if (demoWorkflowIds.length > 0) {
      await prisma.approvalRequest.deleteMany({ where: { workflowId: { in: demoWorkflowIds } } });
      await prisma.workflowInstance.deleteMany({ where: { id: { in: demoWorkflowIds } } });
    }

    await prisma.quoteEvaluationRecord.deleteMany({ where: { quoteId: { in: demoQuoteIds } } });
    await prisma.scenarioRun.deleteMany({ where: { quoteId: { in: demoQuoteIds } } });
    await prisma.quoteLine.deleteMany({ where: { quoteId: { in: demoQuoteIds } } });
    await prisma.quote.deleteMany({ where: { id: { in: demoQuoteIds } } });
    log.info(`Deleted ${demoQuoteIds.length} demo quotes`);
  }

  if (demoOppIds.length > 0) {
    await prisma.opportunity.deleteMany({ where: { id: { in: demoOppIds } } });
    log.info(`Deleted ${demoOppIds.length} demo opportunities`);
  }

  // Demo suppliers (code starts with DEMO_)
  const demoSuppliers = await prisma.supplier.findMany({
    where:  { code: { startsWith: "DEMO_" } },
    select: { id: true },
  });
  const demoSupplierIds = demoSuppliers.map((s) => s.id);

  if (demoSupplierIds.length > 0) {
    const demoVariants = await prisma.productVariant.findMany({
      where:  { supplierId: { in: demoSupplierIds } },
      select: { id: true, productId: true },
    });
    const demoVariantIds  = demoVariants.map((v) => v.id);
    const demoProductIds  = [...new Set(demoVariants.map((v) => v.productId))];

    const demoImports = await prisma.supplierImport.findMany({
      where:  { supplierId: { in: demoSupplierIds } },
      select: { id: true },
    });
    const demoImportIds = demoImports.map((i) => i.id);

    if (demoImportIds.length > 0) {
      await prisma.supplierImportRow.deleteMany({ where: { importId: { in: demoImportIds } } });
      await prisma.supplierImport.deleteMany({ where: { id: { in: demoImportIds } } });
    }

    if (demoVariantIds.length > 0) {
      await prisma.productPrice.deleteMany({ where: { variantId: { in: demoVariantIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: demoVariantIds } } });
    }

    if (demoProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: demoProductIds } } });
    }

    await prisma.supplier.deleteMany({ where: { id: { in: demoSupplierIds } } });
    log.info(`Deleted ${demoSupplierIds.length} demo suppliers and catalog`);
  }
}

async function main() {
  await resetDemo();

  const [suppliers, products, quotes, opportunities] = await Promise.all([
    prisma.supplier.count(),
    prisma.product.count(),
    prisma.quote.count(),
    prisma.opportunity.count(),
  ]);

  console.log(`\n✓ Demo reset complete${FULL_WIPE ? " (FULL WIPE)" : ""}`);
  console.log(`  Remaining suppliers:     ${suppliers}`);
  console.log(`  Remaining products:      ${products}`);
  console.log(`  Remaining quotes:        ${quotes}`);
  console.log(`  Remaining opportunities: ${opportunities}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
