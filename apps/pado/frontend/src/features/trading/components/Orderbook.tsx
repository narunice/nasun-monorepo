/**
 * Orderbook Component
 * Vertical layout: Asks (top, reversed) → Spread → Bids (bottom)
 * With Book/Trades tab toggle (benchmark: Lighter, Hyperliquid, dYdX)
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Orderbook as OrderbookType, PriceLevel } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';
import { UnderlineTabs } from '@/components/common';
import { ConnectionStatusDot } from '@/components/common/ConnectionStatus';
import { useTradeEvents } from '../hooks/useTradeEvents';
import type { Trade } from '../types/trade';
import type { ConnectionMode } from '../types/events';

type DepthLevel = 5 | 10 | 20;
type OrderbookTab = 'book' | 'trades';

/** Available grouping sizes per pool based on tick size */
function getGroupOptions(tickSizeUsd: number): number[] {
  if (tickSizeUsd >= 0.1) return [0.1, 1, 10, 100];       // NBTC: tick=$0.10
  if (tickSizeUsd >= 0.01) return [0.01, 0.1, 1, 10];      // NASUN: tick=$0.01
  return [0.001, 0.01, 0.1, 1];
}

/** Group price levels by rounding to nearest groupSize bucket */
function groupLevels(levels: PriceLevel[], groupSize: number, isAsk: boolean): PriceLevel[] {
  const grouped = new Map<number, PriceLevel>();
  for (const level of levels) {
    // Asks round up, bids round down
    const key = isAsk
      ? Math.ceil(level.price / groupSize) * groupSize
      : Math.floor(level.price / groupSize) * groupSize;
    // Use toFixed to avoid floating point drift, then parse back
    const roundedKey = parseFloat(key.toFixed(8));
    const existing = grouped.get(roundedKey);
    if (existing) {
      existing.quantity += level.quantity;
    } else {
      grouped.set(roundedKey, { price: roundedKey, quantity: level.quantity, total: 0 });
    }
  }
  return Array.from(grouped.values());
}

/** Format group size for display */
function formatGroupLabel(size: number): string {
  if (size >= 1) return size.toString();
  return size.toFixed(size >= 0.1 ? 1 : size >= 0.01 ? 2 : 3);
}

interface OrderbookProps {
  orderbook: OrderbookType;
  onPriceClick?: (price: number) => void;
  showSpread?: boolean;
  compact?: boolean;
  isError?: boolean;
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

  // Track seen trade IDs to only animate genuinely new trades
  const [seenIds, setSeenIds] = useState(new Set<string>());
  const newTradeIds = useMemo(() => {
    const newIds = new Set<string>();
    for (const t of trades) {
      if (!seenIds.has(t.id)) newIds.add(t.id);
    }
    return newIds;
  }, [trades, seenIds]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSeenIds(prev => {
      const next = new Set(prev);
      for (const t of trades) next.add(t.id);
      return next;
    });
  }, [trades]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
                className={`grid grid-cols-3 gap-1 ${fontSize} ${rowHeight} ${
                  newTradeIds.has(trade.id)
                    ? trade.isBuy ? 'animate-flash-buy' : 'animate-flash-sell'
                    : ''
                }`}
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
            <p>No trades yet</p>
            <p className="text-[10px] mt-1">Recent market fills will appear here</p>
          </div>
        )}
      </div>
    </>
  );
}

