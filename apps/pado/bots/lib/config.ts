/**
 * LP Bot Configuration
 *
 * Multi-market configuration for the liquidity provider bot.
 * Supports NBTC/NUSDC, NETH/NUSDC, and NSOL/NUSDC markets.
 *
 * Select market via LP_MARKET env var (default: NBTC).
 *
 * @version 0.2.0
 */

// ========================================
// Network Configuration
// ========================================

export const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
export const FAUCET_URL = process.env.NASUN_FAUCET_URL || 'https://faucet.devnet.nasun.io';

// ========================================
// Contract Addresses (DevNet V7 - 2026-02-04)
// ========================================

// DeepBook V3
export const DEEPBOOK_PACKAGE = '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134';
export const DEEPBOOK_REGISTRY = '0x0a6ba6378a30598f1487e193865bfa387f177f82660400a5eace887cfe5a6b7b';

// Tokens V1 (NBTC, NUSDC)
export const TOKENS_PACKAGE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';
export const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';

// Tokens V2 (NETH, NSOL)
export const TOKENS_V2_PACKAGE = '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2';
// V2 faucet upgraded package (reduced mint amounts to prevent u64 supply overflow)
export const TOKENS_V2_FAUCET_PACKAGE = '0x3887377706f0307d22f1d0b04e0c4fa72b2cbbf0315502a0b8ecba9cba5216f8';
export const TOKEN_FAUCET_V2 = '0x39d18f61b17942dd6823d11a09393937e526619af2f7f707f6afc5c9453c75f2';

// Token Types
const NBTC_TYPE = `${TOKENS_PACKAGE}::nbtc::NBTC`;
const NUSDC_TYPE = `${TOKENS_PACKAGE}::nusdc::NUSDC`;
const NETH_TYPE = `${TOKENS_V2_PACKAGE}::neth::NETH`;
const NSOL_TYPE = `${TOKENS_V2_PACKAGE}::nsol::NSOL`;

// System
export const CLOCK_ID = '0x6';

// ========================================
// Market Configuration
// ========================================

export interface MarketConfig {
  name: string;           // Display name (NBTC, NETH, NSOL)
  baseType: string;       // Full Move type for base token
  quoteType: string;      // Full Move type for quote token (always NUSDC)
  poolId: string;         // DeepBook V3 pool object ID
  baseDecimals: number;   // Base token decimals
  quoteDecimals: number;  // Quote token decimals (always 6 for NUSDC)
  tickSize: bigint;       // Pool tick size
  lotSize: bigint;        // Pool lot size
  minSize: bigint;        // Pool minimum order size
  binanceSymbol: string;  // Binance API ticker (BTCUSDT, ETHUSDT, SOLUSDT)
  defaultMinPrice: number;
  defaultMaxPrice: number;
  defaultOrderSize: number;
  defaultLevelSpacing: number; // Default level spacing in bps (per-market)
  defaultSpreadBps: number;    // Default spread in bps (per-market)
  defaultMaxArbQuantity: number; // Default max arb quantity (per-market)
  defaultMaxOrderSize: number; // Default max order size (per-market)
  faucetBaseAmount: number;    // Base tokens received per faucet call (for accumulation calc)
  startupDelayMs: number;      // Staggered startup delay to avoid gas coin contention
  faucetType: 'v1' | 'v2'; // Which faucet module to use for base token
}

