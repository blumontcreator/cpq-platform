/**
 * Validates Supabase Auth env + connectivity. Optionally exercises email/password login.
 *
 * Usage:
 *   npx tsx scripts/verify-supabase-auth.ts
 *
 * Optional (full login round-trip against your Supabase project):
 *   AUTH_TEST_EMAIL=... AUTH_TEST_PASSWORD=... npx tsx scripts/verify-supabase-auth.ts
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

function envKeys(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return { url, key };
}

async function main() {
  const { url, key } = envKeys();
  const authHealth = new URL("/auth/v1/health", url);
  const healthRes = await fetch(authHealth, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!healthRes.ok) {
    throw new Error(`Auth API health check failed: HTTP ${healthRes.status}`);
  }
  console.log("Auth API reachable (health OK)");

  const email = process.env.AUTH_TEST_EMAIL?.trim();
  const password = process.env.AUTH_TEST_PASSWORD;
  if (!email || password === undefined || password === "") {
    console.log(
      "Skipping password login test — set AUTH_TEST_EMAIL and AUTH_TEST_PASSWORD to verify credentials.",
    );
    return;
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signInWithPassword: ${error.message}`);
  }
  if (!data.session) {
    throw new Error("signInWithPassword succeeded but no session returned");
  }
  console.log("signInWithPassword OK (session established)");

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    throw new Error(`signOut: ${signOutError.message}`);
  }
  console.log("signOut OK");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
