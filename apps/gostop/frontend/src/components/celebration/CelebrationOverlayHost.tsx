/**
 * CelebrationOverlayHost
 *
 * Subscribes only to celebration state context (state-side of the split
 * provider). Renders the active win celebration via portal. Triggers the
 * SoundOptInToast on first big/jackpot when sound is disabled.
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useCelebrationState } from './CelebrationProvider'
import { TieredWinCelebration } from './TieredWinCelebration'
import { SlamWinCelebration } from './SlamWinCelebration'
import { triggerSoundOptInPrompt } from './SoundOptInToast'

interface Props {
  onComplete: () => void
}

export function CelebrationOverlayHost({ onComplete }: Props) {
  const config = useCelebrationState()

  useEffect(() => {
    if (!config) return
    // Surface the sound opt-in prompt the first time a big/jackpot win happens
    // while sound is disabled. Idempotent.
    if (config.tier === 'big' || config.tier === 'jackpot') {
      triggerSoundOptInPrompt()
    }
  }, [config])

  if (!config) return null

  // Mount via portal so the celebration sits above modals (z-90) but below
  // canvas-confetti (z-80). We use a higher layer (z-90) for the overlay so
  // the share button is interactive.
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh] pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {config.variant === 'slam' ? (
        <SlamWinCelebration key={config.key} config={config} onComplete={onComplete} />
      ) : (
        <TieredWinCelebration key={config.key} config={config} onComplete={onComplete} />
      )}
    </div>,
    document.body,
  )
}
