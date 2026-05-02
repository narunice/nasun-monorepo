import { NM_MIN_NUM, NM_MAX_NUM, NM_MAX_PICKS } from '../constants'
import type { NumberMatchResult } from '../useNumberMatch'

interface NMPickPanelProps {
  picks: number[]
  onToggle: (n: number) => void
  onClear: () => void
  result: NumberMatchResult | null
}

export function NMPickPanel({ picks, onToggle, onClear, result }: NMPickPanelProps) {
  return (
    <section className="panel p-5 sm:p-7">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display text-2xl text-gold">Your Picks</h2>
        <button
          onClick={onClear}
          disabled={picks.length === 0}
          className="btn-ghost !py-2 !px-4 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2 sm:gap-3 justify-items-center">
        {Array.from({ length: NM_MAX_NUM - NM_MIN_NUM + 1 }, (_, i) => i + NM_MIN_NUM).map((n) => {
          const selected = picks.includes(n)
          const isWinning = result?.winningNumber === n
          return (
            <button
              key={n}
              onClick={() => onToggle(n)}
              className={`number-ball !w-12 !h-12 sm:!w-14 sm:!h-14 !text-base sm:!text-lg ${
                selected ? 'is-selected' : ''
              } ${isWinning ? 'ring-2 ring-emerald-400' : ''}`}
              aria-pressed={selected}
            >
              {n}
            </button>
          )
        })}
      </div>
      <p className="text-sm text-neutral-200 mt-4">
        Pick {NM_MIN_NUM}-{NM_MAX_PICKS} numbers from {NM_MIN_NUM}-{NM_MAX_NUM}. More picks means higher
        win chance but lower multiplier.
      </p>
    </section>
  )
}
