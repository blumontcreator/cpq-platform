/**
 * Harborline demo seed — distributor / importer scenario (dogfood-ready).
 *
 * Seeds:
 *  - Organization + two console users (sign in with matching emails in Supabase)
 *  - Two suppliers, dual-region catalog (automation + fasteners)
 *  - Supplier import runs (realistic file names)
 *  - Opportunities: open, active deal, won account, lost deal
 *  - Quotes linked to opportunities, with graphs + evaluations
 *  - Workflows + approvals (pending, approved, rejected)
 *  - Negotiation timelines
 *  - Quote outcomes: one WON, one LOST
 *
 * Run: npm run demo:seed   (or: npx tsx src/scripts/seed-demo.ts)
 */
import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rootLogger } from "@/lib/observability/logger";

const log = rootLogger.child("seed");

const DEMO = {
  SUPPLIER_BMC_CODE:   "DEMO_BMC",
  SUPPLIER_SCF_CODE:   "DEMO_SCF",
  QUOTE_DRAFT_REF:     "HL-Q-DRAFT-01",
  QUOTE_ACTIVE_REF:    "HL-Q-PACIFIC-ACTIVE",
  QUOTE_WON_REF:       "HL-Q-MEGA-WON",
  QUOTE_LOST_REF:      "HL-Q-RIDGEWAY-LOST",
  OPP_OPEN_REF:        "HL-OPP-BREMER-OPEN",
  OPP_ACTIVE_REF:      "HL-OPP-PACIFIC-QUOTE",
  OPP_WON_REF:         "HL-OPP-MEGA-WON",
  OPP_LOST_REF:        "HL-OPP-RIDGEWAY-LOST",
  CUST_BREMER:         "cust_bremer_hafen",
  CUST_PACIFIC:        "cust_pacific_foods",
  CUST_MEGA:           "cust_mega_process",
  CUST_RIDGEWAY:       "cust_ridgeway_pack",
  ORG_SLUG:            "harborline-demo",
} as const;

function demoGraph(
  quoteId: string,
  lines: Array<{
    sku: string;
    label: string;
    qty: number;
    unitCost: number;
    unitPrice: number;
    currency: string;
  }>,
) {
  return {
    id: `graph-${quoteId.slice(0, 10)}`,
    quoteId,
    nodes: lines.map((l, i) => ({
      id: `node-${i}-${l.sku}`,
      kind: "PRODUCT_VARIANT",
      label: l.label,
      variantSku: l.sku,
      quantity: l.qty,
      unitCost: l.unitCost,
      unitPrice: l.unitPrice,
      currency: l.currency,
      isRequired: true,
      isOptional: false,
      isMandatoryService: false,
    })),
    edges: [] as unknown[],
    context: {
      currency: lines[0]?.currency ?? "EUR",
      channel: "DIRECT",
      pricingDate: new Date().toISOString(),
    },
  };
}

function demoEvaluation(totalRevenue: number, overallMarginPct: number): Prisma.InputJsonValue {
  const totalMargin = totalRevenue * (overallMarginPct / 100);
  const totalCost = totalRevenue - totalMargin;
  return {
    metrics: {
      totalRevenue,
      totalCost,
      totalMargin,
      overallMarginPct,
      marginByKind: {},
      highestMarginNodeId: null,
      lowestMarginNodeId: null,
      overallComplexityScore: 4,
      complexityLevel: "MODERATE",
      criticalPathLeadTimeDays: 18,
      totalInstallationHours: 0,
      freightGroups: [],
    },
    confidence: 0.78,
    nodeEvaluations: [],
    violations: [],
    trace: { steps: [] },
    recommendations: [],
    warnings: [],
  } as unknown as Prisma.InputJsonValue;
}

