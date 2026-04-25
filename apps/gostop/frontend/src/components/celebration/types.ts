/**
 * Shared celebration types.
 */

export type CelebrationTier = 'normal' | 'big' | 'jackpot'

export type CelebrationVariant = 'tiered' | 'slam'

export type GameLabel =
  | 'Scratch'
  | 'Number Match'
  | 'Lottery'
  | 'Mines'
  | 'Crash'

export interface CelebrationConfig {
  /** Internal id so React can replay the same tier+payout (unique per fire). */
  key: string
  variant: CelebrationVariant
  tier: CelebrationTier
  /** Total prize amount (NUSDC base units, 6 decimals). */
  payout: bigint
  /** Optional multiplier for tiered display (e.g. "10x"). */
  multiplier?: number
  /** Game label for sharing & a11y announcement. */
  gameLabel: GameLabel
  /** Optional override for the displayed tier label. */
  tierLabelOverride?: string
}
