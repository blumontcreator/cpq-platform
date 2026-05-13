"use client";

import { useTransition } from "react";

export function ApprovalForm({
  approvalId,
  approveAction,
}: {
  approvalId: string;
  approveAction: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(fd: FormData) => {
        startTransition(async () => { await approveAction(fd); });
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="approvalId" value={approvalId} />
      <input
        name="note"
        placeholder="Decision note (optional)"
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          name="decision"
          value="APPROVED"
          disabled={isPending}
          className="flex-1 rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
        >
          {isPending ? "…" : "✓ Approve"}
        </button>
        <button
          type="submit"
          name="decision"
          value="REJECTED"
          disabled={isPending}
          className="flex-1 rounded bg-red-900 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-800 disabled:opacity-50"
        >
          ✗ Reject
        </button>
      </div>
    </form>
  );
}
