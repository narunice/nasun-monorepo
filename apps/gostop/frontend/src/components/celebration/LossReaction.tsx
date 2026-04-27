/**
 * LossReaction — small "no luck" reaction (scratch only). Ported from pado
 * scratchcard LossReaction. Not gated by sound prefs (no audio).
 */

import { useEffect, useMemo, useState } from 'react'

const LOSS_TEXTS = [
  { emoji: '💨', text: 'Ooof.' },
  { emoji: '🎯', text: 'Almost! ...not really.' },
  { emoji: '⛓️', text: 'The blockchain gods said no.' },
  { emoji: '🎲', text: 'Try again, degen.' },
  { emoji: '⏳', text: 'Your luck is loading... 0%' },
  { emoji: '🎬', text: 'Plot twist: no plot twist.' },
  { emoji: '🧱', text: 'Better luck next block.' },
  { emoji: '🤖', text: 'RNG says: nah.' },
  { emoji: '🔍', text: 'So close! (we lied)' },
  { emoji: '🕳️', text: 'The void stares back.' },
  { emoji: '🍀', text: 'Have you tried being luckier?' },
  { emoji: '🚫', text: 'Error 404: Prize not found.' },
  { emoji: '💅', text: 'Scratch harder next time.' },
  { emoji: '🌉', text: 'Your prize is in another chain.' },
  { emoji: '💥', text: 'That was anticlimactic.' },
] as const

const recentIndices = new Set<number>()

function pickRandomText(): (typeof LOSS_TEXTS)[number] {
  if (recentIndices.size >= LOSS_TEXTS.length - 2) {
    recentIndices.clear()
  }
  let idx: number
  do {
    idx = Math.floor(Math.random() * LOSS_TEXTS.length)
  } while (recentIndices.has(idx))
  recentIndices.add(idx)
  return LOSS_TEXTS[idx]
}

interface LossReactionProps {
  onComplete?: () => void
}

export function LossReaction({ onComplete }: LossReactionProps) {
  const picked = useMemo(pickRandomText, [])
  const [showText, setShowText] = useState(false)

  useEffect(() => {
    const textTimer = setTimeout(() => setShowText(true), 600)
    const completeTimer = setTimeout(() => onComplete?.(), 6000)
    return () => {
      clearTimeout(textTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  return (
    <div className="relative text-center py-10 px-8 animate-scratch-drumroll">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.18),transparent_60%)] pointer-events-none" />
      <div className="relative text-7xl md:text-8xl mb-4 drop-shadow-[0_0_18px_rgba(220,38,38,0.45)] animate-scratch-card-shake">
        {picked.emoji}
      </div>
      {showText && (
        <p className="relative text-xl md:text-2xl font-bold uppercase tracking-[0.15em] text-red-300/90 animate-scratch-text-fade">
          {picked.text}
        </p>
      )}
    </div>
  )
}
