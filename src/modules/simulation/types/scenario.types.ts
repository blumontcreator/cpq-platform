/**
 * Scenario domain types.
 *
 * A QuoteScenario is a named "what if" experiment:
 *   baselineGraph + mutations → mutatedGraph → QuoteEvaluation → ScenarioEvaluation
 *
 * ScenarioEvaluations compare the mutated result to the baseline via ScenarioDelta,
 * producing an explainable, deterministic audit trail.
 */
import type { QuoteGraph } from "../../quoting/types/graph.types";
import type { QuoteEvaluation } from "../../quoting/types/evaluation.types";

// ── Mutation kinds ─────────────────────────────────────────────────────────

export const SCENARIO_MUTATION_KINDS = [
  "PRICING_ADJUSTMENT",
  "SUPPLIER_SWAP",
  "BUNDLE_SUBSTITUTION",
  "QUANTITY_CHANGE",
  "FREIGHT_REGROUP",
  "SERVICE_TOGGLE",
  "DISCOUNT_SIMULATION",
  "LEAD_TIME_TRADEOFF",
] as const;

export type ScenarioMutationKind = (typeof SCENARIO_MUTATION_KINDS)[number];

// ── Mutation param types ───────────────────────────────────────────────────

export interface PricingAdjustmentParams {
  /** Specific node ids to adjust. If empty, adjusts all non-DISCOUNT nodes. */
  nodeIds?: string[];
  /** Filter to a single node kind (e.g. only SERVICE nodes). */
  applyToKind?: string;
  /** Percentage change: -15 = −15%, +10 = +10%. */
  adjustmentPct?: number;
  /** Absolute price change in currency units (applied after pct if both set). */
  adjustmentAmount?: number;
}

export interface SupplierSwapParams {
  nodeId: string;
  newVariantSku: string;
  newUnitCost: number;
  newUnitPrice: number;
  newLeadTimeDays?: number;
  newWeightKg?: number;
  newLabel?: string;
}

export interface BundleSubstitutionParams {
  bundleNodeId: string;
  newBundlePrice: number;
  newBundleCost?: number;
  newLabel?: string;
}

export interface QuantityChangeParams {
  nodeId: string;
  newQuantity: number;
}

export interface FreightRegroupParams {
  /** All these node ids will be connected with SHARES_FREIGHT edges. */
  nodeIds: string[];
}

export interface ServiceToggleParams {
  action: "ADD" | "REMOVE";
  nodeId?: string;             // required for REMOVE
  nodeToAdd?: {                // required for ADD
    id?: string;
    kind?: string;
    label: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    installationHours?: number;
    isMandatoryService?: boolean;
  };
}

export interface DiscountSimulationParams {
  /** Discount as a percentage of total quote revenue (0–100). */
  discountPct?: number;
  /** Absolute discount amount in currency units. */
  discountAmount?: number;
  /** Label for the new/updated DISCOUNT node. */
  label?: string;
  /** Replace an existing discount node instead of adding a new one. */
  existingDiscountNodeId?: string;
}

export interface LeadTimeTradeoffParams {
  nodeId: string;
  /** Target lead time in days (must be less than current). */
  newLeadTimeDays: number;
  /** Cost premium paid for expedited delivery (percentage, e.g. 15 = +15% unitCost). */
  costPremiumPct: number;
}

export type ScenarioMutationParams =
  | PricingAdjustmentParams
  | SupplierSwapParams
  | BundleSubstitutionParams
  | QuantityChangeParams
  | FreightRegroupParams
  | ServiceToggleParams
  | DiscountSimulationParams
  | LeadTimeTradeoffParams;

// ── Mutation ───────────────────────────────────────────────────────────────

export interface ScenarioMutation {
  id: string;
  kind: ScenarioMutationKind;
  label: string;
  /** Human-readable explanation of why this mutation is being tried. */
  rationale?: string;
  params: ScenarioMutationParams;
}

// ── Scenario ───────────────────────────────────────────────────────────────

export interface QuoteScenario {
  id: string;
  name: string;
  /** The id of the baseline QuoteGraph this scenario is derived from. */
  baselineGraphId: string;
  mutations: ScenarioMutation[];
  metadata?: Record<string, unknown>;
}

// ── Delta ──────────────────────────────────────────────────────────────────

export interface ScenarioDelta {
  revenueDelta: number;
  revenueDeltaPct: number;
  costDelta: number;
  marginDelta: number;
  /** Absolute percentage-point change (e.g. 35% → 40% = +5pp). */
  marginPctDelta: number;
  complexityScoreDelta: number;
  leadTimeDelta: number;
  violationCountDelta: number;
  recommendationCountDelta: number;
  winProbabilityDelta?: number;
}

// ── Trace ──────────────────────────────────────────────────────────────────

export interface ScenarioTraceStep {
  step: number;
  mutation: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  note: string;
}

export interface ScenarioTrace {
  scenarioId: string;
  steps: ScenarioTraceStep[];
  simulatedAt: string;
  engineVersion: number;
}

// ── Scenario evaluation ────────────────────────────────────────────────────

export interface ScenarioEvaluation {
  scenarioId: string;
  scenarioName: string;
  appliedMutations: ScenarioMutation[];
  mutatedGraph: QuoteGraph;
  evaluation: QuoteEvaluation;
  delta: ScenarioDelta;
  /** Per-objective scores (0–1). */
  objectiveScores: ObjectiveScore[];
  /** Weighted composite score (0–1) — higher is better. */
  compositeScore: number;
  trace: ScenarioTrace;
  warnings: string[];
}

/** Single objective score with reasoning. */
export interface ObjectiveScore {
  kind: string;
  rawValue: number;
  normalizedScore: number; // 0–1
  weight: number;
  weightedScore: number;
  reasoning: string;
}
