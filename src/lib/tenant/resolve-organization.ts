import type { OrganizationMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantResolutionError } from "./errors";

export interface ResolvedOrganization {
  id: string;
  slug: string;
  name: string;
  role: OrganizationMemberRole;
}

/**
 * Deterministic tenant selection: among all memberships for the user, choose
 * the organization with the earliest `createdAt` (stable ordering).
 */
export async function resolveOrganizationForUserId(
  userId: string,
): Promise<ResolvedOrganization | null> {
  try {
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId },
      include: { organization: true },
    });
    if (memberships.length === 0) return null;

    const sorted = [...memberships].sort(
      (a, b) =>
        a.organization.createdAt.getTime() - b.organization.createdAt.getTime(),
    );
    const row = sorted[0];
    if (!row) return null;

    return {
      id:   row.organization.id,
      slug: row.organization.slug,
      name: row.organization.name,
      role: row.role,
    };
  } catch (err) {
    throw new TenantResolutionError(
      "Failed to resolve organization for user",
      err,
    );
  }
}
