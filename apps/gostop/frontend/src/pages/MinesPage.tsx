import { useEffect, useRef, useState } from 'react'
import { useMines } from '../features/mines/useMines'
import minesThumb from '../assets/images/mines.webp'
import {
  useCelebrate,
  tierForMines,
  useForceTierDebug,
} from '../components/celebration'
import { useInvalidateGameHistory } from '../features/game-history'
import {
  computeMultiplierBps,
  maxMultiplierBps,
} from '../features/mines/mines-config'
import {
  MINES_GRID_SIZE,
  MINES_MIN_MINES,
  MINES_MAX_MINES,
  MINES_MAX_SINGLE_PAYOUT,
} from '../lib/gostop-config'
import { useToast } from '../components/ui/Toast'

const MIN_BET_NUSDC = 0.1
const DEFAULT_BET_NUSDC = 1

function fmt(mist: bigint): string {
  const whole = mist / 1_000_000n
  const frac = Number(mist % 1_000_000n) / 1_000_000
  return (Number(whole) + frac).toFixed(2)
}
function fmtNum(n: number): string {
  return n.toFixed(2)
}

export default function MinesPage() {
  const {
    isWalletConnected,
    session,
    phase,
    pendingCells,
    createSession,
    revealCell,
    cashout,
    error,
    clearError,
    lastFinish,
    clearLastFinish,
  } = useMines()
  const { showToast } = useToast()
  const celebrate = useCelebrate()
  const invalidateHistory = useInvalidateGameHistory()
  useForceTierDebug('Mines')

  const [bet, setBet] = useState<number>(DEFAULT_BET_NUSDC)
  const [mineCount, setMineCount] = useState<number>(3)

  // Fire celebration when a cashout finishes. lastFinish.kind === 'cashed_out'
  // is the only winning outcome; explosions resolve to no celebration.
  // Either way (cashout or explosion), invalidate the history cache so the
  // session shows up in /games/history immediately.
  const celebratedFinishRef = useRef<typeof lastFinish>(null)
  useEffect(() => {
    if (!lastFinish) {
      celebratedFinishRef.current = null
      return
    }
    if (celebratedFinishRef.current === lastFinish) return
    celebratedFinishRef.current = lastFinish
    invalidateHistory()
    if (lastFinish.kind !== 'cashed_out') return
    if (lastFinish.bet === 0n) return
    // Compute multiplier from on-chain payout / bet.
    const multBps = Number((lastFinish.payout * 10_000n) / lastFinish.bet)
    const multiplier = multBps / 10_000
    const tier = tierForMines(multiplier)
    if (tier) {
      celebrate({
        variant: 'tiered',
        tier,
        payout: lastFinish.payout,
        multiplier: Number(multiplier.toFixed(2)),
        gameLabel: 'Mines',
      })
    }
  }, [lastFinish, celebrate, invalidateHistory])

  // Contract enforces bet_amount <= cap.max_single_payout. Payout is silently
  // clamped at cashout, so the bet ceiling is just the raw payout cap rather
  // than cap/maxMultiplier (which collapses to ~0 at 7+ mines).
  const maxMul = maxMultiplierBps(mineCount) / 10_000
  const payoutCapNusdc = Number(MINES_MAX_SINGLE_PAYOUT) / 1_000_000
  const maxBetAllowed = payoutCapNusdc
  const betCapped = Math.min(bet, maxBetAllowed)
  const betMist = BigInt(Math.floor(betCapped * 1_000_000))

  async function onCreate() {
    if (!isWalletConnected) return
    const ok = await createSession(betMist, mineCount)
    if (!ok) return
    showToast(
      `Session started: ${fmtNum(betCapped)} NUSDC · ${mineCount} mines`,
      'info',
    )
  }

  async function onReveal(i: number) {
    await revealCell(i)
  }

  async function onCashout() {
    const ok = await cashout()
    if (ok) {
      const currentMul = session
        ? computeMultiplierBps(session.mineCount, session.safeReveals) / 10_000
        : 1
      showToast(`Cashed out at ${currentMul.toFixed(2)}×`, 'success')
    }
  }

  // Post-finish modal
  if (lastFinish) {
    return (
      <div className="space-y-6">
        <FinishCard finish={lastFinish} onDismiss={clearLastFinish} />
      </div>
    )
  }

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

      {!session ? (
        <BetPanel
          bet={bet}
          payoutCapNusdc={payoutCapNusdc}
          mineCount={mineCount}
          maxBetAllowed={maxBetAllowed}
          maxMul={maxMul}
          isWalletConnected={isWalletConnected}
          isCreating={phase === 'creating'}
          onBetChange={setBet}
          onMineCountChange={setMineCount}
          onCreate={onCreate}
        />
      ) : (
        <ActiveSession
          session={session}
          pendingCells={pendingCells}
          phase={phase}
          onReveal={onReveal}
          onCashout={onCashout}
        />
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="panel p-6 md:p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)] flex flex-col md:flex-row md:items-center gap-6">
      <img
        src={minesThumb}
        alt=""
        aria-hidden
        className="w-full md:w-48 h-40 md:h-48 rounded-xl object-cover border border-gold-subtle shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">
          Risk Escalation
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-gold">Mines</h1>
        <p className="text-base text-neutral-200 mt-3 max-w-2xl leading-relaxed">
          Set your bet, choose how many mines to hide on a 5×5 grid, and
          reveal safe cells to grow your multiplier. Cash out anytime, but
          one mine ends the round.
        </p>
        {/*
          Devnet prototype caveat: mine_positions is readable via getObject
          RPC on the active MinesSession. Bet cap (GameCap.max_single_payout)
          bounds the exploit upside. Encrypted placement (ECIES + house key)
          lands before mainnet. Hidden from end users to keep the page clean.
        */}
      </div>
    </header>
  )
}

function BetPanel({
  bet,
  mineCount,
  maxBetAllowed,
  maxMul,
  payoutCapNusdc,
  isWalletConnected,
  isCreating,
  onBetChange,
  onMineCountChange,
  onCreate,
}: {
  bet: number
  mineCount: number
  maxBetAllowed: number
  maxMul: number
  payoutCapNusdc: number
  isWalletConnected: boolean
  isCreating: boolean
  onBetChange: (n: number) => void
  onMineCountChange: (n: number) => void
  onCreate: () => void
}) {
  const overCap = bet > maxBetAllowed
  const theoreticalPayout = bet * maxMul
  const payoutWillCap = theoreticalPayout > payoutCapNusdc
  return (
    <section className="panel p-5 sm:p-7 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm text-neutral-200 mb-2">Bet (NUSDC)</label>
          <input
            type="number"
            min={MIN_BET_NUSDC}
            step={0.1}
            value={bet}
            onChange={(e) => onBetChange(Number(e.target.value) || 0)}
            className="w-full px-4 py-3 rounded-lg bg-ink-900 border border-gold-subtle text-neutral-100 font-mono focus:outline-none focus:border-gold-200/60"
          />
          <input
            type="range"
            min={MIN_BET_NUSDC}
            max={Math.max(maxBetAllowed, MIN_BET_NUSDC)}
            step={0.1}
            value={Math.min(Math.max(bet, MIN_BET_NUSDC), maxBetAllowed)}
            onChange={(e) =>
              onBetChange(Number(Number(e.target.value).toFixed(2)))
            }
            className="w-full mt-3 accent-gold-200"
            aria-label="Bet amount slider"
          />
          <p className="text-sm text-neutral-200 mt-2">
            Max bet: {fmtNum(maxBetAllowed)} NUSDC
          </p>
        </div>
        <div>
          <label className="block text-sm text-neutral-200 mb-2">
            Mines ({MINES_MIN_MINES}-{MINES_MAX_MINES})
          </label>
          <input
            type="range"
            min={MINES_MIN_MINES}
            max={MINES_MAX_MINES}
            value={mineCount}
            onChange={(e) => onMineCountChange(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-sm text-gold-200 mt-1 font-mono">
            {mineCount} / {MINES_GRID_SIZE - 1}
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-gold-subtle/50 bg-ink-900/60">
        <div>
          <p className="text-sm text-neutral-200">First reveal multiplier</p>
          <p className="font-mono text-xl text-gold-200">
            {(computeMultiplierBps(mineCount, 1) / 10_000).toFixed(2)}×
          </p>
        </div>
        <div>
          <p className="text-sm text-neutral-200">Max (all safe cells)</p>
          <p className="font-mono text-xl text-gold-200">{maxMul.toFixed(2)}×</p>
        </div>
        <div>
          <p className="text-sm text-neutral-200">Max payout</p>
          <p className="font-mono text-xl text-gold-200">
            {fmtNum(Math.min(theoreticalPayout, payoutCapNusdc))} NUSDC
          </p>
        </div>
      </div>
      {overCap && (
        <p className="text-sm text-amber-300">
          Bet will be capped to {fmtNum(maxBetAllowed)} NUSDC (per-payout limit).
        </p>
      )}
      {payoutWillCap && !overCap && (
        <p className="text-sm text-amber-300">
          Payout is capped at {fmtNum(payoutCapNusdc)} NUSDC. Reveals beyond the
          cap multiplier do not increase your win.
        </p>
      )}
      <button
        onClick={onCreate}
        disabled={!isWalletConnected || isCreating || bet < MIN_BET_NUSDC}
        className="btn-gold w-full md:w-auto"
      >
        {isCreating
          ? 'Starting…'
          : !isWalletConnected
            ? 'Connect Wallet'
            : `Start Session · ${fmtNum(Math.min(bet, maxBetAllowed))} NUSDC`}
      </button>
    </section>
  )
}

function ActiveSession({
  session,
  pendingCells,
  phase,
  onReveal,
  onCashout,
}: {
  session: import('../features/mines/mines-client').MinesSession
  pendingCells: Set<number>
  phase: 'idle' | 'creating' | 'cashing_out'
  onReveal: (i: number) => void
  onCashout: () => void
}) {
  const currentMul = computeMultiplierBps(session.mineCount, session.safeReveals) / 10_000
  const rawPayout =
    (session.betAmount * BigInt(Math.floor(currentMul * 10_000))) / 10_000n
  // Mirror the contract's silent clamp so the button shows the actual payout.
  const currentPayout =
    rawPayout > MINES_MAX_SINGLE_PAYOUT ? MINES_MAX_SINGLE_PAYOUT : rawPayout
  const isCapped = rawPayout > MINES_MAX_SINGLE_PAYOUT
  const nextMul =
    computeMultiplierBps(session.mineCount, session.safeReveals + 1) / 10_000
  const canCashout = session.safeReveals > 0 && phase === 'idle' && pendingCells.size === 0

  return (
    <section className="panel p-5 sm:p-7 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatBox label="Bet" value={`${fmt(session.betAmount)} NUSDC`} />
        <StatBox label="Current" value={`${currentMul.toFixed(2)}×`} emphasis />
        <StatBox label="Next reveal" value={`${nextMul.toFixed(2)}×`} />
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-3 max-w-md mx-auto">
        {Array.from({ length: MINES_GRID_SIZE }, (_, i) => {
          const revealed = session.revealed[i]
          const pending = pendingCells.has(i)
          const disabled = revealed || pending || phase !== 'idle'
          return (
            <button
              key={i}
              onClick={() => onReveal(i)}
              disabled={disabled}
              className={`aspect-square rounded-lg flex items-center justify-center transition-all ${
                revealed
                  ? 'border-2 border-emerald-500/60 bg-emerald-950/40 text-emerald-300'
                  : pending
                    ? 'border border-gold-200/60 bg-ink-900 animate-pulse'
                    : 'border border-gold-subtle bg-ink-900 hover:border-gold-200/60 hover:-translate-y-0.5'
              } ${disabled && !revealed && !pending ? 'opacity-50' : ''}`}
            >
              {revealed ? (
                <span className="text-lg">✓</span>
              ) : (
                <span className="text-sm text-neutral-400">{i + 1}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex flex-col items-center gap-3">
        <p className="text-sm text-neutral-200">
          Safe reveals:{' '}
          <span className="font-mono text-gold-200">{session.safeReveals}</span>
          {' / '}
          {MINES_GRID_SIZE - session.mineCount}
        </p>
        {isCapped && (
          <p className="text-sm text-amber-300">
            Payout reached the cap. Further reveals do not increase your win.
          </p>
        )}
        <button
          onClick={onCashout}
          disabled={!canCashout}
          className="btn-gold w-full sm:w-auto sm:min-w-[20rem] !px-10 !py-4 text-xl font-bold tracking-wide shadow-gold-glow disabled:shadow-none"
        >
          {phase === 'cashing_out'
            ? 'Cashing out…'
            : session.safeReveals === 0
              ? 'Reveal a cell first'
              : `Cash Out · ${fmt(currentPayout)} NUSDC`}
        </button>
      </div>
    </section>
  )
}

function StatBox({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="p-4 rounded-lg border border-gold-subtle/40 bg-ink-900/60">
      <p className="text-sm text-neutral-200 uppercase tracking-wider">{label}</p>
      <p className={`font-mono mt-1 ${emphasis ? 'text-2xl text-gold-200' : 'text-xl text-neutral-100'}`}>
        {value}
      </p>
    </div>
  )
}

function FinishCard({
  finish,
  onDismiss,
}: {
  finish: NonNullable<ReturnType<typeof useMines>['lastFinish']>
  onDismiss: () => void
}) {
  const won = finish.kind === 'cashed_out'
  return (
    <section
      className={`panel p-10 text-center animate-slide-in ${
        won
          ? 'border-gold-200/60 bg-gradient-to-br from-amber-950/50 to-ink-900'
          : 'border-red-500/50 bg-gradient-to-br from-red-950/40 to-ink-900'
      }`}
    >
      <p className="text-sm uppercase tracking-wider text-neutral-200">
        {won ? 'Session cashed out' : 'Mine hit'}
      </p>
      <h2 className={`font-display text-5xl mt-2 ${won ? 'text-gold' : 'text-red-300'}`}>
        {won ? `+${fmt(finish.payout)} NUSDC` : '💥'}
      </h2>
      <p className="text-base text-neutral-200 mt-2 font-mono">
        Bet {fmt(finish.bet)} · {won ? 'Payout' : 'Lost'}{' '}
        {won ? fmt(finish.payout) : fmt(finish.bet)} NUSDC
      </p>
      <button onClick={onDismiss} className="btn-gold mt-6">
        Play again
      </button>
    </section>
  )
}
