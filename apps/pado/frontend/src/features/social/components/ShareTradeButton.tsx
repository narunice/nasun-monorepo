/**
 * ShareTradeButton
 * Small share icon button that generates a trade share card when clicked.
 * Designed to be placed next to trade rows in OrderHistory or RecentTrades.
 */

import { useState, useCallback } from 'react';
import { renderTradeCard, type TradeCardData } from '../utils/canvasRenderer';
import { ShareCardModal } from './ShareCardModal';

interface Props {
  pair: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  total: number;
  pnl?: number;
  pnlPct?: number;
  txDigest?: string;
  nickname?: string;
  timestamp: number;
  className?: string;
}

export function ShareTradeButton({
  pair, side, price, quantity, total,
  pnl, pnlPct, txDigest, nickname, timestamp, className = '',
}: Props) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleShare = useCallback(() => {
    const data: TradeCardData = {
      pair, side, price, quantity, total,
      pnl, pnlPct, txDigest, nickname, timestamp,
    };
    const cardCanvas = renderTradeCard(data);
    setCanvas(cardCanvas);
    setIsOpen(true);
  }, [pair, side, price, quantity, total, pnl, pnlPct, txDigest, nickname, timestamp]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setCanvas(null);
  }, []);

  const dateStr = new Date(timestamp).toISOString().slice(0, 10);
  const filename = `pado-trade-${side.toLowerCase()}-${pair.replace('/', '-')}-${dateStr}.png`;

  return (
    <>
      <button
        onClick={handleShare}
        className={`text-theme-text-muted hover:text-pd4 transition-colors ${className}`}
        title="Share trade"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
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
