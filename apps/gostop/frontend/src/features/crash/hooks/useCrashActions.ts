import { useCallback, useEffect, useState } from 'react'
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
  roundState: any
) {
  const [localPhase, setLocalPhase] = useState<CrashPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [autoCashOutBps, setAutoCashOutBps] = useState<number | null>(null)

  const { executeGameTx, isPending } = useGameTransaction()

  const placeBet = useCallback(async (betAmount: bigint): Promise<boolean> => {
    if (!walletAddress || !roundObjectIdRef.current) return false
    if (betAmount < CRASH_MIN_BET) { setError('Minimum bet is 1 NUSDC'); return false }

    setError(null)
    setLocalPhase('placing_bet')

    const success = await executeGameTx(
      async (coins) => buildPlaceBetTx(roundObjectIdRef.current!, coins!.primary, betAmount),
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
    if (isPending || myCashoutBps !== null) return false
    
    setError(null)
    setLocalPhase('cashing_out')

    const success = await executeGameTx(
      async () => buildCashOutTx(objectId, currentBps),
      {
        skipBalanceCheck: true,
        awaitFullnode: false, // Ultra low latency for crash cashout
        onError: (err) => {
          if (isInputObjectDeletedError(err)) {
            setError('Round crashed before your cashout reached the chain. Bet lost this round, no further action needed.')
          } else {
            setError(err.message)
          }
        }
      }
    )

    if (success) setMyCashoutBps(currentBps)
    setLocalPhase('idle')
    return success
  }, [isPending, myCashoutBps, executeGameTx, setMyCashoutBps])

  const cashOut = useCallback(async (): Promise<boolean> => {
    if (!roundObjectIdRef.current) return false
    return doCashOut(roundObjectIdRef.current, liveMultiplierBps)
  }, [doCashOut, liveMultiplierBps, roundObjectIdRef])

  // Auto cash-out
  useEffect(() => {
    if (autoCashOutBps === null || !hasBetThisRound || myCashoutBps !== null) return
    if (!roundObjectIdRef.current) return
    if (roundState?.state !== 'FLYING') return
    if (liveMultiplierBps >= autoCashOutBps) {
      doCashOut(roundObjectIdRef.current, liveMultiplierBps)
    }
  }, [liveMultiplierBps, autoCashOutBps, hasBetThisRound, myCashoutBps, roundState?.state, doCashOut, roundObjectIdRef])

  return {
    phase: localPhase,
    error,
    placeBet,
    cashOut,
    autoCashOutBps,
    setAutoCashOutBps,
  }
}
