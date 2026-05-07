import { useEffect, useRef, useState } from 'react'
import { subscribeCrash } from '../crash-ws'
import { fetchCurrentRound } from '../crash-client'
import type { CrashRoundState } from '../crash-client'

export interface RecentRound {
  roundId: number
  crashPointBps: number
}

export interface CashoutSettlement {
  status: 'confirmed' | 'invalid'
  payout: bigint
  multiplierBps: number
}

// FLYING-only freeze threshold: server emits ~1Hz `tick` during FLYING. If the
// last received frame on this WS is older than this, we treat the snapshot as
// untrustworthy and disable the cashout button. Set above the 1s tick interval
// with margin for ordinary network jitter; below the perceptual "did anything
// happen?" threshold so users see the freeze before they click.
const WS_LAG_THRESHOLD_MS = 3000
const WS_LAG_CHECK_MS = 200

export function useCrashSocketState(walletAddress: string | undefined) {
  const [roundState, setRoundState] = useState<CrashRoundState | null>(null)
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([])
  const [hasBetThisRound, setHasBetThisRound] = useState(false)
  const [myCashoutBps, setMyCashoutBps] = useState<number | null>(null)
  const [cashoutSettlement, setCashoutSettlement] = useState<CashoutSettlement | null>(null)
  const [isWsLagged, setIsWsLagged] = useState(false)

  const walletAddressRef = useRef<string | undefined>(walletAddress)
  useEffect(() => { walletAddressRef.current = walletAddress }, [walletAddress])

  const stateVersionRef = useRef(0)
  const currentRoundIdRef = useRef<number | null>(null)
  const serverSkewMsRef = useRef(0)
  const flyingStartedAtRef = useRef<number | null>(null)
  const bettingEndsAtRef = useRef<number | null>(null)
  const roundObjectIdRef = useRef<string | null>(null)
  // Set false when betting_closed arrives (could be predicted — close_betting
  // not yet confirmed on-chain). Set true when flying_corrected or state_sync
  // FLYING arrives (close_betting has succeeded). Auto-cashout checks this to
  // avoid submitting cashout TXs against a round still in BETTING state.
  const isConfirmedFlyingRef = useRef(false)
  // Wall-clock receipt time of the last WS frame. Used by the lag watchdog
  // below to drive `isWsLagged` (and therefore the cashout button freeze).
  const lastWsMessageAtRef = useRef<number>(Date.now())

  // Tween control signals (will be consumed by useCrashTimer)
  const [tweenSignal, setTweenSignal] = useState<{
    type: 'snap' | 'transition' | 'reset'
    payload?: any
  } | null>(null)

  useEffect(() => {
    const unsub = subscribeCrash((event) => {
      // Refresh the lag watchdog on every frame, including ticks. Even ticks
      // we otherwise ignore prove the WS is delivering and the server is
      // running the FLYING loop on schedule. functional setter avoids stale
      // closure on isWsLagged.
      lastWsMessageAtRef.current = Date.now()
      setIsWsLagged(prev => prev ? false : prev)

      if ('serverTime' in event && typeof event.serverTime === 'number') {
        serverSkewMsRef.current = event.serverTime - Date.now()
      }
      if (event.type === 'tick') {
        // Liveness only — no state change. serverSkew already updated above.
        return
      }

      if (event.type === 'state_sync') {
        stateVersionRef.current = event.stateVersion
        const isFlying = event.state === 'FLYING'
        flyingStartedAtRef.current = isFlying ? (event.flyingStartedAt ?? null) : null
        bettingEndsAtRef.current = event.state === 'BETTING' ? (event.bettingEndsAt ?? null) : null
        // REST snapshot always reflects committed on-chain state — safe to confirm.
        isConfirmedFlyingRef.current = isFlying
        setTweenSignal({ type: 'reset' })
        
        roundObjectIdRef.current = event.roundObjectId ?? null
        const newRoundId = event.roundId
        if (currentRoundIdRef.current !== newRoundId) {
          currentRoundIdRef.current = newRoundId
          setHasBetThisRound(false)
          setMyCashoutBps(null)
          setCashoutSettlement(null)
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
        return
      }

      if ('stateVersion' in event && event.stateVersion > stateVersionRef.current + 1) {
        fetchCurrentRound().then((s) => {
          if (typeof s.serverTime === 'number') serverSkewMsRef.current = s.serverTime - Date.now()
          stateVersionRef.current = s.stateVersion
          const isFlying = s.state === 'FLYING'
          flyingStartedAtRef.current = isFlying ? (s.flyingStartedAt ?? null) : null
          bettingEndsAtRef.current = s.state === 'BETTING' ? (s.bettingEndsAt ?? null) : null
          isConfirmedFlyingRef.current = isFlying
          setTweenSignal({ type: 'reset' })
          roundObjectIdRef.current = s.roundObjectId ?? null
          if (currentRoundIdRef.current !== s.roundId) {
            currentRoundIdRef.current = s.roundId
            setHasBetThisRound(false)
            setMyCashoutBps(null)
            setCashoutSettlement(null)
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
        setCashoutSettlement(null)
        flyingStartedAtRef.current = null
        bettingEndsAtRef.current = event.bettingEndsAt
        isConfirmedFlyingRef.current = false
        setTweenSignal({ type: 'reset' })
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
        bettingEndsAtRef.current = null
        // Predicted broadcast: close_betting has NOT confirmed on-chain yet.
        // Auto-cashout must remain suppressed until flying_corrected arrives.
        isConfirmedFlyingRef.current = false
        setTweenSignal({ type: 'transition', payload: event.flyingStartedAt })
        setRoundState((prev) => prev ? { ...prev, state: 'FLYING', flyingStartedAt: event.flyingStartedAt, stateVersion: event.stateVersion } : prev)
      } else if (event.type === 'flying_corrected') {
        // close_betting confirmed on-chain. Safe to enable auto-cashout.
        flyingStartedAtRef.current = event.flyingStartedAt
        isConfirmedFlyingRef.current = true
        setTweenSignal({ type: 'transition', payload: event.flyingStartedAt })
        setRoundState((prev) => prev ? { ...prev, flyingStartedAt: event.flyingStartedAt, stateVersion: event.stateVersion } : prev)
      } else if (event.type === 'crashed') {
        flyingStartedAtRef.current = null
        bettingEndsAtRef.current = null
        setTweenSignal({ type: 'snap', payload: event.crashPointBps })
        setRoundState((prev) => prev ? { ...prev, state: 'CRASHED', crashedAlreadyFired: true, stateVersion: event.stateVersion } : prev)
      } else if (event.type === 'resolved') {
        setRecentRounds((prev) => [{ roundId: event.roundId, crashPointBps: event.crashPointBps }, ...prev.slice(0, 19)])
        setRoundState((prev) => prev ? { ...prev, state: 'RESOLVED', nextRoundAt: event.nextRoundAt, stateVersion: event.stateVersion } : prev)
      } else if (event.type === 'disabled') {
        // Server signaled the round loop is paused (boot-block, backoff, or
        // stale recovery). Stop animating and gate cash-out by clearing the
        // flying anchor and resetting tween. Frontend already shows
        // "Reconnecting…" via the timer's stale path, but explicit clearing
        // means we don't wait the 25s STALE_FLY_MS to surface it.
        flyingStartedAtRef.current = null
        bettingEndsAtRef.current = null
        setTweenSignal({ type: 'reset' })
        setRoundState((prev) => prev ? {
          ...prev,
          state: 'IDLE' as CrashRoundState['state'],
          flyingStartedAt: null,
          bettingEndsAt: null,
          stateVersion: event.stateVersion,
        } : prev)
      } else if (event.type === 'resolve_persisted') {
        if (event.roundId !== currentRoundIdRef.current) return
        const me = walletAddressRef.current
        if (!me) return
        const meLower = me.toLowerCase()
        const row = event.rows.find((r) => r.player.toLowerCase() === meLower)
        if (!row) return
        try {
          const payout = BigInt(row.payout)
          setCashoutSettlement({
            status: payout > 0n ? 'confirmed' : 'invalid',
            payout,
            multiplierBps: row.multiplierBps,
          })
        } catch (err) {
          console.error('[Crash] resolve_persisted payout parse failed', { row, err })
        }
      }
    })
    return unsub
  }, [])

  // Lag watchdog: only meaningful while FLYING (server tick is FLYING-only and
  // BETTING/IDLE legitimately have long quiet periods). Functional setters
  // avoid stale closures so the deps array stays empty and the interval
  // survives across React strict-mode remounts unchanged.
  useEffect(() => {
    const id = window.setInterval(() => {
      const flying = flyingStartedAtRef.current !== null
      if (!flying) {
        setIsWsLagged(prev => prev ? false : prev)
        return
      }
      const gap = Date.now() - lastWsMessageAtRef.current
      const should = gap > WS_LAG_THRESHOLD_MS
      setIsWsLagged(prev => prev === should ? prev : should)
    }, WS_LAG_CHECK_MS)
    return () => window.clearInterval(id)
  }, [])

  return {
    roundState,
    recentRounds,
    hasBetThisRound,
    setHasBetThisRound,
    myCashoutBps,
    setMyCashoutBps,
    cashoutSettlement,
    setCashoutSettlement,
    isWsLagged,
    serverSkewMsRef,
    flyingStartedAtRef,
    bettingEndsAtRef,
    roundObjectIdRef,
    currentRoundIdRef,
    lastWsMessageAtRef,
    isConfirmedFlyingRef,
    tweenSignal,
    setTweenSignal,
  }
}
