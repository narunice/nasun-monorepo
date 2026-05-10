/**
 * MarketCard Component
 * Displays a prediction market in card format
 */

import { Link } from 'react-router-dom';
import type { PredictionMarket, Orderbook, Position } from '../types';
import {
  calculateProbabilityFromOrderbook,
  calculateProbabilityFromBestPrices,
} from '../types';
import { useLastTradePrice } from '../hooks/useLastTradePrice';
import { NUSDC_DECIMALS } from '../constants';

interface MarketCardProps {
  market: PredictionMarket;
  yesOrderbook?: Orderbook | null;
  noOrderbook?: Orderbook | null;
  myPositions?: Position[];
}

export function MarketCard({ market, yesOrderbook, noOrderbook, myPositions }: MarketCardProps) {
  // List page does not pre-fetch full orderbooks (lazy on detail page only),
  // but the Market struct itself stores sorted price-level vectors inline —
  // `fetchMarket` already pulled them via showContent at zero extra RPC cost,
  // so we get accurate best bid/ask without paginating ORDER_FILLED events.
  // lastTradePrice is kept only as a final fallback for markets that have
  // never had a resting order on either side.
  const hasAnyQuote =
    market.bestPrices.yesBid !== null ||
    market.bestPrices.yesAsk !== null ||
    market.bestPrices.noBid !== null ||
    market.bestPrices.noAsk !== null;
  const lastTradePriceBps = useLastTradePrice(hasAnyQuote ? undefined : market.id);

  const resolvedProbability = market.status === 'resolved' && market.outcome != null
    ? { yesProbability: market.outcome ? 100 : 0, noProbability: market.outcome ? 0 : 100, hasRealQuotes: true }
    : null;

  const probability =
    resolvedProbability ??
    ((yesOrderbook || noOrderbook)
      ? calculateProbabilityFromOrderbook(yesOrderbook ?? null, noOrderbook ?? null, lastTradePriceBps)
      : calculateProbabilityFromBestPrices(market.bestPrices, lastTradePriceBps));
  const { yesProbability, noProbability, hasRealQuotes } = probability;

  const timeRemaining = getTimeRemaining(market.closeTime);
  const volume = formatVolume(market.totalVolume);

  const statusBadge = getStatusBadge(market.status, market.outcome);
  const myPositionBadge = getMyPositionBadge(market, myPositions);
  const cryptoSymbol = market.category === 'crypto'
    ? extractCryptoSymbol(market.question)
    : null;
  const stockTicker = market.category === 'finance'
    ? extractStockTicker(market.question)
    : null;

  return (
    <Link
      to={`/predict/${market.id}`}
      className="block bg-theme-bg-secondary rounded-xl p-4 hover:bg-theme-bg-tertiary transition-colors"
    >
      {/* Header: Category & Status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-pd1 dark:text-pd3 bg-pd5 dark:bg-pd0/30 px-2 py-1 rounded">
          {market.category}
        </span>
        {statusBadge}
      </div>

      {/* Crypto Token Symbol */}
      {cryptoSymbol && (
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-theme-bg-tertiary flex items-center justify-center shrink-0 overflow-hidden">
            {hasIcon(cryptoSymbol) ? (
              <img
                src={`/crypto-icons/${cryptoSymbol.toLowerCase()}.svg`}
                alt={cryptoSymbol}
                className="w-8 h-8"
              />
            ) : (
              <span className="text-xs font-bold text-theme-text-secondary">
                {cryptoSymbol.slice(0, 3)}
              </span>
            )}
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-theme-text-primary">
            {cryptoSymbol}
          </span>
        </div>
      )}

      {/* Stock Ticker (finance markets) */}
      {stockTicker && (
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-md bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
            {hasStockIcon(stockTicker) ? (
              <img
                src={`/stock-icons/${stockTicker}.svg`}
                alt={stockTicker}
                className="w-8 h-8 object-contain"
              />
            ) : (
              <span className="text-xs font-bold text-gray-600">
                {stockTicker.slice(0, 4)}
              </span>
            )}
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-theme-text-primary">
            {stockTicker}
          </span>
        </div>
      )}

      {/* Question */}
      <h3 className="text-base font-semibold text-theme-text-primary mb-4 line-clamp-2">
        {market.question}
      </h3>

      {/* Probability Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-green-600 dark:text-green-400 font-medium">
            YES {hasRealQuotes ? `${yesProbability.toFixed(0)}%` : '—'}
          </span>
          <span className="text-red-600 dark:text-red-400 font-medium">
            NO {hasRealQuotes ? `${noProbability.toFixed(0)}%` : '—'}
          </span>
        </div>
        <div className="h-2 bg-red-500 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${hasRealQuotes ? yesProbability : 50}%` }}
          />
        </div>
        {!hasRealQuotes && (
          <p className="mt-1 text-[11px] text-theme-text-muted">No quotes yet</p>
        )}
      </div>

      {/* Footer: Volume & Time */}
      <div className="flex justify-between text-xs text-theme-text-muted">
        <span>Volume: {volume}</span>
        <span>{timeRemaining}</span>
      </div>

      {myPositionBadge && (
        <div className="mt-3 pt-3 border-t border-theme-border/60">
          {myPositionBadge}
        </div>
      )}
    </Link>
  );
}

