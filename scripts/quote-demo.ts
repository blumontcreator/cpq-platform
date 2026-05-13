/**
 * Quote graph engine demo.
 *
 * Builds a realistic motorized blind quote for the A400 Black catalog,
 * wires up dependencies and bundle edges, runs the full engine,
 * and prints the evaluation summary.
 *
 * Run with:  npm run quote:demo
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  GraphBuilder,
  runQuoteEngine,
  minimumMarginConstraint,
  mandatoryServiceConstraint,
  getEvaluationSummaries,
  createQuoteWithGraph,
} from "../src/modules/quoting";

async function main() {
  console.log("=== Quote Graph Engine Demo ===\n");

  // ── 1. Load a few A400 variants from DB ────────────────────────────────────
  const variants = await prisma.productVariant.findMany({
    where: { supplier: { code: "A400" }, active: true },
    include: { prices: { where: { priceType: "LIST" } } },
    take: 3,
  });

  if (variants.length === 0) {
    console.log("No A400 variants found — run `npm run import:a400` first.");
    await prisma.$disconnect();
    return;
  }

  // ── 2. Build the graph ─────────────────────────────────────────────────────
  const builder = GraphBuilder.create({
    currency: "USD",
    channel: "DIRECT",
    pricingDate: new Date(),
    minimumMarginPct: 30,
  });

  const nodeIds: string[] = [];

  for (const variant of variants) {
    const listPrice = Number(variant.prices[0]?.amount ?? 0);
    const id = `node-${variant.id}`;
    nodeIds.push(id);

    builder.addProductVariant({
      id,
      label: variant.sku,
      variantSku: variant.sku,
      quantity: 1,
      unitCost: listPrice * 0.55,  // 55% of list = estimated import cost
      unitPrice: listPrice,
      leadTimeDays: 14,
      weightKg: 8,
      freightClass: "CLASS_65",
      attributes: (variant.attributes as Record<string, unknown>) ?? {},
    });
  }

  // ── 3. Add services ────────────────────────────────────────────────────────
  builder.addService({
    id: "installation-1",
    label: "On-site Installation Service",
    quantity: variants.length,
    unitCost: 85,
    unitPrice: 150,
    installationHours: 2,
    isMandatoryService: true,
  });

  builder.addService({
    id: "warranty-1",
    kind: "WARRANTY",
    label: "2-Year Extended Warranty",
    quantity: variants.length,
    unitCost: 20,
    unitPrice: 65,
  });

  // ── 4. Freight line ────────────────────────────────────────────────────────
  builder.addNode({
    id: "freight-1",
    kind: "FREIGHT",
    label: "Shipping & Handling",
    quantity: 1,
    unitCost: 60,
    unitPrice: 85,
    currency: "USD",
    freightClass: "CLASS_65",
  });

  // ── 5. Bundle discount ─────────────────────────────────────────────────────
  if (nodeIds.length >= 2) {
    builder.addBundle({
      id: "bundle-1",
      label: "Motorized Blind Bundle",
      unitCost: 0,
      unitPrice: -50,  // $50 bundle discount
      quantity: 1,
    });

    builder.bundledWith(nodeIds[0], nodeIds[1], 5); // 5% bundle discount
  }

  // ── 6. Edges ───────────────────────────────────────────────────────────────
  for (const nodeId of nodeIds) {
    builder.requires(nodeId, "installation-1");
    builder.sharesFreight(nodeId, "freight-1");
  }
  builder.requires("installation-1", "warranty-1");

  if (nodeIds.length >= 2) {
    builder.compatibleWith(nodeIds[0], nodeIds[1]);
    builder.sharesInstallation(nodeIds[0], nodeIds[1]);
  }

  const graph = builder.build();
  console.log(`Graph built: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  // ── 7. Constraints ─────────────────────────────────────────────────────────
  const constraints = [
    minimumMarginConstraint(30),
    mandatoryServiceConstraint("installation-1", "Installation is required for all blinds"),
  ];

  // ── 8. Run the engine ──────────────────────────────────────────────────────
  console.log("\nRunning quote engine...");
  const { evaluation, structuralErrors } = await runQuoteEngine({
    graph,
    constraints,
    persist: false,
  });

  if (structuralErrors.length) {
    console.error("Structural errors:", structuralErrors);
  }

  // ── 9. Print evaluation summary ────────────────────────────────────────────
  const m = evaluation.metrics;
  console.log("\n── Graph Metrics ──────────────────────────────────────");
  console.log(`  Total Revenue:    USD ${m.totalRevenue.toFixed(2)}`);
  console.log(`  Total Cost:       USD ${m.totalCost.toFixed(2)}`);
  console.log(`  Total Margin:     USD ${m.totalMargin.toFixed(2)}`);
  console.log(`  Overall Margin:   ${m.overallMarginPct.toFixed(1)}%`);
  console.log(`  Complexity:       ${m.complexityLevel} (${m.overallComplexityScore}/10)`);
  console.log(`  Critical Path:    ${m.criticalPathLeadTimeDays}d`);
  console.log(`  Install Hours:    ${m.totalInstallationHours}h`);
  console.log(`  Freight Saving:   USD ${m.potentialFreightSaving.toFixed(2)}`);

  console.log("\n── Node Evaluations ──────────────────────────────────");
  for (const ne of evaluation.nodeEvaluations) {
    console.log(
      `  [${ne.kind.padEnd(16)}] ${ne.label.padEnd(35)} ` +
      `rev=${ne.lineRevenue.toFixed(2).padStart(8)} ` +
      `margin=${ne.lineMarginPct.toFixed(1).padStart(5)}% ` +
      `risk=${ne.leadTimeRisk}`,
    );
  }

  if (evaluation.violations.length) {
    console.log("\n── Constraint Violations ─────────────────────────────");
    for (const v of evaluation.violations) {
      console.log(`  [${v.severity}] ${v.message}`);
      if (v.suggestedFix) console.log(`         Fix: ${v.suggestedFix}`);
    }
  }

  if (evaluation.recommendations.length) {
    console.log("\n── Recommendations ───────────────────────────────────");
    for (const r of evaluation.recommendations) {
      console.log(`  [${r.priority.padEnd(8)}] [${r.kind.padEnd(26)}] ${r.title}`);
    }
  }

  console.log(`\n── Confidence: ${(evaluation.confidence * 100).toFixed(0)}%`);
  if (evaluation.warnings.length) {
    console.log("── Warnings:");
    for (const w of evaluation.warnings) console.log(`  ⚠  ${w}`);
  }

  // ── 10. Persist demo ───────────────────────────────────────────────────────
  const { quoteId } = await createQuoteWithGraph(prisma, {
    reference: `DEMO-${Date.now()}`,
    graph,
  });
  console.log(`\nQuote saved to DB with id: ${quoteId}`);

  const [summary] = await getEvaluationSummaries(prisma, [quoteId]);
  if (summary) {
    console.log("Evaluation summary retrieved:", summary.overallMarginPct.toFixed(1) + "% margin");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
