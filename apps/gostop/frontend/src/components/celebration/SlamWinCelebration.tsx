/**
 * SlamWinCelebration — Number Match variant.
 * Ported from pado NumberMatchWinCelebration. Adapted to gostop gold/emerald
 * gradient palette.
 *
 * Sequence:
 *  flash (150ms) -> slam title + confetti rain + sound -> done (2.5s)
 *
 * If tier is 'jackpot' the bottom share button is rendered as well.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fireConfettiRain } from '../../lib/celebration'
import { playGameSound } from '../../lib/sounds'
import { formatNusdc } from '../../lib/format'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { JackpotShareButton } from './JackpotShareButton'
import { tierToColors, tierToSound } from './tier-style'
import type { CelebrationConfig } from './types'

interface Props {
  config: CelebrationConfig
  onComplete: () => void
}

export function SlamWinCelebration({ config, onComplete }: Props) {
  const { tier, payout, gameLabel } = config
  const [phase, setPhase] = useState<'flash' | 'celebrate' | 'done'>('flash')
  const reducedMotion = useReducedMotion()
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  })

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const colors = [...tierToColors(tier)]
    const sound = tierToSound(tier)

    timers.push(
      setTimeout(() => {
        setPhase('celebrate')
        playGameSound(sound)
        fireConfettiRain('large', colors)
      }, 150),
    )

    timers.push(
      setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true
          setPhase('done')
          onCompleteRef.current()
        }
      }, 5000),
    )

    return () => {
      timers.forEach(clearTimeout)
    }
    // tier is stable for the lifetime of the celebration (key remounts on new fire)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showFlash = phase === 'flash' && !reducedMotion
  const showCelebrate = phase === 'celebrate'

  return (
    <>
      {/* Full-screen flash via portal so it can cover dialogs */}
      {showFlash &&
        createPortal(
          <div
            className="fixed inset-0 bg-white/55 animate-nm-win-flash pointer-events-none"
            style={{ zIndex: 85 }}
            aria-hidden="true"
          />,
          document.body,
        )}

      {showCelebrate && (
        <div className="pointer-events-auto panel p-6 sm:p-10 md:p-12 text-center w-full max-w-xl">
          <p className="text-sm uppercase tracking-[0.35em] text-gold-400 mb-5">{gameLabel}</p>
          <div className="animate-nm-win-slam">
            <p className="font-display text-5xl sm:text-6xl md:text-7xl bg-gradient-to-r from-gold-200 via-gold-300 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(255,215,0,0.45)]">
              YOU WON!
            </p>
          </div>
          <p
            className="font-mono text-2xl sm:text-3xl md:text-4xl text-gold-100 mt-4 animate-scratch-text-fade"
            style={{ animationDelay: '0.3s', opacity: 0 }}
          >
            +{formatNusdc(payout)} NUSDC
          </p>
          <div className="mx-auto mt-4 w-32 h-1 rounded-full bg-gradient-to-r from-gold-200 via-gold-300 to-emerald-400 animate-nm-win-glow" />

          {tier === 'jackpot' && (
            <div className="mt-5 flex items-center justify-center">
              <JackpotShareButton payout={payout} gameLabel={gameLabel} />
            </div>
          )}
        </div>
      )}
    </>
  )
}
