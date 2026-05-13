"use client";

import { useTransition } from "react";

export function AddVariantForm({
  addVariantAction,
}: {
  addVariantAction: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await addVariantAction(formData);
    });
  }

  return (
    <form action={handleSubmit} className="flex gap-2">
      <input
        name="sku"
        placeholder="Variant SKU"
        required
        className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
      />
      <input
        name="quantity"
        type="number"
        min="1"
        defaultValue="1"
        className="w-20 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "+ Add"}
      </button>
    </form>
  );
}
