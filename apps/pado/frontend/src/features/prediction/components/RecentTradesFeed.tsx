/**
 * RecentTradesFeed — terminal-style ticker of last 15 fills for the market.
 *
 * `OrderFilled.is_bid` is from the **maker** perspective (Move emits is_bid=false
 * on place_buy_taker → maker was asking → taker BOUGHT). UI flips it to taker
 * direction so green = buy, red = sell.
 */

import type { RecentFill } from '../types';
import { useRecentFills } from '../hooks/useRecentFills';
import { useActiveAddress } from '../hooks/useActiveAddress';
import { formatTimeAgo } from '@/lib/format';

interface RecentTradesFeedProps {
  marketId: string;
}

const VISIBLE_LIMIT = 15;

function formatShares(raw: bigint): string {
  // Shares are stored at NUSDC's 6-decimal scale (1 mint = `amount` raw share
  // units = `amount`/1e6 display shares). Use adaptive precision: dust trades
  // need 4 decimals to be visible at all, normal trades show 2.
  const display = Number(raw) / 1_000_000;
  if (display === 0) return '0';
  if (Math.abs(display) < 1) return display.toFixed(4);
  if (Math.abs(display) < 100) return display.toFixed(2);
  return display.toFixed(0);
}

function formatCost(raw: bigint): string {
  const display = Number(raw) / 1_000_000; // NUSDC = 6 decimals
  if (display < 1) return `$${display.toFixed(2)}`;
  if (display < 1000) return `$${display.toFixed(0)}`;
  return `$${(display / 1000).toFixed(1)}k`;
}

function TradeRow({ fill, isMine }: { fill: RecentFill; isMine: boolean }) {
  const isBuy = !fill.isBid;
  const side = isBuy
    ? fill.isYes ? 'BUY YES' : 'BUY NO'
    : fill.isYes ? 'SELL YES' : 'SELL NO';
  const price = (fill.price / 10000).toFixed(2);
  const shares = formatShares(fill.fillShares);
  const cost = formatCost(fill.cost);
  const borderColor = isBuy ? 'rgb(22 163 74)' : 'rgb(220 38 38)';
  const sideColor = isBuy ? 'text-green-500' : 'text-red-500';

  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 border-l-2 transition-colors duration-150 hover:bg-theme-bg-primary/40 animate-trade-row-in${
        isMine ? ' bg-theme-accent/10 ring-1 ring-theme-accent/40' : ''
      }`}
      style={{ borderLeftColor: borderColor }}
    >
      <span className={`shrink-0 text-[10px] font-bold font-mono tracking-wider w-16 ${sideColor}`}>
        {isMine ? '★ ' : ''}{side}
      </span>
      <span className="shrink-0 font-mono text-xs text-theme-text-primary tabular-nums w-12">
        ${price}
      </span>
      <span className="shrink-0 font-mono text-xs text-theme-text-secondary tabular-nums w-14 text-right">
        {cost}
      </span>
      <span className="flex-1 font-mono text-xs text-theme-text-muted tabular-nums text-right">
        {shares}
      </span>
      <span className="shrink-0 text-[10px] text-theme-text-muted/60 w-12 text-right">
        {formatTimeAgo(fill.timestamp)}
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-l-2 border-theme-border animate-pulse">
      <div className="h-2.5 w-16 bg-theme-bg-tertiary rounded" />
      <div className="h-2.5 w-10 bg-theme-bg-tertiary rounded" />
      <div className="flex-1 flex justify-end">
        <div className="h-2.5 w-12 bg-theme-bg-tertiary rounded" />
      </div>
      <div className="h-2.5 w-10 bg-theme-bg-tertiary rounded" />
    </div>
  );
}

export function RecentTradesFeed({ marketId }: RecentTradesFeedProps) {
  const { data: fills = [], isLoading } = useRecentFills(marketId);
  const myAddress = useActiveAddress()?.toLowerCase();
  const visible = fills.slice(0, VISIBLE_LIMIT);

  return (
    <div className="bg-theme-bg-secondary rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme-border/50">
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-theme-text-secondary tracking-wide uppercase">
            Recent Trades
          </span>
        </div>
        <div className="flex gap-3 text-[10px] font-mono text-theme-text-muted/50 uppercase tracking-wider">
          <span className="w-16">Side</span>
          <span className="w-12">Price</span>
          <span className="w-14 text-right">Cost</span>
          <span className="flex-1 text-right">Shares</span>
          <span className="w-12 text-right">Time</span>
        </div>
      </div>

      <div className="divide-y divide-theme-border/20">
        {isLoading ? (
          Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
        ) : visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-theme-text-muted/50">
            No trades yet
          </div>
        ) : (
          visible.map((fill) => {
            const isMine = !!myAddress && (
              fill.taker.toLowerCase() === myAddress ||
              fill.maker.toLowerCase() === myAddress
            );
            return (
              <TradeRow key={`${fill.orderId}-${fill.timestamp}`} fill={fill} isMine={isMine} />
            );
          })
        )}
      </div>
    </div>
  );
}
