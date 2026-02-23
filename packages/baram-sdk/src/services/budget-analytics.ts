/**
 * Budget utilization analytics — computes spend rates, runway, and usage breakdown.
 * Pure synchronous functions operating on AERRecord[].
 */

import type { AERRecord } from '../types/aer';
import type { BudgetUtilization } from '../types/budget';

/**
 * Compute budget utilization metrics from AER records filtered by budgetId.
 * Expects records to already be filtered to a single budget.
 */
export function computeBudgetUtilization(
  budgetId: string,
  records: AERRecord[],
): BudgetUtilization {
  if (records.length === 0) {
    return {
      budgetId,
      totalRecords: 0,
      totalSpent: 0,
      latestBudgetRemaining: null,
      estimatedBurnRate: null,
      estimatedRunway: null,
      modelUsage: [],
      executorUsage: [],
      balanceTimeline: [],
      agents: [],
    };
  }

  let totalSpent = 0;
  const modelMap = new Map<string, { count: number; totalSpent: number }>();
  const executorMap = new Map<string, { count: number; totalSpent: number }>();
  const agentSet = new Set<string>();
  const timeline: { settledAt: number; remaining: number }[] = [];

  // Sort by settledAt for timeline
  const sorted = [...records].sort((a, b) => a.settledAt - b.settledAt);

  for (const r of sorted) {
    totalSpent += r.paymentAmount;

    // Model usage
    const model = modelMap.get(r.modelName);
    if (model) {
      model.count++;
      model.totalSpent += r.paymentAmount;
    } else {
      modelMap.set(r.modelName, { count: 1, totalSpent: r.paymentAmount });
    }

    // Executor usage
    const exec = executorMap.get(r.executor);
    if (exec) {
      exec.count++;
      exec.totalSpent += r.paymentAmount;
    } else {
      executorMap.set(r.executor, { count: 1, totalSpent: r.paymentAmount });
    }

    // Track agents (initiators)
    agentSet.add(r.initiator);

    // Balance timeline
    if (r.budgetRemaining !== null && r.settledAt > 0) {
      timeline.push({ settledAt: r.settledAt, remaining: r.budgetRemaining });
    }
  }

  // Latest budget remaining (from most recent record)
  const latestWithRemaining = sorted
    .filter((r) => r.budgetRemaining !== null)
    .pop();
  const latestBudgetRemaining = latestWithRemaining?.budgetRemaining ?? null;

  // Estimate burn rate (NUSDC per hour) from timeline
  let estimatedBurnRate: number | null = null;
  let estimatedRunway: number | null = null;

  if (timeline.length >= 2) {
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    const timeDeltaMs = last.settledAt - first.settledAt;
    const spentDelta = first.remaining - last.remaining;

    if (timeDeltaMs > 0 && spentDelta > 0) {
      const hoursElapsed = timeDeltaMs / 3_600_000;
      estimatedBurnRate = spentDelta / hoursElapsed;

      if (latestBudgetRemaining !== null && estimatedBurnRate > 0) {
        estimatedRunway = latestBudgetRemaining / estimatedBurnRate;
      }
    }
  }

  // Convert maps to sorted arrays
  const modelUsage = Array.from(modelMap.entries())
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const executorUsage = Array.from(executorMap.entries())
    .map(([executor, stats]) => ({ executor, ...stats }))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  return {
    budgetId,
    totalRecords: records.length,
    totalSpent,
    latestBudgetRemaining,
    estimatedBurnRate,
    estimatedRunway,
    modelUsage,
    executorUsage,
    balanceTimeline: timeline,
    agents: Array.from(agentSet),
  };
}
