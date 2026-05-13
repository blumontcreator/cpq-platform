import { getConsoleOperatorContext } from "@/lib/auth/operator-context";
import type { ResolvedOrganization } from "./resolve-organization";

export type CurrentOrganization = ResolvedOrganization;

/**
 * Returns the current tenant for the authenticated console operator, or `null`
 * if there is no session or the user has no organization memberships.
 */
export async function getCurrentOrganization(): Promise<CurrentOrganization | null> {
  const op = await getConsoleOperatorContext();
  if (
    !op?.organizationId ||
    !op.organizationSlug ||
    op.organizationRole === undefined
  ) {
    return null;
  }
  return {
    id:   op.organizationId,
    slug: op.organizationSlug,
    name: op.organizationName ?? op.organizationSlug,
    role: op.organizationRole,
  };
}
