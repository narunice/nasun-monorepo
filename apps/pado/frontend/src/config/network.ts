import { NETWORK } from '@nasun/devnet-config';

// Nasun Devnet Configuration
export const NETWORK_CONFIG = {
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://rpc.devnet.nasun.io',
  faucetUrl: import.meta.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io',
  chainId: import.meta.env.VITE_CHAIN_ID || '272218f1',
  explorerUrl: import.meta.env.VITE_EXPLORER_URL || NETWORK.explorerUrl,
  // Explorer API base, e.g. https://explorer.nasun.io/api/v1. Used by `useTier`
  // (Phase 3) to fetch NSI tier + benefits from /standing/by-address/:address.
  explorerApiUrl: import.meta.env.VITE_EXPLORER_API_URL || 'https://explorer.nasun.io/api/v1',

  // DeepBook V3
  deepbookPackage: import.meta.env.VITE_DEEPBOOK_PACKAGE,
  deepbookRegistry: import.meta.env.VITE_DEEPBOOK_REGISTRY,
  // DEEP token used for DeepBook taker fees. Required as a coin argument to
  // swap_exact_*; for whitelisted pools a zero-DEEP coin is accepted.
  deepTokenPackage: import.meta.env.VITE_DEEP_TOKEN || '',
  deepType: `${import.meta.env.VITE_DEEP_TOKEN || ''}::deep::DEEP`,

  // Tokens
  tokensPackage: import.meta.env.VITE_TOKENS_PACKAGE,
  nbtcType: import.meta.env.VITE_NBTC_TYPE,
  nusdcType: import.meta.env.VITE_NUSDC_TYPE,
  nbtcTreasuryCap: import.meta.env.VITE_NBTC_TREASURY_CAP,
  nusdcTreasuryCap: import.meta.env.VITE_NUSDC_TREASURY_CAP,

  // Tokens V2 (NETH, NSOL)
  tokensV2Package: import.meta.env.VITE_TOKENS_V2_PACKAGE || '',
  nethType: import.meta.env.VITE_NETH_TYPE || '',
  nsolType: import.meta.env.VITE_NSOL_TYPE || '',

  // Pools
  poolNbtcNusdc: import.meta.env.VITE_POOL_NBTC_NUSDC,
  poolNasunNusdc: import.meta.env.VITE_POOL_NASUN_NUSDC,
  poolNethNusdc: import.meta.env.VITE_POOL_NETH_NUSDC || '',
  poolNsolNusdc: import.meta.env.VITE_POOL_NSOL_NUSDC || '',

  // Token Faucet
  faucetPackage: import.meta.env.VITE_FAUCET_PACKAGE,
  tokenFaucet: import.meta.env.VITE_TOKEN_FAUCET,

  // Token Faucet V2 — NSOL (original V2 package)
  tokenFaucetV2: import.meta.env.VITE_TOKEN_FAUCET_V2 || '',
  claimRecordV2: import.meta.env.VITE_CLAIM_RECORD_V2 || '',

  // Token Faucet V2 — NETH (re-published V2 package, 8 decimals)
  nethFaucetV2: import.meta.env.VITE_NETH_FAUCET_V2 || '',
  nethClaimRecordV2: import.meta.env.VITE_NETH_CLAIM_RECORD_V2 || '',

  // zkLogin Configuration
  zkLoginSaltApiUrl: import.meta.env.VITE_ZKLOGIN_SALT_API_URL || '',
  zkLoginProverUrl: import.meta.env.VITE_ZKLOGIN_PROVER_URL || '',  // Optional: custom prover URL (defaults to Mysten Labs)
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',

  // Chat
  chatWebSocketUrl: import.meta.env.VITE_CHAT_WS_URL || '',
  chatHttpUrl: import.meta.env.VITE_CHAT_HTTP_URL || '',

  // Feature Flags
  useTradingView: import.meta.env.VITE_USE_TRADINGVIEW === 'true',
  accessMode: (import.meta.env.VITE_ACCESS_MODE || 'full') as AccessMode, // TEMPORARY: Remove after 2026-07-01
  spotAccessCode: import.meta.env.VITE_SPOT_ACCESS_CODE || '',             // TEMPORARY: Remove after 2026-07-01
} as const;

// Access mode: progressive feature unlock
// games-only -> spot -> full
export type AccessMode = 'games-only' | 'spot' | 'full';

const ACCESS_LEVEL: Record<AccessMode, number> = { 'games-only': 0, 'spot': 1, 'full': 2 };

