import Link from "next/link";
import { notFound } from "next/navigation";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import { Badge, statusBadge } from "@/components/ui/badge";
import { QuoteTabs } from "@/components/console/quote-tabs";
import { QuoteNextStepsBanner } from "@/components/console/quote-next-steps-banner";

export async function QuoteWorkspaceChrome({ quoteId }: { quoteId: string }) {
  const scoped = await requireScopedPrisma();
  const quote = await scoped.quotes.findUnique({
    where: { id: quoteId },
    include: {
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
      outcome: true,
    },
  });
  if (!quote) notFound();

  const pendingApprovals = await scoped.prisma.approvalRequest.count({
    where: { quoteId, status: "PENDING" },
  });

  const graph = quote.graph as { nodes?: unknown[] } | null | undefined;
  const nodeCount = graph?.nodes?.length ?? 0;
  const hasGraph = graph != null && nodeCount > 0;
  const hasEvaluation = quote.evaluations.length > 0;

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 pt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Link href="/quotes" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← All quotes
        </Link>
        <span className="text-zinc-700">·</span>
        <h1 className="font-mono text-base font-semibold text-zinc-100">{quote.reference}</h1>
        <span className="text-xs text-zinc-500">{quote.currency}</span>
        <Badge variant={statusBadge(quote.status)}>{quote.status}</Badge>
        {quote.outcome && (
          <Badge variant={statusBadge(quote.outcome.outcome)}>{quote.outcome.outcome}</Badge>
        )}
      </div>

      <QuoteNextStepsBanner
        quoteId={quoteId}
        quoteStatus={quote.status}
        hasGraph={hasGraph}
        nodeCount={nodeCount}
        hasEvaluation={hasEvaluation}
        pendingApprovals={pendingApprovals}
        hasOutcome={quote.outcome != null}
      />

      <QuoteTabs quoteId={quoteId} />
    </div>
  );
}
