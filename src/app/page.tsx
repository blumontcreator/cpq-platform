import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 dark:bg-zinc-950">
      <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Importer / distributor CPQ
        </p>
        <h1 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          CPQ platform
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
          Foundation is in place: Next.js App Router, Tailwind v3, Prisma 6 with
          PostgreSQL, and domain-oriented folders under{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm dark:bg-zinc-800">
            src/domains
          </code>
          . Connect a database, run{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm dark:bg-zinc-800">
            npm run db:push
          </code>
          , then start modeling products and quotes.
        </p>
        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
          >
            Operator sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