export function Orderbook({ orderbook, onPriceClick, showSpread = true, compact = false, isError = false }: OrderbookProps) {
  const { currentPool } = useMarket();
  const tickSizeUsd = currentPool.tickSize / Math.pow(10, currentPool.quoteToken.decimals);
  const groupOptions = useMemo(() => getGroupOptions(tickSizeUsd), [tickSizeUsd]);

  const [depthLevel, setDepthLevel] = useState<DepthLevel>(() => {
    const stored = parseInt(localStorage.getItem('pado:orderbook:depth') || '');
    return ([5, 10, 20] as DepthLevel[]).includes(stored as DepthLevel) ? stored as DepthLevel : 10;
  });
  const [groupSize, setGroupSize] = useState<number>(() => {
    const stored = parseFloat(localStorage.getItem('pado:orderbook:group') || '');
    return stored > 0 ? stored : tickSizeUsd;
  });
  const [activeTab, setActiveTab] = useState<OrderbookTab>('book');

  useEffect(() => { localStorage.setItem('pado:orderbook:depth', String(depthLevel)); }, [depthLevel]);
  useEffect(() => { localStorage.setItem('pado:orderbook:group', String(groupSize)); }, [groupSize]);

  // Reset groupSize when pool changes and stored value is not in the new options
  useEffect(() => {
    if (!groupOptions.includes(groupSize)) {
      setGroupSize(groupOptions[0]);
    }
  }, [groupOptions, groupSize]);

  // Cycle through group options on click
  const cycleGroupSize = useCallback(() => {
    const idx = groupOptions.indexOf(groupSize);
    const next = groupOptions[(idx + 1) % groupOptions.length];
    setGroupSize(next);
  }, [groupOptions, groupSize]);

  // On-chain market tape — lifted to Orderbook level to persist across tab switches
  const { trades: marketTrades, connectionMode } = useTradeEvents();

  const handlePriceClick = (price: number) => {
    if (onPriceClick) {
      onPriceClick(price);
    }
  };

  // Apply grouping then limit display depth
  const isGrouped = groupSize > tickSizeUsd;
  const displayedBids = useMemo(() => {
    const levels = isGrouped ? groupLevels(orderbook.bids, groupSize, false) : orderbook.bids;
    return levels.slice(0, depthLevel);
  }, [orderbook.bids, groupSize, isGrouped, depthLevel]);
  const displayedAsks = useMemo(() => {
    const levels = isGrouped ? groupLevels(orderbook.asks, groupSize, true) : orderbook.asks;
    return levels.slice(0, depthLevel);
  }, [orderbook.asks, groupSize, isGrouped, depthLevel]);

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

  // Determine price decimal places from groupSize
  const priceDecimals = useMemo(() => {
    if (groupSize >= 1) return 0;
    if (groupSize >= 0.1) return 1;
    if (groupSize >= 0.01) return 2;
    return 3;
  }, [groupSize]);

  // Track price direction for spread arrow
  const prevMidPriceRef = useRef<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (!spreadInfo) return;
    const prev = prevMidPriceRef.current;
    if (prev !== null && prev !== spreadInfo.midPrice) {
      setPriceDirection(spreadInfo.midPrice > prev ? 'up' : 'down');
    }
    prevMidPriceRef.current = spreadInfo.midPrice;
  }, [spreadInfo]);

  // Auto-scroll asks container to bottom so best ask is visible near spread
  const asksContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = asksContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [reversedAsks]);

  // Track previous level quantities for pulse animation
  const prevLevelsRef = useRef<Map<number, number>>(new Map());
  const prevGroupSizeRef = useRef(groupSize);
  const [pulseKey, setPulseKey] = useState(0);

  // Detect quantity changes for pulse animation (read-only from refs)
  const changedPrices = useMemo(() => {
    const changes = new Map<number, 'up' | 'down'>();
    // Skip pulse when groupSize changed (all prices shift)
    if (prevGroupSizeRef.current !== groupSize) return changes;
    const prev = prevLevelsRef.current;
    for (const level of displayedBids) {
      const prevQty = prev.get(level.price);
      if (prevQty !== undefined && prevQty !== level.quantity) {
        changes.set(level.price, level.quantity > prevQty ? 'up' : 'down');
      }
    }
    for (const level of displayedAsks) {
      const prevQty = prev.get(level.price);
      if (prevQty !== undefined && prevQty !== level.quantity) {
        changes.set(level.price, level.quantity > prevQty ? 'up' : 'down');
      }
    }
    return changes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedBids, displayedAsks, groupSize]);

  // Update refs and pulse key in useEffect (safe for concurrent mode)
  useEffect(() => {
    if (prevGroupSizeRef.current !== groupSize) {
      prevGroupSizeRef.current = groupSize;
      prevLevelsRef.current = new Map();
      return;
    }
    const next = new Map<number, number>();
    for (const l of displayedBids) next.set(l.price, l.quantity);
    for (const l of displayedAsks) next.set(l.price, l.quantity);
    prevLevelsRef.current = next;
    if (changedPrices.size > 0) setPulseKey((k) => k + 1);
  }, [displayedBids, displayedAsks, changedPrices, groupSize]);

  const rowHeight = compact ? 'py-px' : 'py-0.5';
  const fontSize = compact ? 'text-trading-xs xl:text-trading-sm' : 'text-trading-sm xl:text-trading-lg';

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {isError && (
        <div className="px-2 py-1 text-xs text-yellow-300 bg-yellow-900/30 border-b border-yellow-700/40" role="alert">
          Orderbook unavailable — showing last known data
        </div>
      )}
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
            <div className="flex items-center gap-2">
              {/* Group size (click to cycle) */}
              <button
                onClick={cycleGroupSize}
                className="px-1.5 py-0.5 text-trading-xs xl:text-trading-sm rounded bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                title={`Price grouping: ${formatGroupLabel(groupSize)}`}
              >
                {formatGroupLabel(groupSize)}
              </button>
              {/* Depth level */}
              <div className="flex gap-0.5">
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
          <div ref={asksContainerRef} className="flex-1 overflow-y-auto flex flex-col">
            {reversedAsks.length > 0 ? (
              <div className="mt-auto space-y-px">
                {reversedAsks.map((level, i) => {
                  const cumulative = reversedAskCumulatives[i];
                  const depthPercent = maxCumulative > 0 ? (cumulative / maxCumulative) * 100 : 0;
                  const change = changedPrices.get(level.price);
                  const pulseClass = change === 'up' ? 'animate-pulse-up' : change === 'down' ? 'animate-pulse-down' : '';

                  return (
                    <div
                      key={change ? `${i}-${pulseKey}` : i}
                      className={`relative grid grid-cols-3 gap-1 ${fontSize} ${rowHeight} ${pulseClass} ${
                        onPriceClick ? 'cursor-pointer hover:bg-trading-ask-bg' : ''
                      }`}
                      onClick={() => handlePriceClick(level.price)}
                    >
                      {/* Depth Bar (right-aligned, gradient for asks) */}
                      <div
                        className="absolute right-0 top-0 bottom-0"
                        style={{
                          width: `${depthPercent}%`,
                          background: 'linear-gradient(to left, var(--color-ask-bg), transparent)',
                        }}
                      />
                      {/* Content */}
                      <span className="relative z-10 font-mono text-trading-ask">{level.price.toFixed(priceDecimals)}</span>
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
              <span className="text-trading-xl xl:text-trading-2xl font-bold font-mono flex items-center gap-1">
                {priceDirection === 'up' && (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="text-trading-bid"><path d="M6 2L10 8H2L6 2Z" fill="currentColor" /></svg>
                )}
                {priceDirection === 'down' && (
                  <svg width="12" height="12" viewBox="0 0 12 12" className="text-trading-ask"><path d="M6 10L2 4H10L6 10Z" fill="currentColor" /></svg>
                )}
                <span className={priceDirection === 'up' ? 'text-trading-bid' : priceDirection === 'down' ? 'text-trading-ask' : 'text-theme-text-primary'}>
                  {spreadInfo.midPrice.toFixed(2)}
                </span>
              </span>
              <span className="text-trading-xs xl:text-trading-sm">
                <span className="text-theme-text-muted">Spread </span>
                <span className={`font-mono ${
                  spreadInfo.spreadPercent > 0.5 ? 'text-yellow-400' :
                  spreadInfo.spreadPercent > 0.2 ? 'text-theme-text-muted' :
                  'text-green-400'
                }`}>
                  {spreadInfo.spread.toFixed(2)} ({spreadInfo.spreadPercent.toFixed(3)}%)
                </span>
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
                  const change = changedPrices.get(level.price);
                  const pulseClass = change === 'up' ? 'animate-pulse-up' : change === 'down' ? 'animate-pulse-down' : '';

                  return (
                    <div
                      key={change ? `${i}-${pulseKey}` : i}
                      className={`relative grid grid-cols-3 gap-1 ${fontSize} ${rowHeight} ${pulseClass} ${
                        onPriceClick ? 'cursor-pointer hover:bg-trading-bid-bg' : ''
                      }`}
                      onClick={() => handlePriceClick(level.price)}
                    >
                      {/* Depth Bar (right-aligned, gradient for bids) */}
                      <div
                        className="absolute right-0 top-0 bottom-0"
                        style={{
                          width: `${depthPercent}%`,
                          background: 'linear-gradient(to left, var(--color-bid-bg), transparent)',
                        }}
                      />
                      {/* Content */}
                      <span className="relative z-10 font-mono text-trading-bid">{level.price.toFixed(priceDecimals)}</span>
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
