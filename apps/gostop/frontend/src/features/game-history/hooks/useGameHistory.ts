/**
 * useGameHistory — window-bounded fetch + filter + summary computation.
 *
 * Default window is 7d; the page surfaces a selector for 2w / 4w / 3m for
 * users who want to look further back. RPC paging terminates at the window
 * cutoff, so widening the window is the only operation that costs more
 * calls. tx-success sites call useInvalidateGameHistory() to break stale-
 * cache so newly played games appear without forcing the user to refresh.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useActiveAddress } from '../../../hooks/useActiveAddress'
import { fetchAllGameHistory } from '../lib/game-client'
import type { GameType, GameActivity, GameSummary, HistoryWindow } from '../types'
import { HISTORY_WINDOW_MS } from '../types'

const EMPTY_SUMMARY = (window: HistoryWindow): GameSummary => ({
  totalSpent: 0n,
  totalPayouts: 0n,
  netPnl: 0n,
  totalGames: 0,
  pendingCount: 0,
  winCount: 0,
  winRate: 0,
  isTruncated: false,
  window,
})

export interface UseGameHistoryResult {
  activities: GameActivity[]
  summary: GameSummary
  /** Filter-independent — used to surface the crash limitation footnote. */
  hasCrashActivity: boolean
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useGameHistory(
  filter: GameType | 'all' = 'all',
  window: HistoryWindow = '7d',
): UseGameHistoryResult {
  const address = useActiveAddress()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['game-history', address, window],
    // cutoffMs is computed inside queryFn so cache freshness controls
    // its own time horizon; React Query staleTime suppresses re-fetch
    // within the window.
    queryFn: () => fetchAllGameHistory(address!, Date.now() - HISTORY_WINDOW_MS[window]),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const all = data?.activities ?? []

  const filtered = useMemo(
    () => (filter === 'all' ? all : all.filter((a) => a.gameType === filter)),
    [all, filter],
  )

  const hasCrashActivity = useMemo(
    () => all.some((a) => a.gameType === 'crash'),
    [all],
  )

  const summary = useMemo<GameSummary>(() => {
    if (all.length === 0) return EMPTY_SUMMARY(window)

    const nonPending = all.filter((a) => a.result !== 'pending')
    const pending = all.filter((a) => a.result === 'pending')
    // totalSpent includes pending — user's actual capital outflow.
    const totalSpent = all.reduce((s, a) => s + a.spent, 0n)
    // payouts/netPnl/winRate are apples-to-apples on resolved rows only.
    const totalPayouts = nonPending.reduce((s, a) => s + a.payout, 0n)
    const nonPendingSpent = nonPending.reduce((s, a) => s + a.spent, 0n)
    const winCount = nonPending.filter((a) => a.result === 'win').length
    const totalResolved = nonPending.length

    return {
      totalSpent,
      totalPayouts,
      netPnl: totalPayouts - nonPendingSpent,
      totalGames: all.length,
      pendingCount: pending.length,
      winCount,
      winRate:
        totalResolved > 0 ? Math.round((winCount / totalResolved) * 10000) / 100 : 0,
      isTruncated: data?.isTruncated ?? false,
      crashBackendError: data?.crashBackendError,
      window,
    }
  }, [all, data, window])

  return {
    activities: filtered,
    summary,
    hasCrashActivity,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch: () => {
      void refetch()
    },
  }
}
