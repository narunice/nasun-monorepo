/**
 * Shared formatting helpers. Single source of truth replacing per-page
 * `formatNusdc` duplicates.
 */

/** Format NUSDC amount (6 decimals) for display. Trims trailing zeros. */
export function formatNusdc(amount: bigint): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const whole = abs / 1_000_000n
  const frac = abs % 1_000_000n
  const fracStr = frac === 0n ? '' : `.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`
  return `${negative ? '-' : ''}${whole}${fracStr}`
}

/** Two-decimal format (always shows .00). */
export function formatNusdcFixed(amount: bigint): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const whole = abs / 1_000_000n
  const fracMicros = Number(abs % 1_000_000n)
  const value = Number(whole) + fracMicros / 1_000_000
  return `${negative ? '-' : ''}${value.toFixed(2)}`
}
