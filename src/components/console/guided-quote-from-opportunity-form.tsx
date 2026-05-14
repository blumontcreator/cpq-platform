"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { searchCatalogVariantsForPicker } from "@/app/(console)/actions/catalog-picker.actions";
import type { CatalogPickerRow } from "@/app/(console)/actions/catalog-picker.actions";

type Line = { sku: string; quantity: number; label?: string; productName?: string };

export function GuidedQuoteFromOpportunityForm({
  opportunityId,
  runAction,
}: {
  opportunityId: string;
  runAction: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CatalogPickerRow[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [pasteSkus, setPasteSkus] = useState("");
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const r = await searchCatalogVariantsForPicker(q);
      setHits(r);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  function addLine(row: CatalogPickerRow) {
    setLines((prev) => {
      const i = prev.findIndex((p) => p.sku === row.sku);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: Math.min(9999, next[i].quantity + 1) };
        return next;
      }
      return [
        ...prev,
        {
          sku: row.sku,
          quantity: 1,
          label: row.label ?? undefined,
          productName: row.productName,
        },
      ];
    });
    setQuery("");
    void runSearch("");
  }

  function setQty(sku: string, quantity: number) {
    const q = Math.max(1, Math.min(9999, Math.floor(quantity) || 1));
    setLines((prev) => prev.map((l) => (l.sku === sku ? { ...l, quantity: q } : l)));
  }

  function removeLine(sku: string) {
    setLines((prev) => prev.filter((l) => l.sku !== sku));
  }

  return (
    <form
      action={(fd) => {
        startTransition(() => runAction(fd));
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="linesJson" value={JSON.stringify(lines.map(({ sku, quantity }) => ({ sku, quantity })))} />

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-300">
          Add products from catalog
        </label>
        <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
          Search by SKU, name, or product. Click a row to add it to this quote. Quantities can be
          adjusted before you create the quote.
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search catalog…"
          autoComplete="off"
          className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
        />
        <div className="mt-1 max-h-40 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/50">
          {searching && (
            <p className="px-3 py-2 text-[11px] text-zinc-500">Searching…</p>
          )}
          {!searching && hits.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-zinc-500">No matches. Try another search.</p>
          )}
          {!searching &&
            hits.map((h) => (
              <button
                key={h.sku}
                type="button"
                onClick={() => addLine(h)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-zinc-800/80 px-3 py-2 text-left text-xs last:border-0 hover:bg-zinc-800/60"
              >
                <span className="font-mono text-zinc-200">{h.sku}</span>
                <span className="text-zinc-500">
                  {h.productName}
                  {h.label ? ` · ${h.label}` : ""}
                </span>
              </button>
            ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-300">Line items ({lines.length})</label>
        {lines.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-700 bg-zinc-950/30 px-3 py-4 text-center text-[11px] text-zinc-500">
            No lines yet — search above and add products, or use the advanced SKU list.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => (
              <li
                key={l.sku}
                className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-zinc-200">{l.sku}</div>
                  {(l.productName || l.label) && (
                    <div className="truncate text-[10px] text-zinc-500">
                      {[l.productName, l.label].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-1 text-zinc-500">
                  <span className="sr-only">Quantity</span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={l.quantity}
                    onChange={(e) => setQty(l.sku, parseInt(e.target.value, 10))}
                    className="w-16 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-right text-zinc-100"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeLine(l.sku)}
                  className="shrink-0 text-zinc-500 hover:text-red-400"
                  aria-label={`Remove ${l.sku}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || (lines.length === 0 && !pasteSkus.trim())}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Creating quote…" : "Create priced quote"}
      </button>
      <p className="text-[10px] leading-relaxed text-zinc-600">
        This runs pricing, margin checks, approvals if required, and opens the quote in your workspace.
        You can refine line items afterward in the quote builder.
      </p>

      <details className="rounded border border-zinc-800/80 bg-zinc-950/20">
        <summary className="cursor-pointer px-3 py-2 text-[11px] text-zinc-400 hover:text-zinc-300">
          Advanced: paste SKU list (one per line or comma-separated)
        </summary>
        <div className="border-t border-zinc-800/80 p-3 pt-2">
          <p className="mb-2 text-[10px] text-zinc-600">
            When this field is used together with line items above, line items take priority. Leave line
            items empty to use only pasted SKUs (quantity 1 each).
          </p>
          <textarea
            name="skus"
            rows={3}
            value={pasteSkus}
            onChange={(e) => setPasteSkus(e.target.value)}
            placeholder={"A400-BK-001\nA400-BK-002"}
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
        </div>
      </details>
    </form>
  );
}
