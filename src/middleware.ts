import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PROTECTED_PREFIXES = [
  "/opportunities",
  "/approvals",
  "/catalog",
  "/quotes",
  "/imports",
  "/intelligence",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function needsTenantGate(pathname: string): boolean {
  if (pathname.startsWith("/setup")) return false;
  if (pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/logout")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname === "/") return false;
  return isProtectedPath(pathname);
}

function supabaseEnv(): { url: string; key: string } | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

async function fetchTenantGate(
  request: NextRequest,
): Promise<{ needsSetup: boolean } | null> {
  try {
    const gateRes = await fetch(new URL("/api/tenant/gate", request.url), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!gateRes.ok) return null;
    return (await gateRes.json()) as { needsSetup: boolean };
  } catch {
    return null;
  }
}

function redirectPreservingCookies(from: NextResponse, url: URL) {
  const redirectResponse = NextResponse.redirect(url);
  from.cookies.getAll().forEach(({ name, value, ...opts }) => {
    redirectResponse.cookies.set(name, value, opts);
  });
  return redirectResponse;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const env = supabaseEnv();
  if (!env) {
    if (isProtectedPath(pathname)) {
      const u = new URL("/login", request.url);
      u.searchParams.set("error", "config");
      return NextResponse.redirect(u);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/setup") && !user) {
    const u = new URL("/login", request.url);
    u.searchParams.set("next", "/setup");
    return redirectPreservingCookies(response, u);
  }

  if (pathname.startsWith("/login") && user) {
    const gate = await fetchTenantGate(request);
    if (gate?.needsSetup) {
      return redirectPreservingCookies(response, new URL("/setup", request.url));
    }
    return redirectPreservingCookies(response, new URL("/catalog", request.url));
  }

  if (user && needsTenantGate(pathname)) {
    const gate = await fetchTenantGate(request);
    if (gate?.needsSetup) {
      return redirectPreservingCookies(response, new URL("/setup", request.url));
    }
  }

  if (isProtectedPath(pathname) && !user) {
    const u = new URL("/login", request.url);
    u.searchParams.set("next", pathname);
    return redirectPreservingCookies(response, u);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
