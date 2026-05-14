export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import { Card, CardBody, CardHeader, StatRow } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import { CloseOutcomeForm } from "@/components/console/lifecycle-form";
import Link from "next/link";
import type { QuoteEvaluation } from "@/modules/quoting/types/evaluation.types";

interface Props { params: Promise<{ quoteId: string }> }

export default async function OutcomePage({ params }: Props) {
  const { quoteId } = await params;
  const scoped = await requireScopedPrisma();
  const quote = await scoped.quotes.findUnique({
    where:   { id: quoteId },
    include: {
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
      outcome:     true,
      opportunity: true,
    },
  });
  if (!quote) notFound();

  const latestEval = quote.evaluations[0]?.evaluation as unknown as QuoteEvaluation | undefined;
  const metrics    = latestEval?.metrics;
  const quotedMarginPct = metrics
    ? (metrics.totalMargin / Math.max(metrics.totalRevenue, 1))
    : null;

  async function closeBound(fd: FormData) {
    "use server";
    const { closeOutcomeAction } = await import("@/app/(console)/actions/negotiation.actions");
    return closeOutcomeAction(quoteId, fd);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Outcome</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Compare what you quoted with what happened commercially. This feeds future pricing guidance.
          </p>
        </div>
        <Badge variant={statusBadge(quote.status)}>{quote.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Quoted values */}
        <Card>
          <CardHeader label="Quoted Values" />
          <CardBody>
            {metrics ? (
              <>
                <StatRow label="Total Revenue" value={`$${metrics.totalRevenue.toFixed(2)}`} accent="blue" />
                <StatRow label="Total Cost" value={`$${metrics.totalCost.toFixed(2)}`} />
                <StatRow label="Gross Margin" value={`$${metrics.totalMargin.toFixed(2)}`} accent="green" />
                {quotedMarginPct !== null && (
                  <StatRow label="Margin %" value={`${(quotedMarginPct * 100).toFixed(1)}%`}
                    accent={quotedMarginPct >= 0.3 ? "green" : quotedMarginPct >= 0.15 ? "yellow" : "red"} />
                )}
                <StatRow label="Nodes" value={latestEval?.nodeEvaluations?.length ?? "—"} />
                <StatRow label="Confidence" value={`${((latestEval?.confidence ?? 0) * 100).toFixed(0)}%`} />
              </>
            ) : (
              <p className="text-sm text-zinc-500">No evaluation on record.</p>
            )}
          </CardBody>
        </Card>

        {/* Realized outcome (if closed) */}
        {quote.outcome ? (
          <Card>
            <CardHeader label="Realized Outcome" actions={
              <Badge variant={
                quote.outcome.outcome === "WON" ? "green"
                  : quote.outcome.outcome === "LOST" ? "red"
                  : "zinc"
              }>{quote.outcome.outcome}</Badge>
            } />
            <CardBody>
              {quote.outcome.realizedRevenue && (
                <StatRow label="Realized Revenue"
                  value={`$${Number(quote.outcome.realizedRevenue).toFixed(2)}`}
                  accent="blue" />
              )}
              {quote.outcome.realizedMarginPct && (
                <StatRow label="Realized Margin"
                  value={`${(Number(quote.outcome.realizedMarginPct) * 100).toFixed(1)}%`}
                  accent={Number(quote.outcome.realizedMarginPct) >= 0.3 ? "green" : "yellow"} />
              )}
              {quote.outcome.realizedDiscount && (
                <StatRow label="Discount Granted"
                  value={`${(Number(quote.outcome.realizedDiscount) * 100).toFixed(1)}%`}
                  accent="yellow" />
              )}
              {quote.outcome.closedAt && (
                <StatRow label="Closed" value={quote.outcome.closedAt.toLocaleDateString()} />
              )}
              {quote.outcome.lossReason && (
                <StatRow label="Loss Reason" value={quote.outcome.lossReason} mono={false} accent="red" />
              )}
              {quote.outcome.competitorPrice && (
                <StatRow label="Competitor Price"
                  value={`$${Number(quote.outcome.competitorPrice).toFixed(2)}`} />
              )}
              {/* Margin delta */}
              {quotedMarginPct !== null && quote.outcome.realizedMarginPct && (
                <StatRow
                  label="Margin Delta"
                  value={`${((Number(quote.outcome.realizedMarginPct) - quotedMarginPct) * 100).toFixed(1)}pp`}
                  accent={Number(quote.outcome.realizedMarginPct) >= quotedMarginPct ? "green" : "red"}
                />
              )}
              <p className="text-xs text-zinc-600 mt-3 italic">
                Reported outcomes improve forecasts and playbook suggestions over time.
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader label="Close Outcome" />
            <CardBody>
              <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
                When the customer decides, record the result here so reporting and guidance stay accurate.
              </p>
              <CloseOutcomeForm closeAction={closeBound} />
            </CardBody>
          </Card>
        )}
      </div>

      {/* Opportunity link */}
      {quote.opportunity && (
        <Card>
          <CardHeader label="Opportunity" />
          <CardBody>
            <StatRow label="Reference" value={
              <Link href={`/opportunities/${quote.opportunity.id}`} className="text-blue-400 hover:text-blue-300">
                {quote.opportunity.reference}
              </Link>
            } />
            <StatRow label="Customer" value={quote.opportunity.customerName} />
            <StatRow label="Target Margin" value={`${(Number(quote.opportunity.targetMarginPct) * 100).toFixed(1)}%`} />
            <StatRow label="Priority" value={quote.opportunity.strategicPriority} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
