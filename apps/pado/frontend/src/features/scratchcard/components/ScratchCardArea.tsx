import { useState, useCallback, useEffect, useRef } from 'react';
import { useScratchCardActions } from '../hooks';
import { useScratchCardPool } from '../hooks';
import { useToast } from '../../../components/common';
import { BuyCardButton } from './BuyCardButton';
import { ScratchCardCanvas } from './ScratchCardCanvas';
import { CardResultDisplay } from './CardResultDisplay';
import { getTierLabel, formatNusdc } from '../types';
import type { ScratchResult } from '../types';

const RESULT_LINGER_MS = 3000;
const COOLDOWN_SECONDS = 3;

type Phase = 'idle' | 'buying' | 'scratching' | 'revealed' | 'cooldown';

export function ScratchCardArea() {
  const { buyCard, isBuying, error } = useScratchCardActions();
  const { pool } = useScratchCardPool();
  const { showToast } = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ScratchResult | null>(null);
  const [canvasRevealed, setCanvasRevealed] = useState(false);
  const [showBuyAnother, setShowBuyAnother] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Timer refs for cleanup on unmount
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const handleBuy = useCallback(async () => {
    setPhase('buying');
    const scratchResult = await buyCard();

    if (scratchResult) {
      setResult(scratchResult);
      setCanvasRevealed(false);
      setShowBuyAnother(false);
      setPhase('scratching');
    } else {
      setPhase('idle');
    }
  }, [buyCard]);

  const handleReveal = useCallback(() => {
    setCanvasRevealed(true);
    setPhase('revealed');

    if (result && result.isWinner) {
      showToast(
        `${getTierLabel(result.multiplier)}! +${formatNusdc(result.prizeAmount)} NUSDC`,
        'success',
      );
    }

    // Show "Buy Another" after linger delay
    if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
    lingerTimerRef.current = setTimeout(() => {
      setShowBuyAnother(true);
      lingerTimerRef.current = null;
    }, RESULT_LINGER_MS);
  }, [result, showToast]);

  const handleRevealAll = useCallback(() => {
    handleReveal();
  }, [handleReveal]);

  const handleReset = useCallback(() => {
    // Clear linger timer if still pending
    if (lingerTimerRef.current) {
      clearTimeout(lingerTimerRef.current);
      lingerTimerRef.current = null;
    }

    setResult(null);
    setCanvasRevealed(false);
    setShowBuyAnother(false);

    // Start cooldown
    setCountdown(COOLDOWN_SECONDS);
    setPhase('cooldown');

    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          setPhase('idle');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const isPaused = pool?.isPaused ?? true;
  const canBuy = !isPaused && phase === 'idle';

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-theme-text-primary">
        Scratch Card
      </h2>

      {/* Card area */}
      {(phase === 'scratching' || phase === 'revealed') && result && (
        <div className="flex flex-col items-center gap-3">
          <ScratchCardCanvas
            width={320}
            height={200}
            onReveal={handleReveal}
            revealed={canvasRevealed}
          >
            <CardResultDisplay result={result} />
          </ScratchCardCanvas>

          {phase === 'scratching' && (
            <button
              onClick={handleRevealAll}
              className="text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              Reveal All
            </button>
          )}

          {phase === 'revealed' && showBuyAnother && (
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-theme-accent hover:bg-theme-accent-hover
                text-white font-medium text-sm transition-colors animate-fade-in"
            >
              Buy Another
            </button>
          )}
        </div>
      )}

      {/* Buy button (idle, buying, cooldown) */}
      {(phase === 'idle' || phase === 'buying' || phase === 'cooldown') && (
        <BuyCardButton
          onClick={handleBuy}
          isBuying={isBuying || phase === 'buying'}
          disabled={!canBuy}
          countdown={phase === 'cooldown' ? countdown : undefined}
        />
      )}

      {/* Error display (clear on next phase transition) */}
      {error && phase === 'idle' && (
        <p className="text-sm text-red-500 dark:text-red-400 text-center">
          {error}
        </p>
      )}

      {/* Paused notice */}
      {isPaused && phase === 'idle' && (
        <p className="text-sm text-yellow-600 dark:text-yellow-400 text-center">
          Scratch cards are currently paused
        </p>
      )}
    </div>
  );
}
