"use client";

import { useFormStatus } from "react-dom";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Running pricing…" : "Run pricing"}
    </button>
  );
}

export function RunPricingForm({
  action,
  hasGraph,
}: {
  action: (formData: FormData) => Promise<void>;
  hasGraph: boolean;
}) {
  return (
    <form action={action}>
      <Submit disabled={!hasGraph} />
    </form>
  );
}
