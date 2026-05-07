import {
  MINES_GRID_SIZE,
  MINES_HOUSE_EDGE_BPS,
} from '../../lib/gostop-config'

export const MINES_SESSION_STATUS = {
  ACTIVE: 0,
  CASHED_OUT: 1,
  EXPLODED: 2,
} as const

export type MinesSessionStatus = (typeof MINES_SESSION_STATUS)[keyof typeof MINES_SESSION_STATUS]

export const MINES_ERRORS: Record<number, string> = {
  0: 'Invalid mine count (1-24).',
  1: 'Session is no longer active.',
  2: 'Cell already revealed.',
  3: 'Cell index out of range.',
  4: 'Not the session owner.',
  5: 'Bet amount must be greater than zero.',
  6: 'Must reveal at least one safe cell before cashing out.',
  7: 'Bet too large for this mine count. Reduce bet or mine count.',
  8: 'You already have an active session.',
  9: 'Game cap already installed.',
  10: 'Game cap does not match this module.',
}

/**
 * Client-side mirror of `compute_multiplier_bps` in mines.move.
 * Uses JS number; integer truncation matches contract within ±few bps.
 */
export function computeMultiplierBps(
  mineCount: number,
  safeReveals: number,
): number {
  const n = MINES_GRID_SIZE
  const m = mineCount
  const k = safeReveals
  let result = 10_000
  for (let i = 0; i < k; i++) {
    const safe = n - m - i
    const total = n - i
    result = Math.floor((result * total) / safe)
  }
  const afterEdge = Math.floor((result * (10_000 - MINES_HOUSE_EDGE_BPS)) / 10_000)
  return Math.max(10_000, afterEdge)
}

/** Maximum theoretical multiplier bps for `mine_count` (reveal all safe cells). */
export function maxMultiplierBps(mineCount: number): number {
  return computeMultiplierBps(mineCount, MINES_GRID_SIZE - mineCount)
}

export function humanizeMinesError(raw: string): string {
  if (/Balance of gas object.*lower than the needed amount|GasBalanceTooLow/i.test(raw)) {
    return 'Not enough NASUN for gas. Please top up your wallet and try again.'
  }
  if (raw.includes('MoveAbort')) {
    for (const code of Object.keys(MINES_ERRORS)) {
      if (raw.includes(`, ${code})`)) return MINES_ERRORS[Number(code)]
    }
  }
  return raw
}
