/**
 * Perpetual Futures DEX Constants
 * @module features/perp/constants
 *
 * TODO: Perp and Oracle contracts need to be redeployed for V6
 * Current IDs are from V5 and will not work on V6 network
 */

// ===== Package & Object IDs =====

/** Deployed pado_perp package ID (TODO: Redeploy for V6) */
export const PERP_PACKAGE_ID =
  import.meta.env.VITE_PERP_PACKAGE_ID || '';

/** Module names */
export const PERP_MODULE = 'perpetual';
export const FUNDING_MODULE = 'funding';
export const LIQUIDATION_MODULE = 'liquidation';

// ===== Market IDs (to be populated after market creation) =====

/** BTC-PERP market shared object ID (TODO: Create after V6 redeployment) */
export const PERP_MARKET_BTC =
  import.meta.env.VITE_PERP_MARKET_BTC || '';

// ===== Oracle Configuration =====

/** Oracle symbol IDs (from contracts-oracle) */
export const ORACLE_SYMBOL = {
  BTC: 1,
  ETH: 2,
  NASUN: 3,
} as const;

/** Oracle Registry shared object ID (TODO: Redeploy for V6) */
export const ORACLE_REGISTRY_ID =
  import.meta.env.VITE_ORACLE_REGISTRY_ID || '';

// ===== Contract Constants (mirrored from perpetual.move) =====

/** Maximum leverage allowed */
export const MAX_LEVERAGE = 20;

/** Minimum leverage */
export const MIN_LEVERAGE = 1;

/** Basis points denominator */
export const BPS = 10000;

/** Price precision (8 decimals) */
export const PRICE_DECIMALS = 100_000_000;

/** Minimum position size in NUSDC units (10 NUSDC = 10_000_000 units) */
export const MIN_POSITION_SIZE = 10_000_000;

/** NUSDC decimals */
export const NUSDC_DECIMALS = 6;

/** Default maker fee (2 bps = 0.02%) */
export const DEFAULT_MAKER_FEE_BPS = 2;

/** Default taker fee (5 bps = 0.05%) */
export const DEFAULT_TAKER_FEE_BPS = 5;

/** Initial margin requirement (5% = 500 bps) */
export const INITIAL_MARGIN_BPS = 500;

/** Maintenance margin requirement (2.5% = 250 bps) */
export const MAINTENANCE_MARGIN_BPS = 250;

/** Funding interval (8 hours in milliseconds) */
export const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000;

/** Liquidation bonus for liquidators (5% = 500 bps) */
export const LIQUIDATION_BONUS_BPS = 500;

/** Minimum liquidation bonus in NUSDC units (0.1 NUSDC) */
export const MIN_LIQUIDATION_BONUS = 100_000;

// ===== Leverage Options =====

/** Available leverage options for UI */
export const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 15, 20] as const;

// ===== UI Constants =====

/** Position sides */
export const POSITION_SIDE = {
  LONG: 'long',
  SHORT: 'short',
} as const;

/** Risk levels based on margin ratio */
export const RISK_LEVEL = {
  HEALTHY: 'healthy', // > 10%
  WARNING: 'warning', // 5-10%
  DANGER: 'danger', // 2.5-5%
  CRITICAL: 'critical', // < 2.5% (liquidatable)
} as const;

/** Margin ratio thresholds in BPS */
export const MARGIN_THRESHOLDS = {
  HEALTHY: 1000, // 10%
  WARNING: 500, // 5%
  DANGER: 250, // 2.5% (maintenance margin)
} as const;

// ===== Helper Functions =====

/**
 * Convert human readable price to contract price (8 decimals)
 */
export function toContractPrice(price: number): bigint {
  return BigInt(Math.floor(price * PRICE_DECIMALS));
}

/**
 * Convert contract price to human readable
 */
export function fromContractPrice(price: bigint | number): number {
  return Number(price) / PRICE_DECIMALS;
}

/**
 * Convert human readable NUSDC amount to contract units (6 decimals)
 */
export function toContractAmount(amount: number): bigint {
  return BigInt(Math.floor(amount * 10 ** NUSDC_DECIMALS));
}

/**
 * Convert contract NUSDC units to human readable
 */
export function fromContractAmount(amount: bigint | number): number {
  return Number(amount) / 10 ** NUSDC_DECIMALS;
}

/**
 * Calculate required margin for a position
 */
export function calculateRequiredMargin(
  size: number,
  price: number,
  leverage: number,
): number {
  const notional = size * price;
  return notional / leverage;
}

/**
 * Get risk level from margin ratio
 */
export function getRiskLevel(
  marginRatioBps: number,
): (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL] {
  if (marginRatioBps >= MARGIN_THRESHOLDS.HEALTHY) return RISK_LEVEL.HEALTHY;
  if (marginRatioBps >= MARGIN_THRESHOLDS.WARNING) return RISK_LEVEL.WARNING;
  if (marginRatioBps >= MARGIN_THRESHOLDS.DANGER) return RISK_LEVEL.DANGER;
  return RISK_LEVEL.CRITICAL;
}
