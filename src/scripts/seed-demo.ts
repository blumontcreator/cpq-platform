/**
 * Deterministic demo seed.
 *
 * Creates a stable, reproducible dataset that exercises all platform modules:
 *   - 2 suppliers (A400 Electronics, OmniParts Co.)
 *   - 5 products, 5 variants with realistic pricing
 *   - 3 opportunities (OPEN, QUOTED, WON)
 *   - 3 quotes in various states
 *   - 1 completed WON outcome
 *
 * Designed for:
 *   - CI/CD demo environments
 *   - Screenshot fixtures
 *   - Manual E2E exploration
 *
 * Run: npx tsx src/scripts/seed-demo.ts
 *
 * Safe to re-run: uses find-or-create patterns with DEMO_ prefix to avoid duplicates.
 */
import { prisma } from "@/lib/prisma";
import { rootLogger } from "@/lib/observability/logger";

const log = rootLogger.child("seed");

// Deterministic references — safe to re-run
const DEMO = {
  SUPPLIER_A400_CODE:  "DEMO_A400",
  SUPPLIER_OMNI_CODE:  "DEMO_OMNI",
  QUOTE_DRAFT_REF:     "DEMO-Q-001",
  QUOTE_SENT_REF:      "DEMO-Q-002",
  QUOTE_ACCEPTED_REF:  "DEMO-Q-003",
  OPP_OPEN_REF:        "DEMO-OPP-001",
  OPP_QUOTED_REF:      "DEMO-OPP-002",
  OPP_WON_REF:         "DEMO-OPP-003",
  CUST_ACME:           "DEMO_CUST_ACME",
  CUST_NORDTECH:       "DEMO_CUST_NORDTECH",
  CUST_MEGACORP:       "DEMO_CUST_MEGACORP",
  USER_ALICE:          "DEMO_USER_ALICE",
  USER_BOB:            "DEMO_USER_BOB",
};

async function seedSuppliers() {
  log.info("Seeding suppliers...");

  const a400 = await prisma.supplier.upsert({
    where:  { code: DEMO.SUPPLIER_A400_CODE },
    update: { name: "A400 Electronics B.V." },
    create: {
      code:     DEMO.SUPPLIER_A400_CODE,
      name:     "A400 Electronics B.V.",
      metadata: { country: "NL", currency: "EUR", tier: "preferred", paymentTerms: "NET30" },
    },
  });

  const omni = await prisma.supplier.upsert({
    where:  { code: DEMO.SUPPLIER_OMNI_CODE },
    update: { name: "OmniParts Co." },
    create: {
      code:     DEMO.SUPPLIER_OMNI_CODE,
      name:     "OmniParts Co.",
      metadata: { country: "US", currency: "USD", tier: "approved", paymentTerms: "NET60" },
    },
  });

  log.info("Suppliers seeded", { a400Id: a400.id, omniId: omni.id });
  return { a400, omni };
}

async function seedCatalog(supplierId: string) {
  log.info("Seeding catalog...", { supplierId });

  const products = [
    {
      sku:         "DEMO-CTRL-PRO",
      name:        "Industrial Controller Pro",
      description: "High-precision industrial programmable logic controller",
      cost:        380,
      list:        599,
      attributes:  { leadTimeDays: 14, weight: 2.5, voltage: "24V DC", inputChannels: 32 },
    },
    {
      sku:         "DEMO-SENS-T100",
      name:        "Temperature Sensor T100",
      description: "Industrial-grade PT100 temperature sensor",
      cost:        45,
      list:        89,
      attributes:  { leadTimeDays: 7, accuracy: "0.1C", range: "-200 to 850C" },
    },
    {
      sku:         "DEMO-SENS-P200",
      name:        "Pressure Sensor P200",
      description: "Stainless steel pressure transmitter",
      cost:        120,
      list:        229,
      attributes:  { leadTimeDays: 10, range: "0-400 bar", outputSignal: "4-20mA" },
    },
    {
      sku:         "DEMO-DRIVE-AC",
      name:        "AC Motor Drive",
      description: "Variable frequency drive for AC motors",
      cost:        290,
      list:        449,
      attributes:  { leadTimeDays: 21, powerRange: "0.75-7.5kW", inputVoltage: "400V AC" },
    },
    {
      sku:         "DEMO-CABLE-25M",
      name:        "Industrial Cable 25m",
      description: "Shielded 4-core industrial data cable",
      cost:        35,
      list:        64,
      attributes:  { leadTimeDays: 3, length: "25m", shielding: "braided" },
    },
  ];

  for (const p of products) {
    // Find or create product (no unique on canonicalName — use DEMO suffix as marker)
    let product = await prisma.product.findFirst({
      where: { canonicalName: p.name, description: p.description },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          canonicalName: p.name,
          description:   p.description,
          attributes:    p.attributes,
          active:        true,
        },
      });
    }

    // Upsert variant by composite key (supplierId + supplierSku is unique)
    const variant = await prisma.productVariant.upsert({
      where:  { supplierId_supplierSku: { supplierId, supplierSku: p.sku } },
      update: { label: p.name, attributes: p.attributes, active: true },
      create: {
        productId:   product.id,
        supplierId,
        sku:         p.sku,
        supplierSku: p.sku,
        label:       p.name,
        attributes:  p.attributes,
        active:      true,
      },
    });

    // Delete and recreate prices to ensure fresh values
    await prisma.productPrice.deleteMany({
      where: { variantId: variant.id },
    });
    await prisma.productPrice.createMany({
      data: [
        { variantId: variant.id, priceType: "COST", amount: p.cost, currency: "EUR" },
        { variantId: variant.id, priceType: "LIST", amount: p.list, currency: "EUR" },
      ],
    });
  }

  log.info("Catalog seeded", { products: products.length });
}

