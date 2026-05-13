/**
 * Pricing orchestrator — the main public API of the pricing engine.
 *
 * Resolves a pricing policy from the repository (or accepts an inline config),
 * fetches the supplier cost from ProductPrice, and runs the full pipeline.
 *
 * This is the only layer that touches the database.
 * Everything below it (cost graph, rules, strategy) is pure.
 */
import type { PrismaClient } from "@prisma/client";
import type { PricingContext } from "../types/pricing-context.types";
import type { CostLayer } from "../types/cost-layer.types";
import type { PricingStrategy } from "../types/pricing-strategy.types";
import type { MarginPolicy } from "../types/margin-policy.types";
import type { PricingRule } from "../types/pricing-rule.types";
import type { PricingResult } from "../types/pricing-result.types";
import { priceVariant } from "./variant-pricer";
import {
  STANDARD_IMPORT_LAYERS,
  COST_PLUS_STRATEGY,
  STANDARD_MARGIN_POLICY,
} from "../strategies/default-policies";

export interface InlinePricingConfig {
  costLayers?: CostLayer[];
  strategy?: PricingStrategy;
  marginPolicy?: MarginPolicy;
  rules?: PricingRule[];
}

export interface OrchestratorInput {
  context: PricingContext;
  /**
   * If provided, loads this policy from the DB.
   * If omitted and inlineConfig is also absent, uses the standard default policy.
   */
  policyId?: string;
  /** Inline config overrides / supplements the policy. */
  inlineConfig?: InlinePricingConfig;
  /** When true, the result is saved to PricingCalculation for audit. */
  saveCalculation?: boolean;
}

export interface OrchestratorResult {
  result: PricingResult;
  calculationId?: string;
}

export async function calculatePrice(
  prisma: PrismaClient,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const { context, policyId, inlineConfig, saveCalculation = false } = input;

  // ── 1. Resolve policy ─────────────────────────────────────────────────────
  let costLayers: CostLayer[] = inlineConfig?.costLayers ?? STANDARD_IMPORT_LAYERS;
  let strategy: PricingStrategy = inlineConfig?.strategy ?? COST_PLUS_STRATEGY;
  let marginPolicy: MarginPolicy = inlineConfig?.marginPolicy ?? STANDARD_MARGIN_POLICY;
  const rules: PricingRule[] = inlineConfig?.rules ?? [];

  if (policyId) {
    const policy = await prisma.pricingPolicy.findUnique({ where: { id: policyId } });
    if (policy) {
      costLayers = (policy.costLayers as unknown as CostLayer[]) ?? costLayers;
      strategy = (policy.strategy as unknown as PricingStrategy) ?? strategy;
      marginPolicy = (policy.marginPolicy as unknown as MarginPolicy) ?? marginPolicy;
    }
  }

  // ── 2. Resolve supplier cost ──────────────────────────────────────────────
  let supplierCost = context.supplierCostOverride ?? 0;

  if (!supplierCost) {
    const variant = await prisma.productVariant.findUnique({
      where: { sku: context.variantSku },
      include: {
        prices: {
          where: { priceType: "COST" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (variant?.prices[0]) {
      supplierCost = Number(variant.prices[0].amount);
    } else {
      // Fallback: use LIST price × 0.5 as estimated cost (produces low confidence)
      const listPrice = await prisma.productPrice.findFirst({
        where: { variant: { sku: context.variantSku }, priceType: "LIST" },
        orderBy: { createdAt: "desc" },
      });
      if (listPrice) {
        supplierCost = Number(listPrice.amount) * 0.5;
        // Flag this in context so the engine knows it's estimated
      }
    }
  }

  // ── 3. Run the engine ─────────────────────────────────────────────────────
  const result = priceVariant({
    context,
    supplierCost,
    costLayers,
    strategy,
    marginPolicy,
    rules,
    policyId,
  });

  // ── 4. Optionally persist calculation ────────────────────────────────────
  let calculationId: string | undefined;
  if (saveCalculation) {
    const variant = await prisma.productVariant.findUnique({
      where: { sku: context.variantSku },
      select: { id: true },
    });
    if (variant) {
      const calc = await prisma.pricingCalculation.create({
        data: {
          variantId: variant.id,
          policyId: policyId ?? null,
          context: context as unknown as import("@prisma/client").Prisma.InputJsonValue,
          result: JSON.parse(JSON.stringify(result)) as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
      calculationId = calc.id;
    }
  }

  return { result, calculationId };
}
