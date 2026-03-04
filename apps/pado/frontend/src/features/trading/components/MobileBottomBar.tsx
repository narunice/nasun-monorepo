/**
 * MobileBottomBar Component
 * Fixed bottom Buy/Sell buttons for mobile trading (V2 compatible).
 * Positioned above MobileBottomNav (bottom-14) with gradient styling.
 */

interface MobileBottomBarProps {
  onTradeClick: (side: 'buy' | 'sell') => void;
}

export function MobileBottomBar({ onTradeClick }: MobileBottomBarProps) {
  return (
    <div className="fixed bottom-14 left-0 right-0 z-40 bg-theme-bg-primary border-t border-[var(--color-panel-border)] px-4 py-2 flex gap-3 md:hidden">
      <button
        onClick={() => onTradeClick('buy')}
        className="flex-1 py-3.5 rounded-lg font-semibold text-trading-sm
          bg-gradient-to-b from-green-600 to-green-700 hover:from-green-500 hover:to-green-600
          active:from-green-700 active:to-green-800
          text-white shadow-sm transition-all duration-150
          dark:shadow-[inset_0_1px_0_rgba(134,243,183,0.2)]"
      >
        Buy
      </button>
      <button
        onClick={() => onTradeClick('sell')}
        className="flex-1 py-3.5 rounded-lg font-semibold text-trading-sm
          bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600
          active:from-red-700 active:to-red-800
          text-white shadow-sm transition-all duration-150
          dark:shadow-[inset_0_1px_0_rgba(252,165,165,0.2)]"
      >
        Sell
      </button>
    </div>
  );
}
