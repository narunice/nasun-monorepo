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

// ─────────────────────────────────────────────────────────────────────────────
// Token / faucet package map  (INVARIANT — read before editing)
//
// Each MarketConfig.faucetV2Object MUST hold a TreasuryCap whose minted coin
// type EQUALS MarketConfig.baseType. If the faucet is wired to a stale package's
// TreasuryCap, the bot will mint a token of the wrong type that DeepBook pools
// will refuse to accept, and the bot will appear to refill while its trading
// inventory stays empty (2026-05-18 NETH liquidity incident).
//
// Pairings (must stay consistent):
//
//   Market | baseType package          | faucet package             | faucet object
//   -------|---------------------------|----------------------------|-----------------
//   NBTC   | TOKENS_PACKAGE            | TOKENS_PACKAGE             | TOKEN_FAUCET (v1)
//   NETH   | NETH_PACKAGE              | NETH_FAUCET_PACKAGE        | NETH_FAUCET_V2
//   NSOL   | TOKENS_V2_PACKAGE         | TOKENS_V2_FAUCET_PACKAGE   | TOKEN_FAUCET_V2
//
// `verifyMarketFaucet()` in lib/preflight.ts enforces this at bot startup; do
// NOT bypass it. When re-publishing a token package, update BOTH the *_PACKAGE
// constant AND its dedicated faucet object below, and confirm preflight passes.
// ─────────────────────────────────────────────────────────────────────────────

// Tokens V1 (NBTC, NUSDC)
export const TOKENS_PACKAGE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';
export const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';

// Tokens V2 - NSOL (original package, 9 decimals).
// The shared v2 faucet (TOKEN_FAUCET_V2) was created with NSOL's TreasuryCap
// AND a now-legacy NETH TreasuryCap; the legacy NETH is NOT the current NETH —
// see the NETH block below.
export const TOKENS_V2_PACKAGE = '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2';
export const TOKENS_V2_FAUCET_PACKAGE = '0xa26189900ac82fbb581579a346e0557905f1c7c9958e9d4dd460f421a43fc9ae';
export const TOKEN_FAUCET_V2 = '0x39d18f61b17942dd6823d11a09393937e526619af2f7f707f6afc5c9453c75f2';

// Tokens V2 - NETH (re-published, 8 decimals — matches Sui mainnet WETH convention).
// NETH lives in its OWN package and has its OWN faucet — the shared
// TOKEN_FAUCET_V2 still mints the obsolete pre-republish NETH type and must
// not be used for NETH. The current NETH faucet exposes `request_tokens`
// (no cooldown, mints NETH + NSOL together) and `request_neth_with_cooldown`.
export const NETH_PACKAGE = '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31';
export const NETH_FAUCET_PACKAGE = '0xbf33cac7b8ccb22d398a6dedc3e159ed68bc1804bf0726516360e7e0b9dcb474';
export const NETH_FAUCET_V2 = '0x8654e80b3e978aa0d5dca457f6b891e2c6cdbda4531d8c2ee7ab4e1251a0e50e';

// Token Types
const NBTC_TYPE = `${TOKENS_PACKAGE}::nbtc::NBTC`;
const NUSDC_TYPE = `${TOKENS_PACKAGE}::nusdc::NUSDC`;
const NETH_TYPE = `${NETH_PACKAGE}::neth::NETH`;
const NSOL_TYPE = `${TOKENS_V2_PACKAGE}::nsol::NSOL`;

// System
export const CLOCK_ID = '0x6';

// ========================================
// Market Configuration
// ========================================

/**
 * Tiered grid zone: a contiguous band of levels at a given spacing and size multiplier.
 * Inner zones produce tighter, smaller orders near the mid; outer zones produce sparser,
 * thicker orders for depth.
 */
export interface ZoneConfig {
  levels: number;       // Number of levels in this zone (per side)
  spacingBps: number;   // Per-level spacing in bps within this zone
  sizeMult: number;     // Multiplier on base orderSize for orders in this zone
}

