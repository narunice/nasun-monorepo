import { useState, useEffect } from 'react';
import { formatNusdc, getTierLabel, getTierColorClass } from '../types';
import type { ScratchResult } from '../types';

interface CardResultDisplayProps {
  result: ScratchResult;
}

export function CardResultDisplay({ result }: CardResultDisplayProps) {
  const { multiplier, prizeAmount, isWinner } = result;
  const label = getTierLabel(multiplier);
  const colorClass = getTierColorClass(multiplier);
  const [animate, setAnimate] = useState(false);

  // Trigger animation on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!isWinner) {
    return (
      <div
        className="text-center py-6"
        style={animate ? {
          animation: 'scratch-shake 0.4s ease-out',
        } : undefined}
      >
        <p
          className="text-2xl font-bold text-theme-text-muted"
          style={animate ? {
            animation: 'scratch-fade-in 0.5s ease-out 0.3s both',
          } : undefined}
        >
          No Prize
        </p>
        <p
          className="text-sm text-theme-text-muted mt-1"
          style={animate ? {
            animation: 'scratch-fade-in 0.5s ease-out 0.5s both',
          } : undefined}
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
        animation: 'scratch-pop 0.4s ease-out',
      } : undefined}
    >
      <p className={`text-3xl font-bold ${colorClass}`}>
        {multiplier}x
      </p>
      <p className={`text-xl font-semibold ${colorClass} mt-1`}>
        {label}!
      </p>
      <p className="text-lg text-theme-text-primary mt-2">
        +{formatNusdc(prizeAmount)} NUSDC
      </p>
    </div>
  );
}
