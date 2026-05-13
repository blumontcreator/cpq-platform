/**
 * RBAC types for the CPQ platform.
 *
 * Six roles with distinct authority levels, designed for enterprise commercial
 * operations. Roles are additive but scoped — every role can only do what its
 * permission set explicitly grants.
 */
import type { CpqRole, OrganizationMemberRole } from "@prisma/client";

export type { CpqRole, OrganizationMemberRole };

// ── Permissions ────────────────────────────────────────────────────────────

export const PERMISSIONS = [
  // Catalog
  "CATALOG_READ",
  "CATALOG_WRITE",
  // Pricing
  "PRICING_READ",
  "PRICING_WRITE",
  "PRICING_OVERRIDE",      // modify pricing rules mid-quote
  // Quotes
  "QUOTE_CREATE",
  "QUOTE_READ",
  "QUOTE_UPDATE",
  "QUOTE_DELETE",
  "QUOTE_SEND",            // transition to SENT status
  "QUOTE_APPROVE",         // approve quote in workflow
  "QUOTE_OVERRIDE",        // force-advance workflow state
  // Simulation
  "SIMULATION_RUN",
  "SIMULATION_READ",
  // Intelligence
  "INTELLIGENCE_READ",
  // Workflow
  "WORKFLOW_ADVANCE",
  "WORKFLOW_OVERRIDE",     // break-glass: manual state transition
  // Approval authorities (what kinds of approvals this role can grant)
  "APPROVE_MARGIN",        // approve margin exceptions
  "APPROVE_DISCOUNT",      // approve discount exceptions
  "APPROVE_HIGH_VALUE",    // approve high-value deals
  "APPROVE_STRATEGIC",     // approve strategic account deals
  "APPROVE_OVERRIDE",      // approve governance overrides
  // Governance
  "AUDIT_READ",
  "GOVERNANCE_OVERRIDE",   // record a governance override
  "GOVERNANCE_ROLLBACK",   // restore an earlier state
  // Administration
  "USER_MANAGE",
  "CONFIG_WRITE",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ── Operator context (injected per request / action) ──────────────────────

export interface OperatorContext {
  userId: string;
  role: CpqRole;
  email: string;
  name?: string;
  /** Delegated permissions beyond the base role (e.g. temporary elevation). */
  additionalPermissions?: Permission[];
  /** Prisma-backed tenant (present when the user has ≥1 org membership). */
  organizationId?: string;
  organizationSlug?: string;
  organizationRole?: OrganizationMemberRole;
  organizationName?: string;
}

// ── Approval authority ────────────────────────────────────────────────────

export type ApprovalKind =
  | "MARGIN"
  | "DISCOUNT"
  | "HIGH_VALUE"
  | "STRATEGIC"
  | "OVERRIDE";

/**
 * Minimum approval authority per kind.
 * A role can approve if it has the corresponding permission.
 */
export const APPROVAL_AUTHORITY: Record<ApprovalKind, Permission> = {
  MARGIN:     "APPROVE_MARGIN",
  DISCOUNT:   "APPROVE_DISCOUNT",
  HIGH_VALUE: "APPROVE_HIGH_VALUE",
  STRATEGIC:  "APPROVE_STRATEGIC",
  OVERRIDE:   "APPROVE_OVERRIDE",
};

// ── Quote ownership ───────────────────────────────────────────────────────

export interface QuoteOwnership {
  ownerId: string;
  /** Whether this user was explicitly shared the quote. */
  isShared?: boolean;
}
