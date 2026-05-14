import { NextResponse } from "next/server";
import { getConsoleOperatorContext } from "@/lib/auth/operator-context";

export const dynamic = "force-dynamic";

/**
 * Middleware helper route: whether the session user still needs `/setup`.
 */
const noStore = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function GET() {
  const ctx = await getConsoleOperatorContext();
  if (!ctx) {
    return NextResponse.json(
      { authenticated: false, needsSetup: false },
      { headers: noStore },
    );
  }
  const needsSetup =
    ctx.organizationId === undefined ||
    ctx.organizationSlug === undefined ||
    ctx.organizationRole === undefined;
  return NextResponse.json(
    { authenticated: true, needsSetup },
    { headers: noStore },
  );
}
