/**
 * Pure function for mapping trader_points DB rows to leaderboard API response shape.
 *
 * Kept free of DB/store dependencies so the logic can be lifted to a shared
 * package (packages/leaderboard-core) when apps beyond pado need it.
 *
 * Table trader_points is historical name; values are DEX trading scores.
 */
import type { TraderPointsRow } from './leaderboard-types.js';

export interface MapRowExtras {
  nicknames: Map<string, string>;
  followerCounts: Map<string, number>;
  genesisPassSet: Set<string>;
}

export interface TraderListItem {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass: boolean;
  tradeCount: number;
  volumeUsd: string;
  rankChange: number;
  followerCount: number;
}

/**
 * Map a trader_points row to a list-item shape used by both /points and /score endpoints.
 * Callers add the score/points field (`totalScore` or `totalPoints`) themselves.
 */
export function mapRowToListItem(
  row: TraderPointsRow,
  extras: MapRowExtras,
  formatVolume: (raw: string) => string,
): TraderListItem {
  return {
    rank: row.rank,
    address: row.address,
    nickname: extras.nicknames.get(row.address) ?? null,
    hasGenesisPass: extras.genesisPassSet.has(row.address),
    tradeCount: row.trade_count,
    volumeUsd: formatVolume(row.volume_quote),
    rankChange: row.prev_rank > 0 ? row.prev_rank - row.rank : 0,
    followerCount: extras.followerCounts.get(row.address) ?? 0,
  };
}