// Default tiered grid shared across markets. Inner: tight & small, Outer: sparse & thick.
// Innermost spread is consumed from config.spreadBps (default 3 bps).
const DEFAULT_ZONES: ZoneConfig[] = [
  { levels: 10, spacingBps: 3,  sizeMult: 1.0 },
  { levels: 15, spacingBps: 8,  sizeMult: 1.3 },
  { levels: 15, spacingBps: 22, sizeMult: 1.8 },
];

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
  defaultLevelSpacing: number;         // Default level spacing in bps (per-market, uniform fallback)
  defaultSpreadBps: number;            // Default spread in bps (per-market)
  defaultRequoteThresholdBps: number;  // Price move threshold to trigger cancel+place (per-market)
  defaultMaxArbQuantity: number;       // Default max arb quantity (per-market)
  defaultMaxOrderSize: number; // Default max order size (per-market)
  faucetBaseAmount: number;    // Base tokens received per faucet call (for accumulation calc)
  startupDelayMs: number;      // Staggered startup delay to avoid gas coin contention
  faucetType: 'v1' | 'v2'; // Which faucet module to use for base token
  faucetV2Package?: string;  // Package to call for V2 faucet (per-market)
  faucetV2Object?: string;   // Shared faucet object for V2 (per-market)
  faucetV2Function?: string; // Function name for V2 faucet (default: 'request_tokens')
  defaultZones?: ZoneConfig[]; // Tiered grid zones; falls back to uniform when undefined
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
    defaultOrderSize: 0.05,
    defaultLevelSpacing: 8,
    defaultSpreadBps: 3,
    defaultRequoteThresholdBps: 5,
    defaultMaxArbQuantity: 0.1,
    defaultMaxOrderSize: 1.0,
    faucetBaseAmount: 0.01,  // V1 faucet: 0.01 NBTC per call
    startupDelayMs: 0,
    faucetType: 'v1',
    defaultZones: DEFAULT_ZONES,
  },
  NETH: {
    name: 'NETH',
    baseType: NETH_TYPE,
    quoteType: NUSDC_TYPE,
    poolId: '0xb6c960985711cf5a9cc5063cec8c7ad148794e4cb3c1ad1cea224911cd68e7b7',
    baseDecimals: 8,      // 8 decimals (matches Sui mainnet WETH convention)
    quoteDecimals: 6,
    tickSize: 100000n,    // $0.10 (same as NBTC — both 8 dec)
    lotSize: 1000n,       // 0.00001 ETH
    minSize: 1000n,
    binanceSymbol: 'ETHUSDT',
    defaultMinPrice: 1000,
    defaultMaxPrice: 10000,
    defaultOrderSize: 2,
    defaultLevelSpacing: 12,
    defaultSpreadBps: 3,
    defaultRequoteThresholdBps: 5,
    defaultMaxArbQuantity: 5,
    defaultMaxOrderSize: 10.0,
    faucetBaseAmount: 0.5,   // V2 faucet: 0.5 NETH per call (NETH_FAUCET_AMOUNT = 50_000_000)
    startupDelayMs: 20000,
    faucetType: 'v2',
    // Current NETH (type 0xe672...::neth::NETH) is minted by the dedicated NETH
    // faucet, not the shared TOKEN_FAUCET_V2. The shared faucet holds the
    // legacy 0xcc65...::neth::NETH TreasuryCap and produces unusable coins.
    faucetV2Package: NETH_FAUCET_PACKAGE,
    faucetV2Object: NETH_FAUCET_V2,
    faucetV2Function: 'request_neth',
    defaultZones: DEFAULT_ZONES,
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
    defaultOrderSize: 30,
    defaultLevelSpacing: 15,
    defaultSpreadBps: 3,
    defaultRequoteThresholdBps: 5,
    defaultMaxArbQuantity: 100,
    defaultMaxOrderSize: 1000,
    faucetBaseAmount: 10,    // V2 faucet: 10 NSOL per call (request_nsol)
    startupDelayMs: 40000,
    faucetType: 'v2',
    faucetV2Package: TOKENS_V2_FAUCET_PACKAGE,
    faucetV2Object: TOKEN_FAUCET_V2,
    faucetV2Function: 'request_nsol',
    defaultZones: DEFAULT_ZONES,
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

  // Faucet control
  disableTokenFaucet: boolean;

  // Divergence detection
  divergenceForceRequoteBps: number;

  // Tiered grid (optional). When set, overrides uniform `levelSpacingBps`/`orderLevels` path.
  // Inner→outer order; first zone's offset starts at `spreadBps`.
  zones?: ZoneConfig[];
}

