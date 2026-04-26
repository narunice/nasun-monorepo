/**
 * Game History types.
 *
 * `source` field tracks how the result was determined so a future indexer
 * (LT-3) can retroactively correct optimistic crash rows without touching
 * the rest of the data model.
 */

export type GameType = 'scratch' | 'numbermatch' | 'lottery' | 'mines' | 'crash'

export type ActivityResult = 'win' | 'loss' | 'pending'

/** Result provenance — used by the indexer in LT-3 to reconcile optimistic rows. */
export type ActivitySource =
  /** Final outcome derivable from a single contract event (scratch/nm/mines). */
  | 'final'
  /** Lottery — derived from round.drawnNumbers + getTicketTier(matchCount). */
  | 'lottery-derived'
  /** Crash — bet placed, no cashout yet, finalize window not elapsed. */
  | 'optimistic-pending'
  /** Crash — cashout recorded; payout assumed valid until indexer confirms. */
  | 'optimistic-cashout'
  /** Crash — finalize window elapsed without cashout; presumed loss. */
  | 'optimistic-no-cashout'

export interface GameActivity {
  /** Stable per-event key: `${gameType}-${txDigest}-${eventSeq}`. */
  id: string
  gameType: GameType
  timestampMs: number
  spent: bigint
  payout: bigint
  result: ActivityResult
  detail: string
  /** For win rows that pair across two events (crash), points at the cashout tx. */
  txDigest: string
  source: ActivitySource
}

export interface GameSummary {
  /** All rows (pending included) — actual capital deployed. */
  totalSpent: bigint
  /** Resolved rows only. */
  totalPayouts: bigint
  /** totalPayouts - (resolved-row spent). Pending bets excluded from both sides
   *  for apples-to-apples accounting. */
  netPnl: bigint
  /** Total row count (pending included). */
  totalGames: number
  /** Pending row count, surfaced as "(N settling)" in the summary. */
  pendingCount: number
  winCount: number
  /** 0–100. Denominator excludes pending. */
  winRate: number
  /** True when sender-event pagination cap was hit. */
  isTruncated: boolean
}
