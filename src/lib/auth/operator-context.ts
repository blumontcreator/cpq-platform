import type { OperatorContext } from "@/modules/governance/rbac";
import { resolveOrganizationForUserId } from "@/lib/tenant/resolve-organization";
import { isAuthConfigured } from "./env";
import { createSupabaseServerClient } from "./supabase-server";
import { syncAuthUserToPrisma } from "./sync-user";
import { prisma } from "@/lib/prisma";

function applyResolvedTenant(
  base: OperatorContext,
  tenant: Awaited<ReturnType<typeof resolveOrganizationForUserId>>,
): OperatorContext {
  if (!tenant) return base;
  return {
    ...base,
    organizationId:   tenant.id,
    organizationSlug: tenant.slug,
    organizationRole: tenant.role,
    organizationName: tenant.name,
  };
}

/**
 * Resolves the authenticated Supabase user to an `OperatorContext` for RBAC.
 * Returns `null` if there is no valid session or the operator is inactive / missing.
 */
export async function getConsoleOperatorContext(): Promise<OperatorContext | null> {
  if (!isAuthConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;

  let dbUser;
  try {
    dbUser = await syncAuthUserToPrisma(user);
  } catch {
    return null;
  }

  if (!dbUser.active) return null;

  const base: OperatorContext = {
    userId: dbUser.id,
    role:   dbUser.role,
    email:  dbUser.email,
    name:   dbUser.name ?? undefined,
  };

  const tenant = await resolveOrganizationForUserId(dbUser.id);
  return applyResolvedTenant(base, tenant);
}

/**
 * Same as `getConsoleOperatorContext` but skips provisioning (strict).
 * Use when you only want existing Prisma users.
 */
export async function getConsoleOperatorContextStrict(): Promise<OperatorContext | null> {
  if (!isAuthConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.id) return null;

  const dbUser = await prisma.user.findUnique({
    where: { authSubject: user.id },
  });
  if (!dbUser?.active) return null;

  const base: OperatorContext = {
    userId: dbUser.id,
    role:   dbUser.role,
    email:  dbUser.email,
    name:   dbUser.name ?? undefined,
  };
  const tenant = await resolveOrganizationForUserId(dbUser.id);
  return applyResolvedTenant(base, tenant);
}