function extractCryptoSymbol(question: string): string | null {
  // Newer crypto-batch script emits "Will Solana (SOL/USDT) close..." — prefer
  // the parenthesized SYMBOL/QUOTE pair when present.
  const paren = question.match(/\(([A-Z]{2,6})\/[A-Z]{2,5}\)/);
  if (paren) return paren[1];
  // Legacy/short form: "Will BTC/USDT...", "Will ETH/USD...", "Will SOL price..."
  const match = question.match(/Will\s+([A-Z]{2,6})(?:\/|\s)/);
  return match ? match[1] : null;
}

function extractStockTicker(question: string): string | null {
  // Matches the parenthesized ticker emitted by create-finance-markets.ts:
  // "Will Apple Inc. (AAPL) close..." or "Will Samsung (005930.KS) close..."
  const match = question.match(/\(([A-Z0-9.\-]{1,20})\)/);
  return match ? match[1] : null;
}

const STOCK_ICON_TICKERS = new Set(['AAPL', 'NVDA', '005930.KS']);

function hasStockIcon(ticker: string): boolean {
  return STOCK_ICON_TICKERS.has(ticker);
}

const ICON_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE',
  'AVAX', 'MATIC', 'LINK', 'DOT', 'UNI', 'ATOM', 'LTC',
  'BCH', 'XLM', 'TRX', 'ALGO',
]);

function hasIcon(symbol: string): boolean {
  return ICON_SYMBOLS.has(symbol.toUpperCase());
}

function getTimeRemaining(closeTime: number): string {
  const now = Date.now();
  const diff = closeTime - now;

  if (diff <= 0) return 'Closed';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m left`;
}

function formatVolume(volume: bigint): string {
  const value = Number(volume) / Math.pow(10, NUSDC_DECIMALS);
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function getMyPositionBadge(
  market: PredictionMarket,
  positions: Position[] | undefined,
): React.ReactNode {
  if (!positions || positions.length === 0) return null;

  const divisor = Math.pow(10, NUSDC_DECIMALS);
  let yesShares = 0n;
  let noShares = 0n;
  let costBasis = 0n;
  for (const p of positions) {
    if (p.isYes) yesShares += p.shares;
    else noShares += p.shares;
    costBasis += p.costBasis;
  }
  const yesNum = Number(yesShares) / divisor;
  const noNum = Number(noShares) / divisor;
  const costNum = Number(costBasis) / divisor;

  const sideText = (() => {
    const parts: string[] = [];
    if (yesNum > 0) parts.push(`YES ${yesNum.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    if (noNum > 0) parts.push(`NO ${noNum.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    return parts.join(' / ');
  })();

  if (market.status === 'resolved') {
    const winningShares = market.outcome ? yesNum : noNum;
    const pnl = winningShares - costNum;
    const isWin = winningShares > 0;
    const color = isWin
      ? 'text-green-700 dark:text-green-400'
      : 'text-red-700 dark:text-red-400';
    const label = isWin
      ? `Won +${pnl.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC`
      : `Lost ${(-costNum).toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC`;
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-theme-text-muted">My position: {sideText}</span>
        <span className={`font-semibold ${color}`}>{label}</span>
      </div>
    );
  }

  if (market.status === 'cancelled') {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-theme-text-muted">My position: {sideText}</span>
        <span className="font-semibold text-yellow-700 dark:text-yellow-400">Refundable</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-theme-text-muted">My position</span>
      <span className="font-semibold text-theme-text-primary">{sideText}</span>
    </div>
  );
}

function getStatusBadge(
  status: string,
  outcome?: boolean
): React.ReactNode {
  if (status === 'resolved') {
    const label = outcome ? 'YES Won' : 'NO Won';
    const color = outcome
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return (
      <span className={`text-xs font-medium px-2 py-1 rounded ${color}`}>
        {label}
      </span>
    );
  }

  if (status === 'closed') {
    return (
      <span className="text-xs font-medium px-2 py-1 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        Awaiting Result
      </span>
    );
  }

  return (
    <span className="text-xs font-medium px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      Open
    </span>
  );
}
