"use client";

import { useTransition } from "react";

const STRATEGIES = ["BALANCED", "AGGRESSIVE", "PREMIUM", "STRATEGIC"] as const;

export function RunSimulationForm({
  runAction,
}: {
  runAction: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {STRATEGIES.map((strategy) => (
        <form
          key={strategy}
          action={(fd: FormData) => {
            fd.set("strategy", strategy);
            startTransition(async () => { await runAction(fd); });
          }}
        >
          <input type="hidden" name="strategy" value={strategy} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-40"
          >
            {isPending ? "Running…" : `▶ ${strategy}`}
          </button>
        </form>
      ))}
    </div>
  );
}
