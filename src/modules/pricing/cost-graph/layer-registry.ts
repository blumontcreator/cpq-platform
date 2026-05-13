/**
 * Layer registry — maps CostLayerKind to its processor.
 *
 * Add new processors here. The cost graph runner resolves them by kind.
 */
import type { LayerProcessor } from "./layer-processor";
import { ValidationError } from "@/lib/errors";
import type { CostLayerKind } from "../types/cost-layer.types";
import { supplierCostProcessor } from "./layers/supplier-cost.layer";
import { fxConversionProcessor } from "./layers/fx.layer";
import { freightProcessor } from "./layers/freight.layer";
import { customsProcessor } from "./layers/customs.layer";
import { warehousingProcessor } from "./layers/warehousing.layer";
import { installationProcessor } from "./layers/installation.layer";
import { accessoriesProcessor } from "./layers/accessories.layer";
import { commissionProcessor } from "./layers/commission.layer";
import { warrantyProcessor } from "./layers/warranty.layer";
import { riskBufferProcessor } from "./layers/risk-buffer.layer";

const REGISTRY = new Map<CostLayerKind, LayerProcessor>([
  ["SUPPLIER_COST", supplierCostProcessor],
  ["FX_CONVERSION", fxConversionProcessor],
  ["FREIGHT", freightProcessor],
  ["CUSTOMS", customsProcessor],
  ["WAREHOUSING", warehousingProcessor],
  ["INSTALLATION", installationProcessor],
  ["ACCESSORIES", accessoriesProcessor],
  ["COMMISSION", commissionProcessor],
  ["WARRANTY", warrantyProcessor],
  ["RISK_BUFFER", riskBufferProcessor],
]);

export function getLayerProcessor(kind: CostLayerKind): LayerProcessor {
  const p = REGISTRY.get(kind);
  if (!p) throw new ValidationError(`No layer processor registered for kind: ${kind}`, { kind }, "pricing");
  return p;
}
