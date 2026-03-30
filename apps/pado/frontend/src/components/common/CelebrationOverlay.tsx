/**
 * CelebrationOverlay
 *
 * Full-screen confetti overlay rendered via React Portal to escape
 * overflow-hidden containers. Uses canvas-confetti for physics-based
 * particle effects.
 *
 * pointer-events: none, z-[80] - sits above modals (z-50) but below
 * FirstTradeCelebration (z-[100]).
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fireCelebration, type CelebrationPreset } from '../../lib/celebration';

interface CelebrationOverlayProps {
  /** Celebration size preset */
  preset: CelebrationPreset;
  /** Fire when this transitions to true */
  trigger: boolean;
  /** Optional color override */
  colors?: string[];
  /** Called when the confetti animation finishes */
  onComplete?: () => void;
}

export function CelebrationOverlay({
  preset,
  trigger,
  colors,
  onComplete,
}: CelebrationOverlayProps) {
  const prevTrigger = useRef(false);

  useEffect(() => {
    // Fire only on false -> true transition
    if (trigger && !prevTrigger.current) {
      fireCelebration(preset, colors)
        .then(() => { onComplete?.(); })
        .catch(() => { /* graceful: confetti failure should not affect UX */ });
    }
    prevTrigger.current = trigger;
  }, [trigger, preset, colors, onComplete]);

  // Portal is invisible (canvas-confetti manages its own canvas on document.body).
  // We render nothing visible, just the effect trigger.
  if (!trigger) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] pointer-events-none"
      aria-hidden="true"
    />,
    document.body,
  );
}
