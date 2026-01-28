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
  proverUrl: import.meta.env.VITE_ZKLOGIN_PROVER_URL || 'https://prover-dev.mystenlabs.com/v1',
} as const;

// Baram Contract Configuration
// IDs from @nasun/devnet-config
export const BARAM_CONFIG = {
  packageId: import.meta.env.VITE_BARAM_PACKAGE_ID || BARAM.packageId,
  registryId: import.meta.env.VITE_BARAM_REGISTRY_ID || BARAM.registry,
  executorAddress: import.meta.env.VITE_EXECUTOR_ADDRESS || '',
  backendUrl: import.meta.env.VITE_BACKEND_URL || '',
} as const;

// Executor Registry Configuration
export const EXECUTOR_CONFIG = {
  packageId: import.meta.env.VITE_EXECUTOR_PACKAGE_ID || BARAM.executorPackageId,
  registryId: import.meta.env.VITE_EXECUTOR_REGISTRY_ID || BARAM.executorRegistry,
} as const;

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
  // Groq models (fast inference, free tier available)
  'llama-3.1-8b-instant': {
    name: 'Llama 3.1 8B (Groq)',
    price: 100_000, // 0.1 NUSDC
    description: 'Fast inference via Groq Cloud',
    provider: 'groq',
  },
  'llama-3.3-70b-versatile': {
    name: 'Llama 3.3 70B (Groq)',
    price: 100_000, // 0.1 NUSDC
    description: 'Large model via Groq Cloud',
    provider: 'groq',
  },
  'mixtral-8x7b-32768': {
    name: 'Mixtral 8x7B (Groq)',
    price: 100_000, // 0.1 NUSDC
    description: 'Mixtral MoE model via Groq',
    provider: 'groq',
  },
  // OpenAI models (paid)
  'gpt-4o-mini': {
    name: 'GPT-4o Mini (OpenAI)',
    price: 100_000, // 0.1 NUSDC
    description: 'OpenAI GPT-4o Mini',
    provider: 'openai',
  },
  // TEE Local (when TEE is running)
  'llama-3.2-3b-local': {
    name: 'Llama 3.2 3B (TEE)',
    price: 100_000, // 0.1 NUSDC
    description: 'Private inference in TEE enclave',
    provider: 'tee',
  },
} as const;

export type ModelId = keyof typeof MODEL_PRICING;
// Default to Groq for development/testing
export const DEFAULT_MODEL: ModelId = 'llama-3.1-8b-instant';
