export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { submitApproval, advanceWorkflow } from "../../../actions/workflow.actions";
import { QuoteTabs } from "@/components/console/quote-tabs";
import { ApprovalForm } from "@/components/console/approval-form";
import { Card, CardHeader, CardBody, StatRow } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import { TracePanel, TraceRow } from "@/components/ui/trace-panel";
import { ConfidenceBar } from "@/components/ui/confidence-bar";
import { getWorkflowStatus } from "@/modules/workflow";
import type { WorkflowTransitionRecord } from "@/modules/workflow/types/workflow.types";

export async function generateMetadata({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { reference: true } });
  return { title: `${q?.reference ?? quoteId} — Workflow — CPQ Console` };
}

export default async function WorkflowTimelinePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, reference: true, currency: true },
  });
  if (!quote) notFound();

  let workflowStatus = null;
  let noWorkflow = false;
  try {
    workflowStatus = await getWorkflowStatus(prisma, quoteId);
  } catch {
    noWorkflow = true;
  }

  const submitApprovalBound = submitApproval.bind(null, quoteId);
  const advanceBound = advanceWorkflow.bind(null, quoteId);

  const history = workflowStatus
    ? (workflowStatus.instance.history as unknown as WorkflowTransitionRecord[]) ?? []
    : [];

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
        {noWorkflow && (
          <Card>
            <CardBody>
              <p className="text-sm text-zinc-500 mb-3">No workflow initialized for this quote.</p>
              <form action={advanceBound} className="flex gap-2">
                <input type="hidden" name="note" value="Initialized from console" />
                <button type="submit" className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
                  Initialize Workflow
                </button>
              </form>
            </CardBody>
          </Card>
        )}

        {workflowStatus && (
          <>
            {/* Current state */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader label="Current State" />
                <CardBody>
                  <div className="mb-3">
                    <Badge variant={statusBadge(workflowStatus.instance.currentState)}>
                      {workflowStatus.instance.currentState}
                    </Badge>
                  </div>
                  <StatRow label="Status" value={workflowStatus.instance.status} />
                  <StatRow label="Transitions" value={workflowStatus.historyLength} />
                  <StatRow label="Workflow ID" value={workflowStatus.instance.id.slice(0, 8)} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader label="Operational Risk" />
                <CardBody>
                  <div className="mb-3 flex items-center gap-3">
                    <Badge variant={statusBadge(workflowStatus.operationalRisk.level)}>
                      {workflowStatus.operationalRisk.level}
                    </Badge>
                    <span className="font-mono text-sm text-zinc-300">
                      {workflowStatus.operationalRisk.overallScore.toFixed(0)}/100
                    </span>
                  </div>
                  <div className="mb-2">
                    <ConfidenceBar value={1 - workflowStatus.operationalRisk.overallScore / 100} label="health" />
                  </div>
                  <StatRow label="Supplier risk" value={workflowStatus.operationalRisk.supplierRisk.toFixed(0)} />
                  <StatRow label="Lead time risk" value={workflowStatus.operationalRisk.leadTimeRisk.toFixed(0)} />
                  <StatRow label="Customer risk" value={workflowStatus.operationalRisk.customerRisk.toFixed(0)} />
                  {workflowStatus.operationalRisk.signals.map((s, i) => (
                    <p key={i} className="text-[10px] text-zinc-600 mt-0.5">{s}</p>
                  ))}
                </CardBody>
              </Card>

              <Card>
                <CardHeader label="Manual Advance" />
                <CardBody>
                  <p className="text-xs text-zinc-500 mb-3">Force a transition to the next logical state.</p>
                  <form action={advanceBound} className="flex flex-col gap-2">
                    <input
                      name="note"
                      placeholder="Reason for manual advance"
                      className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                    />
                    <button type="submit" className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-600">
                      ▶ Advance
                    </button>
                  </form>
                </CardBody>
              </Card>
            </div>

            {/* AI insight */}
            {workflowStatus.insight && (
              <Card>
                <CardHeader label="Operational Insight" actions={
                  <div className="w-32"><ConfidenceBar value={workflowStatus.insight.confidence} /></div>
                } />
                <CardBody>
                  <p className="text-sm text-zinc-300 mb-3">{workflowStatus.insight.reasoning}</p>
                  {workflowStatus.insight.predictedNextState && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Predicted next:</span>
                      <Badge variant={statusBadge(workflowStatus.insight.predictedNextState)}>
                        {workflowStatus.insight.predictedNextState}
                      </Badge>
                      {workflowStatus.insight.predictedNextStateProbability != null && (
                        <span className="font-mono text-xs text-zinc-500">
                          ({(workflowStatus.insight.predictedNextStateProbability * 100).toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  )}
                  {workflowStatus.insight.suggestedActions.length > 0 && (
                    <TracePanel label={`Suggested actions (${workflowStatus.insight.suggestedActions.length})`}>
                      {workflowStatus.insight.suggestedActions.map((a, i) => (
                        <TraceRow key={i} label={`action ${i + 1}`} value={a} />
                      ))}
                    </TracePanel>
                  )}
                </CardBody>
              </Card>
            )}

            {/* Pending approvals */}
            {workflowStatus.pendingApprovals.length > 0 && (
              <Card>
                <CardHeader label={`Pending Approvals (${workflowStatus.pendingApprovals.length})`} />
                <div className="divide-y divide-zinc-800/50">
                  {workflowStatus.pendingApprovals.map((ap) => (
                    <div key={ap.id} className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="yellow">Stage {ap.stage}</Badge>
                        <Badge variant="default">{ap.kind}</Badge>
                        <span className="text-xs text-zinc-400">{ap.requiredRole}</span>
                        <Badge variant={statusBadge(ap.status)}>{ap.status}</Badge>
                      </div>
                      <ApprovalForm approvalId={ap.id} approveAction={submitApprovalBound} />
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Escalations */}
            {workflowStatus.escalations.length > 0 && (
              <Card>
                <CardHeader label="Escalation Alerts" />
                <div className="divide-y divide-zinc-800/50">
                  {workflowStatus.escalations.map((esc, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                      <Badge variant="red">ESCALATE</Badge>
                      <span className="text-zinc-300">{esc.reason}</span>
                      <span className="text-zinc-600 font-mono">{esc.name}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader label={`Transition History (${history.length})`} />
              {history.length === 0 ? (
                <div className="p-4 text-xs text-zinc-600">No transitions recorded yet.</div>
              ) : (
                <div className="relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-8 top-0 bottom-0 w-px bg-zinc-800" />
                  <div className="divide-y divide-zinc-800/50">
                    {[...history].reverse().map((rec, i) => (
                      <div key={i} className="flex gap-4 px-4 py-3 relative">
                        {/* Dot */}
                        <div className="relative z-10 mt-0.5 h-3 w-3 rounded-full border-2 border-zinc-700 bg-zinc-900 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Badge variant={statusBadge(rec.fromState ?? "DRAFT")}>{rec.fromState ?? "—"}</Badge>
                            <span className="text-zinc-700 text-xs">→</span>
                            <Badge variant={statusBadge(rec.toState)}>{rec.toState}</Badge>
                            <span className="text-[10px] font-mono text-zinc-600 ml-auto">
                              {new Date(rec.timestamp).toISOString().slice(0, 16)}
                            </span>
                          </div>
                          {rec.reasoning && (
                            <p className="text-xs text-zinc-500 truncate">{rec.reasoning}</p>
                          )}
                          {rec.initiatedBy && (
                            <p className="text-[10px] text-zinc-700">{rec.initiatedBy}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
