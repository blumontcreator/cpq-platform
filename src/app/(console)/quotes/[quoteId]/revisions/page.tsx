export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRevisions } from "@/modules/negotiation";
import { Card, CardBody, CardHeader, StatRow } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TracePanel, TraceRow } from "@/components/ui/trace-panel";
import Link from "next/link";
import { QuoteTabs } from "@/components/console/quote-tabs";

interface Props { params: Promise<{ quoteId: string }> }

const REASON_COLORS: Record<string, "zinc" | "blue" | "yellow" | "green" | "purple"> = {
  INITIAL: "zinc",
  CUSTOMER_REQUEST: "blue",
  INTERNAL_REVISION: "zinc",
  POST_APPROVAL: "green",
  NEGOTIATION: "yellow",
  SCOPE_CHANGE: "purple",
};

export default async function RevisionsPage({ params }: Props) {
  const { quoteId } = await params;
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) notFound();

  const revisions = await getRevisions(prisma, quoteId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/quotes/${quoteId}`} className="text-zinc-500 hover:text-zinc-300 text-sm">← Quote</Link>
        <span className="text-zinc-700">/</span>
        <span className="text-sm font-mono text-zinc-300">{quote.reference}</span>
      </div>

      <QuoteTabs quoteId={quoteId} />

      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Quote Revision Timeline</h1>
        <p className="text-xs text-zinc-500 mt-1">{revisions.length} revision(s) — immutable history</p>
      </div>

      {revisions.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-zinc-500 text-center py-4">
              No revisions recorded. Execute the lifecycle to create the initial revision.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-5 top-4 bottom-4 w-px bg-zinc-700" />
          <div className="space-y-4">
            {revisions.map((rev, idx) => {
              const snapshot = rev.snapshot as Record<string, unknown> | null;
              const nodes = Array.isArray((snapshot as Record<string, unknown> | null)?.["nodes"])
                ? ((snapshot as Record<string, unknown>)["nodes"] as unknown[]).length
                : "—";

              return (
                <div key={rev.id} className="flex gap-4">
                  <div className="relative flex-none">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold z-10 relative
                      ${idx === 0 ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
                      R{rev.revisionNo}
                    </div>
                  </div>
                  <Card className="flex-1">
                    <CardHeader
                      label={`Revision ${rev.revisionNo}`}
                      actions={
                        <Badge variant={REASON_COLORS[rev.reason] ?? "zinc"}>
                          {rev.reason.replace(/_/g," ")}
                        </Badge>
                      }
                    />
                    <CardBody>
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <StatRow label="Created" value={rev.createdAt.toLocaleString()} />
                        <StatRow label="Changed By" value={rev.changedBy ?? "—"} />
                        <StatRow label="Graph Nodes" value={String(nodes)} />
                      </div>
                      {rev.changeNote && (
                        <p className="text-xs text-zinc-400 bg-zinc-900 rounded p-2 mb-3">
                          {rev.changeNote}
                        </p>
                      )}
                      {snapshot && (
                        <TracePanel label="Snapshot Preview">
                          {Object.entries(snapshot)
                            .filter(([k]) => k !== "nodes" && k !== "edges")
                            .slice(0, 5)
                            .map(([k, v]) => (
                              <TraceRow key={k} label={k} value={JSON.stringify(v).slice(0, 80)} />
                            ))}
                        </TracePanel>
                      )}
                    </CardBody>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
