/**
 * GameActivityList — desktop table / mobile card unified timeline.
 *
 * Result indicators pair color with a glyph (✓ ✗ ⏱) for colorblind a11y.
 * Crash limitation footnote renders only when the user has any crash
 * activity at all (filter-independent — the parent passes `showCrashFootnote`).
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatNusdc } from '../../../lib/format'
import { getExplorerTxUrl } from '../../../lib/explorer'
import { useActiveAddress } from '../../../hooks/useActiveAddress'
import type { GameActivity, GameType } from '../types'

const ITEMS_PER_PAGE = 10

const GAME_BADGE: Record<GameType, { label: string; className: string }> = {
  scratch: {
    label: 'Scratch',
    className: 'bg-amber-900/40 text-amber-200 border border-amber-700/50',
  },
  numbermatch: {
    label: 'Match',
    className: 'bg-emerald-900/40 text-emerald-200 border border-emerald-700/50',
  },
  lottery: {
    label: 'Lottery',
    className: 'bg-purple-900/40 text-purple-200 border border-purple-700/50',
  },
  mines: {
    label: 'Mines',
    className: 'bg-red-900/40 text-red-200 border border-red-700/50',
  },
  crash: {
    label: 'Crash',
    className: 'bg-orange-900/40 text-orange-200 border border-orange-700/50',
  },
}

function ResultBadge({
  result,
  payout,
}: {
  result: GameActivity['result']
  payout: bigint
}) {
  if (result === 'win') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-sm">
        <CheckIcon /> +{formatNusdc(payout)}
      </span>
    )
  }
  if (result === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-300 text-sm font-medium px-2 py-0.5 rounded bg-amber-900/30 border border-amber-700/40">
        <ClockIcon /> Settling
      </span>
    )
  }
  // loss — show refund amount if any (numbermatch refunds are non-zero on loss)
  if (payout > 0n) {
    return (
      <span className="inline-flex items-center gap-1 text-neutral-300 text-sm">
        <CrossIcon /> +{formatNusdc(payout)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-neutral-300 text-sm">
      <CrossIcon /> —
    </span>
  )
}

function formatTime(timestampMs: number): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '—'
  return new Date(timestampMs).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ExplorerLink({ txDigest, viewer }: { txDigest: string; viewer?: string | null }) {
  return (
    <a
      href={getExplorerTxUrl(txDigest, viewer)}
      target="_blank"
      rel="noopener noreferrer"
      // p-2 -m-2 enlarges the touch target to ≥44px without changing layout.
      className="inline-flex items-center justify-center p-2 -m-2 text-neutral-300 hover:text-gold-200 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200"
      title="View on Explorer"
      aria-label="Open transaction on explorer"
    >
      <ExternalLinkIcon />
    </a>
  )
}


function ActivityCard({ activity, viewer }: { activity: GameActivity; viewer?: string | null }) {
  const badge = GAME_BADGE[activity.gameType]
  return (
    <div className="p-4">
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded text-sm font-medium ${badge.className}`}>
            {badge.label}
          </span>
          <span className="text-sm text-neutral-200">{activity.detail}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-neutral-200">{formatTime(activity.timestampMs)}</span>
          <ExplorerLink txDigest={activity.txDigest} viewer={viewer} />
        </div>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-neutral-300 font-mono">
          −{formatNusdc(activity.spent)} NUSDC
        </span>
        <ResultBadge result={activity.result} payout={activity.payout} />
      </div>
    </div>
  )
}

function ActivityRow({ activity, viewer }: { activity: GameActivity; viewer?: string | null }) {
  const badge = GAME_BADGE[activity.gameType]
  return (
    <tr className="border-t border-gold-subtle/30 hover:bg-ink-800/50 transition-colors">
      <td className="py-3 px-3 text-sm text-neutral-200 whitespace-nowrap">
        {formatTime(activity.timestampMs)}
      </td>
      <td className="py-3 px-3">
        <span className={`px-2 py-0.5 rounded text-sm font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </td>
      <td className="py-3 px-3 text-sm text-neutral-200">{activity.detail}</td>
      <td className="py-3 px-3 text-sm text-right text-neutral-300 font-mono">
        {formatNusdc(activity.spent)}
      </td>
      <td className="py-3 px-3 text-right">
        <ResultBadge result={activity.result} payout={activity.payout} />
      </td>
      <td className="py-3 px-3 text-center w-10">
        <ExplorerLink txDigest={activity.txDigest} viewer={viewer} />
      </td>
    </tr>
  )
}

function SkeletonRows() {
  return (
    <div className="panel divide-y divide-gold-subtle/30">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="p-4 animate-pulse flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-5 w-14 bg-ink-700 rounded" />
            <div className="h-4 w-32 bg-ink-700 rounded" />
          </div>
          <div className="h-4 w-16 bg-ink-700 rounded" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="panel p-10 text-center">
      <p className="text-base text-neutral-300 mb-5">No game activity yet.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/scratch" className="btn-ghost !py-2 !px-4 text-sm">
          Try Scratch
        </Link>
        <Link to="/numbermatch" className="btn-ghost !py-2 !px-4 text-sm">
          Try Number Match
        </Link>
        <Link to="/lottery" className="btn-ghost !py-2 !px-4 text-sm">
          Try Lottery
        </Link>
        <Link to="/mines" className="btn-ghost !py-2 !px-4 text-sm">
          Try Mines
        </Link>
      </div>
    </div>
  )
}

interface Props {
  activities: GameActivity[]
  isLoading: boolean
  error: string | null
  /** True iff *any* activity (filter-independent) is a crash row. */
  showCrashFootnote: boolean
}

