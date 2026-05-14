import Link from "next/link";

export type QuoteNextStepsInput = {
  quoteId: string;
  quoteStatus: string;
  hasGraph: boolean;
  nodeCount: number;
  hasEvaluation: boolean;
  pendingApprovals: number;
  hasOutcome: boolean;
};

/**
 * Single primary CTA for the canonical quote journey (operator language).
 */
export function QuoteNextStepsBanner(props: QuoteNextStepsInput) {
  const {
    quoteId,
    quoteStatus,
    hasGraph,
    nodeCount,
    hasEvaluation,
    pendingApprovals,
    hasOutcome,
  } = props;

  if (hasOutcome) {
    return (
      <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
        Outcome recorded for this quote. You can still review history in Negotiation and Workflow.
      </div>
    );
  }

  let title: string;
  let detail: string;
  let href: string;
  let cta: string;

  if (!hasGraph || nodeCount === 0) {
    title = "Next: build the quote";
    detail = "Add catalog lines so the platform can price the deal and check margins.";
    href = `/quotes/${quoteId}`;
    cta = "Open quote builder";
  } else if (!hasEvaluation) {
    title = "Next: run pricing";
    detail =
      "Pricing rolls up margin and revenue, and opens any required approvals based on your rules.";
    href = `/quotes/${quoteId}`;
    cta = "Run pricing on quote builder";
  } else if (pendingApprovals > 0) {
    title = `Next: approvals (${pendingApprovals})`;
    detail = "A pricing or discount decision needs sign-off before you treat this quote as final.";
    href = `/quotes/${quoteId}/workflow`;
    cta = "Open approvals";
  } else if (quoteStatus === "DRAFT" || quoteStatus === "SENT") {
    title = "Next: customer discussion";
    detail = "Log requests and concessions, then record the final outcome when the customer decides.";
    href = `/quotes/${quoteId}/negotiate`;
    cta = "Go to negotiation";
  } else {
    title = "Next: record outcome";
    detail = "Close the loop so win/loss and margin feed future guidance.";
    href = `/quotes/${quoteId}/outcome`;
    cta = "Record outcome";
  }

  return (
    <div className="mb-3 rounded-lg border border-blue-900/40 bg-blue-950/25 px-4 py-3">
      <p className="text-sm font-medium text-zinc-100">{title}</p>
      {detail && <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{detail}</p>}
      <Link
        href={href}
        className="mt-2 inline-flex text-xs font-medium text-blue-400 hover:text-blue-300"
      >
        {cta} →
      </Link>
    </div>
  );
}