/** Check if the current access mode meets the required level */
export function hasAccess(required: AccessMode): boolean {
  return ACCESS_LEVEL[NETWORK_CONFIG.accessMode] >= ACCESS_LEVEL[required];
}

// Token Metadata
export const TOKENS = {
  NASUN: {
    symbol: 'NSN',
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
  NETH: {
    symbol: 'NETH',
    name: 'Nasun ETH',
    decimals: 8,
    type: NETWORK_CONFIG.nethType,
  },
  NSOL: {
    symbol: 'NSOL',
    name: 'Nasun SOL',
    decimals: 9,
    type: NETWORK_CONFIG.nsolType,
  },
} as const;

// Symbol → Token lookup (maps display symbol to token config)
type TokenValue = typeof TOKENS[keyof typeof TOKENS];
const SYMBOL_TO_TOKEN: Record<string, TokenValue> = Object.fromEntries(
  Object.values(TOKENS).map(t => [t.symbol, t])
) as Record<string, TokenValue>;

/**
 * Look up token config by display symbol (e.g., 'NSN', 'NBTC')
 */
export function getTokenBySymbol(symbol: string): TokenValue | undefined {
  return SYMBOL_TO_TOKEN[symbol];
}

const STABLECOIN_SYMBOLS = new Set(['NUSDC']);

/**
 * Returns true if the given token symbol is a stablecoin (pegged to $1).
 * Used to suppress redundant USD equivalent display.
 */
export function isStablecoin(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol);
}

// Network Type Detection
export type NetworkType = 'devnet' | 'testnet' | 'mainnet';

/**
 * Detect current network type based on Chain ID or RPC URL
 */
export function getNetworkType(): NetworkType {
  const { rpcUrl, chainId } = NETWORK_CONFIG;

  // Chain ID based detection (primary)
  if (chainId === '272218f1') return 'devnet'; // Nasun Devnet V7

  // RPC URL based detection (fallback)
  if (rpcUrl.includes('devnet')) return 'devnet';
  if (rpcUrl.includes('testnet')) return 'testnet';

  return 'mainnet';
}

/**
 * Check if faucet is available on current network
 */
export function isFaucetAvailable(): boolean {
  const networkType = getNetworkType();
  return networkType === 'devnet' || networkType === 'testnet';
}

// Pool Metadata
export const POOLS = {
  // Phase 3 baseline (2026-05-25, on-chain via admin_set_trade_params):
  // taker = 4 bps (Hyperliquid retail equivalent), maker = 1.5 bps.
  // Tier 3 effective ≈ 1.6 / 0.6 bps (Hyperliquid VIP territory).
  NBTC_NUSDC: {
    id: NETWORK_CONFIG.poolNbtcNusdc,
    baseToken: TOKENS.NBTC,
    quoteToken: TOKENS.NUSDC,
    tickSize: 100000,   // $0.10 (on-chain verified)
    lotSize: 1000,      // 0.00001 BTC (on-chain verified)
    makerFeeBps: 1.5,   // 1.5 bps = 0.015% (Hyperliquid retail maker)
    takerFeeBps: 4,     // 4 bps = 0.040% (Hyperliquid retail taker)
  },
  NASUN_NUSDC: {
    id: NETWORK_CONFIG.poolNasunNusdc,
    baseToken: TOKENS.NASUN,
    quoteToken: TOKENS.NUSDC,
    tickSize: 10000,    // $0.01 (on-chain verified)
    lotSize: 1000000000, // 1.0 NASUN (on-chain verified)
    makerFeeBps: 1.5,
    takerFeeBps: 4,
  },
  NETH_NUSDC: {
    id: NETWORK_CONFIG.poolNethNusdc,
    baseToken: TOKENS.NETH,
    quoteToken: TOKENS.NUSDC,
    tickSize: 100000,   // $0.10 (8 decimals, same as NBTC)
    lotSize: 1000,      // 0.00001 ETH (8 decimals)
    makerFeeBps: 1.5,
    takerFeeBps: 4,
  },
  NSOL_NUSDC: {
    id: NETWORK_CONFIG.poolNsolNusdc,
    baseToken: TOKENS.NSOL,
    quoteToken: TOKENS.NUSDC,
    tickSize: 10000,    // $0.01
    lotSize: 1000000000, // 1.0 SOL (9 decimals)
    makerFeeBps: 1.5,
    takerFeeBps: 4,
  },
} as const;
