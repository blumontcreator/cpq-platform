import { prisma } from "@/lib/prisma";
import { buildIntelligence } from "@/modules/intelligence";
import { Card, CardHeader, CardBody, StatRow } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { TracePanel, TraceRow, WarningList } from "@/components/ui/trace-panel";

export const metadata = { title: "Intelligence Panel — CPQ Console" };
export const dynamic = "force-dynamic";

async function getIntelligenceData() {
  try {
    const report = await buildIntelligence(prisma, { periodDays: 90 });
    return { report, error: null };
  } catch (err) {
    return { report: null, error: err instanceof Error ? err.message : "Failed to build intelligence report" };
  }
}

export default async function IntelligencePanelPage() {
  const { report, error } = await getIntelligenceData();

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Intelligence Panel</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {report
              ? `Generated ${report.generatedAt.slice(0, 16)} · ${report.period}`
              : "Commercial analytics & learning signals"}
          </p>
        </div>
        {report && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">confidence</span>
            <div className="w-32"><ConfidenceBar value={report.confidence} /></div>
          </div>
        )}
      </div>

      {error && (
        <Card>
          <CardBody>
            <p className="text-sm text-red-400 mb-1">Failed to load intelligence report</p>
            <p className="text-xs text-zinc-500 font-mono">{error}</p>
            <p className="text-xs text-zinc-600 mt-2">
              Run <code className="bg-zinc-800 px-1 font-mono">npm run intelligence:demo</code> to seed event data.
            </p>
          </CardBody>
        </Card>
      )}

      {report && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Win Rate", value: `${(report.summary.winRate * 100).toFixed(1)}%`, accent: report.summary.winRate >= 0.5 ? "green" : "yellow" as const },
              { label: "Avg Margin", value: `${report.summary.avgRealizedMarginPct.toFixed(1)}%`, accent: report.summary.avgRealizedMarginPct >= 25 ? "green" : "yellow" as const },
              { label: "Avg Discount", value: `${report.summary.avgDiscountGranted.toFixed(1)}%`, accent: "blue" as const },
              { label: "Total Outcomes", value: String(report.summary.totalOutcomes), accent: undefined },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardBody>
                  <p className="text-xs text-zinc-500 mb-1">{kpi.label}</p>
                  <p className={`font-mono text-xl font-semibold ${kpi.accent === "green" ? "text-green-400" : kpi.accent === "yellow" ? "text-yellow-400" : kpi.accent === "blue" ? "text-blue-400" : "text-zinc-100"}`}>
                    {kpi.value}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Win Rate Report */}
            <Card>
              <CardHeader label="Win Rate Analysis" />
              <CardBody>
                <StatRow label="Overall win rate" value={`${(report.winRate.overall.winRate * 100).toFixed(1)}%`} accent="green" />
                <StatRow label="Total quotes" value={report.winRate.overall.total} />
                <StatRow label="Wins" value={report.winRate.overall.wins} />
                <StatRow label="Losses" value={report.winRate.overall.losses} />
                {report.winRate.byChannel.length > 0 && (
                  <TracePanel label="By channel" className="mt-2">
                    {report.winRate.byChannel.map((ch) => (
                      <TraceRow key={ch.dimension} label={ch.dimension} value={`${(ch.winRate * 100).toFixed(1)}% (n=${ch.total})`} />
                    ))}
                  </TracePanel>
                )}
                {report.winRate.byStrategy.length > 0 && (
                  <TracePanel label="By strategy" className="mt-2">
                    {report.winRate.byStrategy.map((s) => (
                      <TraceRow key={s.dimension} label={s.dimension} value={`${(s.winRate * 100).toFixed(1)}% (n=${s.total})`} />
                    ))}
                  </TracePanel>
                )}
              </CardBody>
            </Card>

            {/* Margin Report */}
            <Card>
              <CardHeader label="Margin Analysis" />
              <CardBody>
                <StatRow label="Avg realized margin" value={`${report.margin.avgRealizedMarginPct.toFixed(1)}%`} accent="green" />
                <StatRow label="Avg quoted margin" value={`${report.margin.avgQuotedMarginPct.toFixed(1)}%`} />
                <StatRow label="Margin retention" value={`${(report.margin.marginRetentionRate * 100).toFixed(1)}%`}
                  accent={report.margin.marginRetentionRate >= 0.9 ? "green" : "yellow"} />
                <StatRow label="Sample size" value={report.margin.sampleSize} />
              </CardBody>
            </Card>

            {/* Strategy Effectiveness */}
            <Card>
              <CardHeader label="Strategy Effectiveness" />
              <CardBody>
                {report.strategyEffectiveness.strategies.length === 0 ? (
                  <p className="text-xs text-zinc-600">No strategy data yet</p>
                ) : (
                  <>
                    <StatRow label="Best overall" value={report.strategyEffectiveness.bestOverall} accent="green" />
                    <StatRow label="Best win rate" value={report.strategyEffectiveness.bestByWinRate} />
                    <StatRow label="Best margin" value={report.strategyEffectiveness.bestByMargin} />
                    <div className="mt-3 space-y-2">
                      {report.strategyEffectiveness.strategies.slice(0, 4).map((s) => (
                        <div key={s.strategyKind} className="rounded border border-zinc-800 p-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-zinc-300">{s.strategyKind}</span>
                            <Badge variant="zinc">n={s.sampleSize}</Badge>
                          </div>
                          <div className="flex gap-4 text-[10px] text-zinc-500">
                            <span>win={`${(s.winRate * 100).toFixed(0)}%`}</span>
                            <span>margin={`${s.avgRealizedMarginPct.toFixed(1)}%`}</span>
                            <span>discount={`${s.avgDiscountGranted.toFixed(1)}%`}</span>
                          </div>
                          <ConfidenceBar value={s.confidence} label="conf" />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            {/* Supplier Reliability */}
            <Card>
              <CardHeader label="Supplier Reliability" />
              <CardBody>
                {report.feedback.supplierRiskFactors.length === 0 ? (
                  <p className="text-xs text-zinc-600">No supplier data yet</p>
                ) : (
                  report.feedback.supplierRiskFactors.slice(0, 5).map((s) => (
                    <div key={s.supplierId} className="py-1.5 border-b border-zinc-800/50 last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-zinc-400">{s.supplierId.slice(0, 12)}</span>
                        <Badge variant={statusBadge(s.riskLevel)}>{s.riskLevel}</Badge>
                      </div>
                      <ConfidenceBar value={s.reliabilityScore / 100} />
                      {s.note && <p className="text-[10px] text-zinc-600 mt-0.5">{s.note}</p>}
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>

          {/* Trends */}
          {report.trends.length > 0 && (
            <Card>
              <CardHeader label={`Trend Analysis (${report.trends.length})`} />
              <CardBody>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {report.trends.map((t, i) => (
                    <div key={i} className="rounded border border-zinc-800 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-300">{t.metric}</span>
                        <Badge variant={t.direction === "IMPROVING" ? "green" : t.direction === "DECLINING" ? "red" : "zinc"}>
                          {t.direction === "IMPROVING" ? "↑" : t.direction === "DECLINING" ? "↓" : "→"} {t.direction}
                        </Badge>
                      </div>
                      <div className="w-full"><ConfidenceBar value={t.confidence} label="conf" /></div>
                      {t.note && <p className="text-[10px] text-zinc-600">{t.note}</p>}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Anomaly alerts */}
          {report.anomalies.length > 0 && (
            <Card>
              <CardHeader label={`Anomaly Alerts (${report.anomalies.length})`} />
              <div className="divide-y divide-zinc-800/50">
                {report.anomalies.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <Badge variant={a.severity === "HIGH" ? "red" : a.severity === "MEDIUM" ? "yellow" : "zinc"}>
                      {a.severity}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300">{a.explanation}</p>
                      <p className="text-[10px] font-mono text-zinc-600">{a.metric} · {a.detectedAt.slice(0, 10)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Learning Signals */}
          {report.signals.length > 0 && (
            <Card>
              <CardHeader label={`Learning Signals (${report.signals.length})`} />
              <CardBody>
                <TracePanel label="Signal details">
                  {report.signals.slice(0, 8).map((s, i) => (
                    <TraceRow
                      key={i}
                      label={s.signalType}
                      value={`${s.signalKey} = ${s.value.toFixed(3)} (conf=${(s.confidence * 100).toFixed(0)}%, n=${s.sampleSize})`}
                    />
                  ))}
                </TracePanel>
              </CardBody>
            </Card>
          )}

          <WarningList warnings={report.warnings} />
        </>
      )}
    </div>
  );
}
