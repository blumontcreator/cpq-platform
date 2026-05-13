/**
 * Role-to-permission mapping for the CPQ platform.
 *
 * Design principles:
 *   - Least privilege: each role gets exactly what it needs
 *   - Additive: higher roles include lower-role permissions
 *   - Explicit: no implicit inheritance — every permission is listed
 *   - AI-seam: role assignments can be injected / overridden by policy engine
 */
import type { CpqRole } from "@prisma/client";
import type { Permission } from "./types";

const OPERATOR_PERMISSIONS: Permission[] = [
  "CATALOG_READ",
  "PRICING_READ",
  "QUOTE_READ",
  "SIMULATION_READ",
  "INTELLIGENCE_READ",
  "AUDIT_READ",
];

const SALES_PERMISSIONS: Permission[] = [
  ...OPERATOR_PERMISSIONS,
  "QUOTE_CREATE",
  "QUOTE_UPDATE",
  "QUOTE_SEND",
  "SIMULATION_RUN",
  "WORKFLOW_ADVANCE",
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...SALES_PERMISSIONS,
  "CATALOG_WRITE",
  "PRICING_WRITE",
  "PRICING_OVERRIDE",
  "QUOTE_APPROVE",
  "QUOTE_OVERRIDE",
  "WORKFLOW_OVERRIDE",
  "APPROVE_MARGIN",
  "APPROVE_DISCOUNT",
  "APPROVE_HIGH_VALUE",
  "GOVERNANCE_OVERRIDE",
];

const FINANCE_PERMISSIONS: Permission[] = [
  "CATALOG_READ",
  "PRICING_READ",
  "PRICING_WRITE",
  "PRICING_OVERRIDE",
  "QUOTE_READ",
  "QUOTE_APPROVE",
  "INTELLIGENCE_READ",
  "AUDIT_READ",
  "APPROVE_MARGIN",
  "APPROVE_DISCOUNT",
];

const PROCUREMENT_PERMISSIONS: Permission[] = [
  "CATALOG_READ",
  "CATALOG_WRITE",
  "PRICING_READ",
  "QUOTE_READ",
  "SIMULATION_READ",
  "INTELLIGENCE_READ",
  "AUDIT_READ",
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MANAGER_PERMISSIONS,
  ...FINANCE_PERMISSIONS,
  ...PROCUREMENT_PERMISSIONS,
  "QUOTE_DELETE",
  "APPROVE_STRATEGIC",
  "APPROVE_OVERRIDE",
  "GOVERNANCE_ROLLBACK",
  "USER_MANAGE",
  "CONFIG_WRITE",
];

export const ROLE_PERMISSIONS: Record<CpqRole, Permission[]> = {
  OPERATOR:    dedupe(OPERATOR_PERMISSIONS),
  SALES:       dedupe(SALES_PERMISSIONS),
  MANAGER:     dedupe(MANAGER_PERMISSIONS),
  FINANCE:     dedupe(FINANCE_PERMISSIONS),
  PROCUREMENT: dedupe(PROCUREMENT_PERMISSIONS),
  ADMIN:       dedupe(ADMIN_PERMISSIONS),
};

function dedupe(permissions: Permission[]): Permission[] {
  return [...new Set(permissions)];
}
