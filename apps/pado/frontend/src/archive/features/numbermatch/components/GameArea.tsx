/**
 * GameArea - Main game loop component for Number Match
 * Phases: idle -> buying -> revealing -> revealed
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { FC } from 'react';
import { MAX_PICKS, PRICE_PER_PICK_DISPLAY } from '../constants';
import { NumberGrid } from './NumberGrid';
import { NumberMatchWinCelebration } from './NumberMatchWinCelebration';
import { useNumberMatchActions } from '../hooks/useNumberMatchActions';
import { useNumberMatchPool } from '../hooks/useNumberMatchPool';
import { formatNusdc } from '../types';
import type { NumberMatchResult, GamePhase } from '../types';

interface GameAreaProps {
  onResultRevealed?: () => void;
}

export const GameArea: FC<GameAreaProps> = ({ onResultRevealed }) => {
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [result, setResult] = useState<NumberMatchResult | null>(null);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const { playGame, isPlaying, error } = useNumberMatchActions();
  const { pool } = useNumberMatchPool();
  const revealTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup reveal timer on unmount
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  const handleToggle = useCallback((num: number) => {
    setSelectedNumbers((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num);
      if (prev.length >= MAX_PICKS) return prev;
      return [...prev, num];
    });
  }, []);

  const handlePlay = useCallback(async () => {
    if (selectedNumbers.length === 0) return;

    setPhase('buying');
    const gameResult = await playGame(selectedNumbers);

    if (gameResult) {
      setResult(gameResult);
      setPhase('revealing');

      revealTimerRef.current = setTimeout(() => {
        setPhase('revealed');
        onResultRevealed?.();
        if (gameResult.isWin) {
          setIsCelebrating(true);
        }
      }, 1500);
    } else {
      setPhase('idle');
    }
  }, [selectedNumbers, playGame, onResultRevealed]);

  const handlePlayAgain = useCallback(() => {
    setSelectedNumbers([]);
    setResult(null);
    setPhase('idle');
    setIsCelebrating(false);
  }, []);

  const isIdle = phase === 'idle';
  const isRevealing = phase === 'revealing';
  const isRevealed = phase === 'revealed';
  const showResult = isRevealing || isRevealed;
  const isPaused = pool?.isPaused ?? false;
  const canPlay = isIdle && selectedNumbers.length > 0 && !isPlaying && !isPaused;

  return (
    <div className="bg-theme-surface rounded-2xl border border-theme-border p-6 space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-theme-text">Number Match</h3>
        <p className="text-sm text-theme-text-muted mt-1">
          Pick numbers and match the winning number to win
        </p>
      </div>

      <NumberGrid
        selectedNumbers={selectedNumbers}
        onToggle={handleToggle}
        maxPicks={MAX_PICKS}
        disabled={!isIdle || isPaused}
        winningNumber={showResult ? result?.winningNumber ?? null : null}
      />

      {/* Result display */}
      {showResult && result && (
        <div className={`text-center p-4 rounded-xl transition-all duration-500 ${
          result.isWin
            ? 'bg-green-500/10 border border-green-500/30'
            : 'bg-red-500/10 border border-red-500/30'
        }`}>
          {isRevealing ? (
            <div className="animate-pulse">
              <div className="text-3xl font-bold text-yellow-400 mb-2">
                Winning Number: {result.winningNumber}
              </div>
              <div className="text-theme-text-muted">Checking your picks...</div>
            </div>
          ) : (
            <>
              <div className="text-3xl font-bold mb-2">
                Winning Number: <span className="text-yellow-400">{result.winningNumber}</span>
              </div>
              {result.isWin ? (
                isCelebrating ? (
                  <NumberMatchWinCelebration
                    payout={result.payout}
                    onComplete={() => setIsCelebrating(false)}
                  />
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl font-bold text-green-400">
                      YOU WON!
                    </div>
                    <div className="text-green-300">
                      +{formatNusdc(result.payout)} NUSDC
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-1">
                  <div className="text-xl font-medium text-red-400">
                    No Match
                  </div>
                  <div className="text-red-300/70 text-sm">
                    Refund: {formatNusdc(result.payout)} NUSDC
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Action button */}
      <div className="flex justify-center">
        {isRevealed ? (
          <button
            onClick={handlePlayAgain}
            className="px-8 py-3 rounded-xl font-semibold bg-theme-accent text-white hover:opacity-90 transition-opacity"
          >
            Play Again
          </button>
        ) : (
          <button
            onClick={handlePlay}
            disabled={!canPlay}
            className="px-8 py-3 rounded-xl font-semibold bg-theme-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPaused
              ? 'Game Paused'
              : isPlaying
                ? 'Playing...'
                : `Play (${selectedNumbers.length * PRICE_PER_PICK_DISPLAY} NUSDC)`}
          </button>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="text-center text-sm text-red-400 bg-red-500/10 rounded-lg p-3">
          {error}
        </div>
      )}
    </div>
  );
};
