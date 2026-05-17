/**
 * Nasun AI network/config shim - centralizes contract IDs, model catalog, tier
 * thresholds, and selection constants for the uju/ai feature.
 *
 * Mirrors baram/frontend/src/config/network.ts, adapted to nasun-website. The
 * underlying onchain Move modules still live in the `baram::*` namespace
 * (ARCHIVED but not renamed); we expose them under nasun-ai-friendly names here.
 */

import {
  NETWORK,
  BARAM,
  TOKENS as DEVNET_TOKENS,
  NBTC_TYPE,
  NBTC_DECIMALS,
  NUSDC_TYPE,
  NUSDC_DECIMALS,
  NSN_TYPE,
  NSN_DECIMALS,
} from '@nasun/devnet-config';

export const NETWORK_CONFIG = {
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL || NETWORK.rpcUrl,
  faucetUrl: import.meta.env.VITE_FAUCET_URL || NETWORK.faucetUrl,
  chainId: import.meta.env.VITE_CHAIN_ID || NETWORK.chainId,
  networkName: import.meta.env.VITE_NETWORK_NAME || 'Nasun Devnet',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || NETWORK.explorerUrl,
} as const;

export const BARAM_CONFIG = {
  packageId: import.meta.env.VITE_BARAM_PACKAGE_ID || BARAM.packageId,
  registryId: import.meta.env.VITE_BARAM_REGISTRY_ID || BARAM.registry,
  budgetTypeOrigin: BARAM.budgetTypeOrigin,
  budgetV2TypeOrigin: BARAM.budgetV2TypeOrigin,
  executorAddress: import.meta.env.VITE_EXECUTOR_ADDRESS || '',
  backendUrl: import.meta.env.VITE_BACKEND_URL || '',
  apiKey: import.meta.env.VITE_BARAM_API_KEY || '',
} as const;

export const EXECUTOR_CONFIG = {
  packageId: BARAM.executorPackageId,
  registryId: BARAM.executorRegistry,
  tierRegistryId: BARAM.tierRegistry,
} as const;

export const AER_CONFIG = {
  packageId: import.meta.env.VITE_AER_PACKAGE_ID || BARAM.aerPackageId,
  typeOrigin: BARAM.aerTypeOrigin,
  registryId: BARAM.aerRegistry,
  indexerApiUrl: import.meta.env.VITE_AER_INDEXER_API_URL || '',
} as const;

export const AGENT_CONFIG = {
  packageId: BARAM.agentPackageId,
  registryId: BARAM.agentProfileRegistry,
} as const;

export const AER_STATUS_NAMES: Record<number, string> = {
  0: 'Settled',
  1: 'Disputed',
  2: 'Slashed',
};

export const TIER_NAMES = ['Open', 'Bronze', 'Silver', 'Gold'] as const;
export type TierLevel = 0 | 1 | 2 | 3;
export type TierName = (typeof TIER_NAMES)[TierLevel];

const BRONZE_STAKE = 1_000_000_000_000;
const SILVER_STAKE = 5_000_000_000_000;
const GOLD_STAKE = 10_000_000_000_000;
const BRONZE_REP = 300;
const SILVER_REP = 500;
const GOLD_REP = 700;

export const DORMANT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export const EXECUTOR_SELECTION = {
  BASE_WEIGHT: 0.3,
  REPUTATION_BONUS: 1.0,
  MAX_WEIGHT: 1.0,
  DORMANT_PENALTY: 0.3,
  MIN_TIER: 1 as TierLevel,
  MAX_RETRIES: 3,
} as const;

export function calculateTierClient(stakeAmount: number, reputation: number): TierLevel {
  const stakeTier =
    stakeAmount >= GOLD_STAKE ? 3 :
    stakeAmount >= SILVER_STAKE ? 2 :
    stakeAmount >= BRONZE_STAKE ? 1 : 0;
  const repTier =
    reputation >= GOLD_REP ? 3 :
    reputation >= SILVER_REP ? 2 :
    reputation >= BRONZE_REP ? 1 : 0;
  return Math.min(stakeTier, repTier) as TierLevel;
}

