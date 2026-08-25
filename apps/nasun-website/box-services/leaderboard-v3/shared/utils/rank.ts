import type { RankChange } from '../types';

/**
 * Calculate rank change between current and previous rank.
 */
export function calculateRankChange(currentRank: number, previousRank?: number): RankChange {
  if (previousRank === undefined) {
    return { direction: 'new', amount: 0 };
  }

  const change = previousRank - currentRank;
  if (change > 0) {
    return { direction: 'up', amount: change };
  }
  if (change < 0) {
    return { direction: 'down', amount: Math.abs(change) };
  }
  return { direction: 'same', amount: 0 };
}
