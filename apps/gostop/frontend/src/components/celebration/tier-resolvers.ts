/**
 * Per-game tier resolvers. Pure functions — no React. Each game page calls
 * the matching resolver, then dispatches `celebrate(...)` if tier !== null.
 *
 * Thresholds aligned with on-chain prize tables (scratch [1,2,5,10,20,50,100],
 * lottery PrizeTier enum, etc). May need empirical retuning for mines/crash
 * after a week of devnet data — TODO tracked in plan.
 */

import type { CelebrationTier } from './types'

/** Scratch — multiplier-based. Loss covers 0× and 1× (Even). */
export function tierForScratch(maxMultiplier: number): CelebrationTier | null {
  if (maxMultiplier >= 50) return 'jackpot'
  if (maxMultiplier >= 10) return 'big'
  if (maxMultiplier >= 2) return 'normal'
  return null
}

/** Number Match — payout/cost is bounded ≤6×, so jackpot via multiplier
 *  is unreachable. Map by pick count + win flag instead. */
export function tierForNumberMatch(isWin: boolean, picks: number): CelebrationTier | null {
  if (!isWin) return null
  if (picks >= 3) return 'big'
  return 'normal'
}

/** Lottery — uses on-chain PrizeTier enum directly. */
export function tierForLottery(prizeTier: 1 | 2 | 3): CelebrationTier {
  if (prizeTier === 1) return 'jackpot'
  if (prizeTier === 2) return 'big'
  return 'normal'
}

/** Mines — empirical thresholds; expect retune. */
export function tierForMines(cashedMultiplier: number): CelebrationTier | null {
  if (cashedMultiplier >= 25) return 'jackpot'
  if (cashedMultiplier >= 10) return 'big'
  if (cashedMultiplier >= 1) return 'normal'
  return null
}

/** Crash — heavy tail; lower jackpot threshold than mines. */
export function tierForCrash(cashedMultiplier: number, didCashout: boolean): CelebrationTier | null {
  if (!didCashout) return null
  if (cashedMultiplier >= 50) return 'jackpot'
  if (cashedMultiplier >= 10) return 'big'
  if (cashedMultiplier >= 1) return 'normal'
  return null
}
