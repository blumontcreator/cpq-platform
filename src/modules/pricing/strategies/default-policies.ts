/**
 * Ready-made policy building blocks for common importer/distributor scenarios.
 * Use these as templates; override any field to match your business.
 */
import type { CostLayer } from "../types/cost-layer.types";
import type { MarginPolicy } from "../types/margin-policy.types";
import type { PricingStrategy } from "../types/pricing-strategy.types";

// ── Standard importer cost stack ────────────────────────────────────────────

export const STANDARD_IMPORT_LAYERS: CostLayer[] = [
  {
    kind: "SUPPLIER_COST",
    enabled: true,
    valueKind: "override",
    value: 0,          // will be overridden by context.supplierCostOverride or ProductPrice.COST
    label: "Supplier Cost",
  },
  {
    kind: "FREIGHT",
    enabled: true,
    valueKind: "percentage",
    value: 8,          // 8% of supplier cost
    label: "Ocean Freight",
  },
  {
    kind: "CUSTOMS",
    enabled: true,
    valueKind: "percentage",
    value: 5,          // 5% import duties on landed cost
    label: "Import Duties",
  },
  {
    kind: "WAREHOUSING",
    enabled: true,
    valueKind: "percentage",
    value: 4,          // 4% warehousing + handling
    label: "Warehousing",
  },
  {
    kind: "WARRANTY",
    enabled: true,
    valueKind: "percentage",
    value: 2,          // 2% warranty reserve
    label: "Warranty Reserve",
  },
  {
    kind: "RISK_BUFFER",
    enabled: true,
    valueKind: "percentage",
    value: 3,          // 3% contingency
    label: "Risk Buffer",
  },
];

export const MOTORIZED_EXTRA_LAYERS: CostLayer[] = [
  {
    kind: "INSTALLATION",
    enabled: true,
    valueKind: "absolute",
    value: 25,         // flat $25 installation allowance per motorized unit
    label: "Installation Allowance",
    conditions: [
      {
        attribute: "variantAttributes.extracted.motorization.value.motorized",
        operator: "eq",
        value: true,
      },
    ],
  },
  {
    kind: "WARRANTY",
    enabled: true,
    valueKind: "percentage",
    value: 1,          // extra 1% warranty for motorized (stacks on standard)
    label: "Motor Warranty Surcharge",
    conditions: [
      {
        attribute: "variantAttributes.extracted.motorization.value.motorized",
        operator: "eq",
        value: true,
      },
    ],
  },
];

// ── Standard margin policies ─────────────────────────────────────────────────

export const STANDARD_MARGIN_POLICY: MarginPolicy = {
  floorMarginPct: 25,
  targetMarginPct: 42,
  warningThresholdPct: 30,
  autoEnforceFloor: true,
};

export const DEALER_MARGIN_POLICY: MarginPolicy = {
  floorMarginPct: 15,
  targetMarginPct: 30,
  warningThresholdPct: 20,
  autoEnforceFloor: true,
};

// ── Default strategies ────────────────────────────────────────────────────────

export const COST_PLUS_STRATEGY: PricingStrategy = {
  kind: "COST_PLUS",
  targetMarginPct: 42,
};

export const DEALER_STRATEGY: PricingStrategy = {
  kind: "COST_PLUS",
  targetMarginPct: 30,
};
