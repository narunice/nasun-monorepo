/**
 * SharePnlButton
 * Button that generates a PnL summary share card from portfolio data.
 * Placed in the TradeStats or PortfolioPage header.
 */

import { useState, useCallback } from 'react';
import { renderPnlCard, type PnlCardData } from '../utils/canvasRenderer';
import { ShareCardModal } from './ShareCardModal';

interface Props {
  /** Current period label (e.g., "24H", "7D", "All Time") */
  period: string;
  totalPnl: number;
  totalPnlPct: number;
  winRate: number;
  totalTrades: number;
  totalVolume: number;
  bestTrade: number;
  worstTrade: number;
  nickname?: string;
  className?: string;
}

export function SharePnlButton({
  period, totalPnl, totalPnlPct, winRate,
  totalTrades, totalVolume, bestTrade, worstTrade,
  nickname, className = '',
}: Props) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleShare = useCallback(() => {
    const data: PnlCardData = {
      nickname,
      totalPnl,
      totalPnlPct,
      period,
      winRate,
      totalTrades,
      totalVolume,
      bestTrade,
      worstTrade,
      timestamp: Date.now(),
    };
    const cardCanvas = renderPnlCard(data);
    setCanvas(cardCanvas);
    setIsOpen(true);
  }, [nickname, totalPnl, totalPnlPct, period, winRate, totalTrades, totalVolume, bestTrade, worstTrade]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setCanvas(null);
  }, []);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `pado-pnl-${period.toLowerCase()}-${dateStr}.png`;

  return (
    <>
      <button
        onClick={handleShare}
        className={`flex items-center gap-1.5 text-xs text-theme-text-muted hover:text-pd4 transition-colors px-2 py-1 rounded hover:bg-theme-bg-tertiary ${className}`}
        title="Share P&L"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Share
      </button>
      <ShareCardModal
        isOpen={isOpen}
        onClose={handleClose}
        canvas={canvas}
        filename={filename}
      />
    </>
  );
}
