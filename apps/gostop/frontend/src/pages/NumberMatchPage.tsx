import { useState } from 'react'
import {
  useNumberMatch,
  type NumberMatchResult,
} from '../features/numbermatch/useNumberMatch'
import { useToast } from '../components/ui/Toast'
import {
  useCelebrate,
  tierForNumberMatch,
  useForceTierDebug,
} from '../components/celebration'

const MIN_NUM = 1
const MAX_NUM = 5
const MAX_PICKS = 3
const PRICE_PER_PICK = 5

const PAYOUT_TABLE = [
  { picks: 1, winRate: '20%', win: 16, refund: 1 },
  { picks: 2, winRate: '40%', win: 17, refund: 2 },
  { picks: 3, winRate: '60%', win: 18, refund: 3 },
]

function fmt(mist: bigint): string {
  const whole = mist / 1_000_000n
  const frac = Number(mist % 1_000_000n) / 1_000_000
  return (Number(whole) + frac).toFixed(2)
}

export default function NumberMatchPage() {
  const { isWalletConnected, play, isPlaying, error, clearError } = useNumberMatch()
  const { showToast } = useToast()
  const celebrate = useCelebrate()
  useForceTierDebug('Number Match')
  const [picks, setPicks] = useState<number[]>([])
  const [result, setResult] = useState<NumberMatchResult | null>(null)

  function togglePick(n: number) {
    setResult(null)
    setPicks((prev) =>
      prev.includes(n)
        ? prev.filter((x) => x !== n)
        : prev.length < MAX_PICKS
          ? [...prev, n].sort((a, b) => a - b)
          : prev,
    )
  }

  async function onPlay() {
    if (picks.length === 0) return
    const r = await play(picks)
    if (r) {
      setResult(r)
      if (r.isWin) {
        showToast(
          `Match! Winning number ${r.winningNumber} · +${fmt(r.payout)} NUSDC`,
          'success',
        )
        const tier = tierForNumberMatch(r.isWin, picks.length)
        if (tier) {
          celebrate({
            variant: 'slam',
            tier,
            payout: r.payout,
            gameLabel: 'Number Match',
          })
        }
      } else {
        showToast(
          `No match. Winning number was ${r.winningNumber} · Refund ${fmt(r.payout)} NUSDC`,
          'info',
        )
      }
    }
  }

  const cost = picks.length * PRICE_PER_PICK
  const canPlay = picks.length >= 1 && isWalletConnected && !isPlaying

  return (
    <div className="space-y-8">
      <Header />

      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40 flex items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={clearError} className="btn-ghost !py-1 !px-3 text-sm">
            Dismiss
          </button>
        </div>
      )}

      <section className="panel p-7">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h2 className="font-display text-2xl text-gold">Your Picks</h2>
          <button
            onClick={() => {
              setPicks([])
              setResult(null)
            }}
            disabled={picks.length === 0}
            className="btn-ghost !py-2 !px-4 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
        <div className="grid grid-cols-5 gap-3 justify-items-center">
          {Array.from({ length: MAX_NUM - MIN_NUM + 1 }, (_, i) => i + MIN_NUM).map((n) => {
            const selected = picks.includes(n)
            const isWinning = result?.winningNumber === n
            return (
              <button
                key={n}
                onClick={() => togglePick(n)}
                className={`number-ball !w-14 !h-14 !text-lg ${
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
          Pick 1-{MAX_PICKS} numbers from {MIN_NUM}-{MAX_NUM}. More picks means higher
          win chance but lower multiplier.
        </p>
      </section>

      <section className="panel p-7">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-2xl text-gold">Play</h2>
            <p className="text-sm text-neutral-200 mt-1">
              {PRICE_PER_PICK} NUSDC per pick. 80% RTP across all pick counts.
            </p>
          </div>
          <p className="text-base text-gold-200 font-mono">
            {picks.length} × {PRICE_PER_PICK.toFixed(2)} = {cost.toFixed(2)} NUSDC
          </p>
        </div>
        <button onClick={onPlay} disabled={!canPlay} className="btn-gold w-full sm:w-auto">
          {isPlaying
            ? 'Playing…'
            : !isWalletConnected
              ? 'Connect Wallet'
              : picks.length === 0
                ? 'Pick numbers first'
                : `Play ${picks.length} pick${picks.length === 1 ? '' : 's'}`}
        </button>
      </section>

      {result && <ResultCard result={result} />}

      <PayoutTable />
    </div>
  )
}

function Header() {
  return (
    <header className="panel p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)]">
      <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">
        Instant Play
      </p>
      <h1 className="font-display text-4xl md:text-5xl text-gold">Number Match</h1>
      <p className="text-base text-neutral-200 mt-3 max-w-2xl leading-relaxed">
        Pick 1-3 numbers from 1 to 5. Match the drawn number to win.
        Partial refund on losses keeps every round meaningful.
      </p>
    </header>
  )
}

function ResultCard({ result }: { result: NumberMatchResult }) {
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
            +{fmt(result.payout)} NUSDC
          </span>
          <p className="text-xs text-neutral-200 mt-1">
            Cost {fmt(result.cost)} · Net{' '}
            <span className={result.payout >= result.cost ? 'text-emerald-400' : 'text-red-300'}>
              {result.payout >= result.cost ? '+' : ''}
              {fmt(result.payout - result.cost)}
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}

function PayoutTable() {
  return (
    <section className="panel p-7">
      <h2 className="font-display text-2xl text-gold mb-5">Payouts</h2>
      <div className="overflow-hidden rounded-lg border border-gold-subtle">
        <table className="w-full text-base">
          <thead className="bg-ink-800/80 text-sm uppercase tracking-widest text-neutral-200">
            <tr>
              <th className="text-left px-4 py-3">Picks</th>
              <th className="text-left px-4 py-3">Cost</th>
              <th className="text-left px-4 py-3">Win</th>
              <th className="text-left px-4 py-3">Refund</th>
              <th className="text-right px-4 py-3">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {PAYOUT_TABLE.map((row) => (
              <tr key={row.picks} className="border-t border-gold-subtle/50">
                <td className="px-4 py-3 font-display text-lg text-gold-200">{row.picks}</td>
                <td className="px-4 py-3 font-mono text-neutral-200">
                  {(row.picks * PRICE_PER_PICK).toFixed(2)}
                </td>
                <td className="px-4 py-3 font-mono text-gold-200">{row.win.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono text-neutral-200">{row.refund.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono text-gold-200">{row.winRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-neutral-200 mt-4 italic">
        RTP 80% uniform. Loss refund equals your pick count in NUSDC (20% of cost).
      </p>
    </section>
  )
}
