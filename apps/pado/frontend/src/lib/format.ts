/**
 * Shared formatting utilities for Pado frontend.
 * Canonical source for NUSDC formatting.
 */

/** Format NUSDC amount (6 decimals) for display with locale formatting and 2 decimal places. */
export function formatNusdc(amount: bigint): string {
  const value = Number(amount) / 1_000_000;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
