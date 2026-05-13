/**
 * Runtime checks for tenant boundaries. Use when both operands carry an organization id
 * (e.g. future `organizationId` columns, JWT claims vs row scope).
 */

export class OrganizationMismatchError extends Error {
  constructor(
    public readonly leftOrganizationId: string,
    public readonly rightOrganizationId: string,
  ) {
    super(
      `Organization mismatch: ${leftOrganizationId} !== ${rightOrganizationId}`,
    );
    this.name = "OrganizationMismatchError";
  }
}

export class OrganizationAccessDeniedError extends Error {
  constructor(
    public readonly organizationId: string,
    public readonly reason: string,
  ) {
    super(`Organization access denied (${organizationId}): ${reason}`);
    this.name = "OrganizationAccessDeniedError";
  }
}

export function assertSameOrganization(a: string, b: string): void {
  if (a !== b) {
    throw new OrganizationMismatchError(a, b);
  }
}

/** Ensures a resource’s organization matches the active scoped tenant. */
export function assertOrganizationAccess(
  scopedOrganizationId: string,
  resourceOrganizationId: string,
): void {
  assertSameOrganization(scopedOrganizationId, resourceOrganizationId);
}
