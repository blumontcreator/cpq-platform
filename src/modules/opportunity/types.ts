import type { OpportunityStatus, StrategicPriority } from "@prisma/client";

export type { OpportunityStatus, StrategicPriority };

export interface Opportunity {
  id: string;
  reference: string;
  customerName: string;
  customerId: string;
  salesOwnerId: string;
  channel: string;
  expectedCloseDate?: Date;
  targetMarginPct: number;
  strategicPriority: StrategicPriority;
  estimatedRevenue?: number;
  status: OpportunityStatus;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOpportunityInput {
  customerName: string;
  customerId: string;
  salesOwnerId: string;
  channel?: string;
  expectedCloseDate?: Date;
  /** Decimal fraction: 0.30 = 30% */
  targetMarginPct: number;
  strategicPriority?: StrategicPriority;
  estimatedRevenue?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateOpportunityInput {
  customerName?: string;
  channel?: string;
  expectedCloseDate?: Date;
  targetMarginPct?: number;
  strategicPriority?: StrategicPriority;
  estimatedRevenue?: number;
  status?: OpportunityStatus;
  notes?: string;
}

export interface OpportunityQuery {
  customerId?: string;
  salesOwnerId?: string;
  status?: OpportunityStatus;
  strategicPriority?: StrategicPriority;
  limit?: number;
}

/** Summary returned on an opportunity list view. */
export interface OpportunitySummary {
  id: string;
  reference: string;
  customerName: string;
  channel: string;
  salesOwnerId: string;
  targetMarginPct: number;
  estimatedRevenue?: number;
  strategicPriority: StrategicPriority;
  status: OpportunityStatus;
  expectedCloseDate?: Date;
  quoteCount: number;
  createdAt: Date;
}
