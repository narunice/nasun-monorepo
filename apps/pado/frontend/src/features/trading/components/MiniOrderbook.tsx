/**
 * MiniOrderbook
 * Compact 8-level orderbook for mobile Pro mode.
 * Shows top 8 asks (descending) + spread + top 8 bids (descending).
 */

import type { PriceLevel } from '../../../lib/deepbook';

interface MiniOrderbookProps {
  bids: PriceLevel[];
  asks: PriceLevel[];
  midPrice: number;
  onPriceClick?: (price: number) => void;
}

const LEVELS = 8;

export function MiniOrderbook({ bids, asks, midPrice, onPriceClick }: MiniOrderbookProps) {
  const topAsks = asks.slice(0, LEVELS).reverse();
  const topBids = bids.slice(0, LEVELS);

  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
  const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;

  // Max quantity for bar width normalization
  const allQuantities = [...topAsks, ...topBids].map(l => l.quantity);
  const maxQty = Math.max(...allQuantities, 1);

  const handleClick = (price: number) => {
    onPriceClick?.(price);
  };

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-2.5">
      <div className="text-[10px] text-theme-text-muted mb-1.5 flex justify-between px-1">
        <span>Price</span>
        <span>Qty</span>
      </div>

      {/* Asks (reversed: lowest ask at bottom, closest to spread) */}
      <div className="space-y-px">
        {topAsks.map((level, i) => (
          <button
            key={`ask-${i}`}
            onClick={() => handleClick(level.price)}
            className="w-full flex justify-between items-center text-[11px] font-mono px-1 py-2.5 rounded hover:bg-theme-bg-tertiary transition-colors relative"
          >
            <div
              className="absolute right-0 top-0 bottom-0 bg-red-500/10 rounded"
              style={{ width: `${(level.quantity / maxQty) * 100}%` }}
            />
            <span className="text-red-400 relative z-10">{level.price.toFixed(2)}</span>
            <span className="text-theme-text-muted relative z-10">{level.quantity.toFixed(4)}</span>
          </button>
        ))}
      </div>

      {/* Spread */}
      <div className="flex items-center justify-center gap-2 py-1 my-0.5 border-y border-theme-border/30">
        <span className="text-[10px] text-theme-text-muted">
          Spread: ${spread.toFixed(2)} ({spreadPct.toFixed(3)}%)
        </span>
      </div>

      {/* Bids */}
      <div className="space-y-px">
        {topBids.map((level, i) => (
          <button
            key={`bid-${i}`}
            onClick={() => handleClick(level.price)}
            className="w-full flex justify-between items-center text-[11px] font-mono px-1 py-2.5 rounded hover:bg-theme-bg-tertiary transition-colors relative"
          >
            <div
              className="absolute right-0 top-0 bottom-0 bg-green-500/10 rounded"
              style={{ width: `${(level.quantity / maxQty) * 100}%` }}
            />
            <span className="text-green-400 relative z-10">{level.price.toFixed(2)}</span>
            <span className="text-theme-text-muted relative z-10">{level.quantity.toFixed(4)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
