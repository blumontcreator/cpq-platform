"use client";

import { useTransition } from "react";

export {
  GuidedQuoteFromOpportunityForm,
  GuidedQuoteFromOpportunityForm as LifecycleForm,
} from "./guided-quote-from-opportunity-form";

const NEGOTIATION_EVENT_LABELS: Record<string, string> = {
  CUSTOMER_PRICE_REQUEST: "Customer price request",
  DISCOUNT_REQUEST: "Discount request",
  SCOPE_CHANGE: "Scope change",
  COUNTER_OFFER: "Counter-offer",
  ACCEPTANCE: "Acceptance",
  REJECTION: "Rejection",
  EXPIRY_EXTENSION: "Expiry extension",
};

export function NegotiationEventForm({
  addEventAction,
}: {
  addEventAction: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => { startTransition(() => addEventAction(fd)); }}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Activity type</label>
          <select
            name="kind"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none"
          >
            {["CUSTOMER_PRICE_REQUEST","DISCOUNT_REQUEST","SCOPE_CHANGE","COUNTER_OFFER","ACCEPTANCE","REJECTION","EXPIRY_EXTENSION"].map((k) => (
              <option key={k} value={k}>{NEGOTIATION_EVENT_LABELS[k] ?? k.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Recorded by</label>
          <input name="performedBy" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" placeholder="Your name or initials" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Requested Value ($)</label>
          <input name="requestedValue" type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Requested Discount (%)</label>
          <input name="requestedDiscount" type="number" step="0.1" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Granted Value ($)</label>
          <input name="grantedValue" type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Granted Discount (%)</label>
          <input name="grantedDiscount" type="number" step="0.1" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Concession Note</label>
        <input name="concessionNote" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
      </div>
      <button type="submit" disabled={pending}
        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors">
        {pending ? "Recording…" : "Record Negotiation Event"}
      </button>
    </form>
  );
}

export function CloseOutcomeForm({
  closeAction,
}: {
  closeAction: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => { startTransition(() => closeAction(fd)); }}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Outcome</label>
          <select name="outcome" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none">
            {["WON","LOST","EXPIRED","PARTIALLY_WON"].map((o) => (
              <option key={o} value={o}>{o.replace(/_/g," ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Realized Revenue ($)</label>
          <input name="realizedRevenue" type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Realized Margin (%)</label>
          <input name="realizedMarginPct" type="number" step="0.1" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Competitor Price ($)</label>
          <input name="competitorPrice" type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Loss Reason</label>
        <input name="lossReason" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" />
      </div>
      <button type="submit" disabled={pending}
        className="bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors">
        {pending ? "Closing…" : "Close Outcome"}
      </button>
    </form>
  );
}
