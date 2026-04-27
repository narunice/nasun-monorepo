/**
 * Mapping from celebration tier to preset / colors / sound / display props.
 * Keeps tier→style logic in one place; all win components import from here.
 */

import type { CelebrationPreset } from '../../lib/celebration'
import { CELEBRATION_COLORS } from '../../lib/celebration'
import type { GameSound } from '../../lib/sounds'
import type { CelebrationTier } from './types'

export function tierToPreset(tier: CelebrationTier): CelebrationPreset {
  switch (tier) {
    case 'jackpot':
      return 'large'
    case 'big':
      return 'medium'
    default:
      return 'small'
  }
}

export function tierToSound(tier: CelebrationTier): GameSound {
  switch (tier) {
    case 'jackpot':
      return 'winJackpot'
    case 'big':
      return 'winMedium'
    default:
      return 'winSmall'
  }
}

export function tierToColors(tier: CelebrationTier): readonly string[] {
  switch (tier) {
    case 'jackpot':
      return CELEBRATION_COLORS.royal
    case 'big':
      return CELEBRATION_COLORS.gold
    default:
      return CELEBRATION_COLORS.goldEmerald
  }
}

export function defaultTierLabel(tier: CelebrationTier, multiplier?: number): string {
  if (multiplier && multiplier >= 100) return 'MEGA JACKPOT'
  switch (tier) {
    case 'jackpot':
      return 'JACKPOT'
    case 'big':
      return 'BIG WIN'
    default:
      return 'NICE WIN'
  }
}

export function tierTextColorClass(tier: CelebrationTier): string {
  switch (tier) {
    case 'jackpot':
      return 'text-gold-200'
    case 'big':
      return 'text-gold-300'
    default:
      return 'text-emerald-400'
  }
}