/**
 * Parse `LP_ZONES` env var. Accepts JSON of either ZoneConfig[] (objects) or
 * tuple form: `[[levels, spacingBps, sizeMult], ...]`. Returns undefined when
 * unset/empty/invalid (caller falls back to MarketConfig.defaultZones).
 */
function parseZonesEnv(raw: string | undefined): ZoneConfig[] | undefined {
  if (!raw || raw.trim() === '' || raw.trim() === '[]') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LP_ZONES is not valid JSON: ${raw}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
  return parsed.map((entry, i) => {
    if (Array.isArray(entry) && entry.length === 3) {
      return { levels: Number(entry[0]), spacingBps: Number(entry[1]), sizeMult: Number(entry[2]) };
    }
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      return { levels: Number(e.levels), spacingBps: Number(e.spacingBps), sizeMult: Number(e.sizeMult) };
    }
    throw new Error(`LP_ZONES[${i}] must be {levels,spacingBps,sizeMult} or [levels,spacingBps,sizeMult]`);
  });
}

function validateZones(zones: ZoneConfig[]): void {
  if (zones.length === 0) {
    throw new Error('zones must contain at least one entry');
  }
  let totalLevels = 0;
  for (const [i, z] of zones.entries()) {
    if (!Number.isFinite(z.levels) || z.levels < 1 || z.levels > 50) {
      throw new Error(`zones[${i}].levels must be 1..50`);
    }
    if (!Number.isFinite(z.spacingBps) || z.spacingBps < 1 || z.spacingBps > 1000) {
      throw new Error(`zones[${i}].spacingBps must be 1..1000`);
    }
    if (!Number.isFinite(z.sizeMult) || z.sizeMult <= 0 || z.sizeMult > 100) {
      throw new Error(`zones[${i}].sizeMult must be (0, 100]`);
    }
    totalLevels += z.levels;
  }
  if (totalLevels > 50) {
    throw new Error(`total tiered levels per side must be <= 50, got ${totalLevels}`);
  }
}

