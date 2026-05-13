/**
 * Scenario simulation and optimization demo.
 *
 * Loads the A400 quote graph created by quote-demo, runs the optimizer
 * across all four strategy profiles, prints a side-by-side comparison,
 * then runs a manual "what-if" scenario.
 *
 * Run with:  npm run simulate:demo
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { GraphBuilder } from "../src/modules/quoting";
import {
  runOptimization,
  runWhatIf,
  STRATEGY_PROFILES,
  getScenarioRunSummaries,
} from "../src/modules/simulation";
import type { StrategyKind } from "../src/modules/simulation";

async function buildDemoGraph() {
  // Build a fresh in-memory graph (no DB dependency for the simulation itself)
  const variants = await prisma.productVariant.findMany({
    where: { supplier: { code: "A400" }, active: true },
    include: { prices: { where: { priceType: "LIST" } } },
    take: 3,
  });

  if (variants.length === 0) {
    console.log("No A400 variants found — run `npm run import:a400` first.");
    return null;
  }

  const builder = GraphBuilder.create({
    currency: "USD",
    channel: "DIRECT",
    pricingDate: new Date(),
    minimumMarginPct: 28,
  });

  const nodeIds: string[] = [];
  for (const v of variants) {
    const list = Number(v.prices[0]?.amount ?? 0);
    const id = `node-${v.id}`;
    nodeIds.push(id);
    builder.addProductVariant({
      id,
      label: v.sku,
      variantSku: v.sku,
      quantity: 1,
      unitCost: list * 0.56,
      unitPrice: list,
      leadTimeDays: 18,
      weightKg: 9,
      freightClass: "CLASS_65",
      attributes: (v.attributes as Record<string, unknown>) ?? {},
    });
  }

  builder.addService({
    id: "install-1",
    label: "Installation",
    quantity: variants.length,
    unitCost: 80,
    unitPrice: 140,
    installationHours: 2,
    isMandatoryService: true,
  });

  builder.addNode({
    id: "freight-1",
    kind: "FREIGHT",
    label: "Freight",
    quantity: 1,
    unitCost: 50,
    unitPrice: 80,
    currency: "USD",
    freightClass: "CLASS_65",
  });

  for (const id of nodeIds) {
    builder.requires(id, "install-1");
    builder.sharesFreight(id, "freight-1");
  }
  if (nodeIds.length >= 2) builder.compatibleWith(nodeIds[0], nodeIds[1]);

  return builder.build();
}

async function main() {
  console.log("=== Scenario Simulation & Optimization Demo ===\n");

  const graph = await buildDemoGraph();
  if (!graph) {
    await prisma.$disconnect();
    return;
  }

  console.log(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges\n`);

  // ── 1. Run optimization for all 4 strategy profiles ───────────────────────
  const strategies = Object.keys(STRATEGY_PROFILES) as StrategyKind[];
  const results: Record<string, Awaited<ReturnType<typeof runOptimization>>["result"]> = {};

  for (const strategy of strategies) {
    process.stdout.write(`Optimizing with ${strategy} strategy... `);
    const { result } = await runOptimization({ graph, strategyKind: strategy });
    results[strategy] = result;
    console.log(
      `done — best: "${result.bestScenario.scenarioName}" ` +
      `margin ${result.bestScenario.evaluation.metrics.overallMarginPct.toFixed(1)}% ` +
      `(baseline ${result.baselineEvaluation.metrics.overallMarginPct.toFixed(1)}%)`,
    );
  }

  // ── 2. Strategy comparison table ──────────────────────────────────────────
  console.log("\n── Strategy Comparison ─────────────────────────────────");
  console.log(
    "Strategy    ".padEnd(14) +
    "BestScenario".padEnd(40) +
    "BaseMgn".padEnd(10) +
    "BestMgn".padEnd(10) +
    "Delta".padEnd(8) +
    "Score".padEnd(8) +
    "Risk",
  );
  console.log("─".repeat(100));
  for (const s of strategies) {
    const r = results[s];
    const b = r.bestScenario;
    console.log(
      s.padEnd(14) +
      b.scenarioName.slice(0, 38).padEnd(40) +
      `${r.baselineEvaluation.metrics.overallMarginPct.toFixed(1)}%`.padEnd(10) +
      `${b.evaluation.metrics.overallMarginPct.toFixed(1)}%`.padEnd(10) +
      `${b.delta.marginPctDelta >= 0 ? "+" : ""}${b.delta.marginPctDelta.toFixed(1)}pp`.padEnd(8) +
      `${(b.compositeScore * 100).toFixed(0)}/100`.padEnd(8) +
      r.riskAnalysis.overallRisk,
    );
  }

  // ── 3. Detailed BALANCED strategy output ──────────────────────────────────
  const balanced = results["BALANCED"];
  console.log("\n── BALANCED Strategy — Detailed Results ────────────────");

  const m = balanced.bestScenario.evaluation.metrics;
  console.log(`  Best scenario: "${balanced.bestScenario.scenarioName}"`);
  console.log(`  Applied mutations: ${balanced.bestScenario.appliedMutations.map((m) => m.label).join("; ")}`);
  console.log(`  Revenue:  USD ${m.totalRevenue.toFixed(2)}`);
  console.log(`  Margin:   ${m.overallMarginPct.toFixed(1)}%`);
  console.log(`  Complexity: ${m.complexityLevel}`);
  console.log(`  Lead time: ${m.criticalPathLeadTimeDays}d`);

  console.log("\n── Tradeoff Analysis ────────────────────────────────────");
  const ta = balanced.tradeoffAnalysis;
  console.log(`  Margin vs complexity: ${ta.marginVsComplexity}`);
  console.log(`  Margin vs lead time:  ${ta.marginVsLeadTime}`);
  console.log(`  Win probability:      ${ta.marginVsWinProbability}`);
  console.log(`  Assessment:           ${ta.overallAssessment}`);

  console.log("\n── Negotiation Guidance ─────────────────────────────────");
  const ng = balanced.negotiationGuidance;
  console.log(`  Current total:    USD ${ng.currentTotalPrice.toFixed(2)}`);
  console.log(`  Walk-away floor:  USD ${ng.walkAwayTotalPrice.toFixed(2)}`);
  console.log(`  Safe discount:    ${ng.safeDiscountPct.toFixed(1)}% (USD ${ng.safeDiscountCeiling.toFixed(2)})`);
  console.log(`  Recommended target: USD ${ng.targetNegotiationRange.recommended.toFixed(2)}`);

  console.log("\n── Recommendations ──────────────────────────────────────");
  for (const r of balanced.recommendations.slice(0, 6)) {
    console.log(`  [${r.priority.padEnd(8)}] [${r.kind.padEnd(24)}] ${r.title}`);
  }

  // ── 4. Manual what-if scenario ────────────────────────────────────────────
  console.log("\n── Manual What-If: Custom Scenarios ────────────────────");
  const { ranked } = await runWhatIf({
    graph,
    scenarios: [
      {
        id: "custom-1",
        name: "10% price uplift + remove freight",
        baselineGraphId: graph.id,
        mutations: [
          {
            id: "mut-1",
            kind: "PRICING_ADJUSTMENT",
            label: "+10% on all products",
            rationale: "Test price increase elasticity",
            params: { applyToKind: "PRODUCT_VARIANT", adjustmentPct: 10 },
          },
          {
            id: "mut-2",
            kind: "SERVICE_TOGGLE",
            label: "Remove freight",
            rationale: "Customer arranges own freight",
            params: { action: "REMOVE", nodeId: "freight-1" },
          },
        ],
      },
      {
        id: "custom-2",
        name: "Aggressive 15% discount",
        baselineGraphId: graph.id,
        mutations: [{
          id: "mut-3",
          kind: "DISCOUNT_SIMULATION",
          label: "15% commercial discount",
          rationale: "Aggressive bid to secure the deal",
          params: { discountPct: 15, label: "Commercial Discount 15%" },
        }],
      },
    ],
  });

  for (const s of ranked) {
    console.log(
      `  ${s.scenarioName.padEnd(45)} ` +
      `margin=${s.evaluation.metrics.overallMarginPct.toFixed(1)}%  ` +
      `Δmargin=${s.delta.marginPctDelta >= 0 ? "+" : ""}${s.delta.marginPctDelta.toFixed(1)}pp  ` +
      `score=${(s.compositeScore * 100).toFixed(0)}/100`,
    );
  }

  // ── 5. Persist & verify ───────────────────────────────────────────────────
  // Create a quote, persist, retrieve summary
  const quote = await prisma.quote.create({
    data: { reference: `SIMDEMO-${Date.now()}`, currency: "USD" },
  });
  await runOptimization({ graph: { ...graph, quoteId: quote.id }, strategyKind: "BALANCED", persist: true, prisma });

  const [summary] = await getScenarioRunSummaries(prisma, [quote.id]);
  if (summary) {
    console.log(`\nPersisted to DB — scenario run id: ${summary.runId}`);
    console.log(`  ${summary.candidatesEvaluated} candidates evaluated, best margin: ${summary.bestMarginPct.toFixed(1)}%`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