async function seedOpportunities() {
  log.info("Seeding opportunities...");

  const open = await prisma.opportunity.upsert({
    where:  { reference: DEMO.OPP_OPEN_REF },
    update: {},
    create: {
      reference:         DEMO.OPP_OPEN_REF,
      customerName:      "Acme Industrial GmbH",
      customerId:        DEMO.CUST_ACME,
      salesOwnerId:      DEMO.USER_ALICE,
      channel:           "DIRECT",
      expectedCloseDate: new Date(Date.now() + 30 * 86400000),
      targetMarginPct:   0.28,
      strategicPriority: "IMPORTANT",
      estimatedRevenue:  45000,
      status:            "OPEN",
      notes:             "Automation upgrade project — Q3 budget confirmed",
    },
  });

  const quoted = await prisma.opportunity.upsert({
    where:  { reference: DEMO.OPP_QUOTED_REF },
    update: {},
    create: {
      reference:         DEMO.OPP_QUOTED_REF,
      customerName:      "NordTech AS",
      customerId:        DEMO.CUST_NORDTECH,
      salesOwnerId:      DEMO.USER_BOB,
      channel:           "PARTNER",
      expectedCloseDate: new Date(Date.now() + 14 * 86400000),
      targetMarginPct:   0.32,
      strategicPriority: "STRATEGIC",
      estimatedRevenue:  120000,
      status:            "QUOTED",
      notes:             "Flagship installation — competitor evaluation in progress",
    },
  });

  const won = await prisma.opportunity.upsert({
    where:  { reference: DEMO.OPP_WON_REF },
    update: {},
    create: {
      reference:         DEMO.OPP_WON_REF,
      customerName:      "MegaCorp Ltd.",
      customerId:        DEMO.CUST_MEGACORP,
      salesOwnerId:      DEMO.USER_ALICE,
      channel:           "DIRECT",
      targetMarginPct:   0.35,
      strategicPriority: "MUST_WIN",
      estimatedRevenue:  250000,
      status:            "WON",
      notes:             "Multi-year framework agreement signed",
    },
  });

  log.info("Opportunities seeded", { open: open.id, quoted: quoted.id, won: won.id });
  return { open, quoted, won };
}

async function seedQuotes(opportunityIds: { open: string; quoted: string; won: string }) {
  log.info("Seeding quotes...");

  const draft = await prisma.quote.upsert({
    where:  { reference: DEMO.QUOTE_DRAFT_REF },
    update: {},
    create: {
      reference:     DEMO.QUOTE_DRAFT_REF,
      currency:      "EUR",
      status:        "DRAFT",
      ownerId:       DEMO.USER_ALICE,
      opportunityId: opportunityIds.open,
    },
  });

  const sent = await prisma.quote.upsert({
    where:  { reference: DEMO.QUOTE_SENT_REF },
    update: {},
    create: {
      reference:     DEMO.QUOTE_SENT_REF,
      currency:      "EUR",
      status:        "SENT",
      ownerId:       DEMO.USER_BOB,
      opportunityId: opportunityIds.quoted,
    },
  });

  const accepted = await prisma.quote.upsert({
    where:  { reference: DEMO.QUOTE_ACCEPTED_REF },
    update: {},
    create: {
      reference:     DEMO.QUOTE_ACCEPTED_REF,
      currency:      "EUR",
      status:        "ACCEPTED",
      ownerId:       DEMO.USER_ALICE,
      opportunityId: opportunityIds.won,
    },
  });

  // Seed a WON outcome for the accepted quote (upsert on unique quoteId)
  await prisma.quoteOutcome.upsert({
    where:  { quoteId: accepted.id },
    update: {
      realizedRevenue:   118000,
      realizedMarginPct: 0.31,
      realizedDiscount:  0.08,
    },
    create: {
      quoteId:           accepted.id,
      outcome:           "WON",
      quotedRevenue:     125000,
      quotedMarginPct:   0.34,
      quotedDiscount:    0.05,
      realizedRevenue:   118000,
      realizedMarginPct: 0.31,
      realizedDiscount:  0.08,
      strategy:          "MARGIN_OPTIMIZED",
      customerId:        DEMO.CUST_MEGACORP,
      quotedAt:          new Date(Date.now() - 30 * 86400000),
      closedAt:          new Date(Date.now() - 3 * 86400000),
    },
  });

  log.info("Quotes seeded", { draftId: draft.id, sentId: sent.id, acceptedId: accepted.id });
}

async function main() {
  log.info("Starting demo seed...");

  const { a400 } = await seedSuppliers();
  await seedCatalog(a400.id);
  const opps = await seedOpportunities();
  await seedQuotes({ open: opps.open.id, quoted: opps.quoted.id, won: opps.won.id });

  const [suppliers, products, variants, quotes, opportunities, outcomes] = await Promise.all([
    prisma.supplier.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.quote.count(),
    prisma.opportunity.count(),
    prisma.quoteOutcome.count(),
  ]);

  console.log("\n✓ Demo seed complete");
  console.log(`  Suppliers:     ${suppliers}`);
  console.log(`  Products:      ${products}`);
  console.log(`  Variants:      ${variants}`);
  console.log(`  Quotes:        ${quotes}`);
  console.log(`  Opportunities: ${opportunities}`);
  console.log(`  Outcomes:      ${outcomes}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
