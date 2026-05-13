/**
 * Workflow & Operational Orchestration demo.
 *
 * Walks a quote through the full commercial lifecycle, exercising:
 *   - Workflow initialization (DRAFT)
 *   - Event-driven state advancement (PRICING → REVIEW → APPROVAL → NEGOTIATION → WON → PROCUREMENT → ...)
 *   - Approval system (multi-stage, override tracking)
 *   - Operational risk assessment
 *   - Escalation policy evaluation
 *   - WorkflowInsight (AI readiness)
 *   - Full transition audit history
 *
 * Run with:  npm run workflow:demo
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  initWorkflow,
  processEvent,
  processEvaluationResult,
  manualAdvance,
  submitApprovalDecision,
  getWorkflowStatus,
  getApprovalHistory,
  evaluateApprovalRules,
  getWorkflowHistory,
} from "../src/modules/workflow";
import { assessOperationalRisk } from "../src/modules/workflow";

const SEP = "─".repeat(56);

async function main() {
  console.log("=== Workflow & Operational Orchestration Demo ===\n");

  // ── Setup ──────────────────────────────────────────────────────────────
  const quote = await prisma.quote.create({
    data: { reference: `WF-DEMO-${Date.now()}`, currency: "USD" },
  });
  const qid = quote.id;
  console.log(`Quote: ${quote.reference} (${qid})\n`);

  // ── 1. Initialize workflow ─────────────────────────────────────────────
  console.log(`${SEP}\n1. Init workflow (DRAFT)\n${SEP}`);
  const workflow = await initWorkflow(prisma, qid, {
    quoteId: qid,
    marginPct: 32,
    revenueAmount: 18500,
    customerId: "CUST-DEMO",
    strategyKind: "BALANCED",
    supplierIds: ["A400"],
  });
  console.log(`  State: ${workflow.currentState}  Status: ${workflow.status}`);

  // ── 2. Advance to PRICING (manual) ────────────────────────────────────
  console.log(`\n${SEP}\n2. Manual advance → PRICING\n${SEP}`);
  const r1 = await manualAdvance(prisma, qid, "system", "Initiating pricing");
  printResult(r1.transitionResult.newState, r1.transitionResult.transitionRecord?.reasoning, r1.actionReport);

  // ── 3. Evaluation complete → REVIEW ───────────────────────────────────
  console.log(`\n${SEP}\n3. Evaluation result → REVIEW (margin=32%)\n${SEP}`);
  const r2 = await processEvaluationResult(prisma, qid, {
    overallMarginPct: 32,
    compositeScore: 0.74,
    constraintViolationIds: [],
    initiatedBy: "pricing-engine",
  });
  printResult(r2.transitionResult.newState, r2.transitionResult.transitionRecord?.reasoning, r2.actionReport);

  // ── 4. Check approval rules at current margin ─────────────────────────
  console.log(`\n${SEP}\n4. Approval rule evaluation (margin=32%)\n${SEP}`);
  const approvalEval32 = evaluateApprovalRules({ quoteId: qid, marginPct: 32 });
  console.log(`  Requires approval: ${approvalEval32.requiresApproval}`);
  console.log(`  Reasoning: ${approvalEval32.reasoning}`);

  // ── 5. Simulate negotiation drops margin → APPROVAL ───────────────────
  console.log(`\n${SEP}\n5. Negotiation event drops margin to 18% → APPROVAL\n${SEP}`);
  const r3 = await processEvent(prisma, qid, "quote_negotiated", {
    originalRevenue: 18500,
    negotiatedRevenue: 16200,
    discountRequested: 14,
    discountGranted: 12.4,
    negotiationRound: 1,
    currentMarginPct: 18,
  }, "sales@example.com");
  printResult(r3.transitionResult.newState, r3.transitionResult.transitionRecord?.reasoning, r3.actionReport);

  // Update margin in context and re-evaluate
  const approvalEval18 = evaluateApprovalRules({ quoteId: qid, marginPct: 18, quotedDiscount: 12.4 });
  console.log(`\n  Approval rules at 18% margin:`);
  console.log(`  Requires approval: ${approvalEval18.requiresApproval}`);
  for (const req of approvalEval18.requirements) {
    console.log(`    Stage ${req.stage}: ${req.requiredRole} — ${req.kind} (override: ${req.allowOverride})`);
  }

  // ── 6. Submit Stage 1 approval ────────────────────────────────────────
  console.log(`\n${SEP}\n6. Sales Manager approves (Stage 1)\n${SEP}`);
  const approvals = await getApprovalHistory(prisma, qid);
  const stage1Id = approvals.find((a) => a.stage === 1 && a.status === "PENDING")?.decisionBy;
  if (!stage1Id) {
    // Directly query for pending approval request
    const pending = await prisma.approvalRequest.findFirst({
      where: { quoteId: qid, status: "PENDING", stage: 1 },
    });
    if (pending) {
      const { decisionResult } = await submitApprovalDecision(prisma, qid, {
        approvalRequestId: pending.id,
        decision: "APPROVED",
        decidedBy: "sarah.manager@example.com",
        note: "Reviewed. Margin acceptable for strategic customer.",
      });
      console.log(`  Decision: ${decisionResult.newStatus}  All stages done: ${decisionResult.allStagesComplete}`);
    } else {
      console.log("  (No pending Stage 1 approval found — workflow may already be past APPROVAL)");
    }
  }

  // ── 7. Quote WON ──────────────────────────────────────────────────────
  console.log(`\n${SEP}\n7. quote_won event → WON\n${SEP}`);
  const r5 = await processEvent(prisma, qid, "quote_won", {
    finalRevenue: 16200,
    finalMarginPct: 18,
    finalDiscount: 12.4,
    cycleDays: 22,
    strategy: "BALANCED",
    channel: "DIRECT",
  }, "sales@example.com");
  printResult(r5.transitionResult.newState, r5.transitionResult.transitionRecord?.reasoning, r5.actionReport);

  // ── 8. Advance through operational states ─────────────────────────────
  console.log(`\n${SEP}\n8. Operational lifecycle: WON → PROCUREMENT → LOGISTICS → INSTALLATION\n${SEP}`);
  for (const note of ["Initiating supplier procurement", "Goods dispatched", "Delivery confirmed — scheduling install"]) {
    const r = await manualAdvance(prisma, qid, "ops@example.com", note);
    console.log(`  → ${r.transitionResult.newState ?? "(no transition)"}: ${note}`);
  }

  // ── 9. Installation issue → STALLED ───────────────────────────────────
  console.log(`\n${SEP}\n9. Installation issue → STALLED\n${SEP}`);
  const r6 = await processEvent(prisma, qid, "installation_issue", {
    issueKind: "DEFECTIVE",
    issueDescription: "Motor controller unit DOA",
  });
  printResult(r6.transitionResult.newState, r6.transitionResult.transitionRecord?.reasoning, r6.actionReport);

  // ── 10. Operational risk assessment ───────────────────────────────────
  console.log(`\n${SEP}\n10. Operational risk assessment\n${SEP}`);
  const risk = assessOperationalRisk({
    context: { quoteId: qid, marginPct: 18, operationalRiskScore: 72, supplierIds: ["A400"] },
    supplierRiskFactors: [{
      supplierId: "A400",
      reliabilityScore: 45,
      leadTimeConfidenceMultiplier: 0.72,
      recentDelayRate: 0.35,
      recentIssueRate: 0.12,
      riskLevel: "HIGH",
      note: "35% delay rate, 2 recent issues",
    }],
  });
  console.log(`  Overall risk: ${risk.overallScore}/100 (${risk.level})`);
  console.log(`  Supplier risk: ${risk.supplierRisk}/100`);
  console.log(`  Lead-time risk: ${risk.leadTimeRisk}/100`);
  for (const sig of risk.signals) console.log(`  Signal: ${sig}`);
  console.log(`  Mitigations: ${risk.mitigationActions.join(", ")}`);

  // ── 11. Full workflow status ───────────────────────────────────────────
  console.log(`\n${SEP}\n11. Workflow status & insight\n${SEP}`);
  const status = await getWorkflowStatus(prisma, qid, {
    supplierRiskFactors: [{
      supplierId: "A400",
      reliabilityScore: 45,
      leadTimeConfidenceMultiplier: 0.72,
      recentDelayRate: 0.35,
      recentIssueRate: 0.12,
      riskLevel: "HIGH",
      note: "35% delay rate",
    }],
  });
  if (status) {
    console.log(`  State: ${status.instance.currentState}  Status: ${status.instance.status}`);
    console.log(`  Risk: ${status.operationalRisk.overallScore}/100 (${status.operationalRisk.level})`);
    console.log(`  Insight: ${status.insight.reasoning}`);
    if (status.escalations.length) {
      console.log(`  Escalations (${status.escalations.length}):`);
      for (const e of status.escalations) {
        console.log(`    [${e.riskLevel}] → ${e.escalateTo}: ${e.reason}`);
      }
    }
  }

  // ── 12. Transition history ─────────────────────────────────────────────
  console.log(`\n${SEP}\n12. Transition audit history\n${SEP}`);
  const history = await getWorkflowHistory(prisma, qid);
  for (const h of history) {
    const signals = h.triggerSignals.length ? ` [${h.triggerSignals.join(", ")}]` : "";
    console.log(`  ${h.fromState.padEnd(14)} → ${h.toState.padEnd(14)} | ${h.trigger}${h.triggerSubKind ? `/${h.triggerSubKind}` : ""}${signals}`);
  }

  console.log(`\n  Total transitions: ${history.length}`);
  console.log(`\n✅ Workflow demo completed.`);

  await prisma.$disconnect();
}

function printResult(
  newState: string | undefined,
  reasoning: string | undefined,
  actionReport: import("../src/modules/workflow/types/action.types").ActionExecutionReport | undefined,
) {
  if (newState) {
    console.log(`  → ${newState}`);
    if (reasoning) console.log(`  Reason: ${reasoning}`);
  }
  if (actionReport) {
    console.log(`  Actions: ${actionReport.results.map((r) => `${r.kind}(${r.success ? "✓" : "✗"})`).join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
