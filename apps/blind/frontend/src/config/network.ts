// Blind Network Configuration
export const NETWORK_CONFIG = {
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL || 'https://rpc.devnet.nasun.io',
  faucetUrl: import.meta.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io',
  chainId: import.meta.env.VITE_CHAIN_ID || '6681cdfd',
  networkName: import.meta.env.VITE_NETWORK_NAME || 'Nasun Devnet',
} as const;

// Blind Contract Configuration
export const BLIND_CONFIG = {
  packageId: import.meta.env.VITE_BLIND_PACKAGE_ID || '',
  registryId: import.meta.env.VITE_BLIND_REGISTRY_ID || '',
  executorAddress: import.meta.env.VITE_EXECUTOR_ADDRESS || '',
  backendUrl: import.meta.env.VITE_BACKEND_URL || '',
} as const;

// Executor Registry Configuration
export const EXECUTOR_CONFIG = {
  packageId: import.meta.env.VITE_EXECUTOR_PACKAGE_ID || '',
  registryId: import.meta.env.VITE_EXECUTOR_REGISTRY_ID || '',
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
export const TOKEN_CONFIG = {
  nusdcType: import.meta.env.VITE_NUSDC_TYPE || '',
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
export const MODEL_PRICING = {
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    price: 100_000, // 0.1 NUSDC
    description: 'Fast and efficient for most tasks',
  },
  'gpt-4o': {
    name: 'GPT-4o',
    price: 500_000, // 0.5 NUSDC
    description: 'Most capable model',
  },
} as const;

export type ModelId = keyof typeof MODEL_PRICING;
export const DEFAULT_MODEL: ModelId = 'gpt-4o-mini';
