/**
 * MobileBottomBar Component
 * Fixed bottom Buy/Sell buttons for mobile trading
 * Switches to Trade tab and sets the order side
 */

import { useOrderForm } from '../context';

interface MobileBottomBarProps {
  onTradeClick: (side: 'buy' | 'sell') => void;
}

export function MobileBottomBar({ onTradeClick }: MobileBottomBarProps) {
  const { side } = useOrderForm();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-theme-bg-primary border-t border-theme-border px-4 py-3 flex gap-3 lg:hidden">
      <button
        onClick={() => onTradeClick('buy')}
        className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
          side === 'buy'
            ? 'bg-green-600 text-white'
            : 'bg-green-600/80 text-white hover:bg-green-600'
        }`}
      >
        Buy
      </button>
      <button
        onClick={() => onTradeClick('sell')}
        className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
          side === 'sell'
            ? 'bg-red-600 text-white'
            : 'bg-red-600/80 text-white hover:bg-red-600'
        }`}
      >
        Sell
      </button>
    </div>
  );
}
