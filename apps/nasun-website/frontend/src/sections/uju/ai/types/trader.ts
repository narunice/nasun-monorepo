/**
 * Per-AI-agent trading preset, persisted in IndexedDB + mirrored to
 * chat-server's `nasun_ai_trader_configs.config_json`. One row per
 * agent (keyed by agentAddress).
 */

export type TraderPair = 'NBTC_NUSDC' | 'NETH_NUSDC' | 'NSOL_NUSDC' | 'NSN_NUSDC';

/** Strategy preset id surfaced to the runtime's `resolveStrategyPreset`.
 * Source of truth: `apps/nasun-ai-runtime/src/presets/strategies.ts`. */
export type StrategyPresetId =
  | 'aggressive_scalper'
  | 'conservative_dca'
  | 'mean_reversion'
  | 'trend_follower'
  | 'hold_only';

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

  // Strategy preset that biases the LLM's decision (used only when
  // `promptTemplate` is null/empty — custom prompts override).
  // Defaults to 'conservative_dca' at runtime if unset.
  strategyPresetId?: StrategyPresetId;

  // Soft risk hints surfaced in the agent's prompt. The onchain hard
  // rail lives on the linked Capability (risk_limits). Editing these
  // does NOT sync the capability — users adjust the capability
  // separately via the danger-zone UI.
  maxSlippageBps?: number;
  stopLossBps?: number;
  takeProfitBps?: number;

  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
