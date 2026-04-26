import { useEffect, useState } from 'react'
import {
  useClaimSummary,
  useLatestRound,
  useMyTickets,
  type ClaimableTicket,
} from '../features/lottery/hooks'
import {
  countMatchingNumbers,
  formatNusdc,
  getTicketTier,
  type LotteryRound,
  type Ticket,
} from '../features/lottery/lottery-client'
import { useLotteryActions } from '../features/lottery/useLotteryActions'
import { ROUND_STATUS } from '../lib/gostop-config'
import {
  useCelebrate,
  tierForLottery,
  useForceTierDebug,
} from '../components/celebration'
import { useInvalidateGameHistory } from '../features/game-history'

const URGENT_DEADLINE_MS = 24 * 60 * 60 * 1000

const MAX_NUMBER = 25
const PICK_COUNT = 5
const TICKET_PRICE_NUSDC = 5

function nextMondayUtc(): Date {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun..6=Sat
  const daysUntilMon = ((8 - day) % 7) || 7
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + daysUntilMon)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function statusLabel(status: number): string {
  switch (status) {
    case ROUND_STATUS.OPEN: return 'Open'
    case ROUND_STATUS.CLOSED: return 'Closed'
    case ROUND_STATUS.DRAWN: return 'Drawn'
    case ROUND_STATUS.SETTLED: return 'Settled'
    default: return 'Unknown'
  }
}