export const MARKETS: Record<string, MarketConfig> = {
  NBTC: {
    name: 'NBTC',
    baseType: NBTC_TYPE,
    quoteType: NUSDC_TYPE,
    poolId: '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0',
    baseDecimals: 8,
    quoteDecimals: 6,
    tickSize: 100000n,      // $0.1
    lotSize: 1000n,          // 0.00001 BTC
    minSize: 1000n,
    binanceSymbol: 'BTCUSDT',
    defaultMinPrice: 50000,
    defaultMaxPrice: 200000,
    defaultOrderSize: 0.01,
    defaultLevelSpacing: 8,
    defaultSpreadBps: 20,
    defaultMaxArbQuantity: 0.01,
    defaultMaxOrderSize: 0.1,
    faucetBaseAmount: 1.0,   // V1 faucet: 1 NBTC per call
    startupDelayMs: 0,
    faucetType: 'v1',
  },
  NETH: {
    name: 'NETH',
    baseType: NETH_TYPE,
    quoteType: NUSDC_TYPE,
    poolId: '0x531fed7acf9f5f7fe3a206bc079d69d39db0bf8e22ff703c3fe0817edf9c0714',
    baseDecimals: 18,
    quoteDecimals: 6,
    tickSize: 10000n,                // $0.01
    lotSize: 1000000000000000n,      // 0.001 ETH (10^15)
    minSize: 1000000000000000n,
    binanceSymbol: 'ETHUSDT',
    defaultMinPrice: 1000,
    defaultMaxPrice: 10000,
    defaultOrderSize: 0.01,
    defaultLevelSpacing: 12,
    defaultSpreadBps: 30,
    defaultMaxArbQuantity: 0.5,
    defaultMaxOrderSize: 1.0,
    faucetBaseAmount: 0.1,   // V2 faucet: 0.1 NETH per call
    startupDelayMs: 5000,
    faucetType: 'v2',
  },
  NSOL: {
    name: 'NSOL',
    baseType: NSOL_TYPE,
    quoteType: NUSDC_TYPE,
    poolId: '0x577f81bb5dae12aac57103ed0231aae200af3ac1c5db3d523b679b09ac88c769',
    baseDecimals: 9,
    quoteDecimals: 6,
    tickSize: 10000n,         // $0.01
    lotSize: 1000000000n,     // 1.0 SOL (10^9)
    minSize: 1000000000n,
    binanceSymbol: 'SOLUSDT',
    defaultMinPrice: 10,
    defaultMaxPrice: 1000,
    defaultOrderSize: 1,
    defaultLevelSpacing: 15,
    defaultSpreadBps: 40,
    defaultMaxArbQuantity: 10,
    defaultMaxOrderSize: 100,
    faucetBaseAmount: 10,    // V2 faucet: 10 NSOL per call
    startupDelayMs: 10000,
    faucetType: 'v2',
  },
};

// Active market (from LP_MARKET env var)
const marketName = process.env.LP_MARKET || 'NBTC';
export const MARKET: MarketConfig = (() => {
  const m = MARKETS[marketName];
  if (!m) {
    throw new Error(`Unknown market: ${marketName}. Available: ${Object.keys(MARKETS).join(', ')}`);
  }
  return m;
})();

// ========================================
// LP Bot Configuration
// ========================================

export interface LPConfig {
  // Spread settings
  spreadBps: number;
  levelSpacingBps: number;
  orderLevels: number;

  // Order sizing
  orderSize: number;  // Base token units per order level

  // Timing
  updateIntervalMs: number;
  requoteThresholdBps: number;

  // Inventory management
  refillThresholdBase: number;
  refillThresholdQuote: number;

  // Risk controls
  maxOrderSize: number;
  minSpreadBps: number;
  maxConsecutiveFailures: number;
  minPriceUsd: number;
  maxPriceUsd: number;

  // Gas management
  gasRefillThreshold: number;

  // Arbitrage settings
  enableArbitrage: boolean;
  minArbitrageProfitBps: number;
  maxArbitrageQuantity: number;
}

