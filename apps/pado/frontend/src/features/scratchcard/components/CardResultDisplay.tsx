import { useState, useEffect } from 'react';
import { formatNusdc, getTierLabel, getTierColorClass } from '../types';
import type { ScratchResult } from '../types';

interface CardResultDisplayProps {
  result: ScratchResult;
  /** Set to true after canvas fade-out completes to trigger animations */
  revealed?: boolean;
}

export function CardResultDisplay({ result, revealed = false }: CardResultDisplayProps) {
  const { multiplier, prizeAmount, isWinner } = result;
  const label = getTierLabel(multiplier);
  const colorClass = getTierColorClass(multiplier);
  const [animate, setAnimate] = useState(false);

  // Trigger animation after canvas fade-out (0.4s) completes
  useEffect(() => {
    if (!revealed) {
      setAnimate(false);
      return;
    }
    // Canvas fade-out takes 0.4s, start animation after it finishes
    const timer = setTimeout(() => setAnimate(true), 450);
    return () => clearTimeout(timer);
  }, [revealed]);

  if (!isWinner) {
    return (
      <div
        className="text-center py-6"
        style={animate ? {
          animation: 'scratch-shake 0.5s ease-out',
        } : undefined}
      >
        <p
          className="text-2xl font-bold text-theme-text-muted"
          style={animate ? {
            animation: 'scratch-fade-in 0.5s ease-out 0.2s both',
          } : { opacity: 0 }}
        >
          No Prize
        </p>
        <p
          className="text-sm text-theme-text-muted mt-1"
          style={animate ? {
            animation: 'scratch-fade-in 0.5s ease-out 0.5s both',
          } : { opacity: 0 }}
        >
          Better luck next time!
        </p>
      </div>
    );
  }

  return (
    <div
      className="text-center py-6"
      style={animate ? {
        animation: 'scratch-pop 0.5s ease-out',
      } : undefined}
    >
      <p
        className={`text-3xl font-bold ${colorClass}`}
        style={animate ? {
          animation: 'scratch-fade-in 0.3s ease-out 0.1s both',
        } : { opacity: 0 }}
      >
        {multiplier}x
      </p>
      <p
        className={`text-xl font-semibold ${colorClass} mt-1`}
        style={animate ? {
          animation: 'scratch-fade-in 0.3s ease-out 0.3s both',
        } : { opacity: 0 }}
      >
        {label}!
      </p>
      <p
        className="text-lg text-theme-text-primary mt-2"
        style={animate ? {
          animation: 'scratch-fade-in 0.3s ease-out 0.5s both',
        } : { opacity: 0 }}
      >
        +{formatNusdc(prizeAmount)} NUSDC
      </p>
    </div>
  );
}
