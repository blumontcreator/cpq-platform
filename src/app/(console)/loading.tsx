export default function ConsoleLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col gap-4 p-6 text-zinc-400">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-800/80" />
      <div className="h-32 w-full animate-pulse rounded-lg bg-zinc-900/80" />
      <div className="h-32 w-full animate-pulse rounded-lg bg-zinc-900/80" />
    </div>
  );
}
