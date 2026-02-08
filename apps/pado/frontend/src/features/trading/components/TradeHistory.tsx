/**
 * TradeHistory Component
 * Personal trade fills (1 fill = 1 row) with Role (Maker/Taker)
 * Used in BottomTabPanel "Trade History" tab
 *
 * Features:
 * - P&L per trade (realized for sells, unrealized for buys)
 * - Share PnL card per trade (canvas-based image)
 * - Export all trades as CSV
 */

import { useState } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useMarket } from "../context/MarketContext";
import { useMyTrades, type MyTradeItem } from "../hooks/useMyTrades";
import { useOrderActions } from "../hooks";
import { SkeletonTable } from '@/components/common';
import { type TokenSymbol, getUnifiedPrice } from '@/lib/prices';
import { useCostBasis } from '@/features/portfolio/hooks/useCostBasis';
import { downloadPnlCard, copyPnlCardToClipboard, type PnlCardData } from '@/lib/pnl-share-card';
import { generateCsv, downloadCsv } from '@/lib/csv-export';

// Re-export Trade type for external consumers (useTradeEvents compatibility)
export type { Trade } from '../types/trade';

interface TradeHistoryProps {
  className?: string;
}

const PAGE_SIZE = 10;

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return formatTime(timestamp);
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }) + ' ' + formatTime(timestamp);
}

function computePnl(
  trade: MyTradeItem,
  baseSymbol: TokenSymbol,
  avgBuyPrice: number,
): { pnl: number; pnlPercent: number } | null {
  if (!avgBuyPrice) return null;
  const currentPrice = getUnifiedPrice(baseSymbol);
  const pnl = trade.isBid
    ? (currentPrice - trade.price) * trade.quantity
    : (trade.price - avgBuyPrice) * trade.quantity;
  const costBasis = trade.isBid ? trade.price * trade.quantity : avgBuyPrice * trade.quantity;
  const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  return {
    pnl: Math.round(pnl * 100) / 100,
    pnlPercent: Math.round(pnlPercent * 100) / 100,
  };
}

function buildPnlCardData(
  trade: MyTradeItem,
  pair: string,
  baseSymbol: string,
  avgBuyPrice: number,
  pnl: number,
  pnlPercent: number,
): PnlCardData {
  const currentPrice = getUnifiedPrice(baseSymbol as TokenSymbol);
  return {
    side: trade.isBid ? 'BUY' : 'SELL',
    pair,
    pnl,
    pnlPercent,
    entryPrice: trade.isBid ? trade.price : avgBuyPrice,
    exitPrice: trade.isBid ? undefined : trade.price,
    currentPrice: trade.isBid ? currentPrice : undefined,
    quantity: trade.quantity,
    baseSymbol,
    timestamp: trade.timestamp,
  };
}

