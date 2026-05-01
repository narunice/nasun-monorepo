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

export function useCrashSocketState(walletAddress: string | undefined) {
  const [roundState, setRoundState] = useState<CrashRoundState | null>(null)
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([])
  const [hasBetThisRound, setHasBetThisRound] = useState(false)
  const [myCashoutBps, setMyCashoutBps] = useState<number | null>(null)
  const [cashoutSettlement, setCashoutSettlement] = useState<CashoutSettlement | null>(null)
  
  const walletAddressRef = useRef<string | undefined>(walletAddress)
  useEffect(() => { walletAddressRef.current = walletAddress }, [walletAddress])

  const stateVersionRef = useRef(0)
  const currentRoundIdRef = useRef<number | null>(null)
  const serverSkewMsRef = useRef(0)
  const flyingStartedAtRef = useRef<number | null>(null)
  const bettingEndsAtRef = useRef<number | null>(null)
  const roundObjectIdRef = useRef<string | null>(null)
  
  // Tween control signals (will be consumed by useCrashTimer)
  const [tweenSignal, setTweenSignal] = useState<{
    type: 'snap' | 'transition' | 'reset'
    payload?: any
  } | null>(null)

  useEffect(() => {
    const unsub = subscribeCrash((event) => {
      if ('serverTime' in event && typeof event.serverTime === 'number') {
        serverSkewMsRef.current = event.serverTime - Date.now()
      }

      if (event.type === 'state_sync') {
        stateVersionRef.current = event.stateVersion
        const isFlying = event.state === 'FLYING'
        flyingStartedAtRef.current = isFlying ? (event.flyingStartedAt ?? null) : null
        bettingEndsAtRef.current = event.state === 'BETTING' ? (event.bettingEndsAt ?? null) : null
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

      if ('stateVersion' in event && event.stateVersion > stateVersionRef.current + 5) {
        fetchCurrentRound().then((s) => {
          if (typeof s.serverTime === 'number') serverSkewMsRef.current = s.serverTime - Date.now()
          stateVersionRef.current = s.stateVersion
          const isFlying = s.state === 'FLYING'
          flyingStartedAtRef.current = isFlying ? (s.flyingStartedAt ?? null) : null
          bettingEndsAtRef.current = s.state === 'BETTING' ? (s.bettingEndsAt ?? null) : null
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
        setTweenSignal({ type: 'transition', payload: event.flyingStartedAt })
        setRoundState((prev) => prev ? { ...prev, state: 'FLYING', flyingStartedAt: event.flyingStartedAt, stateVersion: event.stateVersion } : prev)
      } else if (event.type === 'crashed') {
        flyingStartedAtRef.current = null
        bettingEndsAtRef.current = null
        setTweenSignal({ type: 'snap', payload: event.crashPointBps })
        setRoundState((prev) => prev ? { ...prev, state: 'CRASHED', crashedAlreadyFired: true, stateVersion: event.stateVersion } : prev)
      } else if (event.type === 'resolved') {
        setRecentRounds((prev) => [{ roundId: event.roundId, crashPointBps: event.crashPointBps }, ...prev.slice(0, 19)])
        setRoundState((prev) => prev ? { ...prev, state: 'RESOLVED', nextRoundAt: event.nextRoundAt, stateVersion: event.stateVersion } : prev)
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

  return {
    roundState,
    recentRounds,
    hasBetThisRound,
    setHasBetThisRound,
    myCashoutBps,
    setMyCashoutBps,
    cashoutSettlement,
    setCashoutSettlement,
    serverSkewMsRef,
    flyingStartedAtRef,
    bettingEndsAtRef,
    roundObjectIdRef,
    currentRoundIdRef,
    tweenSignal,
    setTweenSignal,
  }
}
