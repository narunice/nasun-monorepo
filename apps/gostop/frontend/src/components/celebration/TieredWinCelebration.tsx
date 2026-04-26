/**
 * TieredWinCelebration
 *
 * Scratch / Lottery / Mines / Crash share this component. NumberMatch uses
 * SlamWinCelebration instead (different orchestration).
 *
 * Phase machine ported from pado scratchcard WinCelebration:
 *  normal:  enter -> confetti
 *  big:     enter -> flash -> counting -> confetti
 *  jackpot: enter -> blackout+typewriter -> counting -> confetti
 *
 * Jackpot adds two gostop-specific luxury accents:
 *  - gold-shimmer border (4s × 2 iterations, gated by !mobile && !reduced-motion)
 *  - jackpot-sweep light streak (1.2s, single pass)
 *  - JackpotShareButton (plain X intent, ~5 LOC)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { fireConfettiRain, isMobileViewport } from '../../lib/celebration'
import { playGameSound } from '../../lib/sounds'
import { formatNusdc } from '../../lib/format'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { JackpotShareButton } from './JackpotShareButton'
import {
  defaultTierLabel,
  tierTextColorClass,
  tierToColors,
  tierToSound,
} from './tier-style'
import type { CelebrationConfig } from './types'

interface Props {
  config: CelebrationConfig
  onComplete: () => void
}

// rAF-based number counter (ported from pado WinCelebration.useCountUp)
function useCountUp(target: bigint, durationMs: number, active: boolean): bigint {
  const [current, setCurrent] = useState<bigint>(0n)
  const startRef = useRef<number | null>(null)
  const targetNum = Number(target)

  useEffect(() => {
    if (!active || targetNum === 0) {
      setCurrent(target)
      return
    }
    startRef.current = null
    let rafId = 0
    const tick = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = Math.floor(eased * targetNum)
      setCurrent(BigInt(value))
      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        setCurrent(target)
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [target, targetNum, durationMs, active])

  return current
}

export function TieredWinCelebration({ config, onComplete }: Props) {
  const { tier, payout, multiplier, gameLabel, tierLabelOverride } = config
  const label = tierLabelOverride ?? defaultTierLabel(tier, multiplier)
  const colorClass = tierTextColorClass(tier)
  const reducedMotion = useReducedMotion()

  const [phase, setPhase] = useState<'enter' | 'counting' | 'confetti'>('enter')
  const [showFlash, setShowFlash] = useState(tier === 'big')
  const [showBlackout, setShowBlackout] = useState(tier === 'jackpot')
  const [typewriterIndex, setTypewriterIndex] = useState(0)

  // Counter active for big/jackpot during counting phase.
  const counterDuration = tier === 'jackpot' ? 1000 : 800
  const countedValue = useCountUp(payout, counterDuration, phase === 'counting')

  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const labelChars = label.split('')

  const startTypewriter = useCallback(() => {
    let i = 0
    typewriterRef.current = setInterval(() => {
      i += 1
      setTypewriterIndex(i)
      if (i >= labelChars.length) {
        if (typewriterRef.current) clearInterval(typewriterRef.current)
        typewriterRef.current = null
      }
    }, 80)
  }, [labelChars.length])

  // Tier-specific timing sequence
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const colors = [...tierToColors(tier)]
    const sound = tierToSound(tier)

    if (tier === 'normal') {
      timers.push(
        setTimeout(() => {
          setPhase('confetti')
          playGameSound(sound)
          fireConfettiRain('medium', colors)
        }, 400),
      )
      timers.push(setTimeout(onComplete, 4200))
    } else if (tier === 'big') {
      timers.push(setTimeout(() => setShowFlash(false), 150))
      timers.push(setTimeout(() => setPhase('counting'), 600))
      timers.push(
        setTimeout(() => {
          setPhase('confetti')
          playGameSound(sound)
          fireConfettiRain('medium', colors)
        }, 1400),
      )
      timers.push(setTimeout(onComplete, 5500))
    } else if (tier === 'jackpot') {
      timers.push(
        setTimeout(() => {
          setShowBlackout(false)
          startTypewriter()
        }, 500),
      )
      timers.push(setTimeout(() => setPhase('counting'), 1200))
      timers.push(
        setTimeout(() => {
          setPhase('confetti')
          playGameSound(sound)
          fireConfettiRain('large', colors)
        }, 2200),
      )
      timers.push(setTimeout(onComplete, 7500))
    }

    return () => {
      timers.forEach(clearTimeout)
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current)
        typewriterRef.current = null
      }
    }
  }, [tier, onComplete, startTypewriter])

  const enableLuxuryAccents = tier === 'jackpot' && !reducedMotion && !isMobileViewport()

  const renderHeading = () => {
    if (tier === 'jackpot') {
      return (
        <div className="mb-3">
          {typeof multiplier === 'number' && (
            <p className={`font-display text-7xl md:text-8xl ${colorClass} mb-3 leading-none drop-shadow-[0_0_24px_rgba(255,215,0,0.55)]`}>{multiplier}×</p>
          )}
          <p className={`font-display text-4xl md:text-5xl ${colorClass}`}>
            {labelChars.map((char, i) => (
              <span
                key={i}
                className={
                  i < typewriterIndex
                    ? 'animate-scratch-typewriter-char inline-block'
                    : 'invisible'
                }
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                {char}
              </span>
            ))}
          </p>
        </div>
      )
    }
    const animClass = tier === 'big' ? 'animate-scratch-slam' : 'animate-scratch-bounce'
    return (
      <div className="mb-3">
        {typeof multiplier === 'number' && (
          <p className={`font-display text-6xl md:text-7xl ${colorClass} ${animClass} leading-none drop-shadow-[0_0_18px_rgba(255,215,0,0.4)]`}>
            {multiplier}×
          </p>
        )}
        <p
          className={`font-display text-2xl md:text-3xl ${colorClass} animate-scratch-text-fade mt-3`}
          style={{ animationDelay: '0.3s', opacity: 0 }}
        >
          {label}
        </p>
      </div>
    )
  }

  const renderPrize = () => {
    const displayAmount =
      (tier === 'big' || tier === 'jackpot') && phase !== 'enter' ? countedValue : payout
    return (
      <p
        className="font-mono text-3xl md:text-4xl text-gold-100 animate-scratch-text-fade mt-3"
        style={{ animationDelay: tier === 'normal' ? '0.4s' : '0.6s', opacity: 0 }}
      >
        +{formatNusdc(displayAmount)} NUSDC
      </p>
    )
  }

  return (
    <div className="pointer-events-auto relative w-full max-w-xl">
      {/* Jackpot luxury sweep — single 1.2s pass */}
      {enableLuxuryAccents && (
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute inset-y-0 -inset-x-1/4 bg-gradient-to-r from-transparent via-gold-200/40 to-transparent animate-jackpot-sweep" />
        </div>
      )}

      <div
        className={`relative panel p-10 md:p-12 text-center overflow-hidden ${
          enableLuxuryAccents
            ? 'border-gold-200/70 shadow-gold-glow-lg bg-[linear-gradient(110deg,rgba(20,20,32,0.95),rgba(11,11,16,0.98),rgba(20,20,32,0.95))] bg-[length:200%_100%] animate-gold-shimmer'
            : ''
        }`}
      >
        {/* BIG tier: white flash overlay */}
        {tier === 'big' && showFlash && !reducedMotion && (
          <div className="absolute inset-0 bg-white/70 animate-scratch-flash z-10 pointer-events-none" />
        )}

        {/* JACKPOT: blackout + golden glow during typewriter intro */}
        {tier === 'jackpot' && showBlackout && !reducedMotion && (
          <div className="absolute inset-0 bg-black/85 z-10 flex items-center justify-center pointer-events-none">
            <div className="w-4 h-4 rounded-full bg-gold-300 animate-scratch-golden-glow" />
          </div>
        )}

        <p className="text-xs uppercase tracking-[0.3em] text-gold-400 mb-4">{gameLabel}</p>

        <div className={tier === 'big' && !reducedMotion ? 'animate-scratch-card-shake' : ''}>
          {renderHeading()}
          {renderPrize()}
        </div>

        {tier === 'jackpot' && (
          <div className="mt-5 flex items-center justify-center">
            <JackpotShareButton payout={payout} gameLabel={gameLabel} />
          </div>
        )}
      </div>
    </div>
  )
}
