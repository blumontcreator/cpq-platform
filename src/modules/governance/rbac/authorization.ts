/**
 * Authorization engine.
 *
 * Pure functions — no side effects, no DB calls. Every function takes an
 * OperatorContext and returns a boolean or throws an AuthorizationError.
 *
 * Design: keep authorization deterministic and testable in isolation.
 * The orchestration layer (server actions, API routes) calls these functions
 * before executing any business operation.
 */
import type { OperatorContext, Permission, ApprovalKind } from "./types";
import { ROLE_PERMISSIONS } from "./permissions";
import { APPROVAL_AUTHORITY } from "./types";

// ── Authorization error ────────────────────────────────────────────────────

export class AuthorizationError extends Error {
  constructor(
    public readonly permission: Permission | string,
    public readonly context: { userId: string; role: string },
    message?: string,
  ) {
    super(
      message ??
        `User ${context.userId} (role=${context.role}) lacks permission: ${permission}`,
    );
    this.name = "AuthorizationError";
  }
}

// ── Core check ────────────────────────────────────────────────────────────

/**
 * Returns true if the operator holds the given permission, considering both
 * their base role and any delegated permissions.
 */
export function hasPermission(
  operator: OperatorContext,
  permission: Permission,
): boolean {
  const rolePerms = ROLE_PERMISSIONS[operator.role] ?? [];
  if (rolePerms.includes(permission)) return true;
  if (operator.additionalPermissions?.includes(permission)) return true;
  return false;
}

/**
 * Throws AuthorizationError if the operator lacks the permission.
 * Use this at the boundary of every sensitive operation.
 */
export function requirePermission(
  operator: OperatorContext,
  permission: Permission,
): void {
  if (!hasPermission(operator, permission)) {
    throw new AuthorizationError(permission, {
      userId: operator.userId,
      role: operator.role,
    });
  }
}

/**
 * Returns true if the operator can make approval decisions of the given kind.
 */
export function canApprove(
  operator: OperatorContext,
  kind: ApprovalKind,
): boolean {
  const requiredPermission = APPROVAL_AUTHORITY[kind];
  return hasPermission(operator, requiredPermission);
}

/**
 * Returns true if the operator can view or edit a specific quote.
 * Owners can always access their own quotes; other roles need QUOTE_READ.
 */
export function canAccessQuote(
  operator: OperatorContext,
  quoteOwnerId: string | null | undefined,
): boolean {
  if (operator.userId === quoteOwnerId) return true;
  return hasPermission(operator, "QUOTE_READ");
}

/**
 * Returns true if the operator can edit the quote.
 * Admins + Managers can edit any quote; Sales can only edit their own.
 */
export function canEditQuote(
  operator: OperatorContext,
  quoteOwnerId: string | null | undefined,
): boolean {
  if (!hasPermission(operator, "QUOTE_UPDATE")) return false;
  if (operator.role === "ADMIN" || operator.role === "MANAGER") return true;
  return operator.userId === quoteOwnerId;
}

/**
 * Returns true if the operator can record a governance override.
 * Overrides must be approved by MANAGER or higher.
 */
export function canOverride(operator: OperatorContext): boolean {
  return hasPermission(operator, "GOVERNANCE_OVERRIDE");
}

/**
 * Returns the full set of permissions for an operator (useful for UI feature flags).
 */
export function getEffectivePermissions(operator: OperatorContext): Permission[] {
  const base = ROLE_PERMISSIONS[operator.role] ?? [];
  const extra = operator.additionalPermissions ?? [];
  return [...new Set([...base, ...extra])];
}

/**
 * Asserts that the requiredRole is held by the operator.
 * Maps workflow `requiredRole` strings (used in ApprovalRequest) to our permission model.
 */
export function satisfiesRequiredRole(
  operator: OperatorContext,
  requiredRole: string,
): boolean {
  const roleHierarchy: Record<string, number> = {
    OPERATOR: 0,
    SALES: 1,
    MANAGER: 2,
    FINANCE: 2,
    PROCUREMENT: 2,
    ADMIN: 99,
  };
  const operatorLevel = roleHierarchy[operator.role] ?? 0;
  const requiredLevel = roleHierarchy[requiredRole] ?? 0;
  return operatorLevel >= requiredLevel;
}
