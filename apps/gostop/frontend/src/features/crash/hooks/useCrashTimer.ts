import { useEffect, useRef, useState } from 'react'
import { multiplierAtBps } from '../crash-math'

export function useCrashTimer(
  serverSkewMsRef: React.MutableRefObject<number>,
  flyingStartedAtRef: React.MutableRefObject<number | null>,
  tweenSignal: { type: 'snap' | 'transition' | 'reset'; payload?: any } | null,
  onTweenConsumed: () => void
) {
  const [liveMultiplierBps, setLiveMultiplierBps] = useState(10_000)
  const liveMultiplierBpsRef = useRef(10_000)
  // Stale-mode flag: true when the server stopped emitting round events (crash-child
  // died mid-FLYING) and the rocket has been climbing for longer than any real
  // round. Crash math caps near 24.7s; we add a small margin. Resets to false on
  // every transition signal (round_started/betting_closed/flying_corrected).
  const [isStale, setIsStale] = useState(false)
  const rafRef = useRef<number | null>(null)

  const crashSnapRef = useRef<{ from: number; to: number; startedAt: number } | null>(null)
  const transitionTweenRef = useRef<{ from: number; startedAt: number; durationMs: number } | null>(null)

  const DISPLAY_LAG_MS = 250
  const CRASH_SNAP_MS = 250
  const ANCHOR_TRANSITION_MS = 400
  const DISPLAY_CAP_BPS = 2_000_000
  // Anchor age beyond which we consider the server snapshot stale. Real rounds
  // crash well before 25s; if `crashed`/`resolved` never arrives, the server
  // child died and we must not keep animating a fake multiplier.
  const STALE_FLY_MS = 25_000

  // Handle incoming tween signals
  useEffect(() => {
    if (!tweenSignal) return
    
    if (tweenSignal.type === 'reset') {
      crashSnapRef.current = null
      transitionTweenRef.current = null
      setLiveMultiplierBps(10_000)
      liveMultiplierBpsRef.current = 10_000
      setIsStale(false)
    } else if (tweenSignal.type === 'transition') {
      transitionTweenRef.current = {
        from: liveMultiplierBpsRef.current,
        startedAt: Date.now(),
        durationMs: ANCHOR_TRANSITION_MS,
      }
      setIsStale(false)
    } else if (tweenSignal.type === 'snap') {
      crashSnapRef.current = {
        from: liveMultiplierBpsRef.current,
        to: tweenSignal.payload,
        startedAt: Date.now(),
      }
    }
    
    onTweenConsumed()
  }, [tweenSignal, onTweenConsumed])

  useEffect(() => {
    function setLive(value: number) {
      liveMultiplierBpsRef.current = value
      setLiveMultiplierBps(value)
    }

    function tick() {
      // Anchor strictly to the on-chain flyingStartedAt. Falling back to
      // bettingEndsAt while waiting for the betting_closed WS event made the
      // displayed multiplier race ahead by up to ~2.4s on devnet (RPC +
      // consensus delay between bettingEndsAt and the on-chain Sui clock at
      // close_betting execution). That gap let the rocket overshoot to ~3x
      // while a low crash (1.8x) had already happened on the server, and the
      // cashout button never enabled because state stayed BETTING.
      const anchor = flyingStartedAtRef.current

      if (anchor !== null) {
        const elapsed = Date.now() + serverSkewMsRef.current - anchor - DISPLAY_LAG_MS
        // STALE-SNAPSHOT detection: if the FLYING anchor has aged past STALE_FLY_MS
        // without a `crashed`/`resolved`/`flying_corrected` transition signal, the
        // server child died mid-round and the parent snapshot is stuck. Stop the
        // animation and surface the state to consumers via `isStale`.
        if (elapsed > STALE_FLY_MS) {
          if (!isStale) setIsStale(true)
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        const rawMult = elapsed > 0 ? multiplierAtBps(elapsed) : 10_000
        const trueMult = rawMult > DISPLAY_CAP_BPS ? DISPLAY_CAP_BPS : rawMult

        if (transitionTweenRef.current) {
          const { from, startedAt, durationMs } = transitionTweenRef.current
          const t = Math.min(1, (Date.now() - startedAt) / durationMs)
          const eased = t * (2 - t)
          const tweened = Math.round(from + (trueMult - from) * eased)
          setLive(tweened)
          if (t >= 1) transitionTweenRef.current = null
        } else {
          setLive(trueMult)
        }
      } else if (crashSnapRef.current) {
        const { from, to, startedAt } = crashSnapRef.current
        const t = Math.min(1, (Date.now() - startedAt) / CRASH_SNAP_MS)
        const eased = t * (2 - t)
        setLive(Math.round(from + (to - from) * eased))
        if (t >= 1) crashSnapRef.current = null
      }
      
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [flyingStartedAtRef, serverSkewMsRef])

  return {
    liveMultiplierBps,
    liveMultiplierBpsRef,
    isStale,
  }
}