export function loadConfig(): LPConfig {
  const spreadBps = parseInt(process.env.LP_SPREAD_BPS || String(MARKET.defaultSpreadBps), 10);
  // Floor below which `validateOrders` filters orders. Lowered to 2 so that the
  // tiered grid's innermost band (3 bps offset) survives validation. Override
  // via LP_MIN_SPREAD_BPS.
  const minSpreadBps = parseInt(process.env.LP_MIN_SPREAD_BPS || '2', 10);

  const zones = parseZonesEnv(process.env.LP_ZONES) ?? MARKET.defaultZones;
  if (zones) validateZones(zones);

  console.log(`[DEBUG] spreadBps: ${spreadBps}, minSpreadBps: ${minSpreadBps}`);

  const config = {
    spreadBps,
    levelSpacingBps: parseInt(process.env.LP_LEVEL_SPACING_BPS || String(MARKET.defaultLevelSpacing), 10),
    orderLevels: parseInt(process.env.LP_ORDER_LEVELS || '30', 10),

    orderSize: parseFloat(process.env.LP_ORDER_SIZE || String(MARKET.defaultOrderSize)),

    updateIntervalMs: parseInt(process.env.LP_UPDATE_INTERVAL || '4000', 10),
    requoteThresholdBps: parseInt(process.env.LP_REQUOTE_THRESHOLD || String(MARKET.defaultRequoteThresholdBps), 10),

    refillThresholdBase: parseFloat(process.env.LP_REFILL_THRESHOLD_BASE || '5'),
    refillThresholdQuote: parseFloat(process.env.LP_REFILL_THRESHOLD_QUOTE || '200000'),

    maxOrderSize: parseFloat(process.env.LP_MAX_ORDER_SIZE || String(MARKET.defaultMaxOrderSize)),
    minSpreadBps,
    maxConsecutiveFailures: parseInt(process.env.LP_MAX_FAILURES || '5', 10),
    minPriceUsd: parseFloat(process.env.LP_MIN_PRICE || String(MARKET.defaultMinPrice)),
    maxPriceUsd: parseFloat(process.env.LP_MAX_PRICE || String(MARKET.defaultMaxPrice)),

    gasRefillThreshold: parseFloat(process.env.LP_GAS_REFILL_THRESHOLD || '1000'),

    enableArbitrage: process.env.LP_ENABLE_ARBITRAGE !== 'false',
    minArbitrageProfitBps: parseInt(process.env.LP_MIN_ARB_PROFIT_BPS || '10', 10),
    maxArbitrageQuantity: parseFloat(process.env.LP_MAX_ARB_QUANTITY || String(MARKET.defaultMaxArbQuantity)),

    disableTokenFaucet: process.env.LP_DISABLE_TOKEN_FAUCET === 'true',

    divergenceForceRequoteBps: parseInt(process.env.LP_DIVERGENCE_THRESHOLD_BPS || '30', 10),

    zones,
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
  if (config.divergenceForceRequoteBps < 1 || config.divergenceForceRequoteBps > 1000) {
    throw new Error('LP_DIVERGENCE_THRESHOLD_BPS must be between 1 and 1000');
  }
  if (config.divergenceForceRequoteBps <= config.requoteThresholdBps) {
    throw new Error('LP_DIVERGENCE_THRESHOLD_BPS must be greater than LP_REQUOTE_THRESHOLD to avoid false positives');
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
  skipCount: number;
  consecutiveZeroDepth: number;
}

// ========================================
// Helpers
// ========================================

// DeepBook V3 encodes price as quote_raw_per_base_unit_at_9_decimals, so the
// scaling for human → raw is 10^(quoteDecimals + 9 - baseDecimals). With
// baseDecimals=9 (NSOL) this collapses to 10^quoteDecimals; with baseDecimals=8
// (NBTC, NETH) it is 10× the naive quoteDecimals scaling.
//
// TODO(SSOT): A duplicate of this function lives at
// apps/pado/frontend/src/lib/deepbook.ts::priceScaleExp. When the next pool
// with a new baseDecimals is added, extract both into a shared package
// (e.g. packages/deepbook-scale) and have both sides import it. Until then,
// any change here MUST be mirrored in the frontend copy. See
// project_2026_05_19_pado_price_10x_regression for the asymmetry incident.
// A lockstep test against the shared fixture file is in config.test.ts.
export function priceScaleExp(
  quoteDecimals: number = MARKET.quoteDecimals,
  baseDecimals: number = MARKET.baseDecimals,
): number {
  return quoteDecimals + 9 - baseDecimals;
}

/**
 * Convert human-readable price to raw quote token units (DeepBook V3 encoding)
 */
export function priceToRaw(price: number): bigint {
  return BigInt(Math.round(price * Math.pow(10, priceScaleExp())));
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
 * Convert DeepBook V3 raw price to human-readable USD price
 */
export function rawToPrice(raw: bigint): number {
  return Number(raw) / Math.pow(10, priceScaleExp());
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
