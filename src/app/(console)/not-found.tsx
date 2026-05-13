import Link from "next/link";

export default function ConsoleNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 gap-4">
      <div className="text-zinc-600 font-mono text-sm">404</div>
      <h2 className="text-zinc-100 text-lg font-semibold">Page not found</h2>
      <p className="text-zinc-500 text-sm">
        The resource you requested does not exist or has been removed.
      </p>
      <Link
        href="/"
        className="mt-2 px-4 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
      >
        ← Back to console
      </Link>
    </div>
  );
}
