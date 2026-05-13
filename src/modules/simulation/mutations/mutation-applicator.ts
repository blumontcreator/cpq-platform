/**
 * Mutation applicator.
 *
 * Dispatches each ScenarioMutation to its corresponding pure mutator function.
 * Each mutator receives a cloned graph and returns a new, mutated graph.
 *
 * Applying mutations in sequence allows multi-mutation scenarios:
 *   applyMutations(graph, [mutA, mutB, mutC]) → graph'''
 */
import type { QuoteGraph } from "../../quoting/types/graph.types";
import type { ScenarioMutation } from "../types/scenario.types";
import type {
  PricingAdjustmentParams,
  SupplierSwapParams,
  BundleSubstitutionParams,
  QuantityChangeParams,
  FreightRegroupParams,
  ServiceToggleParams,
  DiscountSimulationParams,
  LeadTimeTradeoffParams,
} from "../types/scenario.types";
import {
  applyPricingAdjustment,
  applySupplierSwap,
  applyBundleSubstitution,
  applyQuantityChange,
  applyFreightRegroup,
  applyServiceToggle,
  applyDiscountSimulation,
  applyLeadTimeTradeoff,
} from "./mutators";

export function applyMutation(graph: QuoteGraph, mutation: ScenarioMutation): QuoteGraph {
  switch (mutation.kind) {
    case "PRICING_ADJUSTMENT":
      return applyPricingAdjustment(graph, mutation.params as PricingAdjustmentParams);
    case "SUPPLIER_SWAP":
      return applySupplierSwap(graph, mutation.params as SupplierSwapParams);
    case "BUNDLE_SUBSTITUTION":
      return applyBundleSubstitution(graph, mutation.params as BundleSubstitutionParams);
    case "QUANTITY_CHANGE":
      return applyQuantityChange(graph, mutation.params as QuantityChangeParams);
    case "FREIGHT_REGROUP":
      return applyFreightRegroup(graph, mutation.params as FreightRegroupParams);
    case "SERVICE_TOGGLE":
      return applyServiceToggle(graph, mutation.params as ServiceToggleParams);
    case "DISCOUNT_SIMULATION":
      return applyDiscountSimulation(graph, mutation.params as DiscountSimulationParams);
    case "LEAD_TIME_TRADEOFF":
      return applyLeadTimeTradeoff(graph, mutation.params as LeadTimeTradeoffParams);
    default:
      return graph;
  }
}

/** Applies a sequence of mutations in order, threading the graph through each. */
export function applyMutations(graph: QuoteGraph, mutations: ScenarioMutation[]): QuoteGraph {
  return mutations.reduce((g, mutation) => applyMutation(g, mutation), graph);
}
