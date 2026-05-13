import type { PrismaClient } from "@prisma/client";
import { prisma as rootPrisma } from "@/lib/prisma";
import { requireConsoleAuth } from "@/lib/auth/guards";
import { requireOrganization } from "@/lib/tenant/require-organization";

function quoteDelegates(client: PrismaClient) {
  return {
    findUnique: client.quote.findUnique.bind(client.quote),
    findFirst:  client.quote.findFirst.bind(client.quote),
    findMany:   client.quote.findMany.bind(client.quote),
    create:     client.quote.create.bind(client.quote),
    update:     client.quote.update.bind(client.quote),
  };
}

function opportunityDelegates(client: PrismaClient) {
  return {
    findUnique: client.opportunity.findUnique.bind(client.opportunity),
  };
}

function scenarioRunDelegates(client: PrismaClient) {
  return {
    findMany: client.scenarioRun.findMany.bind(client.scenarioRun),
  };
}

function productVariantDelegates(client: PrismaClient) {
  return {
    findUnique: client.productVariant.findUnique.bind(client.productVariant),
  };
}

export type ScopedPrisma = Readonly<{
  organizationId: string;
  /**
   * Full Prisma client for module entrypoints typed as `PrismaClient`.
   * Must only be used together with this scope’s `organizationId` until rows are tenant-keyed.
   */
  prisma: PrismaClient;
  quotes: ReturnType<typeof quoteDelegates>;
  opportunities: ReturnType<typeof opportunityDelegates>;
  scenarioRuns: ReturnType<typeof scenarioRunDelegates>;
  productVariants: ReturnType<typeof productVariantDelegates>;
}>;

export function createScopedPrisma(
  organizationId: string,
  client: PrismaClient = rootPrisma,
): ScopedPrisma {
  return Object.freeze({
    organizationId,
    prisma: client,
    quotes:         quoteDelegates(client),
    opportunities: opportunityDelegates(client),
    scenarioRuns:   scenarioRunDelegates(client),
    productVariants: productVariantDelegates(client),
  });
}

/**
 * Resolves the active console tenant and returns a scoped DB handle.
 * Prefer `quotes` / `opportunities` / … helpers for route-level queries to limit unscoped patterns.
 */
export async function requireScopedPrisma(): Promise<ScopedPrisma> {
  await requireConsoleAuth();
  const org = await requireOrganization();
  return createScopedPrisma(org.id, rootPrisma);
}
