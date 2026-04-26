/**
 * useGameHistory — single sender-event fetch + filter + summary computation.
 *
 * staleTime 5min keeps RPC traffic low; tx-success sites in each game page
 * call useInvalidateGameHistory() to break stale-cache so newly played
 * games appear without forcing the user to refresh.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useActiveAddress } from '../../../hooks/useActiveAddress'
import { fetchAllGameHistory } from '../lib/game-client'
import type { GameType, GameActivity, GameSummary } from '../types'

const EMPTY_SUMMARY: GameSummary = {
  totalSpent: 0n,
  totalPayouts: 0n,
  netPnl: 0n,
  totalGames: 0,
  pendingCount: 0,
  winCount: 0,
  winRate: 0,
  isTruncated: false,
}

export interface UseGameHistoryResult {
  activities: GameActivity[]
  summary: GameSummary
  /** Filter-independent — used to surface the crash limitation footnote. */
  hasCrashActivity: boolean
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useGameHistory(filter: GameType | 'all' = 'all'): UseGameHistoryResult {
  const address = useActiveAddress()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['game-history', address],
    queryFn: () => fetchAllGameHistory(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const all = useMemo(() => data?.activities ?? [], [data])

  const filtered = useMemo(
    () => (filter === 'all' ? all : all.filter((a) => a.gameType === filter)),
    [all, filter],
  )

  const hasCrashActivity = useMemo(
    () => all.some((a) => a.gameType === 'crash'),
    [all],
  )

  const summary = useMemo<GameSummary>(() => {
    if (all.length === 0) return EMPTY_SUMMARY

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
    }
  }, [all, data])

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