export function GameActivityList({ activities, isLoading, error, showCrashFootnote }: Props) {
  const viewer = useActiveAddress()
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE)
  // Reset pagination when the parent swaps the activity list (filter change).
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE)
  }, [activities])
  const visible = useMemo(
    () => activities.slice(0, displayCount),
    [activities, displayCount],
  )
  const hasMore = displayCount < activities.length

  if (isLoading) return <SkeletonRows />

  if (error) {
    return (
      <div className="panel p-6 text-center border-red-500/40 bg-red-950/30">
        <p className="text-sm text-red-300">Failed to load history: {error}</p>
      </div>
    )
  }

  if (activities.length === 0) return <EmptyState />

  return (
    <div>
      {/* Mobile cards */}
      <ul
        role="list"
        aria-label="Game activity"
        className="md:hidden panel divide-y divide-gold-subtle/30 list-none"
      >
        {visible.map((a) => (
          <li key={a.id}>
            <ActivityCard activity={a} viewer={viewer} />
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden md:block panel overflow-hidden">
        <table className="w-full" aria-label="Game activity">
          <thead>
            <tr className="bg-ink-800/80 text-sm uppercase tracking-widest text-neutral-200">
              <th className="py-2 px-3 text-left font-medium">Time</th>
              <th className="py-2 px-3 text-left font-medium">Game</th>
              <th className="py-2 px-3 text-left font-medium">Detail</th>
              <th className="py-2 px-3 text-right font-medium">Spent</th>
              <th className="py-2 px-3 text-right font-medium">Payout</th>
              <th className="py-2 px-3 text-center font-medium w-10">Tx</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <ActivityRow key={a.id} activity={a} viewer={viewer} />
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setDisplayCount((c) => c + ITEMS_PER_PAGE)}
            className="btn-ghost !py-2 !px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200"
            aria-label={`Show next ${ITEMS_PER_PAGE} games, ${activities.length - displayCount} remaining`}
          >
            Load More ({activities.length - displayCount} remaining)
          </button>
        </div>
      )}

      {showCrashFootnote && (
        <p className="text-sm text-neutral-200 italic mt-4 px-1">
          Crash rows reflect on-chain settlement from the keeper&apos;s resolve
          transaction. The Tx link opens the resolve transaction where the USDC
          payout was transferred (use the &ldquo;you&rdquo; highlight in the
          explorer to see your balance change).
        </p>
      )}
    </div>
  )
}

// === Inline icons ===

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden>
      <path d="M3 8.5l3 3 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="8" cy="8" r="6" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path
        d="M9 3h4v4M13 3l-6 6M11 9v3.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5H7"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
