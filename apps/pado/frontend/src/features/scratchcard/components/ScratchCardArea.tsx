import { useReducer, useCallback, useEffect, useRef } from 'react';
import { useScratchCardActions, useMyScratchCards } from '../hooks';
import { useScratchCardPool } from '../hooks';
import { useToast } from '../../../components/common';
import { CANVAS_FADE_MS } from '../constants';
import { getAnimationTier, getTierLabel, formatNusdc, TIER_DURATIONS } from '../types';
import type { ScratchResult, AnimationTier } from '../types';
import { BuyCardButton } from './BuyCardButton';
import { ScratchCardCanvas } from './ScratchCardCanvas';
import { CardResultDisplay } from './CardResultDisplay';
import { LossReaction } from './LossReaction';
import { WinCelebration } from './WinCelebration';

// Phase state machine
type Phase = 'idle' | 'buying' | 'scratching' | 'revealing' | 'animating' | 'settled';

type PhaseAction =
  | { type: 'START_BUY' }
  | { type: 'CARD_READY' }
  | { type: 'BUY_FAILED' }
  | { type: 'REVEAL' }
  | { type: 'START_ANIMATION' }
  | { type: 'SETTLE' }
  | { type: 'RESET' };

const VALID_TRANSITIONS: Record<string, Phase> = {
  'idle:START_BUY': 'buying',
  'buying:CARD_READY': 'scratching',
  'buying:BUY_FAILED': 'idle',
  'scratching:REVEAL': 'revealing',
  'revealing:START_ANIMATION': 'animating',
  'animating:SETTLE': 'settled',
  'settled:RESET': 'idle',
  // Fallback: allow SETTLE from revealing (safety net)
  'revealing:SETTLE': 'settled',
};

function phaseReducer(state: Phase, action: PhaseAction): Phase {
  const key = `${state}:${action.type}`;
  return VALID_TRANSITIONS[key] ?? state;
}

const isCardVisible = (p: Phase) =>
  p === 'scratching' || p === 'revealing' || p === 'animating' || p === 'settled';

export function ScratchCardArea() {
  const { buyCard, isBuying, error } = useScratchCardActions();
  const { pool } = useScratchCardPool();
  const { refetch: refetchHistory } = useMyScratchCards();
  const { showToast } = useToast();

  const [phase, dispatch] = useReducer(phaseReducer, 'idle');
  const resultRef = useRef<ScratchResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const clearFallback = useCallback(() => {
    if (fallbackRef.current) { clearTimeout(fallbackRef.current); fallbackRef.current = null; }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { clearTimer(); clearFallback(); };
  }, [clearTimer, clearFallback]);

  const handleBuy = useCallback(async () => {
    dispatch({ type: 'START_BUY' });
    const scratchResult = await buyCard();

    if (scratchResult) {
      resultRef.current = scratchResult;
      dispatch({ type: 'CARD_READY' });
    } else {
      dispatch({ type: 'BUY_FAILED' });
    }
  }, [buyCard]);

  const handleReveal = useCallback(() => {
    const result = resultRef.current;
    if (!result) return;

    dispatch({ type: 'REVEAL' });

    const tier = getAnimationTier(result.multiplier);

    // Toast for real wins only (LOSS tier includes 0x and 1x Even)
    if (result.isWinner && tier !== 'loss') {
      showToast(
        `${getTierLabel(result.multiplier)}! +${formatNusdc(result.prizeAmount)} NUSDC`,
        'success',
      );
    }

    refetchHistory();

    // After canvas fade, start result animation
    clearTimer();
    timerRef.current = setTimeout(() => {
      dispatch({ type: 'START_ANIMATION' });
    }, CANVAS_FADE_MS);

    // Fallback safety: force settle if animation gets stuck
    clearFallback();
    const totalBudget = CANVAS_FADE_MS + TIER_DURATIONS[tier] + 500;
    fallbackRef.current = setTimeout(() => {
      dispatch({ type: 'SETTLE' });
    }, totalBudget);
  }, [showToast, refetchHistory, clearTimer, clearFallback]);

  const handleAnimationEnd = useCallback(() => {
    clearFallback();
    dispatch({ type: 'SETTLE' });
  }, [clearFallback]);

  const handleReset = useCallback(() => {
    clearTimer();
    clearFallback();
    resultRef.current = null;
    dispatch({ type: 'RESET' });
  }, [clearTimer, clearFallback]);

  const result = resultRef.current;
  const tier = result ? getAnimationTier(result.multiplier) : 'loss';
  const isPaused = pool?.isPaused ?? true;
  const canBuy = !isPaused && phase === 'idle';
  const canvasRevealed = phase === 'revealing' || phase === 'animating' || phase === 'settled';

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-theme-text-primary">
        Scratch Card
      </h2>

      {/* Card area */}
      {isCardVisible(phase) && result && (
        <div className="flex flex-col items-center gap-3">
          {/* Canvas wrapper with scale transition (buttons excluded) */}
          <div
            className="transition-transform duration-400 ease-out"
            style={{ transform: canvasRevealed ? 'scale(1.02)' : 'scale(1)' }}
          >
            <ScratchCardCanvas
              width={320}
              height={200}
              onReveal={handleReveal}
              revealed={canvasRevealed}
            >
              {/* During scratching/revealing: show static result underneath */}
              {(phase === 'scratching' || phase === 'revealing') && (
                <CardResultDisplay result={result} />
              )}

              {/* During animating: show tier-specific animation */}
              {phase === 'animating' && (
                tier === 'loss'
                  ? <LossReaction onComplete={handleAnimationEnd} />
                  : <WinCelebration result={result} tier={tier} onComplete={handleAnimationEnd} />
              )}

              {/* During settled: show static result */}
              {phase === 'settled' && (
                <CardResultDisplay result={result} />
              )}
            </ScratchCardCanvas>
          </div>

          {phase === 'scratching' && (
            <button
              onClick={handleReveal}
              className="text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              Reveal All
            </button>
          )}

          {phase === 'settled' && (
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-theme-accent hover:bg-theme-accent-hover
                text-white font-medium text-sm transition-colors animate-scratch-text-fade"
            >
              Buy Another
            </button>
          )}
        </div>
      )}

      {/* Buy button */}
      {(phase === 'idle' || phase === 'buying') && (
        <BuyCardButton
          onClick={handleBuy}
          isBuying={isBuying || phase === 'buying'}
          disabled={!canBuy}
        />
      )}

      {/* Error display */}
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
