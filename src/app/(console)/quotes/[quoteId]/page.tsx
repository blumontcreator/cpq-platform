import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addVariantToGraph, runQuoteEvaluation } from "../../actions/quote.actions";
import { QuoteTabs } from "@/components/console/quote-tabs";
import { AddVariantForm } from "@/components/console/add-variant-form";
import { Card, CardHeader, CardBody, StatRow } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import { TracePanel, TraceRow, WarningList } from "@/components/ui/trace-panel";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import type { QuoteGraph, QuoteNode } from "@/modules/quoting/types/graph.types";
import type { QuoteEvaluation } from "@/modules/quoting/types/evaluation.types";

export async function generateMetadata({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { reference: true } });
  return { title: `${q?.reference ?? quoteId} — Quote Builder — CPQ Console` };
}

async function getQuoteDetail(quoteId: string) {
  return prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
      outcome: true,
    },
  });
}

export default async function QuoteBuilderPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const quote = await getQuoteDetail(quoteId);
  if (!quote) notFound();

  const graph = quote.graph as unknown as QuoteGraph | null;
  const latestEval = quote.evaluations[0]
    ? (quote.evaluations[0].evaluation as unknown as QuoteEvaluation)
    : null;

  const addVariantBound = addVariantToGraph.bind(null, quoteId);
  const runEvalBound = runQuoteEvaluation.bind(null, quoteId);

  return (
    <div className="flex flex-col">
      {/* Tab nav */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="font-mono text-base font-semibold text-zinc-100">{quote.reference}</h1>
            <p className="text-xs text-zinc-500 mt-0.5">{quote.currency} · {quote.id.slice(0, 8)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusBadge(quote.status)}>{quote.status}</Badge>
            {quote.outcome && <Badge variant={statusBadge(quote.outcome.outcome)}>{quote.outcome.outcome}</Badge>}
          </div>
        </div>
        <QuoteTabs quoteId={quoteId} />
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Add variant form */}
          <Card>
            <CardHeader label="Add Variant to Graph" />
            <CardBody>
              <AddVariantForm addVariantAction={addVariantBound} />
              <p className="mt-2 text-[10px] text-zinc-600">Enter a catalog SKU and quantity to add it as a PRODUCT_VARIANT node.</p>
            </CardBody>
          </Card>

          {/* Run evaluation */}
          <Card>
            <CardHeader label="Evaluation" />
            <CardBody>
              <form action={runEvalBound}>
                <button
                  type="submit"
                  disabled={!graph}
                  className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
                >
                  ▶ Run Evaluation
                </button>
              </form>
              {!graph && <p className="mt-2 text-[10px] text-zinc-600">Add at least one variant to enable evaluation.</p>}
              {latestEval && (
                <div className="mt-3 space-y-0">
                  <StatRow label="Margin" value={`${latestEval.metrics.overallMarginPct.toFixed(1)}%`}
                    accent={latestEval.metrics.overallMarginPct >= 25 ? "green" : latestEval.metrics.overallMarginPct >= 15 ? "yellow" : "red"} />
                  <StatRow label="Revenue" value={`${quote.currency} ${latestEval.metrics.totalRevenue.toFixed(0)}`} />
                  <StatRow label="Confidence" value={latestEval.confidence.toFixed(2)} />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Graph summary */}
          <Card>
            <CardHeader label="Graph" />
            <CardBody>
              {graph ? (
                <>
                  <StatRow label="Nodes" value={graph.nodes.length} />
                  <StatRow label="Edges" value={graph.edges.length} />
                  <StatRow label="Currency" value={graph.context?.currency ?? quote.currency} />
                </>
              ) : (
                <p className="text-xs text-zinc-600">No graph yet. Add variants to start.</p>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Graph nodes table */}
        {graph && graph.nodes.length > 0 && (
          <Card>
            <CardHeader label={`Nodes (${graph.nodes.length})`} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="px-4 py-2 text-left font-medium">Kind</th>
                    <th className="px-4 py-2 text-left font-medium">Label</th>
                    <th className="px-4 py-2 text-left font-medium">SKU</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Cost USD</th>
                    <th className="px-4 py-2 text-right font-medium">Price USD</th>
                    <th className="px-4 py-2 text-right font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {graph.nodes.map((node: QuoteNode) => {
                    const margin = node.unitCost && node.unitPrice
                      ? ((node.unitPrice - node.unitCost) / node.unitPrice * 100)
                      : null;
                    return (
                      <tr key={node.id} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-2">
                          <Badge variant="default">{node.kind}</Badge>
                        </td>
                        <td className="px-4 py-2 text-zinc-300 truncate max-w-[180px]">{node.label}</td>
                        <td className="px-4 py-2 font-mono text-zinc-400">
                          {node.variantSku ? (
                            <a href={`/catalog/${node.variantSku}`} className="hover:text-blue-400">{node.variantSku}</a>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{node.quantity}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{node.unitCost?.toFixed(2) ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-300">{node.unitPrice?.toFixed(2) ?? "—"}</td>
                        <td className={`px-4 py-2 text-right font-mono ${margin != null && margin >= 25 ? "text-green-400" : margin != null && margin >= 15 ? "text-yellow-400" : "text-red-400"}`}>
                          {margin != null ? `${margin.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Edges */}
        {graph && graph.edges.length > 0 && (
          <Card>
            <CardHeader label={`Edges (${graph.edges.length})`} />
            <div className="divide-y divide-zinc-800/50">
              {graph.edges.map((edge) => (
                <div key={edge.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <Badge variant="zinc">{edge.kind}</Badge>
                  <span className="font-mono text-zinc-500">{edge.fromNodeId.slice(0, 8)}</span>
                  <span className="text-zinc-700">→</span>
                  <span className="font-mono text-zinc-500">{edge.toNodeId.slice(0, 8)}</span>
                  {edge.weight && <span className="font-mono text-zinc-600">weight={edge.weight}</span>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Latest evaluation */}
          {latestEval && (
            <Card>
              <CardHeader label="Latest Evaluation" actions={
                <div className="w-32"><ConfidenceBar value={latestEval.confidence} /></div>
              } />
              <CardBody>
                <div className="grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-4">
                  <StatRow label="Total revenue" value={`${quote.currency} ${latestEval.metrics.totalRevenue.toFixed(0)}`} />
                  <StatRow label="Total cost" value={`${quote.currency} ${latestEval.metrics.totalCost.toFixed(0)}`} />
                  <StatRow label="Gross margin" value={`${quote.currency} ${latestEval.metrics.totalMargin.toFixed(0)}`} accent="green" />
                  <StatRow label="Margin %" value={`${latestEval.metrics.overallMarginPct.toFixed(1)}%`}
                    accent={latestEval.metrics.overallMarginPct >= 25 ? "green" : "yellow"} />
                  <StatRow label="Nodes" value={latestEval.nodeEvaluations.length} />
                  <StatRow label="Lead time" value={`${latestEval.metrics.criticalPathLeadTimeDays}d`} />
                  <StatRow label="Freight groups" value={latestEval.metrics.freightGroups.length} />
                </div>

                {latestEval.trace && latestEval.trace.steps.length > 0 && (
                  <TracePanel label={`Evaluator trace (${latestEval.trace.steps.length} steps)`} className="mt-3">
                    {latestEval.trace.steps.map((t) => (
                      <TraceRow key={t.step} label={t.evaluator} value={t.note} />
                    ))}
                  </TracePanel>
                )}

                {latestEval.recommendations.length > 0 && (
                  <TracePanel label={`Recommendations (${latestEval.recommendations.length})`} className="mt-2">
                    {latestEval.recommendations.map((r) => (
                      <div key={r.id} className="flex gap-2 mb-1">
                        <Badge variant={r.priority === "HIGH" ? "yellow" : r.priority === "CRITICAL" ? "red" : "zinc"}>
                          {r.kind}
                        </Badge>
                        <span className="text-zinc-300">{r.title}</span>
                      </div>
                    ))}
                  </TracePanel>
                )}

                <WarningList warnings={latestEval.warnings} />
              </CardBody>
            </Card>
          )}
      </div>
    </div>
  );
}
