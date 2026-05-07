import { useCallback } from 'react'
import type { CrashRoundState } from './crash-client'
import { useCrashWallet } from './hooks/useCrashWallet'
import { useCrashSocketState } from './hooks/useCrashSocketState'
import { useCrashTimer } from './hooks/useCrashTimer'
import { useCrashActions } from './hooks/useCrashActions'
import type { RecentRound, CashoutSettlement } from './hooks/useCrashSocketState'
import type { CrashPhase } from './hooks/useCrashActions'

export type { CrashPhase, RecentRound, CashoutSettlement }

export interface UseCrashResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  phase: CrashPhase
  roundState: CrashRoundState | null
  liveMultiplierBps: number
  recentRounds: RecentRound[]
  hasBetThisRound: boolean
  hasCashedOut: boolean
  myCashoutBps: number | null
  cashoutSettlement: CashoutSettlement | null
  isStale: boolean
  isWsLagged: boolean
  error: string | null
  placeBet: (betAmount: bigint) => Promise<boolean>
  cashOut: () => Promise<boolean>
  autoCashOutBps: number | null
  setAutoCashOutBps: (bps: number | null) => void
}

export function useCrash(): UseCrashResult {
  const {
    walletAddress,
    isWalletConnected,
  } = useCrashWallet()

  const {
    roundState,
    recentRounds,
    hasBetThisRound,
    setHasBetThisRound,
    myCashoutBps,
    setMyCashoutBps,
    cashoutSettlement,
    isWsLagged,
    serverSkewMsRef,
    flyingStartedAtRef,
    roundObjectIdRef,
    isConfirmedFlyingRef,
    tweenSignal,
    setTweenSignal,
  } = useCrashSocketState(walletAddress)

  const onTweenConsumed = useCallback(() => setTweenSignal(null), [setTweenSignal])

  const {
    liveMultiplierBps,
    isStale,
  } = useCrashTimer(
    serverSkewMsRef,
    flyingStartedAtRef,
    tweenSignal,
    onTweenConsumed
  )

  const {
    phase,
    error,
    placeBet,
    cashOut,
    autoCashOutBps,
    setAutoCashOutBps,
  } = useCrashActions(
    walletAddress,
    roundObjectIdRef,
    liveMultiplierBps,
    hasBetThisRound,
    setHasBetThisRound,
    myCashoutBps,
    setMyCashoutBps,
    roundState,
    isStale,
    isConfirmedFlyingRef,
  )

  return {
    walletAddress,
    isWalletConnected,
    phase,
    roundState,
    liveMultiplierBps,
    recentRounds,
    hasBetThisRound,
    hasCashedOut: myCashoutBps !== null,
    myCashoutBps,
    cashoutSettlement,
    isStale,
    isWsLagged,
    error,
    placeBet,
    cashOut,
    autoCashOutBps,
    setAutoCashOutBps,
  }
}
