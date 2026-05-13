"use client";

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ConsoleError({ error, reset }: Props) {
  useEffect(() => {
    // In production, send to error tracking (Sentry, Datadog)
    console.error("[ConsoleError]", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 gap-4">
      <div className="text-red-400 font-mono text-sm">Error</div>
      <h2 className="text-zinc-100 text-lg font-semibold">Something went wrong</h2>
      <p className="text-zinc-500 text-sm max-w-md text-center">
        {error.message ?? "An unexpected error occurred in the console."}
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] text-zinc-700">digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-2 px-4 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
