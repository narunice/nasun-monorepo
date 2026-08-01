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
// Contract Addresses (Nasun Devnet v8 fresh genesis - 2026-06-19)
// ========================================

// DeepBook V3 (fresh publish: packageId == originalPackageId)
export const DEEPBOOK_PACKAGE = '0xf0dce6bfc71db3f20be146e65a70cc721dd82d6bc1a1be84febfa58a1018ea00';
export const DEEPBOOK_REGISTRY = '0xd1f79b00a86ac2f767a47fff88bd5c81597a557e19d645f7f93cf4ce7bce8f76';

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

// Tokens V1 (NBTC, NUSDC): devnet_tokens (v8 fresh genesis)
export const TOKENS_PACKAGE = '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11';
export const TOKEN_FAUCET = '0x336c5db9b9aef143feddb1376c4a7f2a6dc10dabdf6185947f3ac48ddadaf6ff';

// Tokens V2 (NSOL + NETH): devnet_tokens_v2 (v8 fresh genesis).
// v8 consolidation: NETH and NSOL share ONE package and ONE faucet. The v7
// split (NETH on its own re-published package due to an 8-decimal migration)
// is gone. Both coins now live at 0xe09adc42 and the single faucet_v2 object
// 0xf6ff5936 holds both TreasuryCaps (request_neth / request_nsol).
export const TOKENS_V2_PACKAGE = '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9';
export const TOKENS_V2_FAUCET_PACKAGE = TOKENS_V2_PACKAGE; // faucet_v2 module lives in the token package
export const TOKEN_FAUCET_V2 = '0xf6ff5936a307f0c02e7a812c03a17a3ce95e7252a00ec27a809ead96641fcb36';

// NETH: consolidated into devnet_tokens_v2 (8 decimals, matches mainnet WETH).
// In v8 these alias the V2 constants; kept as named symbols because MARKETS and
// preflight reference NETH-specific pairings and NETH could diverge again.
export const NETH_PACKAGE = TOKENS_V2_PACKAGE;
export const NETH_FAUCET_PACKAGE = TOKENS_V2_FAUCET_PACKAGE;
export const NETH_FAUCET_V2 = TOKEN_FAUCET_V2;

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
    poolId: '0x1addff570f17f0e12fa14c5f986806ce21bd5cc0542c4548ebf011a56eb26ec9',
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
    poolId: '0x2fb410e4505fabc13b2791e801969cd9691ad2dc47173fb1b3d7e7811cc37209',
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
    // v8: NETH (0xe09adc42::neth::NETH) is minted by the shared faucet_v2 via
    // request_neth, same package + faucet object as NSOL (consolidated).
    faucetV2Package: NETH_FAUCET_PACKAGE,
    faucetV2Object: NETH_FAUCET_V2,
    faucetV2Function: 'request_neth',
    defaultZones: DEFAULT_ZONES,
  },
  NSOL: {
    name: 'NSOL',
    baseType: NSOL_TYPE,
    quoteType: NUSDC_TYPE,
    poolId: '0xbdcaa69717ffcc5ce67a983903c0d77adabe944ad8d478e618345f66ee7e01c6',
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

// NSN/NUSDC spot pool.
//
// Deliberately NOT a MARKETS entry: NSN is the native gas token, so it has no
// faucet/mint path and must never be selectable via LP_MARKET. The TP/SL keeper
// still needs its price, and the DevOracle NASUN feed is a fixed $1 placeholder
// (price-updater pushes only BTC/ETH/SOL), so for NSN the pool mid IS the price.
export const NSN_POOL = {
  symbol: 'NSN',
  baseType: '0x2::sui::SUI',
  quoteType: NUSDC_TYPE,
  poolId: '0x91f5e123cd1211347dd8dc8a92bfde99a2153844d795c2ccfe6ad43d4a26ec03',
  baseDecimals: 9,
  quoteDecimals: 6,
} as const;

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