async function seedOrganizationAndDemoUsers() {
  log.info("Seeding organization and demo users...");

  const org = await prisma.organization.upsert({
    where:  { slug: DEMO.ORG_SLUG },
    update: { name: "Harborline Import Partners" },
    create: {
      slug: DEMO.ORG_SLUG,
      name: "Harborline Import Partners",
    },
  });

  const alex = await prisma.user.upsert({
    where:  { email: "alex.mercado@harborline.demo" },
    update: { name: "Alex Mercado", role: "SALES" },
    create: {
      email: "alex.mercado@harborline.demo",
      name:  "Alex Mercado",
      role:  "SALES",
    },
  });

  const jordan = await prisma.user.upsert({
    where:  { email: "jordan.oki@harborline.demo" },
    update: { name: "Jordan Oki", role: "MANAGER" },
    create: {
      email: "jordan.oki@harborline.demo",
      name:  "Jordan Oki",
      role:  "MANAGER",
    },
  });

  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: alex.id, organizationId: org.id } },
    update: { role: "ADMIN" },
    create: {
      userId: alex.id,
      organizationId: org.id,
      role:   "ADMIN",
    },
  });

  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: jordan.id, organizationId: org.id } },
    update: {},
    create: {
      userId: jordan.id,
      organizationId: org.id,
      role:   "MEMBER",
    },
  });

  return { org, alex, jordan };
}

async function seedSuppliers() {
  const bmc = await prisma.supplier.upsert({
    where:  { code: DEMO.SUPPLIER_BMC_CODE },
    update: {
      name: "Baltic Motion Controls Oy",
      metadata: { region: "EU", focus: "VFDs & HMI", incoterms: "FOB Tallinn" },
    },
    create: {
      code: DEMO.SUPPLIER_BMC_CODE,
      name: "Baltic Motion Controls Oy",
      metadata: { region: "EU", focus: "VFDs & HMI", incoterms: "FOB Tallinn" },
    },
  });

  const scf = await prisma.supplier.upsert({
    where:  { code: DEMO.SUPPLIER_SCF_CODE },
    update: {
      name: "SunCoast Fasteners LLC",
      metadata: { region: "US", focus: "Stainless MRO hardware", incoterms: "EXW Miami" },
    },
    create: {
      code: DEMO.SUPPLIER_SCF_CODE,
      name: "SunCoast Fasteners LLC",
      metadata: { region: "US", focus: "Stainless MRO hardware", incoterms: "EXW Miami" },
    },
  });

  return { bmc, scf };
}

type CatRow = {
  sku: string;
  name: string;
  description: string;
  cost: number;
  list: number;
  currency: string;
  attributes: Record<string, unknown>;
};

async function upsertProductVariantWithPrices(supplierId: string, p: CatRow) {
  let product = await prisma.product.findFirst({
    where: { canonicalName: p.name },
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        canonicalName: p.name,
        description:   p.description,
        attributes:    p.attributes as Prisma.InputJsonValue,
        active:        true,
      },
    });
  }

  const variant = await prisma.productVariant.upsert({
    where:  { supplierId_supplierSku: { supplierId, supplierSku: p.sku } },
    update: { label: p.name, attributes: p.attributes as Prisma.InputJsonValue, active: true, sku: p.sku },
    create: {
      productId:   product.id,
      supplierId,
      sku:         p.sku,
      supplierSku: p.sku,
      label:       p.name,
      attributes:  p.attributes as Prisma.InputJsonValue,
      active:      true,
    },
  });

  await prisma.productPrice.deleteMany({ where: { variantId: variant.id } });
  await prisma.productPrice.createMany({
    data: [
      { variantId: variant.id, priceType: "COST", amount: p.cost, currency: p.currency },
      { variantId: variant.id, priceType: "LIST", amount: p.list, currency: p.currency },
    ],
  });
}

async function seedCatalogBmc(supplierId: string) {
  const rows: CatRow[] = [
    {
      sku: "BMC-VFD-075-3P",
      name: "VFD 0.75 kW / 400 V three-phase",
      description: "Variable-frequency drive for conveyor lines (Harborline SKU)",
      cost: 268,
      list: 419,
      currency: "EUR",
      attributes: { leadTimeDays: 21, powerKw: 0.75, voltage: "400V 3ph" },
    },
    {
      sku: "BMC-HMI-07-W",
      name: '7" resistive HMI panel, web-enabled',
      description: "Operator panel for packing hall washdown environments",
      cost: 312,
      list: 489,
      currency: "EUR",
      attributes: { leadTimeDays: 14, ipRating: "IP65", diagonalIn: 7 },
    },
    {
      sku: "BMC-IO-DI16",
      name: "Digital input module — 16 channel",
      description: "24 V DC sinking inputs, DIN mount",
      cost: 118,
      list: 195,
      currency: "EUR",
      attributes: { leadTimeDays: 10, channels: 16 },
    },
    {
      sku: "BMC-CBL-PROF-15M",
      name: "Profibus DP cable 15 m, shielded",
      description: "Industrial fieldbus spool for Baltic Motion kitting",
      cost: 42,
      list: 74,
      currency: "EUR",
      attributes: { leadTimeDays: 5, lengthM: 15 },
    },
  ];
  for (const p of rows) await upsertProductVariantWithPrices(supplierId, p);
}

