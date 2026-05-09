/**
 * Trader Bot configuration — user-defined preset for an autonomous trading agent.
 *
 * One TraderConfig per Agent (keyed by agentAddress). Stored per-wallet in
 * IndexedDB so each user manages their own bots independently.
 */

export type TraderPair = 'NBTC_NUSDC' | 'NETH_NUSDC' | 'NSOL_NUSDC' | 'NSN_NUSDC';

export interface TraderConfig {
  /** Stable id (= agentAddress for now; one bot per agent in 2A-1) */
  id: string;
  /** Owner wallet (sanity check; per-wallet DB already isolates) */
  walletAddress: string;
  /** Trader agent on-chain address (e.g. 0x6c45...) */
  agentAddress: string;
  /** Budget shared object id used to pay AER fees */
  budgetId: string;
  /** Executor address that the bot will call (e.g. operator's local host) */
  executorAddress: string;
  /** Operator's executor HTTP endpoint (e.g. http://localhost:3000) */
  executorEndpoint: string;

  /** User-friendly label */
  name: string;
  /** Trading pair */
  pair: TraderPair;
  /** Per-trade size cap, NUSDC raw smallest-units (1 NUSDC = 1_000_000) */
  perTradeMaxQuoteRaw: string;
  /** Daily size cap, same units */
  dailyMaxQuoteRaw: string;
  /** Cycle interval in minutes (>= 5) */
  intervalMinutes: number;
  /** Groq / OpenAI-compatible model id */
  model: string;
  /** Optional custom prompt template; null = built-in default */
  promptTemplate: string | null;

  /** True = scheduler should run cycles; false = paused */
  enabled: boolean;

  createdAt: number;
  updatedAt: number;
}
