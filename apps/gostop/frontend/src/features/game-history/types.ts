/**
 * Game History types.
 */

export type GameType = 'scratch' | 'numbermatch' | 'lottery' | 'mines' | 'crash' | 'wheel'

export type HistoryWindow = '7d' | '2w' | '4w' | '3m'

const DAY_MS = 24 * 60 * 60 * 1000

export const HISTORY_WINDOW_MS: Record<HistoryWindow, number> = {
  '7d': 7 * DAY_MS,
  '2w': 14 * DAY_MS,
  '4w': 28 * DAY_MS,
  '3m': 90 * DAY_MS,
}

export const HISTORY_WINDOW_LABEL: Record<HistoryWindow, string> = {
  '7d': '7 days',
  '2w': '2 weeks',
  '4w': '4 weeks',
  '3m': '3 months',
}

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
  /** True only when the safety-cap on sender-event pagination was hit before
   *  reaching the requested window's cutoff. Normal in-window completion
   *  leaves this false. */
  isTruncated: boolean
  /** The window that produced this summary, surfaced for UI labels. */
  window: HistoryWindow
  /** True when the crash history backend was unreachable. */
  crashBackendError?: boolean
}
