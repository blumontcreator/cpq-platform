export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOpportunity } from "@/modules/opportunity";
import { executeLifecycleAction, closeOpportunityAction } from "../../actions/opportunity.actions";
import { Card, CardBody, CardHeader, StatRow } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { LifecycleForm } from "@/components/console/lifecycle-form";
import { WalkthroughHint } from "@/components/console/walkthrough-hint";
import Link from "next/link";

interface Props { params: Promise<{ opportunityId: string }> }

export default async function OpportunityDetailPage({ params }: Props) {
  const { opportunityId } = await params;
  const opportunity = await getOpportunity(prisma, opportunityId);
  if (!opportunity) notFound();

  const quotes = await prisma.quote.findMany({
    where:   { opportunityId },
    orderBy: { createdAt: "desc" },
    include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 }, outcome: true },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/opportunities" className="text-zinc-500 hover:text-zinc-300 text-sm">← Opportunities</Link>
        <span className="text-zinc-700">/</span>
        <span className="text-sm text-zinc-300 font-mono">{opportunity.reference}</span>
      </div>

      <WalkthroughHint title="Next recommended step">
        Build a <strong className="text-zinc-300">priced quote</strong> from the catalog (right). The platform runs pricing, checks margin, and opens approvals when needed. Then follow the banner on the quote to negotiate and close.
      </WalkthroughHint>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader label="Opportunity Details" />
          <CardBody>
            <StatRow label="Customer" value={opportunity.customerName} />
            <StatRow label="Account ref." value={opportunity.customerId} />
            <StatRow label="Deal owner" value={opportunity.salesOwnerId} />
            <StatRow label="Channel" value={opportunity.channel} />
            <StatRow label="Target Margin" value={`${(opportunity.targetMarginPct * 100).toFixed(1)}%`} accent="green" />
            {opportunity.estimatedRevenue && (
              <StatRow label="Est. Revenue" value={`$${opportunity.estimatedRevenue.toLocaleString()}`} />
            )}
            <StatRow label="Status" value={<Badge variant={statusBadge(opportunity.status)}>{opportunity.status}</Badge>} />
            <StatRow label="Priority" value={<Badge variant={opportunity.strategicPriority === "MUST_WIN" ? "red" : opportunity.strategicPriority === "STRATEGIC" ? "purple" : "blue"}>{opportunity.strategicPriority.replace(/_/g," ")}</Badge>} />
            {opportunity.notes && <StatRow label="Notes" value={opportunity.notes} mono={false} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader label="Create quote from catalog" />
          <CardBody>
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
              Search your catalog, choose line quantities, then create the quote. The platform prices the
              deal, checks margins against your targets, and opens any required approvals automatically.
            </p>
            <LifecycleForm
              opportunityId={opportunityId}
              runAction={executeLifecycleAction}
            />
          </CardBody>
        </Card>
      </div>

      {/* Close opportunity */}
      {opportunity.status === "OPEN" || opportunity.status === "QUOTED" ? (
        <Card>
          <CardHeader label="Close Opportunity" />
          <CardBody>
            <form action={closeOpportunityAction} className="flex gap-3 items-end">
              <input type="hidden" name="opportunityId" value={opportunityId} />
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Outcome</label>
                <select name="outcome" className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none">
                  {["WON","LOST","ABANDONED"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <button type="submit"
                className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-4 py-2 rounded transition-colors">
                Close
              </button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {/* Associated quotes */}
      <Card>
        <CardHeader label={`Quotes (${quotes.length})`} />
        <CardBody>
          {quotes.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No quotes yet. Use <strong className="text-zinc-400">Create quote from catalog</strong> above to
              generate the first one.
            </p>
          ) : (
            <div className="space-y-3">
              {quotes.map((q) => {
                const eval_ = q.evaluations[0]?.evaluation as Record<string, unknown> | undefined;
                const metrics = eval_?.["metrics"] as Record<string, number> | undefined;
                const confidence = eval_?.["confidence"] as number | undefined;
                const marginPct = metrics
                  ? (metrics["totalMargin"] ?? 0) / Math.max(metrics["totalRevenue"] as number ?? 1, 1)
                  : null;

                return (
                  <div key={q.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded border border-zinc-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link href={`/quotes/${q.id}`} className="text-sm font-mono text-blue-400 hover:text-blue-300">{q.reference}</Link>
                        <Badge variant={statusBadge(q.status)}>{q.status}</Badge>
                        {q.outcome && (
                          <Badge variant={q.outcome.outcome === "WON" ? "green" : q.outcome.outcome === "LOST" ? "red" : "zinc"}>
                            {q.outcome.outcome}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{q.createdAt.toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-4 text-right">
                      {metrics && (
                        <>
                          <div>
                            <p className="text-xs text-zinc-500">Revenue</p>
                            <p className="text-sm text-zinc-300">${(metrics["totalRevenue"] as number ?? 0).toFixed(0)}</p>
                          </div>
                          {marginPct !== null && (
                            <div>
                              <p className="text-xs text-zinc-500">Margin</p>
                              <p className={`text-sm ${marginPct >= 0.3 ? "text-green-400" : marginPct >= 0.15 ? "text-yellow-400" : "text-red-400"}`}>
                                {(marginPct * 100).toFixed(1)}%
                              </p>
                            </div>
                          )}
                        </>
                      )}
                      {confidence !== undefined && (
                        <div className="w-24">
                          <p className="text-xs text-zinc-500 mb-1">Confidence</p>
                          <ConfidenceBar value={confidence} />
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <Link href={`/quotes/${q.id}`} className="text-xs text-zinc-400 hover:text-zinc-200">Quote →</Link>
                        <Link href={`/quotes/${q.id}/workflow`} className="text-xs text-zinc-400 hover:text-zinc-200">Approvals →</Link>
                        <Link href={`/quotes/${q.id}/negotiate`} className="text-xs text-zinc-400 hover:text-zinc-200">Negotiation →</Link>
                        <Link href={`/quotes/${q.id}/outcome`} className="text-xs text-zinc-400 hover:text-zinc-200">Outcome →</Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
