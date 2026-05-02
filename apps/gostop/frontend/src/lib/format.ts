import { NUSDC_UNIT } from './constants/assets'

/**
 * Shared formatting helpers. Single source of truth replacing per-page
 * `formatNusdc` duplicates.
 */

/** Format NUSDC amount (6 decimals) for display. Trims trailing zeros. */
export function formatNusdc(amount: bigint): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const whole = abs / NUSDC_UNIT
  const frac = abs % NUSDC_UNIT
  const fracStr = frac === 0n ? '' : `.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`
  return `${negative ? '-' : ''}${whole}${fracStr}`
}

/** Two-decimal format (always shows .00). */
export function formatNusdcFixed(amount: bigint): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const whole = abs / NUSDC_UNIT
  const fracMicros = Number(abs % NUSDC_UNIT)
  const value = Number(whole) + fracMicros / Number(NUSDC_UNIT)
  return `${negative ? '-' : ''}${value.toFixed(2)}`
}
