/**
 * NumberGrid - Pick 1-5 number selector with pick count control
 */
import type { FC } from 'react';
import { MIN_NUMBER, MAX_NUMBER, PRICE_PER_PICK_DISPLAY, PAYOUT_TABLE } from '../constants';

interface NumberGridProps {
  selectedNumbers: number[];
  onToggle: (num: number) => void;
  maxPicks: number;
  disabled?: boolean;
  winningNumber?: number | null;
}

export const NumberGrid: FC<NumberGridProps> = ({
  selectedNumbers,
  onToggle,
  maxPicks,
  disabled,
  winningNumber,
}) => {
  const numbers = Array.from(
    { length: MAX_NUMBER - MIN_NUMBER + 1 },
    (_, i) => MIN_NUMBER + i,
  );

  const cost = selectedNumbers.length * PRICE_PER_PICK_DISPLAY;
  const payoutInfo = PAYOUT_TABLE.find((p) => p.picks === selectedNumbers.length);

  return (
    <div className="space-y-4">
      {/* Pick count selector */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-theme-text-muted">
          Pick up to {maxPicks} numbers ({PRICE_PER_PICK_DISPLAY} NUSDC each)
        </span>
        <span className="font-mono text-theme-text">
          {selectedNumbers.length}/{maxPicks} selected
        </span>
      </div>

      {/* Number buttons */}
      <div className="flex gap-3 justify-center">
        {numbers.map((num) => {
          const isSelected = selectedNumbers.includes(num);
          const isWinner = winningNumber === num;
          const isAtMax = selectedNumbers.length >= maxPicks && !isSelected;

          let btnClass = 'w-16 h-16 rounded-xl text-2xl font-bold transition-all duration-200 ';
          if (isWinner && isSelected) {
            btnClass += 'bg-green-500 text-white ring-4 ring-green-300 scale-110 shadow-lg shadow-green-500/30';
          } else if (isWinner) {
            btnClass += 'bg-yellow-500/20 text-yellow-400 ring-2 ring-yellow-500/50';
          } else if (isSelected) {
            btnClass += 'bg-theme-accent text-white shadow-md shadow-theme-accent/20';
          } else {
            btnClass += 'bg-theme-surface-secondary text-theme-text hover:bg-theme-surface-hover';
          }

          if (disabled || isAtMax) {
            btnClass += ' opacity-50 cursor-not-allowed';
          } else {
            btnClass += ' cursor-pointer';
          }

          return (
            <button
              key={num}
              onClick={() => !disabled && !isAtMax && onToggle(num)}
              disabled={disabled || isAtMax}
              className={btnClass}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* Cost & odds display */}
      {selectedNumbers.length > 0 && (
        <div className="text-center space-y-1">
          <div className="text-sm text-theme-text-muted">
            Cost: <span className="text-theme-text font-mono">{cost} NUSDC</span>
            {payoutInfo && (
              <>
                {' '} | Win: <span className="text-green-400 font-mono">{payoutInfo.winPayout} NUSDC</span>
                {' '} | Odds: <span className="text-yellow-400 font-mono">{payoutInfo.winRate}</span>
              </>
            )}
          </div>
          {payoutInfo && (
            <div className="text-xs text-theme-text-muted">
              Loss refund: {payoutInfo.lossRefund} NUSDC (20% back)
            </div>
          )}
        </div>
      )}
    </div>
  );
};
