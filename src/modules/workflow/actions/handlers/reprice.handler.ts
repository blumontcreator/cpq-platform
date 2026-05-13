import type { WorkflowInstance } from "../../types/workflow.types";
import type { TriggerRepricingParams, ActionResult } from "../../types/action.types";
import { workflowLogger } from "@/lib/observability/logger";

/**
 * Repricing handler.
 *
 * Signals to the pricing layer that the current quote graph should be re-evaluated.
 * In a full integration this would call `runOptimization` from the simulation module.
 * Here we emit a structured record — the integration point is explicit and documented.
 *
 * AI seam: the strategyKind can be overridden by an LLM recommendation based on
 * FeedbackSignals.strategyRanking.
 */
export async function handleTriggerRepricing(
  params: TriggerRepricingParams,
  instance: WorkflowInstance,
  actionId: string,
): Promise<ActionResult> {
  const task = {
    quoteId: instance.quoteId,
    requestedStrategy: params.strategyKind,
    targetMarginPct: params.targetMarginPct,
    reason: params.reason,
    requestedAt: new Date().toISOString(),
    // Integration point: call runOptimization({ graph, strategyKind: params.strategyKind })
    // when a quote graph is available in scope.
    integrationNote: "Call simulation/scenario-engine.ts#runOptimization with the graph from this quote.",
  };

  workflowLogger.info("Repricing requested", {
    quoteId:  instance.quoteId,
    strategy: params.strategyKind ?? "auto",
    reason:   params.reason,
  });

  return {
    actionId,
    kind: "trigger_repricing",
    success: true,
    output: task,
    executedAt: new Date().toISOString(),
  };
}
