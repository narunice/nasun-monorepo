/**
 * Game History Type Definitions
 */

export type GameType = 'lottery' | 'scratch' | 'numbermatch';
export type ActivityResult = 'win' | 'loss' | 'pending';

export interface GameActivity {
  id: string;
  gameType: GameType;
  gameId: number;
  timestampMs: number;
  /** NUSDC (6 decimals) spent on this game */
  spent: bigint;
  /** NUSDC (6 decimals) received back (including consolation refunds). 0n for pending/loss without refund. */
  payout: bigint;
  result: ActivityResult;
  /** Human-readable summary, e.g. "2x", "Picks: [1,3] -> 3", "R5 #7 (Jackpot)" */
  detail: string;
  /** Transaction digest for explorer link */
  txDigest: string;
}

export interface GameSummary {
  totalSpent: bigint;
  totalPayouts: bigint;
  /** totalPayouts - totalSpent */
  netPnl: bigint;
  totalGames: number;
  winCount: number;
  /** 0-100 percentage, pending excluded from calculation */
  winRate: number;
  /** True if any game's event cursor was exhausted before all data loaded */
  isTruncated: boolean;
}
