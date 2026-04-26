import { useEffect, useRef, useState } from 'react'
import { useScratchCard, type ScratchResult } from '../features/scratchcard/useScratchCard'
import { useToast } from '../components/ui/Toast'
import {
  useCelebrate,
  tierForScratch,
  useForceTierDebug,
} from '../components/celebration'
import { useInvalidateGameHistory } from '../features/game-history'

const CARD_PRICE_NUSDC = 5
const BUY_OPTIONS = [1, 3, 5, 10]

// Display-side prize table (mirrors scratchcard.move thresholds).
const PRIZE_TABLE = [
  { mult: 100, probBps: 5,    share: '0.05%' },
  { mult: 50,  probBps: 15,   share: '0.15%' },
  { mult: 20,  probBps: 80,   share: '0.80%' },
  { mult: 10,  probBps: 150,  share: '1.50%' },
  { mult: 5,   probBps: 300,  share: '3.00%' },
  { mult: 2,   probBps: 400,  share: '4.00%' },
  { mult: 1,   probBps: 1550, share: '15.50%' },
]

function formatNusdc(mist: bigint): string {
  const whole = mist / 1_000_000n
  const frac = Number(mist % 1_000_000n) / 1_000_000
  return (Number(whole) + frac).toFixed(2)
}

export default function ScratchCardPage() {
  const { isWalletConnected, buy, isBuying, error, clearError } = useScratchCard()
  const { showToast } = useToast()
  const celebrate = useCelebrate()
  const invalidateHistory = useInvalidateGameHistory()
  useForceTierDebug('Scratch')
  const [results, setResults] = useState<ScratchResult[]>([])
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  // Lock so we celebrate exactly once per batch, regardless of how the
  // user reveals (one-by-one or "Reveal all"). Reset on a new purchase.
  const celebratedBatchRef = useRef<string | null>(null)

  async function onBuy(count: number) {
    setResults([])
    setRevealed(new Set())
    celebratedBatchRef.current = null
    const out = await buy(count)
    if (!out) return
    setResults(out)
    showToast(
      `${out.length} card${out.length === 1 ? '' : 's'} purchased — tap to reveal`,
      'info',
    )
    // Break the 5-min staleTime so /games/history reflects the new cards on
    // next visit without forcing the user to refresh.
    invalidateHistory()
  }

  // Trigger the celebration / result toast only once all cards are revealed.
  // This keeps the surprise intact: showing the win before the user has
  // scratched the card spoils the moment.
  useEffect(() => {
    if (results.length === 0) return
    if (revealed.size !== results.length) return

    const batchKey = results.map((r) => `${r.cardId}:${r.bulkIndex}`).join(',')
    if (celebratedBatchRef.current === batchKey) return
    celebratedBatchRef.current = batchKey

    const totalPrize = results.reduce((s, r) => s + r.prizeAmount, 0n)
    const wins = results.filter((r) => r.multiplier > 0).length

    if (totalPrize > 0n) {
      showToast(
        `${wins}/${results.length} won · +${formatNusdc(totalPrize)} NUSDC`,
        'success',
      )
      const maxMultiplier = results.reduce((m, r) => Math.max(m, r.multiplier), 0)
      const tier = tierForScratch(maxMultiplier)
      if (tier) {
        celebrate({
          variant: 'tiered',
          tier,
          payout: totalPrize,
          multiplier: maxMultiplier,
          gameLabel: 'Scratch',
        })
      }
    } else if (results.length === 1) {
      showToast('No luck this time. Try again!', 'info')
    }
  }, [revealed, results, celebrate, showToast])

  function revealAll() {
    setRevealed(new Set(results.map((_, i) => i)))
  }

  function revealOne(index: number) {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.add(index)
      return next
    })
  }

  const totalWinnings = results
    .filter((_, i) => revealed.has(i))
    .reduce((s, r) => s + r.prizeAmount, 0n)
  const hasResults = results.length > 0
  const allRevealed = hasResults && revealed.size === results.length

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
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl text-gold">Buy Cards</h2>
            <p className="text-sm text-neutral-200 mt-1">
              Each card: {CARD_PRICE_NUSDC.toFixed(2)} NUSDC. RTP 82%.
            </p>
          </div>
          <p className="text-sm text-neutral-200">Max win 100× = 500 NUSDC</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {BUY_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => onBuy(n)}
              disabled={!isWalletConnected || isBuying}
              className="btn-ghost !py-3 !px-5 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
              title={
                !isWalletConnected
                  ? 'Connect a wallet'
                  : isBuying
                    ? 'Submitting transaction'
                    : `Buy ${n} card${n === 1 ? '' : 's'}`
              }
            >
              <span className="font-semibold">Buy {n}</span>
              <span className="ml-2 font-mono text-gold-200">
                {(n * CARD_PRICE_NUSDC).toFixed(2)} NUSDC
              </span>
            </button>
          ))}
        </div>
      </section>

      {hasResults && (
        <section className="panel p-7">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h2 className="font-display text-2xl text-gold">Results</h2>
              <p className="text-sm text-neutral-200 mt-1">
                {revealed.size} / {results.length} revealed ·{' '}
                <span className="font-mono text-gold-200">
                  {formatNusdc(totalWinnings)} NUSDC
                </span>
              </p>
            </div>
            {!allRevealed && (
              <button onClick={revealAll} className="btn-gold !py-2 !px-5 text-sm">
                Reveal all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {results.map((r, i) => (
              <Card
                key={`${r.cardId}-${i}`}
                result={r}
                revealed={revealed.has(i)}
                onReveal={() => revealOne(i)}
              />
            ))}
          </div>
        </section>
      )}

      <PrizeTableSection />
    </div>
  )
}

