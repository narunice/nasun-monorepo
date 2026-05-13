/**
 * Shared input shapes for escrow PTB builders. Lives in its own file
 * so `helpers.ts` and any future test fixture can both import it
 * without circular dependencies.
 */

export interface CapabilityRiskLimitsArgs {
  maxNotionalPerAction: bigint;
  maxDailyLoss: bigint;
  maxSlippageBps: number;
  stopLossBps: number;
  takeProfitBps: number;
}