async function seedCatalogScf(supplierId: string) {
  const rows: CatRow[] = [
    {
      sku: "SCF-SS-M12X40-A4-100",
      name: "M12×40 A4-80 hex cap screw (100 pk)",
      description: "A4 stainless hex bolts — food-grade packaging lines",
      cost: 38,
      list: 62,
      currency: "USD",
      attributes: { leadTimeDays: 4, material: "A4-80", qtyPerPack: 100 },
    },
    {
      sku: "SCF-WASH-M12-DIN-50",
      name: "M12 flat washer DIN 125 A4 (50 pk)",
      description: "Seaside humidity spec washers",
      cost: 12,
      list: 22,
      currency: "USD",
      attributes: { leadTimeDays: 4, standard: "DIN 125" },
    },
    {
      sku: "SCF-NYL-NUT-M12-100",
      name: "M12 nylon lock nut A4 (100 pk)",
      description: "Vibration-safe nut for export crating",
      cost: 24,
      list: 41,
      currency: "USD",
      attributes: { leadTimeDays: 5, locking: "nylon insert" },
    },
  ];
  for (const p of rows) await upsertProductVariantWithPrices(supplierId, p);
}

async function seedImportRuns(bmcId: string) {
  let v = await prisma.supplierImport.findFirst({
    where: { supplierId: bmcId, sourceKey: "bmc_pricelist_2026w08.xlsx" },
  });
  if (!v) {
    v = await prisma.supplierImport.create({
      data: {
        supplierId: bmcId,
        version:    1,
        sourceKey:  "bmc_pricelist_2026w08.xlsx",
        sourceKind: "XLSX",
        status:     "COMPLETED",
        rowCount:   428,
        parsedCount: 420,
        errorCount: 8,
        startedAt:  new Date(Date.now() - 9 * 86400000),
        completedAt: new Date(Date.now() - 9 * 86400000 + 3600000),
      },
    });
  }
  let v2 = await prisma.supplierImport.findFirst({
    where: { supplierId: bmcId, sourceKey: "bmc_pricelist_2026w09.xlsx" },
  });
  if (!v2) {
    v2 = await prisma.supplierImport.create({
      data: {
        supplierId: bmcId,
        version:    2,
        sourceKey:  "bmc_pricelist_2026w09.xlsx",
        sourceKind: "XLSX",
        status:     "COMPLETED",
        rowCount:   431,
        parsedCount: 429,
        errorCount: 2,
        startedAt:  new Date(Date.now() - 2 * 86400000),
        completedAt: new Date(Date.now() - 2 * 86400000 + 2400000),
      },
    });
  }
  return { older: v, newer: v2 };
}

