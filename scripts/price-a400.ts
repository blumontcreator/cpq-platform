/**
 * Smoke-test script: price all imported A400 variants using the standard policy.
 *
 * Usage: npm run price:a400
 *
 * Demonstrates:
 *   - policy creation (upsertPricingPolicy)
 *   - supplier cost resolution from ProductPrice.LIST (estimated)
 *   - full cost graph (freight + customs + warehousing + warranty + risk buffer)
 *   - cost-plus strategy @ 42% margin
 *   - attribute-based motorization surcharge rule
 *   - PricingCalculation audit save
 *   - profitability summary query
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  upsertPricingPolicy,
  calculatePrice,
  getProfitabilitySummaries,
  attributeModifierRule,
} from "../src/modules/pricing";
import {
  STANDARD_IMPORT_LAYERS,
  STANDARD_MARGIN_POLICY,
  COST_PLUS_STRATEGY,
} from "../src/modules/pricing/strategies/default-policies";

async function main() {
  // ── 1. Create / update the standard import policy ─────────────────────────
  const policy = await upsertPricingPolicy(prisma, {
    name: "A400 Standard Import Policy",
    description: "Cost-plus @ 42% with standard import cost stack",
    supplierId: (await prisma.supplier.findUnique({ where: { code: "A400" } }))?.id,
    costLayers: STANDARD_IMPORT_LAYERS,
    strategy: COST_PLUS_STRATEGY,
    marginPolicy: STANDARD_MARGIN_POLICY,
  });
  console.info(`[price:a400] Policy: ${policy.name} (${policy.id})`);

  // ── 2. Motorization surcharge rule ────────────────────────────────────────
  const motorizationRule = attributeModifierRule(
    "Motorized Product Surcharge",
    "extracted.motorization.value.motorized",
    true,
    "surcharge_pct",
    12,    // +12% for motorized variants
    30,
  );

  // ── 3. Load all A400 variants ────────────────────────────────────────────
  const variants = await prisma.productVariant.findMany({
    where: {
      supplier: { code: "A400" },
      active: true,
    },
    select: { sku: true, attributes: true },
    take: 50,
  });

  console.info(`[price:a400] Pricing ${variants.length} variant(s)\n`);

  const skus: string[] = [];
  const rows: Array<Record<string, string | number>> = [];

  for (const variant of variants) {
    const { result } = await calculatePrice(prisma, {
      context: {
        variantSku: variant.sku,
        quantity: 1,
        channel: "DIRECT",
        currency: "USD",
        pricingDate: new Date(),
        variantAttributes: variant.attributes as Record<string, unknown> ?? {},
      },
      policyId: policy.id,
      inlineConfig: { rules: [motorizationRule] },
      saveCalculation: true,
    });

    skus.push(variant.sku);
    rows.push({
      sku: variant.sku,
      cost: `$${result.totalCost.toFixed(2)}`,
      floor: `$${result.floorPrice.toFixed(2)}`,
      recommended: `$${result.recommendedPrice.toFixed(2)}`,
      margin: `${result.marginPct.toFixed(1)}%`,
      conf: result.confidence.toFixed(2),
      rules: result.appliedRules.length,
      warns: result.warnings.length,
    });
  }

  console.table(rows);

  // ── 4. Profitability summary ──────────────────────────────────────────────
  console.info("\n[price:a400] Profitability summary (from saved calculations):");
  const summaries = await getProfitabilitySummaries(prisma, skus);
  const below30 = summaries.filter((s) => s.latestMarginPct < 30);
  if (below30.length) {
    console.warn(`[price:a400] ⚠  ${below30.length} variant(s) below 30% margin:`);
    below30.forEach((s) => console.warn(`  ${s.variantSku}: ${s.latestMarginPct.toFixed(1)}%`));
  } else {
    console.info("[price:a400] ✓ All variants ≥ 30% margin");
  }

  const avgMargin =
    summaries.reduce((s, r) => s + r.latestMarginPct, 0) / (summaries.length || 1);
  console.info(`[price:a400] Average margin: ${avgMargin.toFixed(1)}%`);
}

main()
  .catch((e) => {
    console.error("[price:a400] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
