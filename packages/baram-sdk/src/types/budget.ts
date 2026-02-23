/**
 * Budget utilization analytics types
 */

export interface BudgetUtilization {
  budgetId: string;
  totalRecords: number;
  totalSpent: number;
  latestBudgetRemaining: number | null;
  /** NUSDC per hour (estimated from recent history) */
  estimatedBurnRate: number | null;
  /** Hours remaining at current burn rate */
  estimatedRunway: number | null;

  modelUsage: { model: string; count: number; totalSpent: number }[];
  executorUsage: { executor: string; count: number; totalSpent: number }[];
  balanceTimeline: { settledAt: number; remaining: number }[];
  /** Unique agent addresses that used this budget */
  agents: string[];
}
