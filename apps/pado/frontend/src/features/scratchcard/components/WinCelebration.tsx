import { useState, useEffect, useRef, useCallback } from 'react';
import type { ScratchResult } from '../types';
import type { AnimationTier } from '../types';
import { formatNusdc, getTierLabel, getTierColorClass } from '../types';
import { CelebrationOverlay } from '../../../components/common';
import { CELEBRATION_COLORS, fireConfettiRain, type CelebrationPreset } from '../../../lib/celebration';
import { playGameSound } from '../../../lib/sounds';
// Confetti colors kept for reference but unused (canvas-confetti uses CELEBRATION_COLORS)
// const CONFETTI_COLORS: Record<Exclude<AnimationTier, 'loss'>, string[]> = { ... };

// rAF-based number counter hook
function useCountUp(target: bigint, durationMs: number, active: boolean): bigint {
  const [current, setCurrent] = useState(0n);
  const startRef = useRef<number | null>(null);
  const targetNum = Number(target);

  useEffect(() => {
    if (!active || targetNum === 0) {
      setCurrent(target);
      return;
    }

    startRef.current = null;
    let rafId: number;

    const tick = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic for dramatic slowdown at end
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.floor(eased * targetNum);
      setCurrent(BigInt(value));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setCurrent(target);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, targetNum, durationMs, active]);

  return current;
}

// Map scratchcard tier to celebration preset
function tierToPreset(tier: Exclude<AnimationTier, 'loss'>): CelebrationPreset {
  switch (tier) {
    case 'jackpot': return 'large';
    case 'big': return 'medium';
    default: return 'small';
  }
}

function tierToCelebrationColors(tier: Exclude<AnimationTier, 'loss'>): string[] {
  switch (tier) {
    case 'jackpot': return CELEBRATION_COLORS.gold;
    case 'big': return CELEBRATION_COLORS.brand;
    default: return CELEBRATION_COLORS.mint;
  }
}

function tierToSound(tier: Exclude<AnimationTier, 'loss'>) {
  switch (tier) {
    case 'jackpot': return 'winJackpot' as const;
    case 'big': return 'winMedium' as const;
    default: return 'winSmall' as const;
  }
}

interface WinCelebrationProps {
  result: ScratchResult;
  tier: Exclude<AnimationTier, 'loss'>;
  onComplete: () => void;
}

export function WinCelebration({ result, tier, onComplete }: WinCelebrationProps) {
  const { multiplier, prizeAmount } = result;
  const label = getTierLabel(multiplier);
  const colorClass = getTierColorClass(multiplier);
  const [phase, setPhase] = useState<'enter' | 'counting' | 'confetti'>('enter');
  const [showFlash, setShowFlash] = useState(tier === 'big');
  const [showBlackout, setShowBlackout] = useState(tier === 'jackpot');
  const [typewriterIndex, setTypewriterIndex] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  // Count-up active for BIG/JACKPOT during counting phase
  const counterDuration = tier === 'jackpot' ? 1000 : 800;
  const countedValue = useCountUp(prizeAmount, counterDuration, phase === 'counting');

  // Typewriter interval ref for cleanup
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const labelChars = label.split('');

  const startTypewriter = useCallback(() => {
    let i = 0;
    typewriterRef.current = setInterval(() => {
      i++;
      setTypewriterIndex(i);
      if (i >= labelChars.length) {
        if (typewriterRef.current) clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
    }, 80);
  }, [labelChars.length]);

  // Tier-specific timing sequences
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (tier === 'normal') {
      timers.push(setTimeout(() => {
        setPhase('confetti');
        setShowCelebration(true);
        playGameSound('winSmall');
        fireConfettiRain('medium', CELEBRATION_COLORS.mint);
      }, 400));
      timers.push(setTimeout(onComplete, 2000));
    } else if (tier === 'big') {
      timers.push(setTimeout(() => setShowFlash(false), 150));
      timers.push(setTimeout(() => setPhase('counting'), 600));
      timers.push(setTimeout(() => {
        setPhase('confetti');
        setShowCelebration(true);
        playGameSound(tierToSound(tier));
        fireConfettiRain('medium', CELEBRATION_COLORS.brand);
      }, 1400));
      timers.push(setTimeout(onComplete, 2500));
    } else if (tier === 'jackpot') {
      timers.push(setTimeout(() => {
        setShowBlackout(false);
        startTypewriter();
      }, 500));
      timers.push(setTimeout(() => setPhase('counting'), 1200));
      timers.push(setTimeout(() => {
        setPhase('confetti');
        setShowCelebration(true);
        playGameSound(tierToSound(tier));
        fireConfettiRain('large', CELEBRATION_COLORS.gold);
      }, 2200));
      timers.push(setTimeout(onComplete, 4000));
    }

    return () => {
      timers.forEach(clearTimeout);
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      }
    };
  }, [tier, onComplete, startTypewriter]);

  // Render multiplier display based on tier
  const renderMultiplier = () => {
    if (tier === 'jackpot') {
      return (
        <div className="mb-2">
          <p className={`text-4xl font-bold ${colorClass} mb-1`}>
            {multiplier}x
          </p>
          <p className={`text-2xl font-bold ${colorClass}`}>
            {labelChars.map((char, i) => (
              <span
                key={i}
                className={i < typewriterIndex ? 'animate-scratch-typewriter-char inline-block' : 'invisible'}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                {char}
              </span>
            ))}
          </p>
        </div>
      );
    }

    const animClass = tier === 'big' ? 'animate-scratch-slam' : 'animate-scratch-bounce';
    return (
      <div className="mb-2">
        <p className={`text-3xl font-bold ${colorClass} ${animClass}`}>
          {multiplier}x
        </p>
        <p className={`text-xl font-semibold ${colorClass} animate-scratch-text-fade`}
           style={{ animationDelay: '0.3s', opacity: 0 }}>
          {label}!
        </p>
      </div>
    );
  };

  // Render prize amount (counter for BIG/JACKPOT, static for NORMAL)
  const renderPrize = () => {
    const displayAmount = (tier === 'big' || tier === 'jackpot') && phase !== 'enter'
      ? countedValue
      : prizeAmount;

    return (
      <p className="text-lg text-theme-text-primary animate-scratch-text-fade"
         style={{ animationDelay: tier === 'normal' ? '0.4s' : '0.6s', opacity: 0 }}>
        +{formatNusdc(displayAmount)} NUSDC
      </p>
    );
  };

  return (
    <div className="relative text-center py-6 overflow-hidden">
      {/* BIG tier: white flash overlay */}
      {tier === 'big' && showFlash && (
        <div className="absolute inset-0 bg-white/80 dark:bg-white/60 animate-scratch-flash z-10" />
      )}

      {/* JACKPOT: blackout + golden glow */}
      {tier === 'jackpot' && showBlackout && (
        <div className="absolute inset-0 bg-black/80 z-10 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-yellow-400 animate-scratch-golden-glow" />
        </div>
      )}

      {/* BIG tier: card shake during slam */}
      <div className={tier === 'big' ? 'animate-scratch-card-shake' : ''}>
        {renderMultiplier()}
        {renderPrize()}
      </div>

      {/* Full-screen canvas-confetti via Portal (all winning tiers) */}
      {showCelebration && (
        <CelebrationOverlay
          preset={tierToPreset(tier)}
          trigger={true}
          colors={tierToCelebrationColors(tier)}
        />
      )}
    </div>
  );
}
