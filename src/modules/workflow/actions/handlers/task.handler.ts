import type { WorkflowInstance } from "../../types/workflow.types";
import type {
  CreateProcurementTaskParams,
  CreateInstallationTaskParams,
  ActionResult,
} from "../../types/action.types";

/**
 * Operational task handlers.
 *
 * Creates structured task records for procurement and installation teams.
 * In production these would create tickets in an ERP, field service management
 * system, or trigger autonomous procurement agents.
 *
 * AI seam: both task types include an `aiNote` field for future autonomous
 * procurement assistance (supplier selection, lead-time negotiation).
 */
export async function handleCreateProcurementTask(
  params: CreateProcurementTaskParams,
  instance: WorkflowInstance,
  actionId: string,
): Promise<ActionResult> {
  const task = {
    taskKind: "PROCUREMENT",
    quoteId: instance.quoteId,
    supplierIds: params.supplierIds,
    priority: params.priority,
    notes: params.notes,
    requiredByDate: params.requiredByDate,
    operationalRiskScore: instance.context.operationalRiskScore,
    createdAt: new Date().toISOString(),
    aiNote: `Supplier risk factors should be reviewed. For high-risk suppliers, consider pre-negotiating lead-time commitments. AI procurement assistant integration point.`,
  };

  if (process.env.NODE_ENV !== "test") {
    console.log(`[PROCUREMENT] Quote ${instance.quoteId}: suppliers=${params.supplierIds.join(",")} priority=${params.priority}`);
  }

  return {
    actionId,
    kind: "create_procurement_task",
    success: true,
    output: task,
    executedAt: new Date().toISOString(),
  };
}

export async function handleCreateInstallationTask(
  params: CreateInstallationTaskParams,
  instance: WorkflowInstance,
  actionId: string,
): Promise<ActionResult> {
  const task = {
    taskKind: "INSTALLATION",
    quoteId: instance.quoteId,
    estimatedDays: params.estimatedDays,
    complexity: params.complexity,
    notes: params.notes,
    requiredByDate: params.requiredByDate,
    createdAt: new Date().toISOString(),
    aiNote: `Installation complexity: ${params.complexity}. For HIGH/CRITICAL complexity, consider pre-deployment site assessment. AI field-service integration point.`,
  };

  if (process.env.NODE_ENV !== "test") {
    console.log(`[INSTALLATION] Quote ${instance.quoteId}: est=${params.estimatedDays}d complexity=${params.complexity}`);
  }

  return {
    actionId,
    kind: "create_installation_task",
    success: true,
    output: task,
    executedAt: new Date().toISOString(),
  };
}
