/**
 * Trader Bot configuration - user-defined preset for an autonomous trading agent.
 * One TraderConfig per Agent (keyed by agentAddress).
 */

export type TraderPair = 'NBTC_NUSDC' | 'NETH_NUSDC' | 'NSOL_NUSDC' | 'NSN_NUSDC';

export interface TraderConfig {
  id: string;
  walletAddress: string;
  agentAddress: string;
  budgetId: string;
  executorAddress: string;
  executorEndpoint: string;

  name: string;
  pair: TraderPair;
  perTradeMaxQuoteRaw: string;
  dailyMaxQuoteRaw: string;
  intervalMinutes: number;
  model: string;
  promptTemplate: string | null;

  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
