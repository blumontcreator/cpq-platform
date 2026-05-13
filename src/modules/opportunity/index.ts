export type {
  Opportunity,
  OpportunityStatus,
  StrategicPriority,
  CreateOpportunityInput,
  UpdateOpportunityInput,
  OpportunityQuery,
  OpportunitySummary,
} from "./types";

export {
  createOpportunity,
  getOpportunity,
  updateOpportunity,
  listOpportunities,
  closeOpportunity,
} from "./service";