export const TEE_TYPES = {
  0: 'None',
  1: 'AWS Nitro',
  2: 'Intel SGX',
  3: 'AMD SEV',
} as const;
export type TeeType = keyof typeof TEE_TYPES;

// Canonical token types come from @nasun/devnet-config (single source of truth).
// VITE_* overrides remain available for local devnet experiments.
export const TOKEN_CONFIG = {
  nusdcType: import.meta.env.VITE_NUSDC_TYPE || NUSDC_TYPE,
  nbtcType: import.meta.env.VITE_NBTC_TYPE || NBTC_TYPE,
} as const;

export const FAUCET_CONFIG = {
  packageId: import.meta.env.VITE_TOKENS_PACKAGE_ID || DEVNET_TOKENS.packageId,
  tokenFaucetId: import.meta.env.VITE_TOKEN_FAUCET_ID || DEVNET_TOKENS.tokenFaucet,
  claimRecordId: import.meta.env.VITE_CLAIM_RECORD_ID || DEVNET_TOKENS.claimRecord,
} as const;

// Display name "NASUN" === devnet-config NSN === Move `0x2::sui::SUI`.
// Three-way naming is intentional: NASUN = user-facing brand, NSN = package id, SUI = Move type.
export const TOKENS = {
  NASUN: { symbol: 'NASUN', name: 'Nasun', decimals: NSN_DECIMALS, type: NSN_TYPE },
  NUSDC: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: NUSDC_DECIMALS, type: TOKEN_CONFIG.nusdcType },
  NBTC: { symbol: 'NBTC', name: 'Nasun BTC', decimals: NBTC_DECIMALS, type: TOKEN_CONFIG.nbtcType },
} as const;

export type TokenSymbol = keyof typeof TOKENS;

export type ModelCategory = 'cloud' | 'private' | 'fast';

export const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  cloud: 'Cloud Models',
  private: 'Private (TEE)',
  fast: 'Fast',
};

export const MODEL_CATEGORY_ORDER: ModelCategory[] = ['cloud', 'private', 'fast'];

export const MODEL_PRICING = {
  'gpt-4o': {
    name: 'GPT-4o',
    price: 500_000,
    description: 'OpenAI flagship multimodal model',
    provider: 'openai',
    category: 'cloud' as ModelCategory,
  },
  'claude-3.5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    price: 300_000,
    description: 'Anthropic balanced model',
    provider: 'anthropic',
    category: 'cloud' as ModelCategory,
  },
  'llama-3.3-70b-versatile': {
    name: 'Llama 3.3 70B',
    price: 100_000,
    description: 'Large model via Groq Cloud',
    provider: 'groq',
    category: 'cloud' as ModelCategory,
  },
  'llama-3.2-3b-local': {
    name: 'Llama 3.2 3B (TEE)',
    price: 100_000,
    description: 'Private inference in TEE enclave',
    provider: 'tee',
    category: 'private' as ModelCategory,
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    price: 50_000,
    description: 'Fast and affordable',
    provider: 'openai',
    category: 'fast' as ModelCategory,
  },
  'llama-3.1-8b-instant': {
    name: 'Llama 3.1 8B',
    price: 50_000,
    description: 'Ultra-fast via Groq Cloud',
    provider: 'groq',
    category: 'fast' as ModelCategory,
  },
} satisfies Record<string, { name: string; price: number; description: string; provider: string; category: ModelCategory }>;

export type ModelId = keyof typeof MODEL_PRICING;
export const DEFAULT_MODEL: ModelId = 'llama-3.3-70b-versatile';

export const BUDGET_CONFIG = {
  MIN_DEPOSIT: 100_000,
  DEFAULT_MAX_PER_REQUEST: 10_000_000,
} as const;
