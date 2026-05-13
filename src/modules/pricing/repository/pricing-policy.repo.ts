/**
 * PricingPolicy repository.
 *
 * Scoped policy resolution: customer > channel > supplier > global.
 * Returns the most specific matching active policy.
 */
import type { PrismaClient } from "@prisma/client";
import type { CostLayer } from "../types/cost-layer.types";
import type { PricingStrategy } from "../types/pricing-strategy.types";
import type { MarginPolicy } from "../types/margin-policy.types";

export interface PolicyInput {
  name: string;
  description?: string;
  supplierId?: string;
  channel?: string;
  customerId?: string;
  costLayers: CostLayer[];
  strategy: PricingStrategy;
  marginPolicy: MarginPolicy;
}

export async function upsertPricingPolicy(
  prisma: PrismaClient,
  input: PolicyInput & { id?: string },
) {
  const data = {
    name: input.name,
    description: input.description ?? null,
    supplierId: input.supplierId ?? null,
    channel: input.channel ?? null,
    customerId: input.customerId ?? null,
    costLayers: input.costLayers as unknown as import("@prisma/client").Prisma.InputJsonValue,
    strategy: input.strategy as unknown as import("@prisma/client").Prisma.InputJsonValue,
    marginPolicy: input.marginPolicy as unknown as import("@prisma/client").Prisma.InputJsonValue,
  };
  if (input.id) {
    return prisma.pricingPolicy.update({ where: { id: input.id }, data });
  }
  return prisma.pricingPolicy.create({ data });
}

/**
 * Resolve the most specific active policy for a given context scope.
 * Precedence: customerId > channel > supplierId > global.
 */
export async function resolvePricingPolicy(
  prisma: PrismaClient,
  scope: { customerId?: string; channel?: string; supplierId?: string },
) {
  const { customerId, channel, supplierId } = scope;

  // Try most specific first
  const candidates = await prisma.pricingPolicy.findMany({
    where: {
      active: true,
      OR: [
        ...(customerId ? [{ customerId }] : []),
        ...(channel ? [{ channel }] : []),
        ...(supplierId ? [{ supplierId }] : []),
        { supplierId: null, channel: null, customerId: null }, // global fallback
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Score and pick the most specific
  function specificity(p: (typeof candidates)[number]): number {
    return (p.customerId ? 4 : 0) + (p.channel ? 2 : 0) + (p.supplierId ? 1 : 0);
  }

  return candidates.sort((a, b) => specificity(b) - specificity(a))[0] ?? null;
}