export function loadConfig(): LPConfig {
  const config = {
    spreadBps: parseInt(process.env.LP_SPREAD_BPS || String(MARKET.defaultSpreadBps), 10),
    levelSpacingBps: parseInt(process.env.LP_LEVEL_SPACING_BPS || String(MARKET.defaultLevelSpacing), 10),
    orderLevels: parseInt(process.env.LP_ORDER_LEVELS || '30', 10),

    orderSize: parseFloat(process.env.LP_ORDER_SIZE || String(MARKET.defaultOrderSize)),

    updateIntervalMs: parseInt(process.env.LP_UPDATE_INTERVAL || '10000', 10),
    requoteThresholdBps: parseInt(process.env.LP_REQUOTE_THRESHOLD || '50', 10),

    refillThresholdBase: parseFloat(process.env.LP_REFILL_THRESHOLD_BASE || '0.5'),
    refillThresholdQuote: parseFloat(process.env.LP_REFILL_THRESHOLD_QUOTE || '50000'),

    maxOrderSize: parseFloat(process.env.LP_MAX_ORDER_SIZE || String(MARKET.defaultMaxOrderSize)),
    minSpreadBps: parseInt(process.env.LP_MIN_SPREAD_BPS || '10', 10),
    maxConsecutiveFailures: parseInt(process.env.LP_MAX_FAILURES || '5', 10),
    minPriceUsd: parseFloat(process.env.LP_MIN_PRICE || String(MARKET.defaultMinPrice)),
    maxPriceUsd: parseFloat(process.env.LP_MAX_PRICE || String(MARKET.defaultMaxPrice)),

    gasRefillThreshold: parseFloat(process.env.LP_GAS_REFILL_THRESHOLD || '0.5'),

    enableArbitrage: process.env.LP_ENABLE_ARBITRAGE !== 'false',
    minArbitrageProfitBps: parseInt(process.env.LP_MIN_ARB_PROFIT_BPS || '10', 10),
    maxArbitrageQuantity: parseFloat(process.env.LP_MAX_ARB_QUANTITY || String(MARKET.defaultMaxArbQuantity)),
  };

  // Validate configuration bounds
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'number' && isNaN(value)) {
      throw new Error(`Invalid numeric value for ${key}`);
    }
  }

  if (config.spreadBps < 1 || config.spreadBps > 10000) {
    throw new Error('LP_SPREAD_BPS must be between 1 and 10000');
  }
  if (config.orderSize <= 0) {
    throw new Error('LP_ORDER_SIZE must be positive');
  }
  if (config.maxOrderSize <= 0) {
    throw new Error('LP_MAX_ORDER_SIZE must be positive');
  }
  if (config.maxOrderSize < config.orderSize) {
    throw new Error('LP_MAX_ORDER_SIZE must be >= LP_ORDER_SIZE');
  }
  if (config.minPriceUsd >= config.maxPriceUsd) {
    throw new Error('LP_MIN_PRICE must be less than LP_MAX_PRICE');
  }
  if (config.minSpreadBps > config.spreadBps) {
    throw new Error('LP_MIN_SPREAD_BPS must not exceed LP_SPREAD_BPS');
  }
  if (config.orderLevels < 1 || config.orderLevels > 50) {
    throw new Error('LP_ORDER_LEVELS must be between 1 and 50');
  }
  if (config.levelSpacingBps < 1 || config.levelSpacingBps > 1000) {
    throw new Error('LP_LEVEL_SPACING_BPS must be between 1 and 1000');
  }
  if (config.maxArbitrageQuantity <= 0) {
    throw new Error('LP_MAX_ARB_QUANTITY must be positive');
  }

  return config;
}

// ========================================
// Order Types (DeepBook V3)
// ========================================

export const ORDER_TYPE = {
  NO_RESTRICTION: 0,
  IMMEDIATE_OR_CANCEL: 1,
  FILL_OR_KILL: 2,
  POST_ONLY: 3,
} as const;

export const SELF_MATCHING = {
  ALLOWED: 0,
  CANCEL_TAKER: 1,
  CANCEL_MAKER: 2,
} as const;

// ========================================
// Types
// ========================================

export interface OrderSpec {
  price: bigint;     // Raw price in quote token units
  quantity: bigint;  // Raw quantity in base token units
  isBid: boolean;
}

export interface Inventory {
  base: number;      // Base token balance (human readable)
  quote: number;     // Quote token balance (human readable)
}

export interface BotState {
  lastQuotedPrice: number;
  consecutiveFailures: number;
  clientOrderIdCounter: bigint;
  balanceManagerId: string | null;
  justInitialized: boolean;
}

// ========================================
// Helpers
// ========================================

/**
 * Convert human-readable price to raw quote token units
 */
export function priceToRaw(price: number): bigint {
  return BigInt(Math.round(price * Math.pow(10, MARKET.quoteDecimals)));
}

/**
 * Convert human-readable base amount to raw base token units
 */
export function quantityToRaw(quantity: number): bigint {
  return BigInt(Math.round(quantity * Math.pow(10, MARKET.baseDecimals)));
}

/**
 * Convert raw base token units to human-readable
 */
export function rawToQuantity(raw: bigint): number {
  return Number(raw) / Math.pow(10, MARKET.baseDecimals);
}

/**
 * Convert raw quote token units to human-readable
 */
export function rawToPrice(raw: bigint): number {
  return Number(raw) / Math.pow(10, MARKET.quoteDecimals);
}

/**
 * Round price to tick size
 */
export function roundToTickSize(priceRaw: bigint): bigint {
  return (priceRaw / MARKET.tickSize) * MARKET.tickSize;
}

/**
 * Round quantity to lot size
 */
export function roundToLotSize(quantityRaw: bigint): bigint {
  return (quantityRaw / MARKET.lotSize) * MARKET.lotSize;
}

/**
 * Check if an error message indicates gas exhaustion.
 */
export function isGasExhaustedError(error: string): boolean {
  const patterns = [
    /balance of gas object.*is lower than.*needed amount/i,
    /insufficient gas/i,
    /not enough gas/i,
  ];
  return patterns.some((pattern) => pattern.test(error));
}

/**
 * Format timestamp for logging
 */
export function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}
