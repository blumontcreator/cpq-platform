import { redirect } from "next/navigation";
import type { OperatorContext } from "@/modules/governance/rbac";
import { getConsoleOperatorContext } from "./operator-context";

/**
 * Server-only guard for the operator console. Redirects to `/login` when
 * unauthenticated or inactive. Does not run in Client Components.
 */
export async function requireConsoleAuth(): Promise<OperatorContext> {
  const ctx = await getConsoleOperatorContext();
  if (!ctx) {
    redirect("/login");
  }
  return ctx;
}
