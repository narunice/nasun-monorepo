/**
 * Game History types.
 */

export type GameType = 'scratch' | 'numbermatch' | 'lottery' | 'mines' | 'crash'

export type ActivityResult = 'win' | 'loss' | 'pending'

export type ActivitySource =
  /** Final outcome derivable from a single contract event (scratch/nm/mines). */
  | 'final'
  /** Lottery — derived from round.drawnNumbers + getTicketTier(matchCount). */
  | 'lottery-derived'
  /** Crash — authoritative payout from chat-server keeper history backend. */
  | 'backend-resolved'
  /** Crash — local in-flight bet for the active round (resolves to backend on next refetch). */
  | 'active-pending'

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
  /** Crash only: digest of the user's place_bet tx, when known. Other game
   *  types resolve in a single tx so this stays undefined. */
  betTxDigest?: string
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
  /** True when the crash history backend was unreachable. */
  crashBackendError?: boolean
}
