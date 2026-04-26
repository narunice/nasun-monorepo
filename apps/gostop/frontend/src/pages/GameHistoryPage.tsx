import { useState } from 'react'
import { useActiveAddress } from '../hooks/useActiveAddress'
import {
  useGameHistory,
  GameSummaryCards,
  GameActivityList,
  type GameType,
} from '../features/game-history'
import { ENABLE_CRASH } from '../lib/gostop-config'

const FILTER_OPTIONS: { value: GameType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scratch', label: 'Scratch' },
  { value: 'numbermatch', label: 'Match' },
  { value: 'lottery', label: 'Lottery' },
  { value: 'mines', label: 'Mines' },
  // Crash chip is shown whenever the build flag is on so users with prod
  // history can filter to it. v2.3 dropped the per-environment chip-gate.
  ...(ENABLE_CRASH ? [{ value: 'crash' as const, label: 'Crash' }] : []),
]

export default function GameHistoryPage() {
  const address = useActiveAddress()
  const [filter, setFilter] = useState<GameType | 'all'>('all')
  const { activities, summary, hasCrashActivity, isLoading, error, refetch } =
    useGameHistory(filter)

  if (!address) {
    return (
      <div className="space-y-6 pb-8">
        <header className="panel p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)]">
          <h1 className="font-display text-3xl md:text-4xl text-gold">Game History</h1>
          <p className="text-base text-neutral-200 mt-3 max-w-2xl">
            All your scratch, match, lottery, mines, and crash plays in one place.
          </p>
        </header>
        <div className="panel p-10 text-center">
          <p className="text-base text-neutral-300">
            Connect your wallet to view your game history.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-gold">Game History</h1>
          <p className="text-sm text-neutral-300 mt-1">
            Recent activity across all gostop games.
          </p>
        </div>
        <button
          type="button"
          onClick={refetch}
          disabled={isLoading}
          className="btn-ghost !py-2 !px-4 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200"
          aria-label="Refresh game history"
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <GameSummaryCards summary={summary} isLoading={isLoading} />

      <div role="group" aria-label="Filter by game" className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              aria-pressed={active}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 ${
                active
                  ? 'bg-gold-400/15 text-gold-200 border-gold-200/60 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.3)]'
                  : 'border-gold-subtle text-neutral-300 hover:text-gold-200 hover:border-gold-200/40'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <GameActivityList
        activities={activities}
        isLoading={isLoading}
        error={error}
        showCrashFootnote={hasCrashActivity}
      />
    </div>
  )
}
