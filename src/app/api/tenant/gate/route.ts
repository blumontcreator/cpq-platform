import { NextResponse } from "next/server";
import { getConsoleOperatorContext } from "@/lib/auth/operator-context";

export const dynamic = "force-dynamic";

/**
 * Edge-middleware helper: indicates whether an authenticated user lacks any
 * organization membership (needs `/setup`).
 */
export async function GET() {
  const ctx = await getConsoleOperatorContext();
  if (!ctx) {
    return NextResponse.json({ authenticated: false, needsSetup: false });
  }
  const needsSetup =
    ctx.organizationId === undefined ||
    ctx.organizationSlug === undefined ||
    ctx.organizationRole === undefined;
  return NextResponse.json({ authenticated: true, needsSetup });
}
