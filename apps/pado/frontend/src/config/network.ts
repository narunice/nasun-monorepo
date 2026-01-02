// Nasun Devnet Configuration
export const NETWORK_CONFIG = {
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://rpc.devnet.nasun.io',
  faucetUrl: import.meta.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io/gas',
  chainId: import.meta.env.VITE_CHAIN_ID || '6681cdfd',

  // DeepBook V3
  deepbookPackage: import.meta.env.VITE_DEEPBOOK_PACKAGE,
  deepbookRegistry: import.meta.env.VITE_DEEPBOOK_REGISTRY,

  // Tokens
  tokensPackage: import.meta.env.VITE_TOKENS_PACKAGE,
  nbtcType: import.meta.env.VITE_NBTC_TYPE,
  nusdcType: import.meta.env.VITE_NUSDC_TYPE,
  nbtcTreasuryCap: import.meta.env.VITE_NBTC_TREASURY_CAP,
  nusdcTreasuryCap: import.meta.env.VITE_NUSDC_TREASURY_CAP,

  // Pools
  poolNbtcNusdc: import.meta.env.VITE_POOL_NBTC_NUSDC,
  poolNasunNusdc: import.meta.env.VITE_POOL_NASUN_NUSDC,

  // Token Faucet
  faucetPackage: import.meta.env.VITE_FAUCET_PACKAGE,
  tokenFaucet: import.meta.env.VITE_TOKEN_FAUCET,

  // zkLogin Configuration
  zkLoginSaltApiUrl: import.meta.env.VITE_ZKLOGIN_SALT_API_URL || '',
  zkLoginProverUrl: import.meta.env.VITE_ZKLOGIN_PROVER_URL || '',  // Optional: custom prover URL (defaults to Mysten Labs)
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
} as const;

// Token Metadata
export const TOKENS = {
  NASUN: {
    symbol: 'NASUN',
    name: 'Nasun',
    decimals: 9,
    type: '0x2::sui::SUI',
  },
  NBTC: {
    symbol: 'NBTC',
    name: 'Nasun BTC',
    decimals: 8,
    type: NETWORK_CONFIG.nbtcType,
  },
  NUSDC: {
    symbol: 'NUSDC',
    name: 'Nasun USDC',
    decimals: 6,
    type: NETWORK_CONFIG.nusdcType,
  },
} as const;

// Pool Metadata
export const POOLS = {
  NBTC_NUSDC: {
    id: NETWORK_CONFIG.poolNbtcNusdc,
    baseToken: TOKENS.NBTC,
    quoteToken: TOKENS.NUSDC,
    tickSize: 10000,    // $0.01
    lotSize: 10000,     // 0.0001 BTC
  },
  NASUN_NUSDC: {
    id: NETWORK_CONFIG.poolNasunNusdc,
    baseToken: TOKENS.NASUN,
    quoteToken: TOKENS.NUSDC,
    tickSize: 1000,     // $0.001
    lotSize: 10000000,  // 0.01 NASUN
  },
} as const;
