import { NETWORK, BARAM, TOKENS as DEVNET_TOKENS } from '@nasun/devnet-config';

// Baram Network Configuration
// Fallbacks from @nasun/devnet-config for centralized management
export const NETWORK_CONFIG = {
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL || NETWORK.rpcUrl,
  faucetUrl: import.meta.env.VITE_FAUCET_URL || NETWORK.faucetUrl,
  chainId: import.meta.env.VITE_CHAIN_ID || NETWORK.chainId,
  networkName: import.meta.env.VITE_NETWORK_NAME || 'Nasun Devnet',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || NETWORK.explorerUrl,
} as const;

// zkLogin Configuration
export const ZKLOGIN_CONFIG = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  saltApiUrl: import.meta.env.VITE_ZKLOGIN_SALT_API_URL || '',
  proverUrl: import.meta.env.VITE_ZKLOGIN_PROVER_URL || 'https://rpc.devnet.nasun.io/zkprover/v1',
} as const;

// Baram Contract Configuration
// IDs from @nasun/devnet-config
export const BARAM_CONFIG = {
  packageId: import.meta.env.VITE_BARAM_PACKAGE_ID || BARAM.packageId,
  registryId: import.meta.env.VITE_BARAM_REGISTRY_ID || BARAM.registry,
  budgetTypeOrigin: BARAM.budgetTypeOrigin,
  executorAddress: import.meta.env.VITE_EXECUTOR_ADDRESS || '',
  backendUrl: import.meta.env.VITE_BACKEND_URL || '',
  apiKey: import.meta.env.VITE_BARAM_API_KEY || '',
  nftGateEnabled: import.meta.env.VITE_NFT_GATE_ENABLED === 'true',
} as const;

// Executor Registry Configuration — single source from @nasun/devnet-config
export const EXECUTOR_CONFIG = {
  packageId: BARAM.executorPackageId,
  registryId: BARAM.executorRegistry,
  tierRegistryId: BARAM.tierRegistry,
} as const;

// AER (AI Execution Report) Configuration
export const AER_CONFIG = {
  packageId: import.meta.env.VITE_AER_PACKAGE_ID || BARAM.aerPackageId,
} as const;

// AER status names — mirrors aer.move constants
export const AER_STATUS_NAMES: Record<number, string> = {
  0: 'Settled',
  1: 'Disputed',
  2: 'Slashed',
};

// Tier definitions
export const TIER_NAMES = ['Open', 'Bronze', 'Silver', 'Gold'] as const;
export type TierLevel = 0 | 1 | 2 | 3;
export type TierName = (typeof TIER_NAMES)[TierLevel];

// Stake thresholds in SOE (9 decimals) — mirrors executor_tier.move
const BRONZE_STAKE = 1_000_000_000_000;  // 1,000 NASUN
const SILVER_STAKE = 5_000_000_000_000;  // 5,000 NASUN
const GOLD_STAKE = 10_000_000_000_000;   // 10,000 NASUN

// Reputation thresholds — mirrors executor_tier.move
const BRONZE_REP = 300;
const SILVER_REP = 500;
const GOLD_REP = 700;

// Dormant threshold: 7 days in milliseconds
export const DORMANT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

// Executor Auto-Assignment (Weighted Random)
// Reputation-only weighting — no tier in weight ("No job allocation by tier")
export const EXECUTOR_SELECTION = {
  BASE_WEIGHT: 0.3,        // Minimum probability for all eligible executors
  REPUTATION_BONUS: 1.0,   // Max additional weight from reputation
  MAX_WEIGHT: 1.0,         // Weight cap — prevents long-term centralization
  DORMANT_PENALTY: 0.3,    // Multiplier for dormant executors
  MIN_TIER: 1 as TierLevel, // Bronze+ only — eligible set filter
  MAX_RETRIES: 3,          // Re-roll attempts on failure
} as const;

/**
 * Client-side tier calculation — fallback when TierRegistry is unavailable.
 * tier = min(stake_tier, rep_tier)
 */
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

// TEE Types
export const TEE_TYPES = {
  0: 'None',
  1: 'AWS Nitro',
  2: 'Intel SGX',
  3: 'AMD SEV',
} as const;

export type TeeType = keyof typeof TEE_TYPES;

// Token Configuration
// Baram uses its own bundled NUSDC from the Baram package
export const TOKEN_CONFIG = {
  nusdcType: import.meta.env.VITE_NUSDC_TYPE || BARAM.nusdcType,
  nbtcType: import.meta.env.VITE_NBTC_TYPE || `${BARAM_CONFIG.packageId}::nbtc::NBTC`,
} as const;

// Token Faucet Configuration
// Shared objects from unified devnet_tokens package
export const FAUCET_CONFIG = {
  packageId: import.meta.env.VITE_TOKENS_PACKAGE_ID || DEVNET_TOKENS.packageId,
  tokenFaucetId: import.meta.env.VITE_TOKEN_FAUCET_ID || DEVNET_TOKENS.tokenFaucet,
  claimRecordId: import.meta.env.VITE_CLAIM_RECORD_ID || DEVNET_TOKENS.claimRecord,
} as const;

// Token Metadata
export const TOKENS = {
  NASUN: {
    symbol: 'NASUN',
    name: 'Nasun',
    decimals: 9,
    type: '0x2::sui::SUI',
  },
  NUSDC: {
    symbol: 'NUSDC',
    name: 'Nasun USDC',
    decimals: 6,
    type: TOKEN_CONFIG.nusdcType,
  },
} as const;

// AI Model Pricing (in NUSDC, 6 decimals)
// Note: Contract MIN_PRICE is 100,000 (0.1 NUSDC)
export const MODEL_PRICING = {
  // Groq (Standard mode)
  'llama-3.3-70b-versatile': {
    name: 'Llama 3.3 70B (Groq)',
    price: 100_000, // 0.1 NUSDC
    description: 'Large model via Groq Cloud',
    provider: 'groq',
  },
  // TEE Local (Private mode)
  'llama-3.2-3b-local': {
    name: 'Llama 3.2 3B (TEE)',
    price: 100_000, // 0.1 NUSDC
    description: 'Private inference in TEE enclave',
    provider: 'tee',
  },
} satisfies Record<string, { name: string; price: number; description: string; provider: string }>;

export type ModelId = keyof typeof MODEL_PRICING;
export const DEFAULT_MODEL: ModelId = 'llama-3.3-70b-versatile';

// Privacy Mode Configuration
// Maps toggle state to model selection
export const PRIVACY_MODE_CONFIG = {
  private: {
    modelId: 'llama-3.2-3b-local' as ModelId,
    label: 'Private',
    description: 'Encrypted inference in TEE enclave',
  },
  standard: {
    modelId: 'llama-3.3-70b-versatile' as ModelId,
    label: 'Standard',
    description: 'Fast inference via Groq Cloud',
  },
} as const;

export const DEFAULT_PRIVACY_MODE = false; // Standard by default

// Budget Configuration — matches budget.move constants
export const BUDGET_CONFIG = {
  MIN_DEPOSIT: 100_000,           // 0.1 NUSDC (6 decimals)
  DEFAULT_MAX_PER_REQUEST: 10_000_000, // 10 NUSDC
} as const;
