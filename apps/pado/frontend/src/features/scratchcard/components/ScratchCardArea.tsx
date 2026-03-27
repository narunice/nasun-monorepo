import { useState, useCallback } from 'react';
import { useScratchCardActions } from '../hooks';
import { useScratchCardPool } from '../hooks';
import { useToast } from '../../../components/common';
import { BuyCardButton } from './BuyCardButton';
import { ScratchCardCanvas } from './ScratchCardCanvas';
import { CardResultDisplay } from './CardResultDisplay';
import { getTierLabel, formatNusdc } from '../types';
import type { ScratchResult } from '../types';

type Phase = 'idle' | 'buying' | 'scratching' | 'revealed';

export function ScratchCardArea() {
  const { buyCard, isBuying, error } = useScratchCardActions();
  const { pool } = useScratchCardPool();
  const { showToast } = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ScratchResult | null>(null);
  const [canvasRevealed, setCanvasRevealed] = useState(false);

  const handleBuy = useCallback(async () => {
    setPhase('buying');
    const scratchResult = await buyCard();

    if (scratchResult) {
      setResult(scratchResult);
      setCanvasRevealed(false);
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
  }, [result, showToast]);

  const handleRevealAll = useCallback(() => {
    handleReveal();
  }, [handleReveal]);

  const handleReset = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setCanvasRevealed(false);
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

          {phase === 'revealed' && (
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-theme-accent hover:bg-theme-accent-hover
                text-white font-medium text-sm transition-colors"
            >
              Buy Another
            </button>
          )}
        </div>
      )}

      {/* Buy button (shown in idle and buying phases) */}
      {(phase === 'idle' || phase === 'buying') && (
        <BuyCardButton
          onClick={handleBuy}
          isBuying={isBuying || phase === 'buying'}
          disabled={!canBuy}
        />
      )}

      {/* Error display */}
      {error && (
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