// Share button icon (arrow-up-from-square)
function ShareIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// Download icon
function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function TradeHistory({ className = "" }: TradeHistoryProps) {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  const { currentPool, getMarketLabel } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol as TokenSymbol;
  const quoteSymbol = currentPool.quoteToken.symbol;
  const pair = getMarketLabel();

  const { balanceManagerId } = useOrderActions();
  const { data: trades, isLoading } = useMyTrades(balanceManagerId);
  const { entries: costBasis } = useCostBasis();
  const avgBuyPrice = costBasis.find((e) => e.symbol === baseSymbol)?.avgBuyPrice ?? 0;

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const handleShareTrade = async (trade: MyTradeItem) => {
    const pnlData = computePnl(trade, baseSymbol, avgBuyPrice);
    if (!pnlData) return;

    setSharingId(trade.id);
    try {
      const cardData = buildPnlCardData(trade, pair, baseSymbol, avgBuyPrice, pnlData.pnl, pnlData.pnlPercent);
      const copied = await copyPnlCardToClipboard(cardData);
      if (copied) {
        // Brief visual feedback — sharingId resets below
      }
    } finally {
      // Reset after a short delay for visual feedback
      setTimeout(() => setSharingId(null), 1500);
    }
  };

  const handleDownloadTrade = async (trade: MyTradeItem) => {
    const pnlData = computePnl(trade, baseSymbol, avgBuyPrice);
    if (!pnlData) return;
    const cardData = buildPnlCardData(trade, pair, baseSymbol, avgBuyPrice, pnlData.pnl, pnlData.pnlPercent);
    await downloadPnlCard(cardData);
  };

  const handleExportCsv = () => {
    if (!trades || trades.length === 0) return;
    const csv = generateCsv(trades, [
      { header: 'Date', accessor: (t) => new Date(t.timestamp).toISOString() },
      { header: 'Pair', accessor: () => pair },
      { header: 'Side', accessor: (t) => (t.isBid ? 'BUY' : 'SELL') },
      { header: 'Price', accessor: (t) => t.price },
      { header: 'Amount', accessor: (t) => t.quantity },
      { header: 'Total', accessor: (t) => Math.round(t.price * t.quantity * 100) / 100 },
      { header: 'Role', accessor: (t) => t.role },
      { header: 'TX Digest', accessor: (t) => t.txDigest },
    ]);
    const filename = `pado-trades-${pair.replace('/', '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(csv, filename);
  };

  if (!isConnected) {
    return (
      <div className={`text-center text-theme-text-muted py-6 ${className}`}>
        <p className="text-trading-sm xl:text-trading-lg">Connect wallet to view trade history</p>
      </div>
    );
  }

  if (!balanceManagerId) {
    return (
      <div className={`text-center text-theme-text-muted py-6 ${className}`}>
        <p className="text-trading-sm xl:text-trading-lg">Enable Pado to view trade history</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`py-4 px-2 ${className}`}>
        <SkeletonTable rows={5} cols={6} />
      </div>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <div className={`text-center text-theme-text-muted py-6 ${className}`}>
        <p className="text-trading-sm xl:text-trading-lg">No trades yet</p>
        <p className="text-[10px] xl:text-trading-xs mt-1">Your fills will appear here</p>
      </div>
    );
  }

  const visibleTrades = trades.slice(0, visibleCount);
  const remainingCount = trades.length - visibleCount;
  const canShowMore = remainingCount > 0;
  const canShowLess = visibleCount > PAGE_SIZE;

  return (
    <div className={className}>
      {/* Header with CSV export */}
      <div className="flex items-center justify-end gap-2 pb-1">
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-1 px-2 py-1 text-[10px] xl:text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors rounded hover:bg-theme-bg-tertiary"
          title="Export trades as CSV"
        >
          <DownloadIcon className="w-3 h-3" />
          CSV
        </button>
      </div>

      <table className="w-full text-xs xl:text-sm">
        <thead className="text-theme-text-secondary">
          <tr>
            <th className="py-2 px-2 text-left font-medium">Side</th>
            <th className="py-2 px-2 text-right font-medium">Price ({quoteSymbol})</th>
            <th className="py-2 px-2 text-right font-medium">Amount ({baseSymbol})</th>
            <th className="py-2 px-2 text-center font-medium">Role</th>
            <th className="py-2 px-2 text-right font-medium">P&L</th>
            <th className="py-2 px-2 text-right font-medium">Time</th>
            <th className="py-2 px-1 w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border">
          {visibleTrades.map((trade) => {
            const pnlData = computePnl(trade, baseSymbol, avgBuyPrice);
            const isSharing = sharingId === trade.id;

            return (
              <tr key={trade.id} className="hover:bg-theme-bg-tertiary/30 transition-colors">
                <td className={`py-1.5 px-2 font-semibold ${
                  trade.isBid
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400'
                }`}>
                  {trade.isBid ? 'BUY' : 'SELL'}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-theme-text-primary">
                  ${trade.price.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-theme-text-primary">
                  {trade.quantity.toFixed(5)}
                </td>
                <td className="py-1.5 px-2 text-center">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] xl:text-xs font-medium ${
                    trade.role === 'taker'
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'bg-gray-600/20 text-gray-400'
                  }`}>
                    {trade.role === 'taker' ? 'Taker' : 'Maker'}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-right font-mono">
                  {pnlData ? (() => {
                    const color = pnlData.pnl > 0
                      ? 'text-green-700 dark:text-green-400'
                      : pnlData.pnl < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-theme-text-muted';
                    const sign = pnlData.pnl > 0 ? '+' : '';
                    return (
                      <span className={color}>
                        {sign}${pnlData.pnl.toFixed(2)}
                      </span>
                    );
                  })() : <span className="text-theme-text-muted">--</span>}
                </td>
                <td className="py-1.5 px-2 text-right text-theme-text-muted">
                  {formatDate(trade.timestamp)}
                </td>
                <td className="py-1.5 px-1">
                  {pnlData && (
                    <div className="flex items-center gap-0.5 justify-end">
                      <button
                        onClick={() => handleShareTrade(trade)}
                        className={`p-1 rounded transition-colors ${
                          isSharing
                            ? 'text-green-400 bg-green-500/10'
                            : 'text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary'
                        }`}
                        title={isSharing ? 'Copied!' : 'Copy PnL card'}
                      >
                        <ShareIcon />
                      </button>
                      <button
                        onClick={() => handleDownloadTrade(trade)}
                        className="p-1 rounded text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary transition-colors"
                        title="Download PnL card"
                      >
                        <DownloadIcon />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {(canShowMore || canShowLess) && (
        <div className="flex justify-center gap-3 pt-2">
          {canShowMore && (
            <button
              onClick={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, trades.length))}
              className="text-xs xl:text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              Show {Math.min(PAGE_SIZE, remainingCount)} more
            </button>
          )}
          {canShowLess && (
            <button
              onClick={() => setVisibleCount(PAGE_SIZE)}
              className="text-xs xl:text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}
