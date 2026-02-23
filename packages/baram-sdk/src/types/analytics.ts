/**
 * Analytics result types for AER data aggregation
 */

import type { TierLevel } from './aer';

export interface AERSummary {
  totalRecords: number;

  // Payment totals (separated by token type)
  totalPaymentNusdc: number;
  totalPaymentNasun: number;
  avgPaymentNusdc: number;

  // Execution time
  avgExecutionTimeMs: number;
  medianExecutionTimeMs: number;

  // Distribution counts
  statusDistribution: Record<string, number>;
  tierDistribution: Record<string, number>;
  modelDistribution: Record<string, number>;
  executorDistribution: Record<string, number>;

  // Budget vs Direct
  budgetFundedCount: number;
  directFundedCount: number;
  budgetFundedPercentage: number;

  // TEE
  teeVerifiedCount: number;
  teeVerifiedPercentage: number;

  // Time range
  earliestSettledAt: number | null;
  latestSettledAt: number | null;
}

export type GroupByDimension =
  | 'executor'
  | 'initiator'
  | 'authorizer'
  | 'modelName'
  | 'status'
  | 'executorTier'
  | 'paymentToken'
  | 'budgetId';

export type TimeGranularity = 'hour' | 'day' | 'week';

export interface SpendingTimelineEntry {
  periodStart: number;
  periodEnd: number;
  totalSpent: number;
  recordCount: number;
  avgPayment: number;
}

export interface TrustProfile {
  totalRecords: number;
  teeVerifiedPercentage: number;
  avgExecutorTier: number;
  avgExecutorReputation: number;
  /** Number of unique executors */
  executorDiversity: number;
  tierDistribution: { tier: TierLevel; count: number; percentage: number }[];
  topExecutors: { address: string; count: number; avgReputation: number }[];
}
