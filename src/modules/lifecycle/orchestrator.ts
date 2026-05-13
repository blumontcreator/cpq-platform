/**
 * Commercial Lifecycle Orchestrator.
 *
 * The single entry point for the end-to-end commercial execution flow:
 *
 *   Opportunity → Quote → Pricing → Evaluation → Optimization
 *   → Governance Checks → Workflow Trigger → Snapshot → Events
 *
 * Design:
 *   - Pure coordination: calls domain engines, does NOT re-implement logic
 *   - Explainability: every step appends to `trace[]`
 *   - Immutable audit: snapshots before destructive operations
 *   - Event-driven: emits domain events after state changes
 *   - AI seam: CommercialScores + NegotiationGuidance are structured for LLM
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NotFoundError } from "@/lib/errors";
import { withTransaction } from "@/lib/db/transaction";
import type { QuoteGraph, QuoteNode } from "@/modules/quoting/types/graph.types";
import { runQuoteEngine } from "@/modules/quoting";
import { runOptimization } from "@/modules/simulation";
import { initWorkflow, processEvaluationResult } from "@/modules/workflow";
import type { EvaluationTriggerInput } from "@/modules/workflow/engine/trigger-evaluator";
import { snapshotQuoteGraph } from "@/modules/governance/snapshot/service";
import { createEvent, eventBus } from "@/lib/events";
import { metrics } from "@/lib/observability/metrics";
import { quotingLogger as log } from "@/lib/observability/logger";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type {
  LiveQuoteContext,
  CommercialScores,
  ApprovalRequirement,
  GovernanceCheckResult,
  LifecycleResult,
  CloseOutcomeInput,
  OutcomeResult,
  FeedbackContext,
  QuoteItemRequest,
} from "./types";
import type { NegotiationGuidance } from "@/modules/negotiation/types";
import { buildNegotiationGuidance } from "@/modules/negotiation/service";
import { createRevision } from "@/modules/negotiation/service";
import type { QuoteEvaluation } from "@/modules/quoting/types/evaluation.types";
import type { OptimizationResult } from "@/modules/simulation/types/optimization.types";

// ── Governance thresholds (configurable per environment) ──────────────────

const MARGIN_APPROVAL_THRESHOLD   = 0.25;   // < 25% margin → MARGIN approval
const DISCOUNT_APPROVAL_THRESHOLD = 0.15;   // > 15% discount → DISCOUNT approval
const HIGH_VALUE_THRESHOLD        = 100_000; // > $100k revenue → HIGH_VALUE approval
const STRATEGIC_THRESHOLD         = "STRATEGIC"; // strategic/must-win → STRATEGIC approval

// ── Graph builder ─────────────────────────────────────────────────────────

async function buildGraphFromItems(
  prisma: PrismaClient,
  items: QuoteItemRequest[],
  context: { currency: string; customerId?: string; channel: string; quoteId: string },
): Promise<QuoteGraph> {
  const skus = items.map((i) => i.sku);

  // Single batched query — eliminates N+1 (one query regardless of item count)
  const variants = await prisma.productVariant.findMany({
    where:   { sku: { in: skus } },
    include: { prices: { orderBy: { createdAt: "desc" }, take: 2 } },
  });

  const variantBySku = new Map(variants.map((v) => [v.sku, v]));
  const nodes: QuoteNode[] = [];

  for (const item of items) {
    const variant = variantBySku.get(item.sku);

    // ProductPrice uses `amount` and `priceType` (LIST = list price, COST = cost price)
    const costPrice    = variant?.prices.find((p) => p.priceType === "COST");
    const listPriceRow = variant?.prices.find((p) => p.priceType === "LIST") ?? variant?.prices[0];

    const unitCost  = costPrice ? Number(costPrice.amount) : listPriceRow ? Number(listPriceRow.amount) * 0.65 : 50;
    const listPrice = item.listPriceOverride
      ?? (listPriceRow ? Number(listPriceRow.amount) : unitCost * 1.4);

    const kind = item.isService ? "SERVICE"
      : item.isAccessory ? "ACCESSORY"
      : "PRODUCT_VARIANT";

    nodes.push({
      id:        randomUUID(),
      kind,
      label:     variant?.label ?? item.sku,
      variantSku: item.sku,
      quantity:  item.quantity,
      unitCost,
      unitPrice: listPrice,
      currency:  context.currency,
      isRequired:         !(item.isOptional ?? false),
      isMandatoryService: item.isService ?? false,
      isOptional:         item.isOptional ?? false,
      leadTimeDays: variant?.attributes
        ? ((variant.attributes as Record<string, unknown>)["leadTimeDays"] as number | undefined)
        : undefined,
    });
  }

  return {
    id: randomUUID(),
    quoteId: context.quoteId,
    nodes,
    edges: [],
    context: {
      currency:    context.currency,
      channel:     context.channel as QuoteGraph["context"]["channel"],
      customerId:  context.customerId,
      pricingDate: new Date(),
    },
  };
}

// ── Governance checks ─────────────────────────────────────────────────────

function runGovernanceChecks(params: {
  evaluation: QuoteEvaluation;
  targetMarginPct: number;
  strategicPriority: string;
}): GovernanceCheckResult {
  const { evaluation, targetMarginPct, strategicPriority } = params;
  const m = evaluation.metrics;

  const approvalRequirements: ApprovalRequirement[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  const actualMargin = m.totalRevenue > 0 ? m.totalMargin / m.totalRevenue : 0;
  const discountPct  = m.totalRevenue > 0
    ? 1 - (m.totalRevenue / (m.totalRevenue + Math.abs(m.totalMargin - m.totalRevenue * targetMarginPct)))
    : 0;

  if (actualMargin < MARGIN_APPROVAL_THRESHOLD) {
    approvalRequirements.push({
      kind: "MARGIN",
      reason: `Margin ${(actualMargin * 100).toFixed(1)}% is below the ${(MARGIN_APPROVAL_THRESHOLD * 100)}% threshold`,
      requiredRole: "FINANCE",
      urgent: actualMargin < 0.10,
    });
  }

  if (discountPct > DISCOUNT_APPROVAL_THRESHOLD) {
    approvalRequirements.push({
      kind: "DISCOUNT",
      reason: `Discount ${(discountPct * 100).toFixed(1)}% exceeds the ${(DISCOUNT_APPROVAL_THRESHOLD * 100)}% policy limit`,
      requiredRole: "MANAGER",
      urgent: false,
    });
  }

  if (m.totalRevenue >= HIGH_VALUE_THRESHOLD) {
    approvalRequirements.push({
      kind: "HIGH_VALUE",
      reason: `Deal value $${m.totalRevenue.toFixed(0)} exceeds the $${HIGH_VALUE_THRESHOLD.toLocaleString()} high-value threshold`,
      requiredRole: "MANAGER",
      urgent: false,
    });
  }

  if (strategicPriority === STRATEGIC_THRESHOLD || strategicPriority === "MUST_WIN") {
    approvalRequirements.push({
      kind: "STRATEGIC",
      reason: `Quote is marked as ${strategicPriority} — requires strategic approval sign-off`,
      requiredRole: "ADMIN",
      urgent: strategicPriority === "MUST_WIN",
    });
  }

  if (evaluation.violations.some((v) => v.severity === "ERROR")) {
    blockers.push("Quote has blocking constraint violations — must be resolved before approval");
  }

  evaluation.warnings.forEach((w) => warnings.push(w));

  return {
    passed: blockers.length === 0,
    approvalRequirements,
    warnings,
    blockers,
  };
}

// ── Commercial scores ─────────────────────────────────────────────────────

function computeCommercialScores(
  evaluation: QuoteEvaluation,
  optimization: OptimizationResult,
  targetMarginPct: number,
  strategicPriority: string,
): CommercialScores {
  const m = evaluation.metrics;
  const actualMarginPct = m.totalRevenue > 0 ? m.totalMargin / m.totalRevenue : 0;

  // Profitability: ratio of actual to target margin, capped at 1
  const profitabilityScore = Math.min(1, Math.max(0, actualMarginPct / Math.max(targetMarginPct, 0.01)));

  // Operational risk: inverse of critical path risk
  const leadDays = m.criticalPathLeadTimeDays ?? 0;
  const operationalRiskScore = Math.max(0, 1 - (leadDays / 90));

  // Delivery risk: based on freight and node count complexity
  const freightGroups  = m.freightGroups?.length ?? 1;
  const nodeCount      = evaluation.nodeEvaluations.length;
  const deliveryRiskScore = Math.max(0, 1 - (freightGroups * 0.1) - (nodeCount * 0.03));

  // Strategic fit: based on priority weighting
  const priorityWeight: Record<string, number> = {
    STANDARD: 0.5, IMPORTANT: 0.7, STRATEGIC: 0.9, MUST_WIN: 1.0,
  };
  const strategicFitScore = priorityWeight[strategicPriority] ?? 0.5;

  const overallScore = (
    profitabilityScore  * 0.40 +
    operationalRiskScore * 0.20 +
    deliveryRiskScore   * 0.20 +
    strategicFitScore   * 0.20
  );

  const winProb = optimization.bestScenario?.objectiveScores
    ?.find((s) => s.kind === "MAXIMIZE_WIN_PROBABILITY")?.rawValue ?? 0.5;

  return {
    profitabilityScore:   Number(profitabilityScore.toFixed(3)),
    operationalRiskScore: Number(operationalRiskScore.toFixed(3)),
    deliveryRiskScore:    Number(deliveryRiskScore.toFixed(3)),
    strategicFitScore:    Number(strategicFitScore.toFixed(3)),
    overallScore:         Number(overallScore.toFixed(3)),
    explanations: {
      profitabilityScore:   `Margin ${(actualMarginPct * 100).toFixed(1)}% vs target ${(targetMarginPct * 100).toFixed(1)}%`,
      operationalRiskScore: `Critical path ${leadDays} days`,
      deliveryRiskScore:    `${freightGroups} freight group(s), ${nodeCount} node(s)`,
      strategicFitScore:    `Priority: ${strategicPriority} (win probability: ${(winProb * 100).toFixed(0)}%)`,
      overallScore:         `Weighted composite of all commercial signals`,
    },
  };
}

// ── Main orchestrator ─────────────────────────────────────────────────────

export async function executeCommercialLifecycle(
  context: LiveQuoteContext,
  db?: PrismaClient,
): Promise<LifecycleResult> {
  const prisma = db ?? defaultPrisma;
  const startMs = Date.now();
  const trace: string[] = [];

  const t = (msg: string) => { trace.push(`[${Date.now() - startMs}ms] ${msg}`); };

  log.info("Lifecycle execution started", {
    opportunityId: context.opportunityId,
    ...(context.organizationId ? { organizationId: context.organizationId } : {}),
  });

  // ── 1. Load opportunity ────────────────────────────────────────────────
  t("Loading opportunity");
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: context.opportunityId },
  });
  if (!opportunity) throw new NotFoundError("Opportunity", context.opportunityId, "lifecycle");

  const targetMarginPct = Number(opportunity.targetMarginPct);
  const strategicPriority = opportunity.strategicPriority;

  // ── 2. Get or create quote ─────────────────────────────────────────────
  t("Resolving quote for opportunity");
  let quote = await prisma.quote.findFirst({
    where: { opportunityId: opportunity.id, status: "DRAFT" },
  });

  if (!quote) {
    quote = await prisma.quote.create({
      data: {
        reference:     `Q-${opportunity.reference}`,
        status:        "DRAFT",
        currency:      context.currency ?? "USD",
        ownerId:       context.operatorUserId,
        channel:       opportunity.channel,
        opportunityId: opportunity.id,
      },
    });
    t(`Created new quote ${quote.reference}`);
  } else {
    t(`Reusing existing draft quote ${quote.reference}`);
  }

  // ── 3. Build quote graph ───────────────────────────────────────────────
  t(`Building quote graph from ${context.items.length} item(s)`);
  const graph = await buildGraphFromItems(prisma, context.items, {
    currency:   context.currency ?? "USD",
    customerId: opportunity.customerId,
    channel:    opportunity.channel,
    quoteId:    quote.id,
  });
  t(`Graph has ${graph.nodes.length} nodes`);

  // Persist graph to quote
  await prisma.quote.update({
    where: { id: quote.id },
    data:  { graph: graph as unknown as Prisma.InputJsonValue },
  });

  // ── 4. Run pricing evaluation ──────────────────────────────────────────
  t("Running quote evaluation engine");
  const { evaluation } = await runQuoteEngine({
    graph,
    constraints: [],
    persist:     true,
    prisma,
  });
  t(`Evaluation complete: margin ${(evaluation.metrics.totalMargin / Math.max(evaluation.metrics.totalRevenue, 1) * 100).toFixed(1)}%, confidence ${(evaluation.confidence * 100).toFixed(0)}%`);

  // ── 5. Run optimization ────────────────────────────────────────────────
  t("Running optimization engine (BALANCED strategy)");
  const { result: optimizationResult } = await runOptimization({
    graph,
    strategyKind: "BALANCED",
    persist:      true,
    prisma,
  });
  const bestMargin = optimizationResult.bestScenario?.evaluation?.metrics?.totalMargin ?? 0;
  const bestRevenue = optimizationResult.bestScenario?.evaluation?.metrics?.totalRevenue ?? 1;
  t(`Optimization complete: best margin ${(bestMargin / Math.max(bestRevenue, 1) * 100).toFixed(1)}%`);

  // ── 6. Governance checks ───────────────────────────────────────────────
  t("Running governance checks");
  const governanceCheck = runGovernanceChecks({
    evaluation,
    targetMarginPct,
    strategicPriority,
  });
  t(`Governance: ${governanceCheck.passed ? "passed" : "requires approvals"} (${governanceCheck.approvalRequirements.length} requirements)`);

  // ── 7. Trigger workflow ────────────────────────────────────────────────
  t("Initialising workflow");
  await initWorkflow(prisma, quote.id, {
    quoteId:              quote.id,
    marginPct:            evaluation.metrics.totalRevenue > 0
      ? evaluation.metrics.totalMargin / evaluation.metrics.totalRevenue
      : 0,
    revenueAmount:        evaluation.metrics.totalRevenue,
    evaluationScore:      evaluation.confidence,
    channel:              opportunity.channel,
    customerId:           opportunity.customerId,
    strategyKind:         "BALANCED",
    operationalRiskScore: 50,
    currentState:         "DRAFT",
  });

  const evalInput: EvaluationTriggerInput = {
    overallMarginPct: evaluation.metrics.totalRevenue > 0
      ? evaluation.metrics.totalMargin / evaluation.metrics.totalRevenue
      : 0,
    compositeScore:  evaluation.confidence,
    constraintViolationIds: evaluation.violations
      .filter((v) => v.severity === "ERROR")
      .map((v) => v.constraintId),
  };

  await processEvaluationResult(prisma, quote.id, evalInput);
  t("Workflow triggered from evaluation result");

  // ── 8. Compute commercial scores ───────────────────────────────────────
  t("Computing commercial scores");
  const scores = computeCommercialScores(evaluation, optimizationResult, targetMarginPct, strategicPriority);
  t(`Scores: overall=${scores.overallScore}, profitability=${scores.profitabilityScore}`);

  // ── 9. Build negotiation guidance ─────────────────────────────────────
  t("Building negotiation guidance");
  const totalCost  = evaluation.metrics.totalCost;
  const totalPrice = evaluation.metrics.totalRevenue;
  const winProb    = optimizationResult.bestScenario?.objectiveScores
    ?.find((s) => s.kind === "MAXIMIZE_WIN_PROBABILITY")?.rawValue ?? 0.5;

  const negotiationGuidance: NegotiationGuidance = buildNegotiationGuidance({
    currentPrice:                  totalPrice,
    costBasis:                     totalCost,
    targetMarginPct,
    winProbabilityAtCurrentPrice:  winProb,
    concessionSummary: {
      quoteId: quote.id, totalDiscountRequested: 0, totalDiscountGranted: 0,
      totalValueRequested: 0, totalValueGranted: 0, concessionRatio: 0,
      eventCount: 0, timeline: [], isClosed: false,
    },
    strategicPriority,
  });

  // ── 10. Snapshot state ─────────────────────────────────────────────────
  t("Snapshotting quote state");
  const snap = await snapshotQuoteGraph(prisma, quote.id, graph, {
    createdBy:     context.operatorUserId,
    reason:        "post-lifecycle-execution",
    engineVersion: "1.0.0",
  });

  // Create initial revision
  await createRevision(prisma, {
    quoteId:    quote.id,
    reason:     "INITIAL",
    snapshot:   graph,
    changedBy:  context.operatorUserId,
    changeNote: `Lifecycle executed from opportunity ${opportunity.reference}`,
  });
  t(`Snapshot created: ${snap.id}`);

  // ── 11. Emit domain events ─────────────────────────────────────────────
  t("Emitting domain events");
  await eventBus.emit(
    createEvent("QuoteCreated", quote.id, "Quote", {
      reference: quote.reference,
      currency:  quote.currency,
      ownerId:   quote.ownerId ?? undefined,
      channel:   quote.channel ?? undefined,
    }, {
      userId: context.operatorUserId,
      ...(context.organizationId ? { organizationId: context.organizationId } : {}),
    }),
  );

  await eventBus.emit(
    createEvent("QuoteEvaluated", quote.id, "Quote", {
      evaluationId:         "eval-" + Date.now(),
      totalRevenue:         evaluation.metrics.totalRevenue,
      totalCost:            evaluation.metrics.totalCost,
      overallMarginPct:     evaluation.metrics.totalRevenue > 0
        ? evaluation.metrics.totalMargin / evaluation.metrics.totalRevenue
        : 0,
      nodeCount:            evaluation.nodeEvaluations.length,
      violationCount:       evaluation.violations.length,
      recommendationCount:  evaluation.recommendations.length,
      confidence:           evaluation.confidence,
    }, {
      userId: context.operatorUserId,
      ...(context.organizationId ? { organizationId: context.organizationId } : {}),
    }),
  );

  const durationMs = Date.now() - startMs;
  metrics.recordTiming("lifecycle.execute", durationMs, {
    channel: opportunity.channel,
    priority: strategicPriority,
  });
  metrics.increment("lifecycle.executions");

  t(`Lifecycle complete in ${durationMs}ms`);
  log.info("Lifecycle execution complete", {
    quoteId: quote.id,
    durationMs,
    overallScore: scores.overallScore,
    approvalCount: governanceCheck.approvalRequirements.length,
    ...(context.organizationId ? { organizationId: context.organizationId } : {}),
  });

  return {
    quoteId:              quote.id,
    opportunityId:        opportunity.id,
    evaluation,
    optimizationResult,
    governanceCheck,
    scores,
    negotiationGuidance,
    approvalRequirements: governanceCheck.approvalRequirements,
    snapshotId:           snap.id,
    executedAt:           new Date().toISOString(),
    durationMs,
    trace,
  };
}

// ── Outcome closure + learning feedback ──────────────────────────────────

export async function closeQuoteOutcome(
  input: CloseOutcomeInput,
  db?: PrismaClient,
): Promise<OutcomeResult> {
  const prisma = db ?? defaultPrisma;

  const quote = await prisma.quote.findUnique({
    where:   { id: input.quoteId },
    include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 }, outcome: true },
  });

  if (!quote) throw new NotFoundError("Quote", input.quoteId, "lifecycle");

  const latestEval = quote.evaluations[0]?.evaluation as unknown as QuoteEvaluation | undefined;
  const quotedRevenue    = latestEval?.metrics.totalRevenue   ?? 0;
  const quotedMarginPct  = latestEval
    ? latestEval.metrics.totalMargin / Math.max(latestEval.metrics.totalRevenue, 1)
    : 0;

  // Map PARTIALLY_WON → ACCEPTED for QuoteStatus (not a native status)
  const newStatus = input.outcome === "WON" ? "ACCEPTED"
    : input.outcome === "LOST" ? "REJECTED"
    : input.outcome === "EXPIRED" ? "EXPIRED"
    : "ACCEPTED"; // PARTIALLY_WON

  // Atomic write: quote status + outcome record must succeed together
  const now = new Date();
  const outcome = await withTransaction(prisma, "close-quote-outcome", async (tx) => {
    await tx.quote.update({
      where: { id: input.quoteId },
      data:  { status: newStatus },
    });

    return tx.quoteOutcome.upsert({
      where:  { quoteId: input.quoteId },
      update: {
        outcome:           input.outcome === "PARTIALLY_WON" ? "WON" : input.outcome,
        realizedRevenue:   input.realizedRevenue,
        realizedMarginPct: input.realizedMarginPct,
        realizedDiscount:  input.realizedDiscount,
        lossReason:        input.lossReason,
        competitorPrice:   input.competitorPrice,
        strategy:          input.strategy,
        closedAt:          now,
      },
      create: {
        quoteId:           input.quoteId,
        outcome:           input.outcome === "PARTIALLY_WON" ? "WON" : input.outcome,
        quotedRevenue,
        quotedMarginPct,
        quotedDiscount:    0,
        realizedRevenue:   input.realizedRevenue,
        realizedMarginPct: input.realizedMarginPct,
        realizedDiscount:  input.realizedDiscount,
        lossReason:        input.lossReason,
        competitorPrice:   input.competitorPrice,
        strategy:          input.strategy,
        customerId:        input.customerId,
        quotedAt:          quote.createdAt,
        closedAt:          now,
      },
    });
  });

  // Trigger learning feedback loop
  const feedbackContext: FeedbackContext = {
    quoteId:           input.quoteId,
    outcome:           input.outcome === "PARTIALLY_WON" ? "WON" : input.outcome,
    realizedMarginPct: input.realizedMarginPct,
    realizedRevenue:   input.realizedRevenue,
    realizedDiscount:  input.realizedDiscount,
    quotedMarginPct,
    quotedRevenue,
    quotedDiscount:    0,
    strategy:          input.strategy,
    customerId:        input.customerId,
    lossReason:        input.lossReason,
    competitorPrice:   input.competitorPrice,
    strategicPriority: "STANDARD",
  };

  await triggerLearningFeedback(prisma, feedbackContext);

  const eventsEmitted: string[] = [];
  if (input.outcome === "WON" || input.outcome === "PARTIALLY_WON") {
    await eventBus.emit(
      createEvent("QuoteWon", input.quoteId, "Quote", {
        realizedRevenue:   input.realizedRevenue ?? quotedRevenue,
        realizedMarginPct: input.realizedMarginPct ?? quotedMarginPct,
        quotedMarginPct,
        marginRetained:    input.realizedMarginPct ? input.realizedMarginPct / Math.max(quotedMarginPct, 0.01) : 1,
        strategy:          input.strategy,
        customerId:        input.customerId,
      }, {
        userId: input.operatorUserId,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      }),
    );
    eventsEmitted.push("QuoteWon");
  } else if (input.outcome === "LOST") {
    await eventBus.emit(
      createEvent("QuoteLost", input.quoteId, "Quote", {
        lossReason:        input.lossReason,
        competitorPrice:   input.competitorPrice,
        quotedRevenue,
        quotedMarginPct,
        strategy:          input.strategy,
        customerId:        input.customerId,
      }, {
        userId: input.operatorUserId,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      }),
    );
    eventsEmitted.push("QuoteLost");
  }

  log.info("Quote outcome closed", {
    quoteId: input.quoteId,
    outcome: input.outcome,
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  });

  return {
    outcomeId:              outcome.id,
    quoteId:                input.quoteId,
    outcome:                input.outcome,
    feedbackLoopTriggered:  true,
    intelligenceUpdated:    true,
    eventsEmitted,
  };
}

// ── Learning feedback loop ────────────────────────────────────────────────

async function triggerLearningFeedback(
  prisma: PrismaClient,
  ctx: FeedbackContext,
): Promise<void> {
  const { ingestEvent } = await import("@/modules/intelligence");

  // Ingest commercial outcome event — use the exact payload shapes from event-schema
  const closedAt = new Date();
  const cycleDays = Math.max(1, Math.round(
    (closedAt.getTime() - (Date.now() - 7 * 24 * 60 * 60 * 1000)) / (1000 * 60 * 60 * 24),
  ));

  if (ctx.outcome === "WON") {
    await ingestEvent(prisma, {
      kind:       "quote_won",
      quoteId:    ctx.quoteId,
      customerId: ctx.customerId,
      payload: {
        finalRevenue:   ctx.realizedRevenue  ?? ctx.quotedRevenue,
        finalMarginPct: ctx.realizedMarginPct ?? ctx.quotedMarginPct,
        finalDiscount:  ctx.realizedDiscount  ?? ctx.quotedDiscount,
        cycleDays,
        strategy: ctx.strategy,
        channel:  ctx.channel,
      },
    });
  } else {
    await ingestEvent(prisma, {
      kind:       "quote_lost",
      quoteId:    ctx.quoteId,
      customerId: ctx.customerId,
      payload: {
        quotedRevenue:   ctx.quotedRevenue,
        lossReason:      ctx.lossReason ?? "OTHER",
        competitorPrice: ctx.competitorPrice,
        strategy:        ctx.strategy,
      },
    });
  }

  // Ingest customer behaviour record
  if (ctx.quotedRevenue > 0) {
    await prisma.customerBehaviorRecord.create({
      data: {
        customerId:      ctx.customerId ?? "unknown",
        eventKind:       ctx.outcome,
        originalValue:   ctx.quotedRevenue,
        negotiatedValue: ctx.realizedRevenue ?? ctx.quotedRevenue,
        discountGranted: ctx.realizedDiscount ?? 0,
        quoteId:         ctx.quoteId,
      },
    });
  }

  log.info("Learning feedback loop triggered", { quoteId: ctx.quoteId, outcome: ctx.outcome });
}