async function seedOpportunities(alexId: string, jordanId: string) {
  const open = await prisma.opportunity.upsert({
    where:  { reference: DEMO.OPP_OPEN_REF },
    update: { salesOwnerId: alexId },
    create: {
      reference:         DEMO.OPP_OPEN_REF,
      customerName:      "Bremer Hafen Logistics",
      customerId:        DEMO.CUST_BREMER,
      salesOwnerId:      alexId,
      targetMarginPct:   0.28,
      strategicPriority: "IMPORTANT",
      estimatedRevenue:  52000,
      status:            "OPEN",
      notes:             "Cold-store expansion — waiting on capex sign-off",
      channel:           "DIRECT",
    },
  });

  const active = await prisma.opportunity.upsert({
    where:  { reference: DEMO.OPP_ACTIVE_REF },
    update: { salesOwnerId: jordanId },
    create: {
      reference:         DEMO.OPP_ACTIVE_REF,
      customerName:      "Pacific Foods Co-op",
      customerId:        DEMO.CUST_PACIFIC,
      salesOwnerId:      jordanId,
      channel:           "PARTNER",
      expectedCloseDate: new Date(Date.now() + 12 * 86400000),
      targetMarginPct:   0.3,
      strategicPriority: "STRATEGIC",
      estimatedRevenue:  138000,
      status:            "QUOTED",
      notes:             "Blend line retrofit — comparing us vs. Yokogawa bundle",
    },
  });

  const won = await prisma.opportunity.upsert({
    where:  { reference: DEMO.OPP_WON_REF },
    update: { salesOwnerId: alexId },
    create: {
      reference:         DEMO.OPP_WON_REF,
      customerName:      "MegaProcess Ingredients Ltd",
      customerId:        DEMO.CUST_MEGA,
      salesOwnerId:      alexId,
      channel:           "DIRECT",
      targetMarginPct:   0.34,
      strategicPriority: "MUST_WIN",
      estimatedRevenue:  210000,
      status:            "WON",
      notes:             "Framework through 2027 — starter kit landed Q1",
    },
  });

  const lost = await prisma.opportunity.upsert({
    where:  { reference: DEMO.OPP_LOST_REF },
    update: { salesOwnerId: alexId },
    create: {
      reference:         DEMO.OPP_LOST_REF,
      customerName:      "Ridgeway Packaging Group",
      customerId:        DEMO.CUST_RIDGEWAY,
      salesOwnerId:      alexId,
      channel:           "DISTRIBUTOR",
      targetMarginPct:   0.27,
      strategicPriority: "STANDARD",
      estimatedRevenue:  78000,
      status:            "LOST",
      notes:             "Lost on landed cost vs. regional integrator",
    },
  });

  return { open, active, won, lost };
}

async function replaceEval(quoteId: string, evaluation: Prisma.InputJsonValue) {
  await prisma.quoteEvaluationRecord.deleteMany({ where: { quoteId } });
  await prisma.quoteEvaluationRecord.create({
    data: { quoteId, evaluation },
  });
}

