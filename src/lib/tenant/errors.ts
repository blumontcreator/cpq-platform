/**
 * Typed tenant-resolution failures for programmatic handling (APIs, scripts).
 * App Router flows typically use `redirect("/setup")` instead of throwing.
 */
export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}

/** Authenticated user has no organization memberships in Prisma. */
export class NoOrganizationMembershipError extends TenantError {
  constructor(public readonly userId: string) {
    super(`No organization membership for user ${userId}`);
    this.name = "NoOrganizationMembershipError";
  }
}

/** Unexpected failure while loading tenant data from the database. */
export class TenantResolutionError extends TenantError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TenantResolutionError";
  }
}
