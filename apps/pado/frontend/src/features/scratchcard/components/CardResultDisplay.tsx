import { formatNusdc, getTierLabel, getTierColorClass } from '../types';
import type { ScratchResult } from '../types';

interface CardResultDisplayProps {
  result: ScratchResult;
}

export function CardResultDisplay({ result }: CardResultDisplayProps) {
  const { multiplier, prizeAmount, isWinner } = result;
  const label = getTierLabel(multiplier);
  const colorClass = getTierColorClass(multiplier);

  if (!isWinner) {
    return (
      <div className="text-center py-6">
        <p className="text-2xl font-bold text-theme-text-muted">No Prize</p>
        <p className="text-sm text-theme-text-muted mt-1">Better luck next time!</p>
      </div>
    );
  }

  return (
    <div className="text-center py-6">
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
