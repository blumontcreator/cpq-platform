import { prisma } from "@/lib/prisma";
import { submitApproval } from "../actions/workflow.actions";
import { Card, CardBody, CardHeader, StatRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalForm } from "@/components/console/approval-form";
import Link from "next/link";

const KIND_LABELS: Record<string, string> = {
  MARGIN: "Margin Exception",
  DISCOUNT: "Discount Approval",
  HIGH_VALUE: "High-Value Deal",
  STRATEGIC: "Strategic Account",
  OVERRIDE: "Manual Override",
};

const KIND_COLORS: Record<string, "red" | "yellow" | "blue" | "purple" | "zinc"> = {
  MARGIN: "red",
  DISCOUNT: "yellow",
  HIGH_VALUE: "blue",
  STRATEGIC: "purple",
  OVERRIDE: "red",
};

export default async function ApprovalsPage() {
  const pendingApprovals = await prisma.approvalRequest.findMany({
    where:   { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take:    50,
    include: {
      workflow: {
        select: { quoteId: true, currentState: true },
      },
    },
  });

  const recentDecisions = await prisma.approvalRequest.findMany({
    where:   { status: { in: ["APPROVED", "REJECTED", "ESCALATED"] } },
    orderBy: { decisionAt: "desc" },
    take:    10,
    include: {
      workflow: { select: { quoteId: true } },
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Approval Inbox</h1>
        <p className="text-xs text-zinc-500 mt-1">
          {pendingApprovals.length} pending · {recentDecisions.length} recent decisions
        </p>
      </div>

      {/* Pending approvals */}
      {pendingApprovals.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Pending</h2>
          {pendingApprovals.map((a) => {
            const quoteId = a.workflow.quoteId;
            const boundAction = submitApproval.bind(null, quoteId);
            return (
              <Card key={a.id} className="border-yellow-700/40">
                <CardHeader
                  label={KIND_LABELS[a.kind] ?? a.kind}
                  actions={<Badge variant={KIND_COLORS[a.kind] ?? "zinc"}>{a.kind}</Badge>}
                />
                <CardBody>
                  <div className="grid grid-cols-2 gap-x-8 mb-4">
                    <StatRow label="Quote" value={
                      <Link href={`/quotes/${quoteId}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs">{quoteId}</Link>
                    } />
                    <StatRow label="Workflow State" value={a.workflow.currentState} />
                    <StatRow label="Required Role" value={a.requiredRole} />
                    <StatRow label="Stage" value={`Stage ${a.stage}`} />
                    {a.requestedBy && <StatRow label="Requested By" value={a.requestedBy} />}
                    {a.expiresAt && (
                      <StatRow label="Expires"
                        value={a.expiresAt.toLocaleDateString()}
                        accent={a.expiresAt < new Date() ? "red" : undefined}
                      />
                    )}
                    {a.overrideReason && <StatRow label="Override Reason" value={a.overrideReason} mono={false} />}
                  </div>
                  <ApprovalForm approvalId={a.id} approveAction={boundAction} />
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-zinc-500 text-center py-4">No pending approvals.</p>
          </CardBody>
        </Card>
      )}

      {/* Recent decisions */}
      {recentDecisions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Recent Decisions</h2>
          <div className="border border-zinc-800 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs text-zinc-500 px-4 py-2">Quote</th>
                  <th className="text-left text-xs text-zinc-500 px-4 py-2">Kind</th>
                  <th className="text-left text-xs text-zinc-500 px-4 py-2">Decision</th>
                  <th className="text-left text-xs text-zinc-500 px-4 py-2">By</th>
                  <th className="text-left text-xs text-zinc-500 px-4 py-2">When</th>
                  <th className="text-left text-xs text-zinc-500 px-4 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {recentDecisions.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                    <td className="px-4 py-2">
                      <Link href={`/quotes/${a.workflow.quoteId}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                        {a.workflow.quoteId.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={KIND_COLORS[a.kind] ?? "zinc"} >{a.kind}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={a.status === "APPROVED" ? "green" : a.status === "REJECTED" ? "red" : "yellow"}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-zinc-400 text-xs">{a.decisionBy ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-500 text-xs">
                      {a.decisionAt ? a.decisionAt.toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-400 text-xs max-w-xs truncate">
                      {a.decisionNote ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
