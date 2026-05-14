"use client";
import { useTransition } from "react";

export function ApprovalForm({
  approvalId,
  approveAction,
}: {
  approvalId: string;
  approveAction: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => { startTransition(() => approveAction(fd)); }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="approvalId" value={approvalId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Decision</label>
          <select name="decision" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none">
            <option value="APPROVED">Approve</option>
            <option value="REJECTED">Reject</option>
          </select>
          <p className="mt-1 text-[10px] text-zinc-600">Your signed-in account is stored as the approver.</p>
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Note</label>
        <input name="note" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100" placeholder="Justification or override rationale" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors">
          {pending ? "Submitting…" : "Submit Decision"}
        </button>
      </div>
    </form>
  );
}
