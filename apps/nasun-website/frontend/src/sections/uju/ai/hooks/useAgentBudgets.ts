/**
 * Thin alias - useAgentBudgets was the S3 lightweight query for budgets owned by
 * a wallet. S4 promoted the canonical query+mutations into useBudgets. We keep
 * this name + the slimmer BudgetInfo export so AgentsList (S3) does not need to
 * change shape.
 */

export { useBudgetsQuery as useAgentBudgets } from './useBudgets';
export type { BudgetInfo } from './useBudgets';
