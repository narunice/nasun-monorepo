import { useCallback, useEffect, useRef, useState } from 'react'
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet'
import type { Transaction } from '@mysten/sui/transactions'
import { getSuiClient } from '../../lib/sui-client'
import { NUSDC_TYPE, CRASH_MIN_BET } from '../../lib/gostop-config'
import { multiplierAtBps } from './crash-math'
import { subscribeCrash } from './crash-ws'
import { fetchCurrentRound } from './crash-client'
import type { CrashRoundState } from './crash-client'
import { buildPlaceBetTx, buildCashOutTx } from './transactions'
import { withStaleObjectRetry } from '../../lib/sui-retry'

export type CrashPhase = 'idle' | 'placing_bet' | 'cashing_out'

export interface RecentRound {
  roundId: number
  crashPointBps: number
}

// Phase 1 scope: track only the local player's bet/cashout state.
// Multiplayer participants UI deferred to Phase 2 (requires on-chain event subscription).
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
  error: string | null
  placeBet: (betAmount: bigint) => Promise<boolean>
  cashOut: () => Promise<boolean>
  autoCashOutBps: number | null
  setAutoCashOutBps: (bps: number | null) => void
}

export function useCrash(): UseCrashResult {
  const { account, status, getKeypair } = useWallet()
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSign } = useZkLogin()
  const passkeyKeypair = usePasskeyStore((s) => s.keypair)
  const passkeyAddress = usePasskeyStore((s) => s.address)
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked)

  const isLocalActive = status === 'unlocked' && !!account?.address
  type WalletKind = 'zk' | 'local' | 'passkey'
  let kind: WalletKind | null = null
  let walletAddress: string | undefined
  if (isZkLoggedIn && zkState?.address) { kind = 'zk'; walletAddress = zkState.address }
  else if (isLocalActive) { kind = 'local'; walletAddress = account?.address }
  else if (isPasskeyUnlocked && passkeyAddress) { kind = 'passkey'; walletAddress = passkeyAddress }

  const [phase, setPhase] = useState<CrashPhase>('idle')
  const [roundState, setRoundState] = useState<CrashRoundState | null>(null)
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([])
  const [liveMultiplierBps, setLiveMultiplierBps] = useState(10_000)
  const [error, setError] = useState<string | null>(null)
  const [autoCashOutBps, setAutoCashOutBps] = useState<number | null>(null)
  const [hasBetThisRound, setHasBetThisRound] = useState(false)
  const [myCashoutBps, setMyCashoutBps] = useState<number | null>(null)

  const flyingStartedAtRef = useRef<number | null>(null)
  const stateVersionRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const cashOutInflightRef = useRef(false)
  const roundObjectIdRef = useRef<string | null>(null)
  const currentRoundIdRef = useRef<number | null>(null)
  // serverTime - clientNow at last WS sync. Added to Date.now() to estimate
  // server-side wall clock, used to keep liveMultiplierBps within the 3%
  // on-chain tolerance even when the client clock is skewed.
  const serverSkewMsRef = useRef(0)
  // Last computed live multiplier, mirrored from setLiveMultiplierBps so the
  // crashed handler can capture the overshoot value without depending on
  // closure-stale React state.
  const liveMultiplierBpsRef = useRef(10_000)
  // Active crash-snap tween: eases the displayed multiplier from the latency-
  // induced overshoot down to the true crashPointBps after the 'crashed' event.
  const crashSnapRef = useRef<{ from: number; to: number; startedAt: number } | null>(null)

  // The displayed multiplier lags real elapsed time by this much so the value
  // shown is the same value submitted on cash_out (WYSIWYG). Absorbs residual
  // client/server clock skew and Sui clock granularity so the on-chain check
  // mult_bps <= base * 1.03 always passes.
  const DISPLAY_LAG_MS = 250
  const CRASH_SNAP_MS = 250

  const hasCashedOut = myCashoutBps !== null

  // rAF loop: drives live multiplier during FLYING and the snap-down tween
  // after CRASHED so the displayed value resolves to the on-chain truth
  // without the jarring overshoot caused by WS latency.
  useEffect(() => {
    function setLive(value: number) {
      liveMultiplierBpsRef.current = value
      setLiveMultiplierBps(value)
    }
    function tick() {
      if (flyingStartedAtRef.current !== null) {
        const elapsed = Date.now() + serverSkewMsRef.current - flyingStartedAtRef.current - DISPLAY_LAG_MS
        setLive(elapsed > 0 ? multiplierAtBps(elapsed) : 10_000)
      } else if (crashSnapRef.current) {
        const { from, to, startedAt } = crashSnapRef.current
        const t = Math.min(1, (Date.now() - startedAt) / CRASH_SNAP_MS)
        const eased = t * (2 - t) // ease-out quad
        setLive(Math.round(from + (to - from) * eased))
        if (t >= 1) crashSnapRef.current = null
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [])

  // WS event handler
  useEffect(() => {
    const unsub = subscribeCrash((event) => {
      if ('serverTime' in event && typeof event.serverTime === 'number') {
        serverSkewMsRef.current = event.serverTime - Date.now()
      }
      if (event.type === 'state_sync') {
        stateVersionRef.current = event.stateVersion
        flyingStartedAtRef.current = event.flyingStartedAt ?? null
        roundObjectIdRef.current = event.roundObjectId ?? null
        const newRoundId = event.roundId
        if (currentRoundIdRef.current !== newRoundId) {
          currentRoundIdRef.current = newRoundId
          setHasBetThisRound(false)
          setMyCashoutBps(null)
          cashOutInflightRef.current = false
        }
        setRecentRounds(event.recentRounds)
        setRoundState({
          stateVersion: event.stateVersion,
          serverTime: event.serverTime,
          roundId: event.roundId,
          roundObjectId: event.roundObjectId,
          state: event.state as CrashRoundState['state'],
          commitHash: event.commitHash,
          bettingEndsAt: event.bettingEndsAt,
          flyingStartedAt: event.flyingStartedAt,
          nextRoundAt: event.nextRoundAt ?? null,
          recentRounds: event.recentRounds,
          crashedAlreadyFired: event.crashedAlreadyFired,
        })
        if (!event.flyingStartedAt) setLiveMultiplierBps(10_000)
        return
      }

      // Resync on stateVersion gap
      if ('stateVersion' in event && event.stateVersion > stateVersionRef.current + 5) {
        fetchCurrentRound().then((s) => {
          if (typeof s.serverTime === 'number') {
            serverSkewMsRef.current = s.serverTime - Date.now()
          }
          stateVersionRef.current = s.stateVersion
          flyingStartedAtRef.current = s.flyingStartedAt ?? null
          roundObjectIdRef.current = s.roundObjectId ?? null
          if (currentRoundIdRef.current !== s.roundId) {
            currentRoundIdRef.current = s.roundId
            setHasBetThisRound(false)
            setMyCashoutBps(null)
            cashOutInflightRef.current = false
          }
          setRecentRounds(s.recentRounds)
          setRoundState(s)
        }).catch(() => {})
        return
      }
      if ('stateVersion' in event) stateVersionRef.current = event.stateVersion

      if (event.type === 'round_started') {
        roundObjectIdRef.current = event.roundObjectId
        currentRoundIdRef.current = event.roundId
        setHasBetThisRound(false)
        setMyCashoutBps(null)
        cashOutInflightRef.current = false
        setLiveMultiplierBps(10_000)
        flyingStartedAtRef.current = null
        setRoundState((prev) => ({
          ...(prev ?? {} as CrashRoundState),
          state: 'BETTING',
          roundId: event.roundId,
          roundObjectId: event.roundObjectId,
          commitHash: event.commitHash,
          bettingEndsAt: event.bettingEndsAt,
          flyingStartedAt: null,
          nextRoundAt: null,
          crashedAlreadyFired: false,
          stateVersion: event.stateVersion,
          serverTime: event.serverTime,
        }))
      } else if (event.type === 'betting_closed') {
        flyingStartedAtRef.current = event.flyingStartedAt
        setRoundState((prev) => prev ? { ...prev, state: 'FLYING', flyingStartedAt: event.flyingStartedAt, stateVersion: event.stateVersion } : prev)
      } else if (event.type === 'crashed') {
        // Stop the FLYING rAF branch and start a snap-down tween from the
        // current overshoot value to the authoritative crashPointBps. Without
        // this the display would freeze above the true crash point until the
        // 'resolved' event arrives, then jump abruptly downward.
        flyingStartedAtRef.current = null
        crashSnapRef.current = {
          from: liveMultiplierBpsRef.current,
          to: event.crashPointBps,
          startedAt: Date.now(),
        }
        setRoundState((prev) => prev ? { ...prev, state: 'CRASHED', crashedAlreadyFired: true, stateVersion: event.stateVersion } : prev)
      } else if (event.type === 'resolved') {
        setRecentRounds((prev) => [{ roundId: event.roundId, crashPointBps: event.crashPointBps }, ...prev.slice(0, 19)])
        setRoundState((prev) => prev ? { ...prev, state: 'RESOLVED', nextRoundAt: event.nextRoundAt, stateVersion: event.stateVersion } : prev)
        setLiveMultiplierBps(10_000)
      }
    })
    return unsub
  }, [])

  const execTx = useCallback(async (tx: Transaction): Promise<string> => {
    if (!walletAddress) throw new Error('Wallet not connected')
    const client = getSuiClient()
    tx.setSender(walletAddress)
    const bytes = await tx.build({ client })
    let signature: string
    if (kind === 'zk') signature = await zkSign(bytes)
    else if (kind === 'local') {
      const kp = getKeypair()
      if (!kp) throw new Error('Local keypair unavailable')
      signature = (await kp.signTransaction(bytes)).signature
    } else if (kind === 'passkey') {
      if (!passkeyKeypair) throw new Error('Passkey keypair unavailable')
      signature = (await passkeyKeypair.signTransaction(bytes)).signature
    } else {
      throw new Error('No active wallet to sign with')
    }
    const result = await client.executeTransactionBlock({
      transactionBlock: bytes,
      signature,
      options: { showEffects: true },
    })
    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error ?? 'Transaction failed')
    }
    await client.waitForTransaction({ digest: result.digest })
    return result.digest
  }, [walletAddress, kind, zkSign, getKeypair, passkeyKeypair])

  const placeBet = useCallback(async (betAmount: bigint): Promise<boolean> => {
    if (!walletAddress || !roundObjectIdRef.current) return false
    if (betAmount < CRASH_MIN_BET) { setError('Minimum bet is 1 NUSDC'); return false }
    setError(null)
    setPhase('placing_bet')
    try {
      await withStaleObjectRetry(async () => {
        const client = getSuiClient()
        const coins = await client.getCoins({ owner: walletAddress, coinType: NUSDC_TYPE })
        const enough = coins.data.find((c) => BigInt(c.balance) >= betAmount)
        if (!enough) throw new Error('Insufficient NUSDC balance')
        const roundId = roundObjectIdRef.current
        if (!roundId) throw new Error('Round unavailable')
        const tx = buildPlaceBetTx(roundId, enough.coinObjectId, betAmount)
        await execTx(tx)
      })
      setHasBetThisRound(true)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setPhase('idle')
    }
  }, [walletAddress, execTx])

  const doCashOut = useCallback(async (objectId: string, currentBps: number): Promise<boolean> => {
    if (cashOutInflightRef.current || myCashoutBps !== null) return false
    cashOutInflightRef.current = true
    setPhase('cashing_out')
    try {
      const tx = buildCashOutTx(objectId, currentBps)
      await execTx(tx)
      setMyCashoutBps(currentBps)
      return true
    } catch (e) {
      cashOutInflightRef.current = false
      setError((e as Error).message)
      return false
    } finally {
      setPhase('idle')
    }
  }, [execTx, myCashoutBps])

  const cashOut = useCallback(async (): Promise<boolean> => {
    if (!roundObjectIdRef.current) return false
    return doCashOut(roundObjectIdRef.current, liveMultiplierBps)
  }, [doCashOut, liveMultiplierBps])

  // Auto cash-out
  useEffect(() => {
    if (autoCashOutBps === null || !hasBetThisRound || hasCashedOut) return
    if (!roundObjectIdRef.current) return
    if (roundState?.state !== 'FLYING') return
    if (liveMultiplierBps >= autoCashOutBps) {
      doCashOut(roundObjectIdRef.current, liveMultiplierBps)
    }
  }, [liveMultiplierBps, autoCashOutBps, hasBetThisRound, hasCashedOut, roundState?.state, doCashOut])

  return {
    walletAddress,
    isWalletConnected: !!walletAddress,
    phase,
    roundState,
    liveMultiplierBps,
    recentRounds,
    hasBetThisRound,
    hasCashedOut,
    myCashoutBps,
    error,
    placeBet,
    cashOut,
    autoCashOutBps,
    setAutoCashOutBps,
  }
}
