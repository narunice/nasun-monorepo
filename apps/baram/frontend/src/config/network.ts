// Baram Network Configuration
export const NETWORK_CONFIG = {
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL || 'https://rpc.devnet.nasun.io',
  faucetUrl: import.meta.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io',
  chainId: import.meta.env.VITE_CHAIN_ID || '6681cdfd',
  networkName: import.meta.env.VITE_NETWORK_NAME || 'Nasun Devnet',
} as const;

// Baram Contract Configuration
export const BARAM_CONFIG = {
  packageId: import.meta.env.VITE_BARAM_PACKAGE_ID || '',
  registryId: import.meta.env.VITE_BARAM_REGISTRY_ID || '',
  executorAddress: import.meta.env.VITE_EXECUTOR_ADDRESS || '',
  backendUrl: import.meta.env.VITE_BACKEND_URL || '',
} as const;

// Executor Registry Configuration (2026-01-27 deployment)
export const EXECUTOR_CONFIG = {
  packageId: import.meta.env.VITE_EXECUTOR_PACKAGE_ID || '0xcf72bce1d38d71d8dab61f68f279919f626e240008418ca1e33c4059f9369983',
  registryId: import.meta.env.VITE_EXECUTOR_REGISTRY_ID || '0x3bfe54558fb69e806f9fd3f25392c5deb89b95152b8503c4f97393d27c588fb0',
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
// Privacy-preserving TEE models only
export const MODEL_PRICING = {
  'llama-3.2-3b-local': {
    name: 'Llama 3.2 3B (TEE)',
    price: 10_000, // 0.01 NUSDC (test price)
    description: 'Private inference in TEE enclave',
  },
} as const;

export type ModelId = keyof typeof MODEL_PRICING;
export const DEFAULT_MODEL: ModelId = 'llama-3.2-3b-local';
