/**
 * Candidate scenario generator.
 *
 * Intelligently generates targeted mutation scenarios by scanning the baseline
 * graph and evaluation for improvement opportunities.
 *
 * Philosophy:
 *   - Generate candidates that are grounded in the actual graph state
 *   - Each candidate has a clear rationale explaining why it was proposed
 *   - Avoid exhaustive grid search — generate ~15-25 focused candidates
 *   - Keep each candidate to a single mutation type for explainability
 *     (the optimizer may later combine top singles into multi-mutation scenarios)
 */
import { randomUUID } from "node:crypto";
import type { QuoteGraph } from "../../quoting/types/graph.types";
import type { QuoteEvaluation } from "../../quoting/types/evaluation.types";
import type { QuoteScenario, ScenarioMutation } from "../types/scenario.types";
import type { StrategyProfile } from "../types/strategy.types";

const DEFAULT_MARGIN_FLOOR = 20;
const PRICE_UPLIFT_STEPS = [5, 10, 15, 20];
const PRICE_REDUCTION_STEPS = [5, 10, 15];
const DISCOUNT_STEPS = [3, 5, 8, 10];

function makeMutation(
  kind: ScenarioMutation["kind"],
  label: string,
  params: ScenarioMutation["params"],
  rationale: string,
): ScenarioMutation {
  return { id: randomUUID(), kind, label, params, rationale };
}

function makeScenario(name: string, mutations: ScenarioMutation[]): QuoteScenario {
  return {
    id: randomUUID(),
    name,
    baselineGraphId: "",
    mutations,
  };
}

