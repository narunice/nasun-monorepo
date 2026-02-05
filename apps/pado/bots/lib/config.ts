/**
 * LP Bot Configuration
 *
 * All constants and configuration for the liquidity provider bot.
 */

// ========================================
// Network Configuration
// ========================================

export const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

// ========================================
// Contract Addresses (DevNet V7 - 2026-02-04)
// ========================================

// DeepBook V3
export const DEEPBOOK_PACKAGE = '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134';
export const DEEPBOOK_REGISTRY = '0x0a6ba6378a30598f1487e193865bfa387f177f82660400a5eace887cfe5a6b7b';

// Tokens
export const TOKENS_PACKAGE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';
export const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';

// Token Types
export const NBTC_TYPE = `${TOKENS_PACKAGE}::nbtc::NBTC`;
export const NUSDC_TYPE = `${TOKENS_PACKAGE}::nusdc::NUSDC`;

// Pool
export const NBTC_NUSDC_POOL = '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0';

// System
export const CLOCK_ID = '0x6';

// ========================================
// Token Decimals
// ========================================

export const NBTC_DECIMALS = 8;
export const NUSDC_DECIMALS = 6;

// ========================================
// Pool Configuration
// ========================================

// Pool configuration (from on-chain PoolInner)
export const TICK_SIZE = 100000n; // 0.1 USDC
export const LOT_SIZE = 100000n;  // 0.001 BTC
export const MIN_SIZE = 100000n;  // 0.001 BTC minimum order

// ========================================
// LP Bot Configuration
// ========================================

export interface LPConfig {
  // Spread settings
  spreadBps: number;          // Base spread in basis points (30 = 0.3%)
  levelSpacingBps: number;    // Spacing between levels (10 = 0.1%)
  orderLevels: number;        // Number of orders per side (5 = 5 bids + 5 asks)

  // Order sizing
  orderSizeNbtc: number;      // Order size in BTC per level

  // Timing
  updateIntervalMs: number;   // Main loop interval in milliseconds
  requoteThresholdBps: number; // Re-quote if price moves more than this

  // Inventory management
  refillThresholdNbtc: number;  // Request faucet if NBTC below this
  refillThresholdNusdc: number; // Request faucet if NUSDC below this

  // Risk controls
  maxOrderSizeNbtc: number;    // Maximum order size allowed
  minSpreadBps: number;        // Minimum spread floor
  maxConsecutiveFailures: number; // Circuit breaker threshold
  minPriceUsd: number;         // Minimum acceptable BTC price
  maxPriceUsd: number;         // Maximum acceptable BTC price
}

export function loadConfig(): LPConfig {
  const config = {
    // Spread settings
    spreadBps: parseInt(process.env.LP_SPREAD_BPS || '30', 10),
    levelSpacingBps: parseInt(process.env.LP_LEVEL_SPACING_BPS || '10', 10),
    orderLevels: parseInt(process.env.LP_ORDER_LEVELS || '20', 10),

    // Order sizing
    orderSizeNbtc: parseFloat(process.env.LP_ORDER_SIZE || '0.01'),

    // Timing
    updateIntervalMs: parseInt(process.env.LP_UPDATE_INTERVAL || '10000', 10),
    requoteThresholdBps: parseInt(process.env.LP_REQUOTE_THRESHOLD || '50', 10),

    // Inventory management
    refillThresholdNbtc: parseFloat(process.env.LP_REFILL_THRESHOLD_NBTC || '0.5'),
    refillThresholdNusdc: parseFloat(process.env.LP_REFILL_THRESHOLD_NUSDC || '50000'),

    // Risk controls
    maxOrderSizeNbtc: parseFloat(process.env.LP_MAX_ORDER_SIZE || '0.1'),
    minSpreadBps: parseInt(process.env.LP_MIN_SPREAD_BPS || '10', 10),
    maxConsecutiveFailures: parseInt(process.env.LP_MAX_FAILURES || '5', 10),
    minPriceUsd: parseFloat(process.env.LP_MIN_PRICE || '50000'),
    maxPriceUsd: parseFloat(process.env.LP_MAX_PRICE || '200000'),
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
  if (config.orderSizeNbtc <= 0 || config.orderSizeNbtc > 10) {
    throw new Error('LP_ORDER_SIZE must be between 0 and 10 BTC');
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
  price: bigint;     // Raw price in NUSDC units (6 decimals)
  quantity: bigint;  // Raw quantity in NBTC units (8 decimals)
  isBid: boolean;    // true = buy, false = sell
}

export interface Inventory {
  nbtc: number;      // NBTC balance (human readable)
  nusdc: number;     // NUSDC balance (human readable)
}

export interface BotState {
  lastQuotedPrice: number;
  consecutiveFailures: number;
  clientOrderIdCounter: bigint;
  balanceManagerId: string | null;
  justInitialized: boolean;  // Skip refill on first run after init
}

// ========================================
// Helpers
// ========================================

/**
 * Convert human-readable price to raw NUSDC units
 * Example: 100000 USD -> 100000000000 (100000 * 10^6)
 */
export function priceToRaw(price: number): bigint {
  return BigInt(Math.round(price * Math.pow(10, NUSDC_DECIMALS)));
}

/**
 * Convert human-readable BTC amount to raw NBTC units
 * Example: 0.01 BTC -> 1000000 (0.01 * 10^8)
 */
export function quantityToRaw(quantity: number): bigint {
  return BigInt(Math.round(quantity * Math.pow(10, NBTC_DECIMALS)));
}

/**
 * Convert raw NBTC units to human-readable BTC
 */
export function rawToQuantity(raw: bigint): number {
  return Number(raw) / Math.pow(10, NBTC_DECIMALS);
}

/**
 * Convert raw NUSDC units to human-readable USD
 */
export function rawToPrice(raw: bigint): number {
  return Number(raw) / Math.pow(10, NUSDC_DECIMALS);
}

/**
 * Round price to tick size
 */
export function roundToTickSize(priceRaw: bigint): bigint {
  return (priceRaw / TICK_SIZE) * TICK_SIZE;
}

/**
 * Round quantity to lot size
 */
export function roundToLotSize(quantityRaw: bigint): bigint {
  return (quantityRaw / LOT_SIZE) * LOT_SIZE;
}

/**
 * Format timestamp for logging
 */
export function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}
