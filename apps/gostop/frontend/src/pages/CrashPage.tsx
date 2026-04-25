import { useEffect, useRef, useState } from 'react'
import { useCrash } from '../features/crash/useCrash'
import { formatMultiplier } from '../features/crash/crash-math'
import { CRASH_MIN_BET, CRASH_MAX_BET } from '../lib/gostop-config'
import { WalletConnect } from '@nasun/wallet-ui'
import {
  useCelebrate,
  tierForCrash,
  useForceTierDebug,
} from '../components/celebration'

const NUSDC_DECIMALS = 1_000_000n

function formatNusdc(raw: bigint): string {
  const whole = raw / NUSDC_DECIMALS
  const frac = raw % NUSDC_DECIMALS
  return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '') || '0'}`
}

export default function CrashPage() {
  const crash = useCrash()
  const celebrate = useCelebrate()
  useForceTierDebug('Crash')
  const [betInput, setBetInput] = useState('5')
  const [autoInput, setAutoInput] = useState('')
  // Track our own bet amount so we can compute payout when cashout lands.
  // useCrash does not currently expose myBetAmount; tracking here is the
  // smallest non-invasive change.
  const myBetRef = useRef<bigint>(0n)
  const celebratedCashoutRef = useRef<number | null>(null)

  const state = crash.roundState?.state ?? 'IDLE'
  const isBetting = state === 'BETTING'
  const isFlying = state === 'FLYING'
  // Disable bet 3s before betting window closes to avoid in-flight tx hitting FLYING.
  const bettingEndsAt = crash.roundState?.bettingEndsAt ?? null
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const bettingClosingSoon = bettingEndsAt !== null && bettingEndsAt - now < 3000

  // Reset bet tracking on a new round.
  useEffect(() => {
    if (!crash.hasBetThisRound) {
      myBetRef.current = 0n
      celebratedCashoutRef.current = null
    }
  }, [crash.hasBetThisRound, crash.roundState?.roundId])

  // Fire celebration on cashout transition.
  useEffect(() => {
    if (crash.myCashoutBps === null) return
    if (celebratedCashoutRef.current === crash.myCashoutBps) return
    if (myBetRef.current === 0n) return
    celebratedCashoutRef.current = crash.myCashoutBps
    const multiplier = crash.myCashoutBps / 10_000
    const payout = (myBetRef.current * BigInt(crash.myCashoutBps)) / 10_000n
    const tier = tierForCrash(multiplier, true)
    if (tier) {
      celebrate({
        variant: 'tiered',
        tier,
        payout,
        multiplier: Number(multiplier.toFixed(2)),
        gameLabel: 'Crash',
      })
    }
  }, [crash.myCashoutBps, celebrate])

  function handleBet() {
    const amount = BigInt(Math.round(parseFloat(betInput) * 1_000_000))
    myBetRef.current = amount
    crash.placeBet(amount)
  }

  const betFloat = parseFloat(betInput)
  const betAmountBig = Number.isFinite(betFloat) ? BigInt(Math.round(betFloat * 1_000_000)) : 0n
  const overMax = betAmountBig > CRASH_MAX_BET

  function handleCashOut() { crash.cashOut() }

  function handleAutoSet() {
    const v = parseFloat(autoInput)
    if (v > 1) crash.setAutoCashOutBps(Math.round(v * 10_000))
    else crash.setAutoCashOutBps(null)
  }

  function handleAutoClear() { crash.setAutoCashOutBps(null); setAutoInput('') }

  const multiplierColor =
    crash.liveMultiplierBps < 15_000 ? 'text-green-400' :
    crash.liveMultiplierBps < 25_000 ? 'text-yellow-300' :
    'text-orange-400'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Crash</h1>

      <CrashGraph
        state={state}
        liveMultiplierBps={crash.liveMultiplierBps}
        crashedCrashPoint={state === 'RESOLVED' || state === 'CRASHED' ? (crash.recentRounds[0]?.crashPointBps ?? null) : null}
      />

      <div className="text-center">
        {state === 'FLYING' ? (
          <span className={`text-5xl font-bold ${multiplierColor}`}>{formatMultiplier(crash.liveMultiplierBps)}</span>
        ) : state === 'CRASHED' || state === 'RESOLVED' ? (
          <span className="text-5xl font-bold text-red-400">
            {formatMultiplier(crash.recentRounds[0]?.crashPointBps ?? 10_000)}
          </span>
        ) : state === 'BETTING' ? (
          <span className="text-2xl text-gray-400">
            Accepting bets... {crash.roundState?.bettingEndsAt ? `${Math.max(0, Math.ceil((crash.roundState.bettingEndsAt - Date.now()) / 1000))}s` : ''}
          </span>
        ) : (
          <span className="text-2xl text-gray-500">Waiting for next round...</span>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl p-5 space-y-4">
        {!crash.isWalletConnected ? (
          <WalletConnect />
        ) : crash.hasCashedOut ? (
          <div className="text-center text-green-400 font-semibold py-4">
            Cashed out at {formatMultiplier(crash.myCashoutBps ?? 10_000)}
          </div>
        ) : crash.hasBetThisRound && isFlying ? (
          <div className="space-y-3">
            <button
              onClick={handleCashOut}
              disabled={crash.phase === 'cashing_out'}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg disabled:opacity-50"
            >
              {crash.phase === 'cashing_out' ? 'Cashing out...' : `Cash Out @ ${formatMultiplier(crash.liveMultiplierBps)}`}
            </button>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder="Auto cash-out (e.g. 2.00)"
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded text-sm"
                value={autoInput}
                onChange={(e) => setAutoInput(e.target.value)}
              />
              <button onClick={handleAutoSet} className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded">Set</button>
              {crash.autoCashOutBps && (
                <button onClick={handleAutoClear} className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded">Clear</button>
              )}
            </div>
            {crash.autoCashOutBps && (
              <p className="text-xs text-gray-400 text-center">Auto: {formatMultiplier(crash.autoCashOutBps)}</p>
            )}
          </div>
        ) : isBetting && !crash.hasBetThisRound ? (
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Bet amount (NUSDC)"
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded"
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
              />
              <span className="text-gray-400 text-sm">NUSDC</span>
            </div>
            <p className="text-xs text-gray-500">
              Min: {formatNusdc(CRASH_MIN_BET)} NUSDC · Max: {formatNusdc(CRASH_MAX_BET)} NUSDC
            </p>
            <button
              onClick={handleBet}
              disabled={crash.phase === 'placing_bet' || bettingClosingSoon || overMax}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {crash.phase === 'placing_bet'
                ? 'Placing bet...'
                : bettingClosingSoon
                ? 'Betting closing...'
                : overMax
                ? `Max ${formatNusdc(CRASH_MAX_BET)} NUSDC`
                : 'Place Bet'}
            </button>
          </div>
        ) : (
          <p className="text-center text-gray-400 py-4">
            {crash.hasBetThisRound ? 'Waiting for round to start flying...' : 'Next round starts soon'}
          </p>
        )}
        {crash.error && <p className="text-red-400 text-sm text-center">{crash.error}</p>}
      </div>

      <RoundHistory recentRounds={crash.recentRounds} />
    </div>
  )
}

function CrashGraph({
  state,
  liveMultiplierBps,
  crashedCrashPoint,
}: {
  state: string
  liveMultiplierBps: number
  crashedCrashPoint: number | null
}) {
  const W = 500
  const H = 200
  const PAD = 20

  // Single quadratic curve; visual only.
  const endBps = state === 'CRASHED' || state === 'RESOLVED' ? (crashedCrashPoint ?? liveMultiplierBps) : liveMultiplierBps
  const range = Math.max(endBps - 10_000, 1)
  const steps = 40
  const points: string[] = []
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps
    const x = PAD + frac * (W - PAD * 2)
    const y = H - PAD - frac * frac * (H - PAD * 2)
    points.push(`${x},${y}`)
  }
  void range

  const color = state === 'CRASHED' || state === 'RESOLVED' ? '#ef4444' : state === 'FLYING' ? '#22c55e' : '#6b7280'

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#374151" strokeWidth="1" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#374151" strokeWidth="1" />
      </svg>
    </div>
  )
}

function RoundHistory({ recentRounds }: { recentRounds: Array<{ roundId: number; crashPointBps: number }> }) {
  if (recentRounds.length === 0) return null
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h2 className="text-gray-400 text-sm mb-3 font-semibold">Recent Rounds</h2>
      <div className="flex flex-wrap gap-2">
        {recentRounds.map((r) => {
          const isHigh = r.crashPointBps >= 20_000
          const isMid = r.crashPointBps >= 15_000
          const bg = isHigh ? 'bg-green-700' : isMid ? 'bg-yellow-700' : 'bg-red-800'
          return (
            <span key={r.roundId} className={`${bg} text-white text-xs px-2 py-1 rounded font-mono`}>
              {formatMultiplier(r.crashPointBps)}
            </span>
          )
        })}
      </div>
    </div>
  )
}
