import { useEffect, useRef, useState } from 'react'
import { multiplierAtBps } from '../crash-math'

export function useCrashTimer(
  serverSkewMsRef: React.MutableRefObject<number>,
  flyingStartedAtRef: React.MutableRefObject<number | null>,
  bettingEndsAtRef: React.MutableRefObject<number | null>,
  tweenSignal: { type: 'snap' | 'transition' | 'reset'; payload?: any } | null,
  onTweenConsumed: () => void
) {
  const [liveMultiplierBps, setLiveMultiplierBps] = useState(10_000)
  const liveMultiplierBpsRef = useRef(10_000)
  const rafRef = useRef<number | null>(null)
  
  const crashSnapRef = useRef<{ from: number; to: number; startedAt: number } | null>(null)
  const transitionTweenRef = useRef<{ from: number; startedAt: number; durationMs: number } | null>(null)

  const DISPLAY_LAG_MS = 250
  const CRASH_SNAP_MS = 250
  const ANCHOR_TRANSITION_MS = 400
  const DISPLAY_CAP_BPS = 26_650_000

  // Handle incoming tween signals
  useEffect(() => {
    if (!tweenSignal) return
    
    if (tweenSignal.type === 'reset') {
      crashSnapRef.current = null
      transitionTweenRef.current = null
      setLiveMultiplierBps(10_000)
      liveMultiplierBpsRef.current = 10_000
    } else if (tweenSignal.type === 'transition') {
      transitionTweenRef.current = {
        from: liveMultiplierBpsRef.current,
        startedAt: Date.now(),
        durationMs: ANCHOR_TRANSITION_MS,
      }
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
      let anchor: number | null = flyingStartedAtRef.current
      if (anchor === null) {
        const bea = bettingEndsAtRef.current
        const serverNow = Date.now() + serverSkewMsRef.current
        if (bea !== null && serverNow >= bea) {
          anchor = bea
        }
      }

      if (anchor !== null) {
        const elapsed = Date.now() + serverSkewMsRef.current - anchor - DISPLAY_LAG_MS
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
  }, [flyingStartedAtRef, bettingEndsAtRef, serverSkewMsRef])

  return {
    liveMultiplierBps,
    liveMultiplierBpsRef,
  }
}
