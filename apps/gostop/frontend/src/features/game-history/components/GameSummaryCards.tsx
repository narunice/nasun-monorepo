/**
 * GameSummaryCards — Spent / Payouts / Net P&L + win rate row.
 * Hidden when totalGames = 0 to avoid a zeroed empty state.
 */

import { formatNusdc } from '../../../lib/format'
import type { GameSummary } from '../types'

interface Props {
  summary: GameSummary
  isLoading: boolean
}

function SkeletonCard() {
  return (
    <div className="panel p-4 animate-pulse">
      <div className="h-3 w-20 bg-ink-700 rounded mb-3" />
      <div className="h-6 w-24 bg-ink-700 rounded" />
    </div>
  )
}

export function GameSummaryCards({ summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (summary.totalGames === 0) return null

  const netPnlColor =
    summary.netPnl > 0n
      ? 'text-emerald-400'
      : summary.netPnl < 0n
        ? 'text-crimson-500'
        : 'text-gold-100'
  const netPnlPrefix = summary.netPnl > 0n ? '+' : ''

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card label="Total Spent" value={formatNusdc(summary.totalSpent)} valueClass="text-gold-100" />
        <Card label="Total Payouts" value={formatNusdc(summary.totalPayouts)} valueClass="text-gold-100" />
        <Card
          label="Net P&L"
          value={`${netPnlPrefix}${formatNusdc(summary.netPnl)}`}
          valueClass={netPnlColor}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-200 px-1">
        <span>
          {summary.totalGames} {summary.totalGames === 1 ? 'game' : 'games'}
          {summary.pendingCount > 0 && (
            <span className="text-amber-300"> ({summary.pendingCount} settling)</span>
          )}
        </span>
        <span>
          {summary.winCount} {summary.winCount === 1 ? 'win' : 'wins'}{' '}
          <span className="text-gold-200">({summary.winRate}%)</span>
        </span>
        {summary.isTruncated && (
          <span className="text-amber-300">
            Showing recent history only — older games may be missing
          </span>
        )}
      </div>
    </section>
  )
}

function Card({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass: string
}) {
  return (
    <div className="panel p-4">
      <p className="text-sm uppercase tracking-[0.2em] text-neutral-200 mb-2">{label}</p>
      <p className={`font-mono text-lg ${valueClass}`}>
        {value} <span className="text-sm text-neutral-200">NUSDC</span>
      </p>
    </div>
  )
}
