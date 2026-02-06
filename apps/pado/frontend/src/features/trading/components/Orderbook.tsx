/**
 * Orderbook Component
 * Vertical layout: Asks (top, reversed) → Spread → Bids (bottom)
 * With Book/Trades tab toggle (benchmark: Lighter, Hyperliquid, dYdX)
 */

import { useState, useMemo } from 'react';
import type { Orderbook as OrderbookType } from '../../../lib/deepbook';
import { UnderlineTabs } from '@/components/common';
import { ConnectionStatusDot } from '@/components/common/ConnectionStatus';
import { useTradeEvents } from '../hooks/useTradeEvents';
import type { Trade } from '../types/trade';
import type { ConnectionMode } from '../types/events';

type DepthLevel = 5 | 10 | 20;
type OrderbookTab = 'book' | 'trades';

interface OrderbookProps {
  orderbook: OrderbookType;
  onPriceClick?: (price: number) => void;
  showSpread?: boolean;
  compact?: boolean;
}

function formatTradeTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface TradesPanelProps {
  compact: boolean;
  trades: Trade[];
  connectionMode: ConnectionMode;
}

function TradesPanel({ compact, trades, connectionMode }: TradesPanelProps) {
  const fontSize = compact ? 'text-trading-xs xl:text-trading-sm' : 'text-trading-sm xl:text-trading-lg';
  const rowHeight = compact ? 'py-px' : 'py-0.5';

  return (
    <>
      {/* Column Headers */}
      <div className={`grid grid-cols-3 gap-1 ${fontSize} text-theme-text-muted mb-1 pb-1 border-b border-theme-border`}>
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right flex items-center justify-end gap-1">
          Time <ConnectionStatusDot mode={connectionMode} />
        </span>
      </div>

      {/* Trades List */}
      <div className="flex-1 overflow-y-auto">
        {trades.length > 0 ? (
          <div className="space-y-px">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className={`grid grid-cols-3 gap-1 ${fontSize} ${rowHeight}`}
              >
                <span className={`font-mono ${trade.isBuy ? 'text-trading-bid' : 'text-trading-ask'}`}>
                  {trade.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="font-mono text-right text-theme-text-secondary">
                  {trade.quantity.toFixed(5)}
                </span>
                <span className="font-mono text-right text-theme-text-muted">
                  {formatTradeTime(trade.timestamp)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`text-center text-theme-text-muted ${fontSize} py-8`}>
            No trades yet
          </div>
        )}
      </div>
    </>
  );
}

export function Orderbook({ orderbook, onPriceClick, showSpread = true, compact = false }: OrderbookProps) {
  const [depthLevel, setDepthLevel] = useState<DepthLevel>(10);
  const [activeTab, setActiveTab] = useState<OrderbookTab>('book');

  // On-chain market tape — lifted to Orderbook level to persist across tab switches
  const { trades: marketTrades, connectionMode } = useTradeEvents();

  const handlePriceClick = (price: number) => {
    if (onPriceClick) {
      onPriceClick(price);
    }
  };

  // Limit display depth
  const displayedBids = orderbook.bids.slice(0, depthLevel);
  const displayedAsks = orderbook.asks.slice(0, depthLevel);

  // Reverse asks for vertical display (best ask at bottom, near spread)
  const reversedAsks = useMemo(() => [...displayedAsks].reverse(), [displayedAsks]);

  // Spread calculation
  const spreadInfo = useMemo(() => {
    const bestBid = displayedBids[0]?.price ?? 0;
    const bestAsk = displayedAsks[0]?.price ?? 0;
    if (bestBid === 0 || bestAsk === 0) return null;

    const spread = bestAsk - bestBid;
    const midPrice = (bestAsk + bestBid) / 2;
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    return { spread, spreadPercent, midPrice };
  }, [displayedBids, displayedAsks]);

  // Cumulative calculations for depth visualization
  const { maxCumulative, bidCumulatives, askCumulatives } = useMemo(() => {
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
      maxCumulative: maxTotal,
      bidCumulatives,
      askCumulatives,
    };
  }, [displayedBids, displayedAsks]);

  // Reversed ask cumulatives for display
  const reversedAskCumulatives = useMemo(() => [...askCumulatives].reverse(), [askCumulatives]);

  const rowHeight = compact ? 'py-px' : 'py-0.5';
  const fontSize = compact ? 'text-trading-xs xl:text-trading-sm' : 'text-trading-sm xl:text-trading-lg';

  return (
    <div className="flex flex-col h-full">
      {/* Header: Book/Trades tabs + depth selector */}
      <UnderlineTabs
        tabs={[
          { id: 'book' as const, label: 'Order Book' },
          { id: 'trades' as const, label: 'Trades' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        rightContent={
          activeTab === 'book' ? (
            <div className="flex gap-1">
              {([5, 10, 20] as DepthLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setDepthLevel(level)}
                  className={`px-1.5 py-0.5 text-trading-xs xl:text-trading-sm rounded transition-colors ${
                    depthLevel === level
                      ? 'bg-theme-accent text-white'
                      : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />

      {/* Trades Tab */}
      {activeTab === 'trades' && (
        <TradesPanel compact={compact} trades={marketTrades} connectionMode={connectionMode} />
      )}

      {/* Book Tab */}
      {activeTab === 'book' && (
        <>
          {/* Column Headers */}
          <div className={`grid grid-cols-3 gap-1 ${fontSize} text-theme-text-muted mb-1 pb-1 border-b border-theme-border`}>
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Total</span>
          </div>

          {/* Asks (reversed - best ask at bottom) */}
          <div className="flex-1 overflow-y-auto flex flex-col justify-end">
            {reversedAsks.length > 0 ? (
              <div className="space-y-px">
                {reversedAsks.map((level, i) => {
                  const cumulative = reversedAskCumulatives[i];
                  const depthPercent = maxCumulative > 0 ? (cumulative / maxCumulative) * 100 : 0;

                  return (
                    <div
                      key={i}
                      className={`relative grid grid-cols-3 gap-1 ${fontSize} ${rowHeight} ${
                        onPriceClick ? 'cursor-pointer hover:bg-trading-ask-bg' : ''
                      }`}
                      onClick={() => handlePriceClick(level.price)}
                    >
                      {/* Depth Bar (right-aligned for asks) */}
                      <div
                        className="absolute right-0 top-0 bottom-0 bg-trading-ask-bg"
                        style={{ width: `${depthPercent}%` }}
                      />
                      {/* Content */}
                      <span className="relative z-10 font-mono text-trading-ask">{level.price.toFixed(2)}</span>
                      <span className="relative z-10 font-mono text-right text-theme-text-secondary">{level.quantity.toFixed(4)}</span>
                      <span className="relative z-10 font-mono text-right text-theme-text-muted">{cumulative.toFixed(4)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`text-center text-theme-text-muted ${fontSize} py-4`}>No asks</div>
            )}
          </div>

          {/* Spread / Mid Price */}
          {showSpread && spreadInfo && (
            <div className="flex items-center justify-between py-2 px-1 my-1 bg-theme-bg-tertiary rounded">
              <span className="text-trading-xl font-bold text-theme-text-primary font-mono">
                {spreadInfo.midPrice.toFixed(2)}
              </span>
              <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">
                Spread: <span className="font-mono">{spreadInfo.spread.toFixed(2)}</span> ({spreadInfo.spreadPercent.toFixed(3)}%)
              </span>
            </div>
          )}

          {/* Bids (best bid at top) */}
          <div className="flex-1 overflow-y-auto">
            {displayedBids.length > 0 ? (
              <div className="space-y-px">
                {displayedBids.map((level, i) => {
                  const cumulative = bidCumulatives[i];
                  const depthPercent = maxCumulative > 0 ? (cumulative / maxCumulative) * 100 : 0;

                  return (
                    <div
                      key={i}
                      className={`relative grid grid-cols-3 gap-1 ${fontSize} ${rowHeight} ${
                        onPriceClick ? 'cursor-pointer hover:bg-trading-bid-bg' : ''
                      }`}
                      onClick={() => handlePriceClick(level.price)}
                    >
                      {/* Depth Bar (right-aligned for bids) */}
                      <div
                        className="absolute right-0 top-0 bottom-0 bg-trading-bid-bg"
                        style={{ width: `${depthPercent}%` }}
                      />
                      {/* Content */}
                      <span className="relative z-10 font-mono text-trading-bid">{level.price.toFixed(2)}</span>
                      <span className="relative z-10 font-mono text-right text-theme-text-secondary">{level.quantity.toFixed(4)}</span>
                      <span className="relative z-10 font-mono text-right text-theme-text-muted">{cumulative.toFixed(4)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`text-center text-theme-text-muted ${fontSize} py-4`}>No bids</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
