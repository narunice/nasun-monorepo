import { formatNusdc } from '../../../lib/format'
import type { NumberMatchResult } from '../useNumberMatch'

export function NMResultCard({ result }: { result: NumberMatchResult }) {
  const tone = result.isWin
    ? 'border-gold-200/60 bg-gradient-to-br from-amber-950/60 to-ink-900'
    : 'border-neutral-700 bg-ink-900/80'
  return (
    <section className={`panel p-7 ${tone} animate-slide-in`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wider text-neutral-200">
            Winning number
          </p>
          <span className="font-display text-5xl text-gold">{result.winningNumber}</span>
        </div>
        <div className="text-right">
          <p className="text-sm uppercase tracking-wider text-neutral-200">
            {result.isWin ? 'Payout' : 'Refund'}
          </p>
          <span
            className={`font-mono text-3xl ${
              result.isWin ? 'text-gold-200' : 'text-neutral-300'
            }`}
          >
            +{formatNusdc(result.payout)} NUSDC
          </span>
          <p className="text-xs text-neutral-200 mt-1">
            Cost {formatNusdc(result.cost)} · Net{' '}
            <span className={result.payout >= result.cost ? 'text-emerald-400' : 'text-red-300'}>
              {result.payout >= result.cost ? '+' : ''}
              {formatNusdc(result.payout - result.cost)}
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}
