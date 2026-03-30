import { useState, useEffect, useMemo } from 'react';

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
] as const;

// Session-level dedup to avoid showing the same text consecutively
const recentIndices = new Set<number>();

function pickRandomText(): (typeof LOSS_TEXTS)[number] {
  // Reset if pool is nearly exhausted
  if (recentIndices.size >= LOSS_TEXTS.length - 2) {
    recentIndices.clear();
  }

  let idx: number;
  do {
    idx = Math.floor(Math.random() * LOSS_TEXTS.length);
  } while (recentIndices.has(idx));

  recentIndices.add(idx);
  return LOSS_TEXTS[idx];
}

export { pickRandomText };

interface LossReactionProps {
  onComplete: () => void;
}

export function LossReaction({ onComplete }: LossReactionProps) {
  const picked = useMemo(pickRandomText, []);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    // Show text after shake animation (600ms)
    const textTimer = setTimeout(() => setShowText(true), 600);
    // Signal completion at 1000ms
    const completeTimer = setTimeout(onComplete, 1000);
    return () => {
      clearTimeout(textTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="text-center py-6 animate-scratch-drumroll">
      <div className="text-4xl mb-2">{picked.emoji}</div>
      {showText && (
        <p className="text-lg font-semibold text-theme-text-muted animate-scratch-text-fade">
          {picked.text}
        </p>
      )}
    </div>
  );
}