function fmtDiff(ms: number) {
  if (ms <= 0) return '00d 00h 00m 00s'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(ss)}s`
}

export default function LotteryPage() {
  const [picks, setPicks] = useState<number[]>([])
  const [quickPickSeed, setQuickPickSeed] = useState(0)
  const [fallbackCloseAt, setFallbackCloseAt] = useState<Date>(() => nextMondayUtc())
  const { round, loading: roundLoading, refresh: refreshRound } = useLatestRound()

  // Recompute fallback close time once an hour so a tab left open for days
  // doesn't display a fallback that points to the past.
  useEffect(() => {
    const id = setInterval(() => setFallbackCloseAt(nextMondayUtc()), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  const {
    walletAddress,
    isWalletConnected,
    buyTicket,
    buyTicketBulk,
    claimPrize,
    burnTicket,
    isBuying,
    isClaiming,
    error,
    clearError,
  } = useLotteryActions()
  const { tickets, refresh: refreshTickets } = useMyTickets(walletAddress, round?.id)
  const claimSummary = useClaimSummary(walletAddress)
  const celebrate = useCelebrate()
  const invalidateHistory = useInvalidateGameHistory()
  useForceTierDebug('Lottery')

  const closeMs = round?.closeTime ?? fallbackCloseAt.getTime()
  // isRoundOpen does not need 1Hz precision; minute-level is fine.
  const isRoundOpen = round?.status === ROUND_STATUS.OPEN && Date.now() < round.closeTime

  function togglePick(n: number) {
    setPicks((prev) =>
      prev.includes(n)
        ? prev.filter((x) => x !== n)
        : prev.length < PICK_COUNT
          ? [...prev, n].sort((a, b) => a - b)
          : prev,
    )
  }

  function quickPick() {
    const pool = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1)
    const picked: number[] = []
    while (picked.length < PICK_COUNT) {
      const idx = Math.floor(Math.random() * pool.length)
      picked.push(pool.splice(idx, 1)[0])
    }
    setPicks(picked.sort((a, b) => a - b))
    setQuickPickSeed((s) => s + 1)
  }

  async function onBuy() {
    if (!round || picks.length !== PICK_COUNT) return
    const ok = await buyTicket(round.id, picks)
    if (ok) {
      setPicks([])
      refreshRound()
      refreshTickets()
      invalidateHistory()
    }
  }

  async function onQuickBuy(count: number) {
    if (!round) return
    const ok = await buyTicketBulk(round.id, count)
    if (ok) {
      refreshRound()
      refreshTickets()
      invalidateHistory()
    }
  }

  async function onClaim(roundId: string, ticketId: string) {
    // Look up tier+payout BEFORE claim so the celebration matches the
    // ticket the user clicked (claimSummary refetches after success).
    const claimable = claimSummary.claimable.find(
      (c) => c.round.id === roundId && c.ticket.id === ticketId,
    )
    const ok = await claimPrize(roundId, ticketId)
    if (ok) {
      refreshRound()
      refreshTickets()
      invalidateHistory()
      if (claimable) {
        celebrate({
          variant: 'tiered',
          tier: tierForLottery(claimable.tier),
          payout: claimable.payout,
          gameLabel: 'Lottery',
          tierLabelOverride:
            claimable.tier === 1 ? 'JACKPOT' : claimable.tier === 2 ? '2ND PRIZE' : '3RD PRIZE',
        })
      }
    }
  }

  async function onBurn(roundId: string, ticketId: string) {
    const ok = await burnTicket(roundId, ticketId)
    if (ok) refreshTickets()
  }

  const canBuy =
    picks.length === PICK_COUNT && isWalletConnected && isRoundOpen && !isBuying

  return (
    <div className="space-y-8">
      <RoundHeader
        closeMs={closeMs}
        roundNumber={round?.roundNumber ?? null}
        statusText={
          round ? statusLabel(round.status) : roundLoading ? 'Loading' : 'Not started'
        }
        prizePoolNusdc={round ? formatNusdc(round.prizePool + round.rolloverIn) : '0.00'}
      />

      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40 flex items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={clearError} className="btn-ghost !py-1 !px-3 text-sm">
            Dismiss
          </button>
        </div>
      )}

      <ClaimBanner
        claimable={claimSummary.claimable}
        totalNusdc={claimSummary.totalClaimableNusdc}
        earliestDeadlineMs={claimSummary.earliestDeadlineMs}
        onClaim={onClaim}
        isClaiming={isClaiming}
      />
      <ExpiredBanner expired={claimSummary.expired} />

      <section className="grid md:grid-cols-[1.3fr_1fr] gap-6">
        <PickPanel
          picks={picks}
          onToggle={togglePick}
          onQuickPick={quickPick}
          onClear={() => setPicks([])}
          quickPickSeed={quickPickSeed}
        />
        <BuyPanel
          picks={picks}
          canBuy={canBuy}
          onBuy={onBuy}
          isBuying={isBuying}
          isWalletConnected={isWalletConnected}
          isRoundOpen={isRoundOpen}
        />
      </section>

      <QuickBuyPanel
        onQuickBuy={onQuickBuy}
        isBuying={isBuying}
        isWalletConnected={isWalletConnected}
        isRoundOpen={isRoundOpen}
      />

      <MyTickets
        tickets={tickets}
        round={round}
        onClaim={onClaim}
        onBurn={onBurn}
        isClaiming={isClaiming}
        isWalletConnected={isWalletConnected}
      />

      <PrizeTable />
    </div>
  )
}

function RoundHeader({
  closeMs,
  roundNumber,
  statusText,
  prizePoolNusdc,
}: {
  closeMs: number
  roundNumber: number | null
  statusText: string
  prizePoolNusdc: string
}) {
  const roundLabel = roundNumber != null
    ? `Round ${String(roundNumber).padStart(3, '0')}`
    : 'Round -'
  return (
    <header className="panel p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)]">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">
            {roundLabel} · {statusText}
          </p>
          <h1 className="font-display text-4xl md:text-5xl text-gold">
            The Weekly
          </h1>
          <p className="text-base text-neutral-200 mt-3 max-w-md leading-relaxed">
            Pick five numbers from 1 to 25. Draw every Monday 00:00 UTC. 70% to
            winners, 20% rolls over, 10% flows to the bankroll.
          </p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-sm uppercase tracking-[0.25em] text-neutral-200 mb-2">
            Closes in
          </p>
          <Countdown closeMs={closeMs} />
          <p className="text-sm text-neutral-200 mt-3">
            Prize Pool ·{' '}
            <span className="text-gold-200 font-mono text-base">
              {prizePoolNusdc} NUSDC
            </span>
          </p>
        </div>
      </div>
    </header>
  )
}

function PickPanel({
  picks,
  onToggle,
  onQuickPick,
  onClear,
  quickPickSeed,
}: {
  picks: number[]
  onToggle: (n: number) => void
  onQuickPick: () => void
  onClear: () => void
  quickPickSeed: number
}) {
  return (
    <div className="panel p-7">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="font-display text-2xl text-gold">Your Numbers</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onQuickPick}
            className="btn-ghost !py-2 !px-4 text-sm"
          >
            Quick Pick
          </button>
          <button
            onClick={onClear}
            disabled={picks.length === 0}
            className="btn-ghost !py-2 !px-4 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        key={quickPickSeed}
        className="grid grid-cols-5 gap-2 justify-items-center"
      >
        {Array.from({ length: MAX_NUMBER }, (_, i) => i + 1).map((n) => {
          const selected = picks.includes(n)
          return (
            <button
              key={n}
              onClick={() => onToggle(n)}
              className={`number-ball ${selected ? 'is-selected' : ''}`}
              aria-pressed={selected}
            >
              {n}
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex items-center justify-between text-sm text-neutral-200">
        <span>
          Selected{' '}
          <span className="text-gold-200 font-semibold">{picks.length}</span> /{' '}
          {PICK_COUNT}
        </span>
        <span>Range 1–{MAX_NUMBER}</span>
      </div>
    </div>
  )
}

function BuyPanel({
  picks,
  canBuy,
  onBuy,
  isBuying,
  isWalletConnected,
  isRoundOpen,
}: {
  picks: number[]
  canBuy: boolean
  onBuy: () => void
  isBuying: boolean
  isWalletConnected: boolean
  isRoundOpen: boolean
}) {
  let label = 'Buy Ticket'
  let title = `Pick ${PICK_COUNT} numbers first`
  if (!isWalletConnected) {
    label = 'Connect Wallet'
    title = 'Connect a wallet to buy tickets'
  } else if (!isRoundOpen) {
    label = 'Round Closed'
    title = 'No open round at the moment'
  } else if (isBuying) {
    label = 'Buying...'
    title = 'Submitting transaction'
  } else if (canBuy) {
    title = 'Submit on-chain ticket purchase'
  }

  return (
    <div className="panel p-7 flex flex-col">
      <h2 className="font-display text-2xl text-gold mb-5">Checkout</h2>

      <div className="flex items-center gap-2 mb-6 min-h-[52px] flex-wrap">
        {picks.length === 0 ? (
          <span className="text-neutral-200 italic text-base">
            No numbers selected yet.
          </span>
        ) : (
          picks.map((n) => (
            <span
              key={n}
              className="number-ball is-selected !w-10 !h-10 !text-base"
            >
              {n}
            </span>
          ))
        )}
      </div>

      <dl className="space-y-3 text-base border-t border-gold-subtle pt-5">
        <Row label="Ticket price">
          <span className="font-mono text-gold-200">
            {TICKET_PRICE_NUSDC.toFixed(2)} NUSDC
          </span>
        </Row>
        <Row label="Network">
          <span className="font-mono text-neutral-200">Nasun Devnet</span>
        </Row>
        <Row label="Max prize">
          <span className="font-mono text-gold-200">Jackpot (5-of-5)</span>
        </Row>
      </dl>

      <button
        onClick={onBuy}
        disabled={!canBuy}
        className="btn-gold mt-6"
        title={title}
      >
        {label}
      </button>
    </div>
  )
}

function QuickBuyPanel({
  onQuickBuy,
  isBuying,
  isWalletConnected,
  isRoundOpen,
}: {
  onQuickBuy: (count: number) => void
  isBuying: boolean
  isWalletConnected: boolean
  isRoundOpen: boolean
}) {
  const options = [1, 5, 10]
  const disabled = !isWalletConnected || !isRoundOpen || isBuying
  const hint = !isWalletConnected
    ? 'Connect a wallet to buy tickets'
    : !isRoundOpen
      ? 'No open round at the moment'
      : isBuying
        ? 'Submitting transaction'
        : 'Auto-picks 5 unique numbers per ticket and buys in one transaction'
  return (
    <section className="panel p-7">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-2xl text-gold">Quick Buy</h2>
          <p className="text-sm text-neutral-200 mt-1">
            Skip picking. Auto-generate numbers and buy instantly.
          </p>
        </div>
        <p className="text-sm text-neutral-200">
          {TICKET_PRICE_NUSDC.toFixed(2)} NUSDC each
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {options.map((n) => (
          <button
            key={n}
            onClick={() => onQuickBuy(n)}
            disabled={disabled}
            className="btn-ghost !py-3 !px-5 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
            title={hint}
          >
            <span className="font-semibold">Buy {n}</span>
            <span className="ml-2 font-mono text-gold-200">
              {(n * TICKET_PRICE_NUSDC).toFixed(2)} NUSDC
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-neutral-200">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function MyTickets({
  tickets,
  round,
  onClaim,
  onBurn,
  isClaiming,
  isWalletConnected,
}: {
  tickets: Ticket[]
  round: LotteryRound | null
  onClaim: (roundId: string, ticketId: string) => void
  onBurn: (roundId: string, ticketId: string) => void
  isClaiming: boolean
  isWalletConnected: boolean
}) {
  if (!isWalletConnected) {
    return (
      <section className="panel p-7">
        <h2 className="font-display text-2xl text-gold mb-3">My Tickets</h2>
        <p className="text-base text-neutral-200 italic">
          Connect a wallet to see tickets owned by your address.
        </p>
      </section>
    )
  }
  if (tickets.length === 0) {
    return (
      <section className="panel p-7">
        <h2 className="font-display text-2xl text-gold mb-3">My Tickets</h2>
        <p className="text-base text-neutral-200 italic">
          Tickets you buy this round will appear here.
        </p>
      </section>
    )
  }
  return (
    <section className="panel p-7">
      <h2 className="font-display text-2xl text-gold mb-5">My Tickets</h2>
      <ul className="space-y-3">
        {tickets.map((t) => {
          const matches = round ? countMatchingNumbers(t.numbers, round.drawnNumbers) : 0
          const tier = getTicketTier(matches)
          const settled = round?.status === ROUND_STATUS.SETTLED && round.id === t.roundId
          const tierLabel = tier === 1 ? 'Jackpot' : tier === 2 ? '2nd' : tier === 3 ? '3rd' : null
          const payout =
            tier === 1
              ? round?.tier1PayoutPerWinner
              : tier === 2
                ? round?.tier2PayoutPerWinner
                : tier === 3
                  ? round?.tier3PayoutPerWinner
                  : 0n
          return (
            <li
              key={t.id}
              className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-lg border border-gold-subtle bg-ink-900/60"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-neutral-200 w-16 shrink-0">
                  #{t.ticketId}
                </span>
                <div className="flex gap-2 flex-wrap">
                  {t.numbers.map((n) => {
                    const hit = round?.drawnNumbers?.includes(n) ?? false
                    return (
                      <span
                        key={n}
                        className={`number-ball !w-9 !h-9 !text-base ${hit ? 'is-selected' : ''}`}
                      >
                        {n}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between md:ml-auto gap-3">
                {settled && tierLabel && (
                  <span className="font-mono text-sm text-gold-200">
                    {tierLabel} · {formatNusdc(payout ?? 0n)} NUSDC
                  </span>
                )}
                {!settled && (
                  <span className="font-mono text-sm text-gold-200">5.00 NUSDC</span>
                )}
                {settled && tier !== 0 && (
                  <button
                    onClick={() => onClaim(t.roundId, t.id)}
                    disabled={isClaiming}
                    className="btn-gold !py-2 !px-4 text-sm shrink-0"
                  >
                    {isClaiming ? 'Claiming...' : 'Claim'}
                  </button>
                )}
                {settled && tier === 0 && (
                  <button
                    onClick={() => onBurn(t.roundId, t.id)}
                    className="btn-ghost !py-2 !px-4 text-sm shrink-0"
                    title="Remove non-winning ticket from your wallet"
                  >
                    Burn
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Countdown isolated into its own component so the 1Hz tick only re-renders
 * the timer text, not the whole page (which has 25+ number balls etc).
 */
function Countdown({ closeMs }: { closeMs: number }) {
  const [now, setNow] = useState<number>(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <p className="font-mono text-3xl text-gold-200 tabular-nums">
      {fmtDiff(closeMs - now)}
    </p>
  )
}

function ClaimBanner({
  claimable,
  totalNusdc,
  earliestDeadlineMs,
  onClaim,
  isClaiming,
}: {
  claimable: ClaimableTicket[]
  totalNusdc: bigint
  earliestDeadlineMs: number | null
  onClaim: (roundId: string, ticketId: string) => void
  isClaiming: boolean
}) {
  if (claimable.length === 0) return null

  const now = Date.now()
  const isUrgent =
    earliestDeadlineMs != null && earliestDeadlineMs - now < URGENT_DEADLINE_MS
  const deadlineDate = earliestDeadlineMs
    ? new Date(earliestDeadlineMs).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
    : ''

  // Sort by deadline ascending so urgent ones surface first.
  const sorted = [...claimable].sort((a, b) => a.deadlineMs - b.deadlineMs)
  const tone = isUrgent
    ? 'border-amber-500/60 bg-amber-950/40'
    : 'border-emerald-500/40 bg-emerald-950/30'

  return (
    <section className={`panel p-5 ${tone}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className={`font-display text-2xl ${isUrgent ? 'text-amber-200' : 'text-emerald-300'}`}>
            {isUrgent ? 'Claim deadline approaching' : 'You have unclaimed prizes'}
          </h2>
          <p className="text-base text-neutral-200 mt-1">
            {claimable.length} winning ticket{claimable.length === 1 ? '' : 's'} ·{' '}
            <span className="font-mono text-gold-200">
              {formatNusdc(totalNusdc)} NUSDC
            </span>
          </p>
        </div>
        <p className={`text-sm ${isUrgent ? 'text-amber-200' : 'text-neutral-200'}`}>
          Earliest deadline · <span className="font-mono">{deadlineDate}</span>
        </p>
      </div>

      <ul className="space-y-2">
        {sorted.map((c) => {
          const tierLabel = c.tier === 1 ? 'Jackpot' : c.tier === 2 ? '2nd' : '3rd'
          const ticketUrgent = c.msUntilDeadline < URGENT_DEADLINE_MS
          return (
            <li
              key={c.ticket.id}
              className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-gold-subtle/40 bg-ink-900/60"
            >
              <span className="font-mono text-sm text-neutral-200 w-20">
                Round {c.round.roundNumber}
              </span>
              <span className="text-sm text-gold-200 font-semibold">{tierLabel}</span>
              <span className="font-mono text-sm text-gold-200">
                {formatNusdc(c.payout)} NUSDC
              </span>
              <div className="flex gap-1">
                {c.ticket.numbers.map((n) => {
                  const hit = c.round.drawnNumbers?.includes(n) ?? false
                  return (
                    <span
                      key={n}
                      className={`number-ball !w-7 !h-7 !text-sm ${hit ? 'is-selected' : ''}`}
                    >
                      {n}
                    </span>
                  )
                })}
              </div>
              <span
                className={`ml-auto text-sm ${
                  ticketUrgent ? 'text-amber-200 font-semibold' : 'text-neutral-200'
                }`}
              >
                {fmtTimeLeft(c.msUntilDeadline)}
              </span>
              <button
                onClick={() => onClaim(c.round.id, c.ticket.id)}
                disabled={isClaiming}
                className="btn-gold !py-2 !px-4 text-sm"
              >
                {isClaiming ? 'Claiming...' : 'Claim'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ExpiredBanner({ expired }: { expired: ClaimableTicket[] }) {
  if (expired.length === 0) return null
  const total = expired.reduce((s, c) => s + c.payout, 0n)
  return (
    <section className="panel p-4 border-neutral-700/60 bg-ink-900/60">
      <h2 className="font-display text-lg text-neutral-200 mb-2">
        Forfeited prizes
      </h2>
      <p className="text-sm text-neutral-200">
        {expired.length} winning ticket{expired.length === 1 ? '' : 's'} past the
        30-day claim window ({formatNusdc(total)} NUSDC). These have been swept
        to the bankroll. Burn the tickets below to clear them from your wallet.
      </p>
    </section>
  )
}

function fmtTimeLeft(ms: number): string {
  if (ms <= 0) return 'Expired'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) {
    const mins = Math.floor((ms % 3_600_000) / 60_000)
    return `${hours}h ${mins}m left`
  }
  const mins = Math.floor(ms / 60_000)
  return `${mins}m left`
}

const TIERS = [
  { tier: 'Jackpot', match: '5 of 5', share: '42.0%', color: 'text-gold-200' },
  { tier: 'Second', match: '4 of 5', share: '17.5%', color: 'text-gold-100' },
  { tier: 'Third', match: '3 of 5', share: '10.5%', color: 'text-gold-50' },
  { tier: 'Rollover', match: '-', share: '20.0%', color: 'text-emerald-400' },
  { tier: 'Bankroll', match: '-', share: '10.0%', color: 'text-emerald-400' },
]

function PrizeTable() {
  return (
    <section className="panel p-7">
      <h2 className="font-display text-2xl text-gold mb-5">
        Prize Distribution
      </h2>
      <div className="overflow-hidden rounded-lg border border-gold-subtle">
        <table className="w-full text-base">
          <thead className="bg-ink-800/80 text-sm uppercase tracking-widest text-neutral-200">
            <tr>
              <th className="text-left px-4 py-3">Tier</th>
              <th className="text-left px-4 py-3">Match</th>
              <th className="text-right px-4 py-3">Share of Pool</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t.tier} className="border-t border-gold-subtle/50">
                <td className={`px-4 py-3 font-display text-lg ${t.color}`}>
                  {t.tier}
                </td>
                <td className="px-4 py-3 text-neutral-200">{t.match}</td>
                <td className="px-4 py-3 text-right font-mono text-gold-200">
                  {t.share}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-neutral-200 mt-4 italic">
        Prize pool split: 70% to winners (tiered), 20% rolls to next round, 10%
        to the gostop bankroll.
      </p>
    </section>
  )
}
