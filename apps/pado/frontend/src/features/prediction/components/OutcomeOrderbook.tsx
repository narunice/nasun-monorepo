/**
 * OutcomeOrderbook Component
 * Displays YES/NO orderbook for prediction market
 */

import { useState, useMemo } from 'react';
import type { Orderbook, OrderbookLevel } from '../types';
import { formatCents } from '../utils/formatPrice';

interface OutcomeOrderbookProps {
  yesOrderbook: Orderbook;
  noOrderbook: Orderbook;
  onPriceClick?: (isYes: boolean, price: number) => void;
}

export function OutcomeOrderbook({ yesOrderbook, noOrderbook, onPriceClick }: OutcomeOrderbookProps) {
  const [activeTab, setActiveTab] = useState<'yes' | 'no'>('yes');

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-3 sm:p-4">
      {/* Tab Header */}
      <div className="flex gap-2 mb-3 sm:mb-4">
        <button
          onClick={() => setActiveTab('yes')}
          className={`flex-1 min-h-[40px] py-2 px-3 sm:px-4 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'yes'
              ? 'bg-green-600 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          YES <span className="hidden sm:inline">Orderbook</span>
        </button>
        <button
          onClick={() => setActiveTab('no')}
          className={`flex-1 min-h-[40px] py-2 px-3 sm:px-4 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'no'
              ? 'bg-red-600 text-white'
              : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-primary'
          }`}
        >
          NO <span className="hidden sm:inline">Orderbook</span>
        </button>
      </div>

      {/* Orderbook Content */}
      {activeTab === 'yes' ? (
        <OrderbookPanel
          orderbook={yesOrderbook}
          isYes={true}
          onPriceClick={onPriceClick}
        />
      ) : (
        <OrderbookPanel
          orderbook={noOrderbook}
          isYes={false}
          onPriceClick={onPriceClick}
        />
      )}
    </div>
  );
}

interface OrderbookPanelProps {
  orderbook: Orderbook;
  isYes: boolean;
  onPriceClick?: (isYes: boolean, price: number) => void;
}

function OrderbookPanel({ orderbook, isYes, onPriceClick }: OrderbookPanelProps) {
  const color = isYes ? 'green' : 'red';

  // Calculate cumulative amounts for depth visualization
  const { maxCumulative, bidCumulatives, askCumulatives } = useMemo(() => {
    let bidSum = 0n;
    const bidCumulatives = orderbook.bids.map((level) => {
      bidSum += level.amount;
      return bidSum;
    });

    let askSum = 0n;
    const askCumulatives = orderbook.asks.map((level) => {
      askSum += level.amount;
      return askSum;
    });

    const maxBid = bidCumulatives[bidCumulatives.length - 1] || 0n;
    const maxAsk = askCumulatives[askCumulatives.length - 1] || 0n;
    const maxTotal = maxBid > maxAsk ? maxBid : maxAsk;

    return {
      maxCumulative: maxTotal,
      bidCumulatives,
      askCumulatives,
    };
  }, [orderbook]);

  // Count real vs simulated orders
  const realBidCount = orderbook.bids.filter(l => !l.isSimulated).length;
  const simBidCount = orderbook.bids.filter(l => l.isSimulated).length;
  const realAskCount = orderbook.asks.filter(l => !l.isSimulated).length;
  const simAskCount = orderbook.asks.filter(l => l.isSimulated).length;
  const hasRealOrders = realBidCount > 0 || realAskCount > 0;

  const handleClick = (price: number) => {
    onPriceClick?.(isYes, price);
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4">
      {/* Bids (Buy orders) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className={`text-sm font-medium text-${color}-600 dark:text-${color}-400`}>
            Bids
          </h4>
          {simBidCount > 0 && (
            <span className="text-xs text-yellow-600 dark:text-yellow-500">
              {realBidCount > 0 ? `${simBidCount}/${orderbook.bids.length} sim` : 'Simulated'}
            </span>
          )}
        </div>
        <div className="bg-theme-bg-tertiary rounded p-2 h-48 sm:h-64 overflow-y-auto">
          <div className="text-xs text-theme-text-muted flex justify-between mb-2 border-b border-theme-border pb-1">
            <span>Price</span>
            <span>Shares</span>
          </div>
          {orderbook.bids.length > 0 ? (
            <div className="space-y-0.5">
              {orderbook.bids.map((level, i) => {
                const depthPercent = maxCumulative > 0n
                  ? Number((bidCumulatives[i] * 100n) / maxCumulative)
                  : 0;

                return (
                  <OrderbookRow
                    key={i}
                    level={level}
                    depthPercent={depthPercent}
                    isBid={true}
                    color={color}
                    onClick={() => handleClick(level.price)}
                    hasRealOrders={hasRealOrders}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center text-theme-text-muted mt-20 text-sm">
              No bids yet
            </div>
          )}
        </div>
      </div>

      {/* Asks (Sell orders) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className={`text-sm font-medium text-${color}-600 dark:text-${color}-400`}>
            Asks
          </h4>
          {simAskCount > 0 && (
            <span className="text-xs text-yellow-600 dark:text-yellow-500">
              {realAskCount > 0 ? `${simAskCount}/${orderbook.asks.length} sim` : 'Simulated'}
            </span>
          )}
        </div>
        <div className="bg-theme-bg-tertiary rounded p-2 h-48 sm:h-64 overflow-y-auto">
          <div className="text-xs text-theme-text-muted flex justify-between mb-2 border-b border-theme-border pb-1">
            <span>Price</span>
            <span>Shares</span>
          </div>
          {orderbook.asks.length > 0 ? (
            <div className="space-y-0.5">
              {orderbook.asks.map((level, i) => {
                const depthPercent = maxCumulative > 0n
                  ? Number((askCumulatives[i] * 100n) / maxCumulative)
                  : 0;

                return (
                  <OrderbookRow
                    key={i}
                    level={level}
                    depthPercent={depthPercent}
                    isBid={false}
                    color={color}
                    onClick={() => handleClick(level.price)}
                    hasRealOrders={hasRealOrders}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center text-theme-text-muted mt-20 text-sm">
              No asks yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface OrderbookRowProps {
  level: OrderbookLevel;
  depthPercent: number;
  isBid: boolean;
  color: string;
  onClick: () => void;
  hasRealOrders?: boolean; // true if there are any real orders in the orderbook
}

function OrderbookRow({ level, depthPercent, isBid, color, onClick, hasRealOrders }: OrderbookRowProps) {
  // bps → cents (1¢ = 1% probability since each share pays $1 at resolution)
  const priceLabel = formatCents(level.price, 1);
  const shares = Number(level.amount);
  const isSimulated = level.isSimulated ?? false;

  return (
    <div
      className={`relative text-xs flex justify-between py-1 sm:py-0.5 cursor-pointer hover:brightness-125 active:bg-theme-bg-primary/40 ${
        color === 'green'
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400'
      } ${isSimulated ? 'opacity-60' : ''}`}
      onClick={onClick}
    >
      {/* Depth Bar */}
      <div
        className={`absolute ${isBid ? 'right-0' : 'left-0'} top-0 bottom-0 ${
          color === 'green' ? 'bg-green-500/20' : 'bg-red-500/20'
        }`}
        style={{ width: `${depthPercent}%` }}
      />
      {/* Content */}
      <span className="relative z-10 font-mono flex items-center gap-1">
        {priceLabel}
        {isSimulated && hasRealOrders && (
          <span className="text-yellow-600 dark:text-yellow-500 text-[10px]">•</span>
        )}
      </span>
      <span className="relative z-10 font-mono">{shares.toLocaleString()}</span>
    </div>
  );
}

/**
 * Generate simulated orderbook data
 * In production, this would be fetched from on-chain
 */
export function generateSimulatedOrderbook(basePrice: number): Orderbook {
  const bids: OrderbookLevel[] = [];
  const asks: OrderbookLevel[] = [];

  // Generate bids (buy orders below market price)
  for (let i = 0; i < 8; i++) {
    const price = Math.max(100, basePrice - (i + 1) * 200); // Decrease by 2%
    bids.push({
      price,
      amount: BigInt(Math.floor(Math.random() * 5000) + 1000),
      orders: [],
      isSimulated: true, // Simulated data
    });
  }

  // Generate asks (sell orders above market price)
  for (let i = 0; i < 8; i++) {
    const price = Math.min(9900, basePrice + (i + 1) * 200); // Increase by 2%
    asks.push({
      price,
      amount: BigInt(Math.floor(Math.random() * 5000) + 1000),
      orders: [],
      isSimulated: true, // Simulated data
    });
  }

  return { bids, asks };
}
