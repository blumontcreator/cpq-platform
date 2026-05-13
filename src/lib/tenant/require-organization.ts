import { redirect } from "next/navigation";
import { getCurrentOrganization } from "./tenant-context";
import type { CurrentOrganization } from "./tenant-context";

/**
 * Ensures the operator belongs to at least one organization. Redirects to
 * `/setup` when there is no resolvable tenant.
 */
export async function requireOrganization(): Promise<CurrentOrganization> {
  const org = await getCurrentOrganization();
  if (!org) {
    redirect("/setup");
  }
  return org;
}
