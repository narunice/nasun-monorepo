import { useCallback, useEffect, useRef, useState } from 'react'
import { CRASH_MIN_BET } from '../../../lib/gostop-config'
import { buildPlaceBetTx, buildCashOutTx } from '../transactions'
import { isInputObjectDeletedError } from '../../../lib/sui-retry'
import { useGameTransaction } from '../../../hooks/useGameTransaction'

export type CrashPhase = 'idle' | 'placing_bet' | 'cashing_out'

export function useCrashActions(
  walletAddress: string | undefined,
  roundObjectIdRef: React.MutableRefObject<string | null>,
  liveMultiplierBps: number,
  hasBetThisRound: boolean,
  setHasBetThisRound: (v: boolean) => void,
  myCashoutBps: number | null,
  setMyCashoutBps: (v: number | null) => void,
  roundState: any,
  isStale: boolean,
  isConfirmedFlyingRef: React.MutableRefObject<boolean>,
) {
  const [localPhase, setLocalPhase] = useState<CrashPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [autoCashOutBps, setAutoCashOutBps] = useState<number | null>(null)

  const { executeGameTx, isPending } = useGameTransaction()

  // Synchronous mutex: prevents duplicate cashout TX submissions when the
  // auto cash-out effect fires every RAF frame (60fps) while isPending
  // React state hasn't propagated yet. A ref updates synchronously unlike
  // state, so the guard takes effect on the very next call in the same frame.
  const cashoutInFlightRef = useRef(false)

  // Reset mutex when a new round starts (myCashoutBps goes null → null on
  // round_started reset, and non-null on successful cashout).
  useEffect(() => {
    if (myCashoutBps === null) cashoutInFlightRef.current = false
  }, [myCashoutBps])

  const placeBet = useCallback(async (betAmount: bigint): Promise<boolean> => {
    if (!walletAddress || !roundObjectIdRef.current) return false
    if (betAmount < CRASH_MIN_BET) { setError('Minimum bet is 1 NUSDC'); return false }

    setError(null)
    setLocalPhase('placing_bet')

    const success = await executeGameTx(
      async (coins) => buildPlaceBetTx(roundObjectIdRef.current!, coins!.primary, betAmount, coins!.extra),
      {
        amount: betAmount,
        onError: (err) => {
          if (isInputObjectDeletedError(err)) {
            setError('Round ended before your bet landed. Your NUSDC was not charged. Wait a few seconds and try the next round.')
          } else {
            setError(err.message)
          }
        }
      }
    )

    if (success) setHasBetThisRound(true)
    setLocalPhase('idle')
    return success
  }, [walletAddress, roundObjectIdRef, executeGameTx, setHasBetThisRound])

  const doCashOut = useCallback(async (objectId: string, currentBps: number): Promise<boolean> => {
    // cashoutInFlightRef checked first (synchronous) to block duplicate calls
    // within the same React render cycle before isPending state propagates.
    if (cashoutInFlightRef.current || isPending || myCashoutBps !== null) return false
    cashoutInFlightRef.current = true

    setError(null)
    setLocalPhase('cashing_out')

    const success = await executeGameTx(
      async () => buildCashOutTx(objectId, currentBps),
      {
        skipBalanceCheck: true,
        awaitFullnode: false,
        onError: (err) => {
          cashoutInFlightRef.current = false
          if (isInputObjectDeletedError(err)) {
            // Round ended on-chain before TX landed. No user action needed.
            // Suppress the error — resolve_persisted will show the final result.
          } else {
            setError(err.message)
          }
        }
      }
    )

    if (success) {
      setMyCashoutBps(currentBps)
    } else {
      // TX failed and onError already ran, but reset ref in case onError
      // wasn't called (e.g. wallet rejection).
      cashoutInFlightRef.current = false
    }
    setLocalPhase('idle')
    return success
  }, [isPending, myCashoutBps, executeGameTx, setMyCashoutBps])

  const cashOut = useCallback(async (): Promise<boolean> => {
    if (!roundObjectIdRef.current) return false
    return doCashOut(roundObjectIdRef.current, liveMultiplierBps)
  }, [doCashOut, liveMultiplierBps, roundObjectIdRef])

  // Auto cash-out: fires DISPLAY_LAG_BPS early so the TX lands before
  // crash_deadline. The displayed multiplier lags ~250ms behind on-chain
  // (DISPLAY_LAG_MS). Firing early means the TX is submitted while the
  // chain is still below crash_point_bps. Always claims autoCashOutBps
  // (the target), not liveMultiplierBps, so payout is exactly as configured.
  // 500 bps ≈ 250-300ms of multiplier growth at 2-3x.
  const DISPLAY_LAG_BPS = 500
  useEffect(() => {
    if (autoCashOutBps === null || !hasBetThisRound || myCashoutBps !== null) return
    if (!roundObjectIdRef.current) return
    if (roundState?.state === 'CRASHED' || roundState?.state === 'RESOLVED') return
    if (liveMultiplierBps <= 10_000) return
    if (isStale) return
    // Guard: suppress auto-cashout during the predicted window (between
    // betting_closed and flying_corrected). The round may still be in BETTING
    // state on-chain; a cashout TX submitted here will fail with a Move abort.
    // flying_corrected sets isConfirmedFlyingRef.current = true.
    if (!isConfirmedFlyingRef.current) return
    if (liveMultiplierBps >= autoCashOutBps - DISPLAY_LAG_BPS) {
      doCashOut(roundObjectIdRef.current, autoCashOutBps)
    }
  }, [liveMultiplierBps, autoCashOutBps, hasBetThisRound, myCashoutBps, roundState?.state, isStale, isConfirmedFlyingRef, doCashOut, roundObjectIdRef])

  return {
    phase: localPhase,
    error,
    placeBet,
    cashOut,
    autoCashOutBps,
    setAutoCashOutBps,
  }
}
