export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { runOptimizationAction } from "../../../actions/simulation.actions";
import { QuoteTabs } from "@/components/console/quote-tabs";
import { RunSimulationForm } from "@/components/console/run-simulation-form";
import { Card, CardHeader, CardBody, StatRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TracePanel, TraceRow } from "@/components/ui/trace-panel";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import type { OptimizationResult } from "@/modules/simulation/types/optimization.types";

export async function generateMetadata({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { reference: true } });
  return { title: `${q?.reference ?? quoteId} — Simulation — CPQ Console` };
}

async function getSimData(quoteId: string) {
  const [quote, runs] = await Promise.all([
    prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true, reference: true, currency: true, graph: true } }),
    prisma.scenarioRun.findMany({
      where: { quoteId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);
  return { quote, runs };
}

export default async function SimulationRunnerPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const { quote, runs } = await getSimData(quoteId);
  if (!quote) notFound();

  const hasGraph = !!quote.graph;
  const runAction = runOptimizationAction.bind(null, quoteId);

  return (
    <div className="flex flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 pt-4">
        <div className="mb-3">
          <h1 className="font-mono text-base font-semibold text-zinc-100">{quote.reference}</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{quote.currency} · {quoteId.slice(0, 8)}</p>
        </div>
        <QuoteTabs quoteId={quoteId} />
      </div>

      <div className="p-6 space-y-5">
        {/* Run controls */}
        <Card>
          <CardHeader label="Run Optimization" />
          <CardBody>
            {hasGraph ? (
              <>
                <p className="text-xs text-zinc-500 mb-3">Select a strategy to run the optimization engine against this quote&#39;s graph.</p>
                <RunSimulationForm runAction={runAction} />
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-4 text-[10px] text-zinc-600">
                  <div><span className="text-zinc-500">BALANCED</span> — margin + win rate tradeoff</div>
                  <div><span className="text-zinc-500">AGGRESSIVE</span> — maximize win probability</div>
                  <div><span className="text-zinc-500">PREMIUM</span> — maximize margin</div>
                  <div><span className="text-zinc-500">STRATEGIC</span> — long-term account value</div>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-600">No graph on this quote yet. Go to the Builder tab and add variants first.</p>
            )}
          </CardBody>
        </Card>

        {/* Scenario runs */}
        {runs.length === 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center text-xs text-zinc-600">
            No scenario runs yet. Run an optimization above.
          </div>
        )}

        {runs.map((run) => {
          const result = run.result as unknown as OptimizationResult | null;
          if (!result) return null;

          const best = result.bestScenario;
          const allScenarios = result.allScenarios ?? [];
          const recs = result.recommendations ?? [];
          const winProb = best?.objectiveScores?.find((o) => o.kind === "MAXIMIZE_WIN_PROBABILITY")?.rawValue ?? null;

          return (
            <Card key={run.id}>
              <CardHeader
                label={`${run.strategy ?? "UNKNOWN"} — ${new Date(run.createdAt).toISOString().slice(0, 16)}`}
                actions={
                  <div className="flex items-center gap-3">
                    {winProb != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-600">win prob</span>
                        <ConfidenceBar value={winProb} />
                      </div>
                    )}
                    <Badge variant="zinc">{run.id.slice(0, 8)}</Badge>
                  </div>
                }
              />
              <CardBody>
                {/* Best scenario metrics */}
                {best?.evaluation && (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-4 mb-3">
                    <StatRow label="Revenue" value={`${quote.currency} ${best.evaluation.metrics.totalRevenue.toFixed(0)}`} />
                    <StatRow label="Margin %" value={`${best.evaluation.metrics.overallMarginPct.toFixed(1)}%`}
                      accent={best.evaluation.metrics.overallMarginPct >= 25 ? "green" : "yellow"} />
                    <StatRow label="Score" value={best.compositeScore.toFixed(3)} />
                    <StatRow label="Lead time" value={`${best.evaluation.metrics.criticalPathLeadTimeDays}d`} />
                  </div>
                )}

                {/* Scenario comparison */}
                {allScenarios.length > 1 && (
                  <TracePanel label={`Scenario comparison (${allScenarios.length} candidates)`} defaultOpen>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-600">
                            <th className="py-1 text-left pr-4">Mutation</th>
                            <th className="py-1 text-right pr-4">Margin%</th>
                            <th className="py-1 text-right pr-4">Score</th>
                            <th className="py-1 text-right pr-4">Win prob</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allScenarios.slice(0, 6).map((s, i) => {
                            const wp = s.objectiveScores?.find((o) => o.kind === "MAXIMIZE_WIN_PROBABILITY")?.rawValue;
                            return (
                              <tr key={i} className={s === best ? "text-green-400" : "text-zinc-400"}>
                                <td className="py-0.5 pr-4 truncate max-w-[160px]">{s.scenarioName ?? `scenario ${i + 1}`}</td>
                                <td className="py-0.5 pr-4 text-right font-mono">{s.evaluation?.metrics.overallMarginPct.toFixed(1)}%</td>
                                <td className="py-0.5 pr-4 text-right font-mono">{s.compositeScore.toFixed(3)}</td>
                                <td className="py-0.5 text-right font-mono">{wp != null ? `${(wp * 100).toFixed(0)}%` : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TracePanel>
                )}

                {/* Tradeoffs */}
                {result.tradeoffAnalysis && (
                  <TracePanel label="Tradeoff analysis" className="mt-2">
                    <TraceRow label="margin vs complexity" value={result.tradeoffAnalysis.marginVsComplexity} />
                    <TraceRow label="margin vs lead time" value={result.tradeoffAnalysis.marginVsLeadTime} />
                    <TraceRow label="margin vs win prob" value={result.tradeoffAnalysis.marginVsWinProbability} />
                    <TraceRow label="overall" value={result.tradeoffAnalysis.overallAssessment} />
                  </TracePanel>
                )}

                {/* Advisory recommendations */}
                {recs.length > 0 && (
                  <TracePanel label={`Negotiation guidance (${recs.length})`} className="mt-2">
                    {recs.map((r) => (
                      <div key={r.id} className="flex gap-2 mb-1">
                        <Badge variant={r.priority === "HIGH" ? "yellow" : r.priority === "CRITICAL" ? "red" : "zinc"}>
                          {r.kind}
                        </Badge>
                        <span className="text-zinc-300">{r.title}</span>
                      </div>
                    ))}
                  </TracePanel>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
