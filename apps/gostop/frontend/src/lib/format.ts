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

/**
 * Format SOE (9 decimals — the smallest NASUN unit, same as Sui's MIST) as
 * a NASUN amount. Used for gas figures like storage rebates that come back
 * from tx effects in their raw smallest-unit form.
 */
const SOE_PER_NASUN = 1_000_000_000n
export function formatSoeAsNasun(soe: bigint, fractionDigits = 6): string {
  const negative = soe < 0n
  const abs = negative ? -soe : soe
  const whole = abs / SOE_PER_NASUN
  const frac = Number(abs % SOE_PER_NASUN) / Number(SOE_PER_NASUN)
  const value = Number(whole) + frac
  return `${negative ? '-' : ''}${value.toFixed(fractionDigits)}`
}
