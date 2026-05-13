/**
 * Supabase Auth environment — publishable URL + anon/publishable key only.
 * Never use the service role key in the Next.js bundle.
 */

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return undefined;
}

export function getSupabaseUrl(): string {
  const url = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
  if (!url) {
    throw new Error(
      "Missing Supabase URL. Set NEXT_PUBLIC_SUPABASE_URL (or PUBLIC_SUPABASE_URL / SUPABASE_URL).",
    );
  }
  return url;
}

/** Anon / publishable key — safe for browser and SSR with RLS. */
export function getSupabasePublishableKey(): string {
  const key = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
  );
  if (!key) {
    throw new Error(
      "Missing Supabase publishable key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return key;
}

export function isAuthConfigured(): boolean {
  try {
    getSupabaseUrl();
    getSupabasePublishableKey();
    return true;
  } catch {
    return false;
  }
}
