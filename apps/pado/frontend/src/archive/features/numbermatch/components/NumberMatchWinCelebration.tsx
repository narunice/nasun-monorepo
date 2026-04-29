/**
 * NumberMatchWinCelebration - Celebration overlay for Number Match wins.
 * Renders flash + confetti rain + animated "YOU WON!" text with sound.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fireConfettiRain, CELEBRATION_COLORS } from '../../../lib/celebration';
import { playGameSound } from '../../../lib/sounds';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { formatNusdc } from '../types';

interface NumberMatchWinCelebrationProps {
  payout: bigint;
  onComplete: () => void;
}

export function NumberMatchWinCelebration({ payout, onComplete }: NumberMatchWinCelebrationProps) {
  const [phase, setPhase] = useState<'flash' | 'celebrate' | 'done'>('flash');
  const reducedMotion = useReducedMotion();
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  // One-shot celebration sequence: flash -> confetti + sound -> done
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => {
      setPhase('celebrate');
      playGameSound('winMedium');
      fireConfettiRain('medium', CELEBRATION_COLORS.brand);
    }, 150));

    timers.push(setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        setPhase('done');
        onCompleteRef.current();
      }
    }, 2500));

    return () => {
      timers.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFlash = phase === 'flash' && !reducedMotion;
  const showCelebrate = phase === 'celebrate';

  return (
    <>
      {/* Full-screen flash overlay via portal */}
      {showFlash && createPortal(
        <div
          className="fixed inset-0 bg-white/60 dark:bg-white/40 animate-nm-win-flash pointer-events-none"
          style={{ zIndex: 80 }}
        />,
        document.body,
      )}

      {/* Animated win display (inline, replaces the plain result) */}
      {showCelebrate && (
        <div className="text-center py-2">
          <div className="animate-nm-win-slam">
            <p className="text-3xl font-black bg-gradient-to-r from-green-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
              YOU WON!
            </p>
          </div>
          <p className="text-xl font-bold text-green-400 mt-2 animate-scratch-text-fade" style={{ animationDelay: '0.3s', opacity: 0 }}>
            +{formatNusdc(payout)} NUSDC
          </p>
          <div className="mx-auto mt-3 w-32 h-1 rounded-full bg-gradient-to-r from-green-400 via-teal-400 to-cyan-400 animate-nm-win-glow" />
        </div>
      )}
    </>
  );
}
