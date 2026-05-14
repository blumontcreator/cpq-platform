export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import {
  getNegotiationTimeline,
  buildConcessionSummary,
  buildNegotiationGuidance,
} from "@/modules/negotiation";
import { Card, CardBody, CardHeader, StatRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { TracePanel, TraceRow, WarningList } from "@/components/ui/trace-panel";
import { NegotiationEventForm } from "@/components/console/lifecycle-form";
import { WalkthroughHint } from "@/components/console/walkthrough-hint";
import Link from "next/link";
import type { QuoteEvaluation } from "@/modules/quoting/types/evaluation.types";

interface Props { params: Promise<{ quoteId: string }> }

const KIND_COLORS: Record<string, "green" | "red" | "yellow" | "blue" | "zinc"> = {
  ACCEPTANCE: "green",
  REJECTION: "red",
  DISCOUNT_REQUEST: "yellow",
  CUSTOMER_PRICE_REQUEST: "yellow",
  COUNTER_OFFER: "blue",
  SCOPE_CHANGE: "purple" as "zinc",
  EXPIRY_EXTENSION: "zinc",
};

export default async function NegotiatePage({ params }: Props) {
  const { quoteId } = await params;
  const scoped = await requireScopedPrisma();
  const quote = await scoped.quotes.findUnique({
    where:   { id: quoteId },
    include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!quote) notFound();

  const [concessions, timeline] = await Promise.all([
    buildConcessionSummary(scoped.prisma, quoteId),
    getNegotiationTimeline(scoped.prisma, quoteId),
  ]);

  const latestEval = quote.evaluations[0]?.evaluation as unknown as QuoteEvaluation | undefined;
  const totalRevenue = latestEval?.metrics?.totalRevenue ?? 0;
  const totalCost    = latestEval?.metrics?.totalCost    ?? 0;

  // Get opportunity for target margin
  const opportunity = quote.opportunityId
    ? await scoped.opportunities.findUnique({ where: { id: quote.opportunityId } })
    : null;

  const guidance = totalRevenue > 0
    ? buildNegotiationGuidance({
        currentPrice:                 totalRevenue,
        costBasis:                    totalCost,
        targetMarginPct:              opportunity ? Number(opportunity.targetMarginPct) : 0.3,
        winProbabilityAtCurrentPrice: latestEval?.confidence ?? 0.5,
        concessionSummary:            concessions,
        strategicPriority:            opportunity?.strategicPriority ?? "STANDARD",
      })
    : null;

  async function addEventBound(fd: FormData) {
    "use server";
    const { recordNegotiationEventAction } = await import("@/app/(console)/actions/negotiation.actions");
    return recordNegotiationEventAction(quoteId, fd);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Negotiation</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Log customer asks and concessions. Guidance below uses your latest pricing run when available.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Concession summary */}
        <Card>
          <CardHeader label="Concession Metrics" />
          <CardBody>
            <StatRow label="Events" value={concessions.eventCount} />
            <StatRow label="Discount Requested" value={`${(concessions.totalDiscountRequested * 100).toFixed(1)}%`} />
            <StatRow label="Discount Granted" value={`${(concessions.totalDiscountGranted * 100).toFixed(1)}%`} accent={concessions.totalDiscountGranted > 0.1 ? "red" : "green"} />
            <StatRow label="Concession Ratio" value={
              <ConfidenceBar value={concessions.concessionRatio} label={`${(concessions.concessionRatio * 100).toFixed(0)}%`} />
            } />
            <StatRow label="Status" value={
              concessions.isClosed
                ? <Badge variant={concessions.lastEventKind === "ACCEPTANCE" ? "green" : "red"}>
                    {concessions.lastEventKind}
                  </Badge>
                : <Badge variant="yellow">OPEN</Badge>
            } />
          </CardBody>
        </Card>

        {/* Negotiation guidance */}
        {guidance && (
          <Card>
            <CardHeader label="Coaching hints" />
            <CardBody>
              <StatRow label="Current Price" value={`$${guidance.suggestedCounterOffer ? totalRevenue.toFixed(2) : "—"}`} />
              <StatRow label="Suggested Floor" value={`$${guidance.suggestedFloor.toFixed(2)}`} accent="red" />
              <StatRow label="Counter-Offer" value={`$${guidance.suggestedCounterOffer.toFixed(2)}`} accent="blue" />
              <StatRow label="Max Concession" value={`${(guidance.maxConcessionPct * 100).toFixed(1)}%`} accent="yellow" />
              <div className="flex gap-4 mt-2">
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 mb-1">Win Prob @ Current</p>
                  <ConfidenceBar value={guidance.winProbabilityAtCurrentPrice} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 mb-1">Win Prob @ Floor</p>
                  <ConfidenceBar value={guidance.winProbabilityAtFloor} />
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Guidance details */}
      {guidance && (
        <div className="grid grid-cols-2 gap-4">
          <TracePanel label="Tactics" defaultOpen>
            {guidance.tactics.map((t, i) => <TraceRow key={i} label={`T${i + 1}`} value={t} />)}
          </TracePanel>
          <TracePanel label="Risks" defaultOpen>
            <WarningList warnings={guidance.risks} />
          </TracePanel>
        </div>
      )}

      {/* Record event form */}
      {!concessions.isClosed && (
        <Card>
          <CardHeader label="Record Negotiation Event" />
          <CardBody>
            <NegotiationEventForm addEventAction={addEventBound} />
          </CardBody>
        </Card>
      )}

      {!concessions.isClosed && (
        <WalkthroughHint title="Next recommended step">
          When the customer decides, record the result on the{" "}
          <Link href={`/quotes/${quoteId}/outcome`} className="text-blue-400 hover:text-blue-300">
            outcome
          </Link>{" "}
          tab so win/loss history stays accurate.
        </WalkthroughHint>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader label={`Negotiation Timeline (${timeline.length})`} />
        <CardBody>
          {timeline.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No events yet. Add notes as the conversation moves — each entry builds your deal history.
              </p>
          ) : (
            <div className="space-y-2">
              {[...timeline].reverse().map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 p-3 bg-zinc-900 rounded border border-zinc-800">
                  <Badge variant={KIND_COLORS[ev.kind] ?? "zinc"}>{ev.kind.replace(/_/g," ")}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-4 flex-wrap text-xs text-zinc-400">
                      {ev.requestedValue    && <span>Requested: <span className="text-zinc-200">${ev.requestedValue.toFixed(2)}</span></span>}
                      {ev.requestedDiscount && <span>Req. Disc: <span className="text-yellow-400">{(ev.requestedDiscount * 100).toFixed(1)}%</span></span>}
                      {ev.grantedValue      && <span>Granted: <span className="text-green-400">${ev.grantedValue.toFixed(2)}</span></span>}
                      {ev.grantedDiscount   && <span>Disc. Granted: <span className="text-green-400">{(ev.grantedDiscount * 100).toFixed(1)}%</span></span>}
                    </div>
                    {ev.concessionNote && <p className="text-xs text-zinc-500 mt-1">{ev.concessionNote}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-zinc-500">{ev.occurredAt.toLocaleDateString()}</p>
                    {ev.performedBy && <p className="text-xs text-zinc-600">{ev.performedBy}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
