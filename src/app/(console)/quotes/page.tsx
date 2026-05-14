export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireScopedPrisma } from "@/lib/db/scoped-prisma";
import { createQuote } from "../actions/quote.actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, statusBadge } from "@/components/ui/badge";
import { WalkthroughHint } from "@/components/console/walkthrough-hint";

export const metadata = { title: "Quotes — CPQ Console" };

async function getQuotes() {
  const scoped = await requireScopedPrisma();
  return scoped.quotes.findMany({
    include: {
      _count: { select: { lines: true, evaluations: true, scenarioRuns: true } },
      outcome: { select: { outcome: true, realizedMarginPct: true } },
      workflow: { select: { currentState: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export default async function QuotesPage() {
  const quotes = await getQuotes();

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Quotes</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{quotes.length} quotes</p>
        </div>
      </div>

      <WalkthroughHint title="Quote workflow">
        Use <strong className="text-zinc-300">New quote</strong> for an empty shell, or start from an opportunity to price in one step. After lines exist: run pricing → clear approvals → log negotiation → record outcome.
      </WalkthroughHint>

      {/* Create quote form */}
      <Card>
        <CardHeader label="New Quote" />
        <form action={createQuote} className="flex gap-2 p-4">
          <input
            name="reference"
            placeholder="Quote reference (e.g. Q-2026-001)"
            required
            className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
          />
          <select
            name="currency"
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            + Create
          </button>
        </form>
      </Card>

      {/* Quote list */}
      <Card>
        <CardHeader label="All Quotes" />
        {quotes.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            No quotes yet. Create one above, or seed demo data with{" "}
            <code className="text-zinc-400">npm run demo:seed</code>.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {quotes.map((q) => {
              const hasGraph = q._count.evaluations > 0 || q._count.scenarioRuns > 0;
              return (
                <Link
                  key={q.id}
                  href={`/quotes/${q.id}`}
                  className="flex items-center gap-4 px-4 py-2.5 hover:bg-zinc-800/40 transition-colors group"
                >
                  <span className="w-48 font-mono text-xs text-zinc-300 group-hover:text-blue-400 truncate">
                    {q.reference}
                  </span>
                  <Badge variant={statusBadge(q.status)}>{q.status}</Badge>
                  {q.workflow && (
                    <Badge variant={statusBadge(q.workflow.currentState)}>
                      {q.workflow.currentState}
                    </Badge>
                  )}
                  {q.outcome && (
                    <Badge variant={statusBadge(q.outcome.outcome)}>{q.outcome.outcome}</Badge>
                  )}
                  <span className="flex-1" />
                  <span className="font-mono text-[10px] text-zinc-600">{q.currency}</span>
                  {hasGraph && <span className="text-[10px] text-emerald-600/90">priced</span>}
                  <span className="font-mono text-[10px] text-zinc-600">
                    {new Date(q.createdAt).toISOString().slice(0, 10)}
                  </span>
                  <span className="text-zinc-700 group-hover:text-zinc-400">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