async function seedWorkflowAndRelations(
  quoteId: string,
  state: string,
  approvals: Array<{
    stage: number;
    kind: string;
    requiredRole: string;
    status: string;
    decisionBy?: string;
    decisionNote?: string;
  }>,
  negotiations: Array<{
    kind: string;
    performedBy?: string;
    requestedDiscount?: number;
    grantedDiscount?: number;
    concessionNote?: string;
    daysAgo: number;
  }>,
) {
  const ctx: Prisma.InputJsonValue = {
    quoteId,
    marginPct:        0.29,
    revenueAmount:    118900,
    channel:          "DIRECT",
    customerId:       DEMO.CUST_PACIFIC,
    evaluationScore:  0.76,
    operationalRiskScore: 42,
  } as unknown as Prisma.InputJsonValue;

  const wf = await prisma.workflowInstance.upsert({
    where:  { quoteId },
    update: { currentState: state, context: ctx },
    create: {
      quoteId,
      currentState: state,
      status:       "ACTIVE",
      context:      ctx,
      history:      [] as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.approvalRequest.deleteMany({ where: { workflowId: wf.id } });
  for (const a of approvals) {
    await prisma.approvalRequest.create({
      data: {
        workflowId:   wf.id,
        quoteId,
        stage:        a.stage,
        kind:         a.kind,
        requiredRole: a.requiredRole,
        status:       a.status,
        context:      {} as Prisma.InputJsonValue,
        requestedBy:  "jordan.oki@harborline.demo",
        decisionBy:   a.decisionBy,
        decisionAt:   a.decisionBy ? new Date(Date.now() - 86400000) : null,
        decisionNote: a.decisionNote,
      },
    });
  }

  await prisma.negotiationEvent.deleteMany({ where: { quoteId } });
  for (const n of negotiations) {
    await prisma.negotiationEvent.create({
      data: {
        quoteId,
        kind:              n.kind,
        performedBy:       n.performedBy,
        requestedDiscount: n.requestedDiscount,
        grantedDiscount:   n.grantedDiscount,
        concessionNote:    n.concessionNote,
        occurredAt:        new Date(Date.now() - n.daysAgo * 86400000),
      },
    });
  }

  return wf.id;
}

async function seedQuotesAndOutcomes(
  opps: { open: { id: string }; active: { id: string }; won: { id: string }; lost: { id: string } },
  alexId: string,
  jordanId: string,
) {
  const g1 = demoGraph("draft-placeholder", [
    {
      sku: "BMC-VFD-075-3P",
      label: "VFD 0.75 kW / 400 V three-phase",
      qty: 2,
      unitCost: 268,
      unitPrice: 419,
      currency: "EUR",
    },
    {
      sku: "BMC-CBL-PROF-15M",
      label: "Profibus DP cable 15 m, shielded",
      qty: 4,
      unitCost: 42,
      unitPrice: 74,
      currency: "EUR",
    },
  ]);

  const draft = await prisma.quote.upsert({
    where:  { reference: DEMO.QUOTE_DRAFT_REF },
    update: {
      ownerId: alexId,
      opportunityId: opps.open.id,
      channel: "DIRECT",
      graph: g1 as unknown as Prisma.InputJsonValue,
    },
    create: {
      reference:      DEMO.QUOTE_DRAFT_REF,
      currency:       "EUR",
      status:         "DRAFT",
      ownerId:        alexId,
      opportunityId:  opps.open.id,
      channel:        "DIRECT",
      graph:          g1 as unknown as Prisma.InputJsonValue,
    },
  });

  const g1b = demoGraph(draft.id, [
    {
      sku: "BMC-VFD-075-3P",
      label: "VFD 0.75 kW / 400 V three-phase",
      qty: 2,
      unitCost: 268,
      unitPrice: 419,
      currency: "EUR",
    },
    {
      sku: "BMC-CBL-PROF-15M",
      label: "Profibus DP cable 15 m, shielded",
      qty: 4,
      unitCost: 42,
      unitPrice: 74,
      currency: "EUR",
    },
  ]);
  await prisma.quote.update({
    where: { id: draft.id },
    data:  { graph: g1b as unknown as Prisma.InputJsonValue },
  });
  await replaceEval(draft.id, demoEvaluation(1680, 31.2));
  await seedWorkflowAndRelations(
    draft.id,
    "DRAFT",
    [],
    [
      {
        kind: "CUSTOMER_PRICE_REQUEST",
        performedBy: "buyer@bremer-hafen.de",
        requestedDiscount: 0.05,
        concessionNote: "Asked for 5% shelving allowance vs. last project",
        daysAgo: 3,
      },
    ],
  );

  const g2 = demoGraph("sent-placeholder", [
    {
      sku: "BMC-HMI-07-W",
      label: '7" resistive HMI panel, web-enabled',
      qty: 3,
      unitCost: 312,
      unitPrice: 489,
      currency: "EUR",
    },
    {
      sku: "SCF-SS-M12X40-A4-100",
      label: "M12×40 A4-80 hex cap screw (100 pk)",
      qty: 6,
      unitCost: 38,
      unitPrice: 62,
      currency: "USD",
    },
  ]);

  const activeQuote = await prisma.quote.upsert({
    where:  { reference: DEMO.QUOTE_ACTIVE_REF },
    update: {
      ownerId: jordanId,
      opportunityId: opps.active.id,
      graph: g2 as unknown as Prisma.InputJsonValue,
    },
    create: {
      reference:     DEMO.QUOTE_ACTIVE_REF,
      currency:      "EUR",
      status:        "SENT",
      ownerId:       jordanId,
      opportunityId: opps.active.id,
      channel:       "PARTNER",
      graph:         g2 as unknown as Prisma.InputJsonValue,
    },
  });
  const g2b = demoGraph(activeQuote.id, [
    {
      sku: "BMC-HMI-07-W",
      label: '7" resistive HMI panel, web-enabled',
      qty: 3,
      unitCost: 312,
      unitPrice: 489,
      currency: "EUR",
    },
    {
      sku: "SCF-SS-M12X40-A4-100",
      label: "M12×40 A4-80 hex cap screw (100 pk)",
      qty: 6,
      unitCost: 38,
      unitPrice: 62,
      currency: "USD",
    },
  ]);
  await prisma.quote.update({
    where: { id: activeQuote.id },
    data:  { graph: g2b as unknown as Prisma.InputJsonValue },
  });
  await replaceEval(activeQuote.id, demoEvaluation(184200, 28.4));
  await seedWorkflowAndRelations(
    activeQuote.id,
    "APPROVAL",
    [
      {
        stage: 1,
        kind: "MARGIN",
        requiredRole: "FINANCE",
        status: "PENDING",
      },
      {
        stage: 2,
        kind: "DISCOUNT",
        requiredRole: "MANAGER",
        status: "APPROVED",
        decisionBy: "jordan.oki@harborline.demo",
        decisionNote: "Discount within playbook for strategic account",
      },
    ],
    [
      {
        kind: "DISCOUNT_REQUEST",
        performedBy: "procurement@pacificfoods.coop",
        requestedDiscount: 0.12,
        concessionNote: "Requested 12% on HMI bundle to match incumbent",
        daysAgo: 5,
      },
      {
        kind: "COUNTER_OFFER",
        performedBy: "jordan.oki@harborline.demo",
        grantedDiscount: 0.08,
        concessionNote: "Met halfway — 8% plus extended warranty tier",
        daysAgo: 4,
      },
    ],
  );

  const g3 = demoGraph("won-placeholder", [
    {
      sku: "BMC-IO-DI16",
      label: "Digital input module — 16 channel",
      qty: 8,
      unitCost: 118,
      unitPrice: 195,
      currency: "EUR",
    },
  ]);

  const wonQuote = await prisma.quote.upsert({
    where:  { reference: DEMO.QUOTE_WON_REF },
    update: {
      ownerId: alexId,
      opportunityId: opps.won.id,
      graph: g3 as unknown as Prisma.InputJsonValue,
    },
    create: {
      reference:     DEMO.QUOTE_WON_REF,
      currency:      "EUR",
      status:        "ACCEPTED",
      ownerId:       alexId,
      opportunityId: opps.won.id,
      channel:       "DIRECT",
      graph:         g3 as unknown as Prisma.InputJsonValue,
    },
  });
  const g3b = demoGraph(wonQuote.id, [
    {
      sku: "BMC-IO-DI16",
      label: "Digital input module — 16 channel",
      qty: 8,
      unitCost: 118,
      unitPrice: 195,
      currency: "EUR",
    },
  ]);
  await prisma.quote.update({
    where: { id: wonQuote.id },
    data:  { graph: g3b as unknown as Prisma.InputJsonValue },
  });
  await replaceEval(wonQuote.id, demoEvaluation(97500, 33.1));
  await seedWorkflowAndRelations(
    wonQuote.id,
    "COMPLETED",
    [
      {
        stage: 1,
        kind: "HIGH_VALUE",
        requiredRole: "MANAGER",
        status: "APPROVED",
        decisionBy: "jordan.oki@harborline.demo",
        decisionNote: "Within risk appetite",
      },
    ],
    [
      {
        kind: "ACCEPTANCE",
        performedBy: "cto@megaprocess.uk",
        concessionNote: "PO issued under frame agreement HL-2026-014",
        daysAgo: 12,
      },
    ],
  );

  await prisma.quoteOutcome.upsert({
    where:  { quoteId: wonQuote.id },
    update: {
      realizedRevenue:   94800,
      realizedMarginPct: 0.305,
      realizedDiscount:  0.06,
    },
    create: {
      quoteId:           wonQuote.id,
      outcome:           "WON",
      quotedRevenue:     97500,
      quotedMarginPct:   0.331,
      quotedDiscount:    0.04,
      realizedRevenue:   94800,
      realizedMarginPct: 0.305,
      realizedDiscount:  0.06,
      strategy:          "balanced_margin",
      customerId:        DEMO.CUST_MEGA,
      quotedAt:          new Date(Date.now() - 45 * 86400000),
      closedAt:          new Date(Date.now() - 10 * 86400000),
    },
  });

  const g4 = demoGraph("lost-placeholder", [
    {
      sku: "SCF-WASH-M12-DIN-50",
      label: "M12 flat washer DIN 125 A4 (50 pk)",
      qty: 40,
      unitCost: 12,
      unitPrice: 22,
      currency: "USD",
    },
  ]);

  const lostQuote = await prisma.quote.upsert({
    where:  { reference: DEMO.QUOTE_LOST_REF },
    update: {
      ownerId: alexId,
      opportunityId: opps.lost.id,
      graph: g4 as unknown as Prisma.InputJsonValue,
    },
    create: {
      reference:     DEMO.QUOTE_LOST_REF,
      currency:      "USD",
      status:        "REJECTED",
      ownerId:       alexId,
      opportunityId: opps.lost.id,
      channel:       "DISTRIBUTOR",
      graph:         g4 as unknown as Prisma.InputJsonValue,
    },
  });
  const g4b = demoGraph(lostQuote.id, [
    {
      sku: "SCF-WASH-M12-DIN-50",
      label: "M12 flat washer DIN 125 A4 (50 pk)",
      qty: 40,
      unitCost: 12,
      unitPrice: 22,
      currency: "USD",
    },
  ]);
  await prisma.quote.update({
    where: { id: lostQuote.id },
    data:  { graph: g4b as unknown as Prisma.InputJsonValue },
  });
  await replaceEval(lostQuote.id, demoEvaluation(11800, 24.2));
  await seedWorkflowAndRelations(
    lostQuote.id,
    "CANCELLED",
    [
      {
        stage: 1,
        kind: "MARGIN",
        requiredRole: "FINANCE",
        status: "REJECTED",
        decisionBy: "finance@harborline.demo",
        decisionNote: "Could not approve margin after counter",
      },
    ],
    [
      {
        kind: "DISCOUNT_REQUEST",
        performedBy: "buyer@ridgeway-pack.com",
        requestedDiscount: 0.18,
        concessionNote: "Needed 18% to match Southeast crate supplier",
        daysAgo: 20,
      },
      {
        kind: "REJECTION",
        performedBy: "buyer@ridgeway-pack.com",
        concessionNote: "Awarded to Coastal MRO bundle",
        daysAgo: 8,
      },
    ],
  );

  await prisma.quoteOutcome.upsert({
    where:  { quoteId: lostQuote.id },
    update: {
      lossReason: "Competitor landed cost",
    },
    create: {
      quoteId:           lostQuote.id,
      outcome:           "LOST",
      quotedRevenue:     11800,
      quotedMarginPct:   0.242,
      quotedDiscount:    0.09,
      realizedRevenue:   null,
      realizedMarginPct: null,
      lossReason:        "Competitor landed cost — regional integrator undercut by 6%",
      competitorPrice:   10650,
      customerId:        DEMO.CUST_RIDGEWAY,
      quotedAt:          new Date(Date.now() - 25 * 86400000),
      closedAt:          new Date(Date.now() - 7 * 86400000),
    },
  });

  return { draft, activeQuote, wonQuote, lostQuote };
}

async function main() {
  log.info("Starting Harborline demo seed...");

  const { alex, jordan } = await seedOrganizationAndDemoUsers();
  const { bmc, scf } = await seedSuppliers();
  await seedCatalogBmc(bmc.id);
  await seedCatalogScf(scf.id);
  await seedImportRuns(bmc.id);
  const opps = await seedOpportunities(alex.id, jordan.id);
  await seedQuotesAndOutcomes(opps, alex.id, jordan.id);

  const [approvals, negs, outcomes, imports] = await Promise.all([
    prisma.approvalRequest.count(),
    prisma.negotiationEvent.count(),
    prisma.quoteOutcome.count(),
    prisma.supplierImport.count(),
  ]);

  console.log("\n✓ Demo seed complete — Harborline Import Partners");
  console.log(`  Supplier import runs: ${imports}`);
  console.log(`  Approval rows:        ${approvals}`);
  console.log(`  Negotiation events:   ${negs}`);
  console.log(`  Quote outcomes:       ${outcomes}`);
  console.log("\n  Sign in (Supabase) with users that match these Prisma emails to see org data:");
  console.log("    • alex.mercado@harborline.demo");
  console.log("    • jordan.oki@harborline.demo");
  console.log("  Create the same accounts in Supabase Auth if they do not exist yet.\n");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
