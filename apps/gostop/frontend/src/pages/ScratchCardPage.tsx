import { useEffect, useRef, useState } from 'react'
import { useScratchCard, type ScratchResult } from '../features/scratchcard/useScratchCard'
import scratchThumb from '../assets/images/scratchcard.webp'
import { ScratchSurface } from '../features/scratchcard/ScratchSurface'
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
  const [buyingCount, setBuyingCount] = useState<number | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  // Track the batch we already opened the summary for, so closing the modal
  // doesn't immediately re-open on the next render of the same batch.
  const summaryShownForRef = useRef<string | null>(null)
  // Lock so we celebrate exactly once per batch, regardless of how the
  // user reveals (one-by-one or "Reveal all"). Reset on a new purchase.
  const celebratedBatchRef = useRef<string | null>(null)

  async function onBuy(count: number) {
    setResults([])
    setRevealed(new Set())
    celebratedBatchRef.current = null
    setBuyingCount(count)
    try {
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
    } finally {
      setBuyingCount(null)
    }
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
    const spent = BigInt(results.length) * BigInt(CARD_PRICE_NUSDC) * 1_000_000n
    const isProfit = totalPrize > spent

    if (isProfit) {
      showToast(
        `${wins}/${results.length} won · +${formatNusdc(totalPrize - spent)} net`,
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
    } else if (summaryShownForRef.current !== batchKey) {
      // Not net positive (zero hits OR partial wins below stake): open the
      // recap modal. We never celebrate a net-loss batch even if a card or
      // two paid out, because the user is down on the round.
      summaryShownForRef.current = batchKey
      setSummaryOpen(true)
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
    <div className="space-y-8 min-h-screen">
      <Header />

      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40 flex items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={clearError} className="btn-ghost !py-1 !px-3 text-sm">
            Dismiss
          </button>
        </div>
      )}

      <section className="panel p-5 sm:p-7">
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
          {BUY_OPTIONS.map((n) => {
            const isThisBuying = buyingCount === n
            return (
              <button
                key={n}
                onClick={() => onBuy(n)}
                disabled={!isWalletConnected || isBuying}
                className="btn-ghost !py-3 !px-5 text-sm disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center"
                title={
                  !isWalletConnected
                    ? 'Connect a wallet'
                    : isBuying
                      ? 'Submitting transaction'
                      : `Buy ${n} card${n === 1 ? '' : 's'}`
                }
              >
                {isThisBuying && <BuySpinner />}
                <span className="font-semibold">
                  {isThisBuying ? `Buying ${n}...` : `Buy ${n}`}
                </span>
                {!isThisBuying && (
                  <span className="ml-2 font-mono text-gold-200">
                    {(n * CARD_PRICE_NUSDC).toFixed(2)} NUSDC
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {hasResults && (
        <section className="panel p-5 sm:p-7">
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

      {summaryOpen && (
        <NoWinSummaryModal
          count={results.length}
          wins={results.filter((r) => r.multiplier > 0).length}
          spent={BigInt(results.length) * BigInt(CARD_PRICE_NUSDC) * 1_000_000n}
          won={results.reduce((s, r) => s + r.prizeAmount, 0n)}
          onClose={() => setSummaryOpen(false)}
          onPlayAgain={() => {
            setSummaryOpen(false)
            onBuy(results.length)
          }}
        />
      )}
    </div>
  )
}

type Headline = { emoji: string; title: string; subtitle: string }

// Total bust: zero hits across the batch.
const ZERO_WIN_HEADLINES: Headline[] = [
  { emoji: '🌑', title: 'Cold deck',          subtitle: 'Not a single hit. The luck has to swing back eventually.' },
  { emoji: '🧊', title: 'Frozen out',         subtitle: 'Even the dust came up empty. Reshuffle and run it back.' },
  { emoji: '🎭', title: 'House plays a part', subtitle: 'The cards put on a show, no payout. Curtain call.' },
  { emoji: '🪨', title: 'Stone cold',         subtitle: 'Zero matches. The bankroll thanks you for the donation.' },
  { emoji: '🦴', title: 'Dry bones',          subtitle: 'Not even a 1x. Brutal, but the variance owes you now.' },
  { emoji: '🌚', title: 'New moon energy',    subtitle: 'No light, no luck. Next batch the cycle resets.' },
  { emoji: '🃏', title: 'Bluffed',            subtitle: 'Every card looked promising. None paid. Classic.' },
  { emoji: '🛢️', title: 'Dry well',           subtitle: 'Drilled deep, found nothing. Move to the next field.' },
]

// Partial recovery: some cards hit but the round is still net negative.
const PARTIAL_LOSS_HEADLINES: Headline[] = [
  { emoji: '🩹', title: 'Patched up',     subtitle: 'A couple of hits softened the fall, but the round is still down.' },
  { emoji: '🪙', title: 'Half a coin',    subtitle: 'Saved some face. Not enough to call it a win.' },
  { emoji: '🛟',  title: 'Lifeline',       subtitle: 'You came out the other side with something. Just not profit.' },
  { emoji: '🌫️', title: 'Brushed clouds', subtitle: 'A small hit, but the variance is still owed.' },
  { emoji: '⚖️', title: 'Light on the scale', subtitle: 'Cards paid, math didn\'t. Net loss, but a story.' },
  { emoji: '🍋', title: 'Lemons turned',   subtitle: 'Got something back. The next batch wants the rest.' },
  { emoji: '🪞', title: 'Reflected loss',  subtitle: 'Wins exist, just not enough to outrun the spend.' },
]

function pickHeadline(pool: Headline[]): Headline {
  return pool[Math.floor(Math.random() * pool.length)]
}

function NoWinSummaryModal({
  count,
  wins,
  spent,
  won,
  onClose,
  onPlayAgain,
}: {
  count: number
  wins: number
  spent: bigint
  won: bigint
  onClose: () => void
  onPlayAgain: () => void
}) {
  const isPartial = won > 0n
  const pool = isPartial ? PARTIAL_LOSS_HEADLINES : ZERO_WIN_HEADLINES
  // Stable for this modal instance — picked once, ref-frozen.
  const picked = useRef(pickHeadline(pool)).current
  const net = won - spent
  const accent = isPartial ? 'rgba(245,158,11,0.14)' : 'rgba(220,38,38,0.14)'
  const border = isPartial ? 'border-amber-500/30' : 'border-red-500/30'
  const eyebrowColor = isPartial ? 'text-amber-300/80' : 'text-red-300/80'
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink-950/65 backdrop-blur-sm p-4 animate-slide-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-md panel p-6 sm:p-8 text-center ${border}`}
        style={{ background: `radial-gradient(circle at top, ${accent}, transparent 60%)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-100 text-2xl leading-none"
        >
          ×
        </button>
        <div className="text-6xl sm:text-7xl mb-4 animate-scratch-card-shake">{picked.emoji}</div>
        <p className={`text-xs uppercase tracking-[0.3em] ${eyebrowColor} mb-2`}>
          {count} card{count === 1 ? '' : 's'} revealed
        </p>
        <h2 className="font-display text-3xl sm:text-4xl text-neutral-100 mb-3">{picked.title}</h2>
        <p className="text-base text-neutral-200 leading-relaxed mb-5">{picked.subtitle}</p>
        <div className="grid grid-cols-3 gap-3 mb-6 text-sm">
          <div className="panel p-3 bg-ink-900/60 border-neutral-700">
            <p className="text-xs uppercase tracking-wider text-neutral-400 mb-1">Spent</p>
            <p className="font-mono text-base text-neutral-100">{formatNusdc(spent)}</p>
          </div>
          <div className="panel p-3 bg-ink-900/60 border-neutral-700">
            <p className="text-xs uppercase tracking-wider text-neutral-400 mb-1">Won</p>
            <p className={`font-mono text-base ${isPartial ? 'text-gold-200' : 'text-neutral-400'}`}>
              {formatNusdc(won)}
            </p>
          </div>
          <div className="panel p-3 bg-ink-900/60 border-neutral-700">
            <p className="text-xs uppercase tracking-wider text-neutral-400 mb-1">Hits</p>
            <p className={`font-mono text-base ${isPartial ? 'text-gold-200' : 'text-neutral-400'}`}>
              {wins}/{count}
            </p>
          </div>
        </div>
        <p className="text-sm text-neutral-300 mb-5">
          Net: <span className="font-mono text-red-300">−{formatNusdc(-net)} NUSDC</span>
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">Close</button>
          <button onClick={onPlayAgain} className="btn-gold flex-1">
            Run it back
          </button>
        </div>
      </div>
    </div>
  )
}

function BuySpinner() {
  return (
    <svg className="h-4 w-4 mr-2 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Header() {
  return (
    <header className="panel p-6 md:p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)] flex flex-col md:flex-row md:items-center gap-6">
      <img
        src={scratchThumb}
        alt=""
        aria-hidden
        className="w-full md:w-48 h-40 md:h-48 rounded-xl object-cover border border-gold-subtle shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">
          Instant Play
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-gold">Scratch Cards</h1>
        <p className="text-base text-neutral-200 mt-3 max-w-2xl leading-relaxed">
          Buy up to ten cards in one transaction. Each card resolves instantly
          with provably-fair randomness. Multipliers up to 100×. Winning cards
          become NFTs in your wallet.
        </p>
      </div>
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
  return (
    <div
      className={`relative aspect-[3/4] rounded-lg border overflow-hidden ${
        revealed
          ? isWin
            ? 'border-gold-200/60 bg-gradient-to-br from-amber-950/80 to-ink-900 shadow-[0_0_20px_-5px_rgba(212,175,55,0.4)] animate-slide-in'
            : 'border-neutral-700 bg-ink-900/80 animate-slide-in'
          : 'border-gold-subtle bg-gradient-to-br from-ink-800 to-ink-900'
      }`}
    >
      <ScratchSurface revealed={revealed} onReveal={onReveal}>
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-3">
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
      </ScratchSurface>
    </div>
  )
}

function PrizeTableSection() {
  return (
    <section className="panel p-7">
      <h2 className="font-display text-2xl text-gold mb-5">Prize Table</h2>
      <div className="overflow-x-auto rounded-lg border border-gold-subtle">
        <table className="w-full min-w-[20rem] text-sm sm:text-base">
          <thead className="bg-ink-800/80 text-xs sm:text-sm uppercase tracking-widest text-neutral-200">
            <tr>
              <th className="text-left px-3 sm:px-4 py-3">Multiplier</th>
              <th className="text-left px-3 sm:px-4 py-3">Prize (NUSDC)</th>
              <th className="text-right px-3 sm:px-4 py-3">Probability</th>
            </tr>
          </thead>
          <tbody>
            {PRIZE_TABLE.map((row) => (
              <tr key={row.mult} className="border-t border-gold-subtle/50">
                <td className="px-3 sm:px-4 py-3 font-display text-base sm:text-lg text-gold-200">
                  {row.mult}×
                </td>
                <td className="px-3 sm:px-4 py-3 font-mono text-neutral-200">
                  {(row.mult * CARD_PRICE_NUSDC).toFixed(2)}
                </td>
                <td className="px-3 sm:px-4 py-3 text-right font-mono text-gold-200">
                  {row.share}
                </td>
              </tr>
            ))}
            <tr className="border-t border-gold-subtle/50">
              <td className="px-3 sm:px-4 py-3 text-neutral-400">No win</td>
              <td className="px-3 sm:px-4 py-3 text-neutral-400">—</td>
              <td className="px-3 sm:px-4 py-3 text-right font-mono text-neutral-400">75.00%</td>
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