function Header() {
  return (
    <header className="panel p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)]">
      <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">
        Instant Play
      </p>
      <h1 className="font-display text-4xl md:text-5xl text-gold">Scratch Cards</h1>
      <p className="text-base text-neutral-200 mt-3 max-w-2xl leading-relaxed">
        Buy up to ten cards in one transaction. Each card resolves instantly
        with provably-fair randomness. Multipliers up to 100×. Winning cards
        become NFTs in your wallet.
      </p>
    </header>
  )
}

function Card({
  result,
  revealed,
  onReveal,
}: {
  result: ScratchResult
  revealed: boolean
  onReveal: () => void
}) {
  const isWin = result.multiplier > 0
  if (!revealed) {
    return (
      <button
        onClick={onReveal}
        className="relative aspect-[3/4] rounded-lg border border-gold-subtle bg-gradient-to-br from-ink-800 to-ink-900 flex items-center justify-center hover:border-gold-200/60 transition-all hover:-translate-y-0.5"
      >
        <span className="font-display text-2xl text-gold">?</span>
        <span className="absolute bottom-2 right-2 text-xs text-neutral-200 font-mono">
          Tap to reveal
        </span>
      </button>
    )
  }
  return (
    <div
      className={`aspect-[3/4] rounded-lg border flex flex-col items-center justify-center gap-1 p-3 animate-slide-in ${
        isWin
          ? 'border-gold-200/60 bg-gradient-to-br from-amber-950/80 to-ink-900 shadow-[0_0_20px_-5px_rgba(212,175,55,0.4)]'
          : 'border-neutral-700 bg-ink-900/80'
      }`}
    >
      {isWin ? (
        <>
          <span className="font-display text-3xl text-gold">{result.multiplier}×</span>
          <span className="font-mono text-sm text-gold-200">
            +{formatNusdc(result.prizeAmount)}
          </span>
          <span className="text-xs text-neutral-200 uppercase tracking-wider">Won</span>
        </>
      ) : (
        <>
          <span className="font-display text-2xl text-neutral-400">—</span>
          <span className="text-xs text-neutral-500 uppercase tracking-wider">No win</span>
        </>
      )}
    </div>
  )
}

function PrizeTableSection() {
  return (
    <section className="panel p-7">
      <h2 className="font-display text-2xl text-gold mb-5">Prize Table</h2>
      <div className="overflow-hidden rounded-lg border border-gold-subtle">
        <table className="w-full text-base">
          <thead className="bg-ink-800/80 text-sm uppercase tracking-widest text-neutral-200">
            <tr>
              <th className="text-left px-4 py-3">Multiplier</th>
              <th className="text-left px-4 py-3">Prize (NUSDC)</th>
              <th className="text-right px-4 py-3">Probability</th>
            </tr>
          </thead>
          <tbody>
            {PRIZE_TABLE.map((row) => (
              <tr key={row.mult} className="border-t border-gold-subtle/50">
                <td className="px-4 py-3 font-display text-lg text-gold-200">
                  {row.mult}×
                </td>
                <td className="px-4 py-3 font-mono text-neutral-200">
                  {(row.mult * CARD_PRICE_NUSDC).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gold-200">
                  {row.share}
                </td>
              </tr>
            ))}
            <tr className="border-t border-gold-subtle/50">
              <td className="px-4 py-3 text-neutral-400">No win</td>
              <td className="px-4 py-3 text-neutral-400">—</td>
              <td className="px-4 py-3 text-right font-mono text-neutral-400">75.00%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm text-neutral-200 mt-4 italic">
        RTP 82% · House edge 18%. Winning cards are minted as NFTs (the
        prize is paid immediately; the NFT is a collectible record).
      </p>
    </section>
  )
}
