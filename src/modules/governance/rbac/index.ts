export type { CpqRole, Permission, OperatorContext, ApprovalKind, QuoteOwnership } from "./types";
export { PERMISSIONS, APPROVAL_AUTHORITY } from "./types";
export { ROLE_PERMISSIONS } from "./permissions";
export {
  AuthorizationError,
  hasPermission,
  requirePermission,
  canApprove,
  canAccessQuote,
  canEditQuote,
  canOverride,
  getEffectivePermissions,
  satisfiesRequiredRole,
} from "./authorization";