export function generateCandidates(
  graph: QuoteGraph,
  evaluation: QuoteEvaluation,
  strategy: StrategyProfile,
): QuoteScenario[] {
  const candidates: QuoteScenario[] = [];
  const marginFloor = graph.context.minimumMarginPct ?? DEFAULT_MARGIN_FLOOR;
  const objectiveKinds = new Set(strategy.objectives.map((o) => o.kind));

  // ── 1. Margin improvement: price uplifts on low-margin nodes ───────────────
  if (objectiveKinds.has("MAXIMIZE_MARGIN") || objectiveKinds.has("MAXIMIZE_PROFITABILITY_SCORE")) {
    const lowMarginNodes = evaluation.nodeEvaluations
      .filter((ne) => ne.effectiveMarginPct < marginFloor + 5 && ne.lineRevenue > 0)
      .filter((ne) => ne.kind !== "DISCOUNT" && ne.kind !== "SURCHARGE")
      .sort((a, b) => a.effectiveMarginPct - b.effectiveMarginPct)
      .slice(0, 4);

    for (const ne of lowMarginNodes) {
      for (const pct of PRICE_UPLIFT_STEPS) {
        candidates.push(makeScenario(
          `Price uplift +${pct}% on "${ne.label}"`,
          [makeMutation(
            "PRICING_ADJUSTMENT",
            `+${pct}% on ${ne.label}`,
            { nodeIds: [ne.nodeId], adjustmentPct: pct },
            `"${ne.label}" is at ${ne.effectiveMarginPct.toFixed(1)}% margin (below ${marginFloor}% floor). Raising by ${pct}% tests market response.`,
          )],
        ));
      }
    }

    // Blanket uplift across all product variants
    for (const pct of [5, 10]) {
      candidates.push(makeScenario(
        `Blanket +${pct}% on all product lines`,
        [makeMutation(
          "PRICING_ADJUSTMENT",
          `+${pct}% all PRODUCT_VARIANT`,
          { applyToKind: "PRODUCT_VARIANT", adjustmentPct: pct },
          `Uniform price increase of ${pct}% across all product variants to test overall margin improvement.`,
        )],
      ));
    }
  }

  // ── 2. Win probability: price reductions ───────────────────────────────────
  if (objectiveKinds.has("MAXIMIZE_WIN_PROBABILITY")) {
    for (const pct of PRICE_REDUCTION_STEPS) {
      candidates.push(makeScenario(
        `Price reduction −${pct}% across products`,
        [makeMutation(
          "PRICING_ADJUSTMENT",
          `−${pct}% PRODUCT_VARIANT`,
          { applyToKind: "PRODUCT_VARIANT", adjustmentPct: -pct },
          `Reducing product prices by ${pct}% improves estimated win probability by accepting a lower margin.`,
        )],
      ));
    }

    // Discount simulations
    for (const pct of DISCOUNT_STEPS) {
      candidates.push(makeScenario(
        `Add ${pct}% overall discount`,
        [makeMutation(
          "DISCOUNT_SIMULATION",
          `${pct}% quote discount`,
          { discountPct: pct, label: `${pct}% Commercial Discount` },
          `A ${pct}% discount improves competitiveness and win probability at the cost of margin.`,
        )],
      ));
    }
  }

  // ── 3. Complexity reduction: remove optional services ─────────────────────
  if (objectiveKinds.has("MINIMIZE_COMPLEXITY")) {
    const removableServices = graph.nodes.filter(
      (n) =>
        (n.kind === "SERVICE" || n.kind === "WARRANTY") &&
        !n.isMandatoryService &&
        !n.isRequired,
    );

    for (const service of removableServices.slice(0, 3)) {
      candidates.push(makeScenario(
        `Remove optional service "${service.label}"`,
        [makeMutation(
          "SERVICE_TOGGLE",
          `Remove ${service.label}`,
          { action: "REMOVE", nodeId: service.id },
          `Removing the optional service "${service.label}" reduces operational complexity without affecting the core solution.`,
        )],
      ));
    }
  }

  // ── 4. Lead-time improvement: tradeoffs ──────────────────────────────────
  if (objectiveKinds.has("MINIMIZE_LEAD_TIME")) {
    const slowNodes = evaluation.nodeEvaluations
      .filter((ne) => ne.leadTimeRisk === "HIGH" || ne.leadTimeRisk === "CRITICAL")
      .sort((a, b) => {
        const nodeA = graph.nodes.find((n) => n.id === a.nodeId);
        const nodeB = graph.nodes.find((n) => n.id === b.nodeId);
        return (nodeB?.leadTimeDays ?? 0) - (nodeA?.leadTimeDays ?? 0);
      })
      .slice(0, 3);

    for (const ne of slowNodes) {
      const node = graph.nodes.find((n) => n.id === ne.nodeId);
      if (!node?.leadTimeDays) continue;

      // Offer 15% and 25% lead-time reduction at cost premium
      for (const [reductionPct, premium] of [[30, 15], [50, 25]] as [number, number][]) {
        const newDays = Math.max(3, Math.round(node.leadTimeDays * (1 - reductionPct / 100)));
        candidates.push(makeScenario(
          `Expedite "${node.label}" to ${newDays}d (+${premium}% cost)`,
          [makeMutation(
            "LEAD_TIME_TRADEOFF",
            `Expedite ${node.label}`,
            { nodeId: node.id, newLeadTimeDays: newDays, costPremiumPct: premium },
            `Paying +${premium}% on "${node.label}" reduces its lead time from ${node.leadTimeDays}d to ${newDays}d, cutting overall delivery risk.`,
          )],
        ));
      }
    }
  }

  // ── 5. Freight consolidation ──────────────────────────────────────────────
  const freightNodes = graph.nodes.filter((n) => n.kind === "FREIGHT");
  if (freightNodes.length > 1) {
    candidates.push(makeScenario(
      "Consolidate all freight nodes",
      [makeMutation(
        "FREIGHT_REGROUP",
        "Consolidate freight",
        { nodeIds: freightNodes.map((n) => n.id) },
        "Grouping all freight nodes into one shipment event can reduce logistics cost.",
      )],
    ));
  }

  // ── 6. Attach rate: service additions ─────────────────────────────────────
  if (objectiveKinds.has("MAXIMIZE_ATTACH_RATE")) {
    const hasWarranty = graph.nodes.some((n) => n.kind === "WARRANTY");
    if (!hasWarranty) {
      candidates.push(makeScenario(
        "Add standard warranty",
        [makeMutation(
          "SERVICE_TOGGLE",
          "Add 1-Year Warranty",
          {
            action: "ADD",
            nodeToAdd: {
              kind: "WARRANTY",
              label: "1-Year Standard Warranty",
              quantity: 1,
              unitCost: 30,
              unitPrice: 95,
            },
          },
          "Adding a warranty increases attach rate, average order value, and customer satisfaction.",
        )],
      ));
    }

    const hasInstallation = graph.nodes.some((n) => n.kind === "INSTALLATION");
    if (!hasInstallation) {
      candidates.push(makeScenario(
        "Add installation service",
        [makeMutation(
          "SERVICE_TOGGLE",
          "Add Installation",
          {
            action: "ADD",
            nodeToAdd: {
              kind: "INSTALLATION",
              label: "Professional Installation",
              quantity: 1,
              unitCost: 75,
              unitPrice: 150,
              installationHours: 2,
            },
          },
          "Including professional installation improves attach rate and reduces customer churn.",
        )],
      ));
    }
  }

  // Respect maxCandidates limit
  return candidates.slice(0, strategy.maxCandidates);
}

/**
 * Generates "combination" scenarios by merging the top-scoring single-mutation
 * candidates from different mutation kinds — one from each kind.
 */
export function generateCombinationCandidates(
  topCandidates: Array<{ scenario: QuoteScenario; score: number }>,
  maxDepth: number,
): QuoteScenario[] {
  if (topCandidates.length < 2 || maxDepth < 2) return [];

  // Take the best candidate from each distinct mutation kind
  const seenKinds = new Set<string>();
  const best: QuoteScenario[] = [];
  for (const { scenario } of topCandidates) {
    const kind = scenario.mutations[0]?.kind;
    if (kind && !seenKinds.has(kind)) {
      seenKinds.add(kind);
      best.push(scenario);
    }
    if (best.length >= maxDepth) break;
  }

  if (best.length < 2) return [];

  const combinedMutations = best.flatMap((s) => s.mutations);
  return [
    {
      id: randomUUID(),
      name: `Combined: ${best.map((s) => s.name).join(" + ")}`,
      baselineGraphId: "",
      mutations: combinedMutations,
    },
  ];
}
