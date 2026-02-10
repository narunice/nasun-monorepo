/**
 * SharePortfolioButton
 * Button that generates a portfolio snapshot share card.
 * Placed in AssetOverview or PortfolioPage header.
 */

import { useState, useCallback } from 'react';
import { renderPortfolioCard, type PortfolioCardData } from '../utils/canvasRenderer';
import { ShareCardModal } from './ShareCardModal';

interface TokenData {
  symbol: string;
  value: number;
}

interface Props {
  totalValue: number;
  pnl24h: number;
  change24h: number;
  tokens: TokenData[];
  totalTrades: number;
  totalVolume: number;
  nickname?: string;
  maskBalances?: boolean;
  className?: string;
}

export function SharePortfolioButton({
  totalValue, pnl24h, change24h, tokens,
  totalTrades, totalVolume, nickname,
  maskBalances = false, className = '',
}: Props) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleShare = useCallback(() => {
    // Calculate allocations
    const totalVal = tokens.reduce((sum, t) => sum + t.value, 0) || 1;
    const tokensWithAllocation = tokens
      .filter(t => t.value > 0.01)
      .map(t => ({
        symbol: t.symbol,
        value: t.value,
        allocation: (t.value / totalVal) * 100,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const data: PortfolioCardData = {
      nickname,
      totalValue,
      pnl24h,
      change24h,
      tokens: tokensWithAllocation,
      totalTrades,
      totalVolume,
      timestamp: Date.now(),
      maskBalances,
    };
    const cardCanvas = renderPortfolioCard(data);
    setCanvas(cardCanvas);
    setIsOpen(true);
  }, [totalValue, pnl24h, change24h, tokens, totalTrades, totalVolume, nickname, maskBalances]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setCanvas(null);
  }, []);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `pado-portfolio-${dateStr}.png`;

  return (
    <>
      <button
        onClick={handleShare}
        className={`flex items-center gap-1.5 text-xs text-theme-text-muted hover:text-pd4 transition-colors px-2 py-1 rounded hover:bg-theme-bg-tertiary ${className}`}
        title="Share Portfolio"
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
