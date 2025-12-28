import { useState, useMemo } from 'react';
import type { Orderbook as OrderbookType } from '../../../lib/deepbook';

type DepthLevel = 5 | 10 | 20;

interface OrderbookProps {
  orderbook: OrderbookType;
  onPriceClick?: (price: number) => void;
}

export function Orderbook({ orderbook, onPriceClick }: OrderbookProps) {
  const [depthLevel, setDepthLevel] = useState<DepthLevel>(10);

  const handlePriceClick = (price: number) => {
    if (onPriceClick) {
      onPriceClick(price);
    }
  };

  // 표시할 호가 수 제한
  const displayedBids = orderbook.bids.slice(0, depthLevel);
  const displayedAsks = orderbook.asks.slice(0, depthLevel);

  // 누적 물량 계산 (Depth Chart용)
  const { maxBidCumulative, maxAskCumulative, bidCumulatives, askCumulatives } = useMemo(() => {
    let bidSum = 0;
    const bidCumulatives = displayedBids.map((level) => {
      bidSum += level.quantity;
      return bidSum;
    });

    let askSum = 0;
    const askCumulatives = displayedAsks.map((level) => {
      askSum += level.quantity;
      return askSum;
    });

    const maxBid = bidCumulatives[bidCumulatives.length - 1] || 0;
    const maxAsk = askCumulatives[askCumulatives.length - 1] || 0;
    const maxTotal = Math.max(maxBid, maxAsk);

    return {
      maxBidCumulative: maxTotal,
      maxAskCumulative: maxTotal,
      bidCumulatives,
      askCumulatives,
    };
  }, [displayedBids, displayedAsks]);

  return (
    <div className="space-y-2">
      {/* Depth Level Selector */}
      <div className="flex justify-end gap-1">
        {([5, 10, 20] as DepthLevel[]).map((level) => (
          <button
            key={level}
            onClick={() => setDepthLevel(level)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              depthLevel === level
                ? 'bg-blue-600 text-white'
                : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-border'
            }`}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Bids */}
        <div>
          <h3 className="text-sm font-medium text-green-400 mb-2">Bids (Buy)</h3>
          <div className="bg-theme-bg-tertiary rounded p-3 h-64 overflow-y-auto">
            <div className="text-xs text-theme-text-muted flex justify-between mb-2 border-b border-theme-border pb-1">
              <span>Price</span>
              <span>Amount</span>
            </div>
            {displayedBids.length > 0 ? (
              <div className="space-y-0.5">
                {displayedBids.map((level, i) => {
                  const depthPercent = maxBidCumulative > 0
                    ? (bidCumulatives[i] / maxBidCumulative) * 100
                    : 0;

                  return (
                    <div
                      key={i}
                      className={`relative text-xs flex justify-between text-green-400 py-0.5 ${
                        onPriceClick ? 'cursor-pointer hover:brightness-125' : ''
                      }`}
                      onClick={() => handlePriceClick(level.price)}
                    >
                      {/* Depth Bar */}
                      <div
                        className="absolute right-0 top-0 bottom-0 bg-green-500/20"
                        style={{ width: `${depthPercent}%` }}
                      />
                      {/* Content */}
                      <span className="relative z-10 font-mono">${level.price.toFixed(2)}</span>
                      <span className="relative z-10 font-mono">{level.quantity.toFixed(4)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-theme-text-muted mt-20">
                No bids yet
              </div>
            )}
          </div>
        </div>

        {/* Asks */}
        <div>
          <h3 className="text-sm font-medium text-red-400 mb-2">Asks (Sell)</h3>
          <div className="bg-theme-bg-tertiary rounded p-3 h-64 overflow-y-auto">
            <div className="text-xs text-theme-text-muted flex justify-between mb-2 border-b border-theme-border pb-1">
              <span>Price</span>
              <span>Amount</span>
            </div>
            {displayedAsks.length > 0 ? (
              <div className="space-y-0.5">
                {displayedAsks.map((level, i) => {
                  const depthPercent = maxAskCumulative > 0
                    ? (askCumulatives[i] / maxAskCumulative) * 100
                    : 0;

                  return (
                    <div
                      key={i}
                      className={`relative text-xs flex justify-between text-red-400 py-0.5 ${
                        onPriceClick ? 'cursor-pointer hover:brightness-125' : ''
                      }`}
                      onClick={() => handlePriceClick(level.price)}
                    >
                      {/* Depth Bar */}
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-red-500/20"
                        style={{ width: `${depthPercent}%` }}
                      />
                      {/* Content */}
                      <span className="relative z-10 font-mono">${level.price.toFixed(2)}</span>
                      <span className="relative z-10 font-mono">{level.quantity.toFixed(4)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-theme-text-muted mt-20">
                No asks yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
