/**
 * RankChangeIndicatorV3 Component
 *
 * Displays rank change with direction indicator (▲▼-NEW).
 * Based on V2 RankChangeIndicator pattern.
 */

import type { RankChangeDirection } from '../types';

interface RankChangeIndicatorV3Props {
  direction: RankChangeDirection;
  amount: number;
  variant?: 'full' | 'short';
}

export function RankChangeIndicatorV3({
  direction,
  amount,
  variant = 'short',
}: RankChangeIndicatorV3Props) {
  if (direction === 'same') {
    return <span className="font-medium text-gray-500">-</span>;
  }

  // Full variant for cards/expanded views
  if (variant === 'full') {
    const config = {
      up: { color: 'text-green-400', text: `+${amount} ranks` },
      down: { color: 'text-red-400', text: `-${amount} ranks` },
      new: { color: 'text-green-400', text: 'NEW' },
    };

    const { color, text } = config[direction];
    return <span className={`font-medium ${color}`}>{text}</span>;
  }

  // Short variant for table cells (V2 pattern)
  switch (direction) {
    case 'up':
      return (
        <div className="flex flex-col items-center font-semibold leading-none">
          <span className="text-green-500" style={{ fontSize: '0.7em' }}>
            ▲
          </span>
          <span className="text-green-500 mt-0.5">{amount}</span>
        </div>
      );
    case 'down':
      return (
        <div className="flex flex-col items-center font-semibold leading-none">
          <span className="text-red-500" style={{ fontSize: '0.7em' }}>
            ▼
          </span>
          <span className="text-red-500 mt-0.5">{amount}</span>
        </div>
      );
    case 'new':
      return (
        <div className="flex flex-col items-center font-bold leading-none">
          <span className="text-green-500" style={{ fontSize: '0.7em' }}>
            ▲
          </span>
          <span className="text-green-500 mt-0.5 text-xs">NEW</span>
        </div>
      );
    default:
      return <span className="font-medium text-gray-500">-</span>;
  }
}
