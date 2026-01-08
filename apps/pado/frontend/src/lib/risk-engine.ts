/**
 * Risk Engine v0 - Frontend Library
 *
 * Provides margin validation and error formatting for Pado Balance trades.
 * Mirrors the on-chain risk_engine.move logic for immediate UI feedback.
 *
 * v0 Implementation:
 * - Simple balance check with 10% buffer
 * - No position tracking, liquidation, or oracle integration
 */

// ===== Constants =====

/** Buffer requirement: 110% (need 110 to trade 100) */
const BUFFER_PERCENTAGE = 110n;

/** NUSDC decimals */
const NUSDC_DECIMALS = 6;

// ===== Core Functions =====

/**
 * Simple balance check without buffer
 * Returns true if marginBalance >= tradeValue
 */
export function canAfford(
  marginBalance: bigint,
  tradeValue: bigint
): boolean {
  return marginBalance >= tradeValue;
}

/**
 * Validate trade with 10% buffer requirement
 * Returns true if marginBalance >= tradeValue * 1.10
 *
 * Example: For a 100 NUSDC trade, account needs at least 110 NUSDC
 */
export function validateTrade(
  marginBalance: bigint,
  tradeValue: bigint
): boolean {
  if (tradeValue === 0n) {
    return true;
  }

  const required = getRequiredMargin(tradeValue);
  return marginBalance >= required;
}

/**
 * Calculate required margin for a trade (with 10% buffer)
 * Returns the minimum balance needed to execute a trade
 */
export function getRequiredMargin(tradeValue: bigint): bigint {
  return (tradeValue * BUFFER_PERCENTAGE) / 100n;
}

/**
 * Calculate margin shortfall (how much more is needed)
 * Returns 0 if no shortfall
 */
export function getMarginShortfall(
  marginBalance: bigint,
  tradeValue: bigint
): bigint {
  const required = getRequiredMargin(tradeValue);
  if (marginBalance >= required) {
    return 0n;
  }
  return required - marginBalance;
}

// ===== Formatting Functions =====

/**
 * Format margin error message for UI display
 */
export function formatMarginError(
  marginBalance: bigint,
  tradeValue: bigint
): string {
  const required = getRequiredMargin(tradeValue);
  const shortfall = required - marginBalance;
  const shortfallNusdc = Number(shortfall) / Math.pow(10, NUSDC_DECIMALS);

  return `Insufficient margin. Need ${shortfallNusdc.toFixed(2)} more NUSDC`;
}

/**
 * Format required margin amount for UI display
 */
export function formatRequiredMargin(tradeValue: bigint): string {
  const required = getRequiredMargin(tradeValue);
  const requiredNusdc = Number(required) / Math.pow(10, NUSDC_DECIMALS);

  return requiredNusdc.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ===== Conversion Helpers =====

/**
 * Convert NUSDC amount (number) to raw bigint (6 decimals)
 */
export function toRawNusdc(amount: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, NUSDC_DECIMALS)));
}

/**
 * Convert raw bigint to NUSDC amount (number)
 */
export function fromRawNusdc(raw: bigint): number {
  return Number(raw) / Math.pow(10, NUSDC_DECIMALS);
}

// ===== Error Code Mapping =====

/**
 * Risk Engine error codes (matches risk_engine.move)
 */
export const RISK_ENGINE_ERRORS = {
  INSUFFICIENT_MARGIN: 100,
  ZERO_TRADE_VALUE: 101,
} as const;

/**
 * Check if error message is a margin-related error
 */
export function isMarginError(errorMessage: string): boolean {
  return (
    errorMessage.includes('EInsufficientMargin') ||
    errorMessage.includes('error code: 100') ||
    errorMessage.includes('Insufficient margin')
  );
}
