/**
 * MarketCard Component
 * Displays a prediction market in card format
 */

import { Link, useLocation } from "react-router-dom";
import type { PredictionMarket, Orderbook, Position } from "../types";
import {
  calculateProbabilityFromOrderbook,
  calculateProbabilityFromBestPrices,
} from "../types";
import { useLastTradePrice } from "../hooks/useLastTradePrice";
import { NUSDC_DECIMALS } from "../constants";
import { splitTitle } from "../lib/title-split";
import { resolveMarketIcon } from "../lib/market-icon";

interface MarketCardProps {
  market: PredictionMarket;
  yesOrderbook?: Orderbook | null;
  noOrderbook?: Orderbook | null;
  myPositions?: Position[];
}

export function MarketCard({
  market,
  yesOrderbook,
  noOrderbook,
  myPositions,
}: MarketCardProps) {
  // Propagate the current filter / sort / status search so the detail page's
  // "Back to Markets" link can restore the exact list view (e.g. ?category=sports).
  const location = useLocation();
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
  const lastTradePriceBps = useLastTradePrice(
    hasAnyQuote ? undefined : market.id,
  );

  const resolvedProbability =
    market.status === "resolved" && market.outcome != null
      ? {
          yesProbability: market.outcome ? 100 : 0,
          noProbability: market.outcome ? 0 : 100,
          hasRealQuotes: true,
        }
      : null;

  const probability =
    resolvedProbability ??
    (yesOrderbook || noOrderbook
      ? calculateProbabilityFromOrderbook(
          yesOrderbook ?? null,
          noOrderbook ?? null,
          lastTradePriceBps,
        )
      : calculateProbabilityFromBestPrices(
          market.bestPrices,
          lastTradePriceBps,
        ));
  const { yesProbability, noProbability, hasRealQuotes } = probability;

  const timeRemaining = getTimeRemaining(market.closeTime);
  const volume = formatVolume(market.totalVolume);

  const statusBadge = getStatusBadge(market.status, market.outcome);
  const myPositionBadge = getMyPositionBadge(market, myPositions);
  const icon = resolveMarketIcon(market.category, market.question);

  return (
    <Link
      to={`/predict/${market.id}${location.search}`}
      className="flex flex-col bg-theme-bg-secondary border border-theme-border hover:border-pd2 dark:hover:border-pd3 rounded-xl p-4 hover:bg-theme-bg-tertiary transition-colors h-full"
    >
      {/* Header: Category & Status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-pd1 dark:text-pd3 bg-pd5 dark:bg-pd0/30 px-2 py-1 rounded">
          {market.category}
        </span>
        {statusBadge}
      </div>

      {/* Brand icon (crypto token or stock ticker) */}
      {icon && (
        <div className="flex items-center gap-3 mb-3">
          <div
            className={
              icon.kind === "crypto"
                ? "w-10 h-10 rounded-full bg-theme-bg-tertiary flex items-center justify-center shrink-0 overflow-hidden"
                : "w-10 h-10 rounded-md bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm p-1.5"
            }
          >
            {icon.src ? (
              <img
                src={icon.src}
                alt={icon.symbol}
                className={
                  icon.kind === "crypto"
                    ? "w-8 h-8"
                    : "w-full h-full object-contain"
                }
              />
            ) : (
              <span
                className={
                  icon.kind === "crypto"
                    ? "text-[11px] font-bold text-theme-text-secondary"
                    : "text-[11px] font-bold text-pd1"
                }
              >
                {icon.symbol.split(".")[0].slice(0, 4)}
              </span>
            )}
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-theme-text-primary">
            {icon.symbol}
          </span>
        </div>
      )}

      {/* Question */}
      {(() => {
        const { main, subtitle } = splitTitle(market.question);
        return (
          <div className="mb-4">
            <h3 className="text-base font-medium text-theme-text-primary line-clamp-2">
              {main}
            </h3>
            {subtitle && (
              <p className="text-xs text-theme-text-muted mt-1 line-clamp-1">
                {subtitle}
              </p>
            )}
          </div>
        );
      })()}

      {/* Probability rows: Yes and No each on their own line with a thin
          underline bar (width proportional to that side's probability) and
          a rounded % chip on the right. */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-predict-yes">
              Yes
            </span>
            <div className="h-1 bg-theme-border/30 mt-1 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-predict-yes-bar transition-all duration-300"
                style={{ width: `${hasRealQuotes ? yesProbability : 0}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-md border border-predict-yes-border text-predict-yes">
            {hasRealQuotes ? `${yesProbability.toFixed(0)}%` : "—"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-predict-no">
              No
            </span>
            <div className="h-1 bg-theme-border/30 mt-1 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-predict-no-bar transition-all duration-300"
                style={{ width: `${hasRealQuotes ? noProbability : 0}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-md border border-predict-no-border text-predict-no">
            {hasRealQuotes ? `${noProbability.toFixed(0)}%` : "—"}
          </span>
        </div>
        {!hasRealQuotes && (
          <p className="text-[11px] text-theme-text-muted italic">
            No quotes yet
          </p>
        )}
      </div>

      {/* Footer: Volume & Time. `mt-auto` pushes the footer (and any
          following my-position block) to the bottom of the card so that
          cards in the same grid row share a baseline. */}
      <div className="flex justify-between text-xs text-theme-text-muted mt-auto">
        <span>Volume: {volume}</span>
        <span>{timeRemaining}</span>
      </div>

      {myPositionBadge && (
        <div className="mt-3 rounded-md bg-pd5 dark:bg-pd0/30 px-3 py-2">
          {myPositionBadge}
        </div>
      )}
    </Link>
  );
}

function getTimeRemaining(closeTime: number): string {
  const now = Date.now();
  const diff = closeTime - now;

  if (diff <= 0) return "Closed";

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
    if (yesNum > 0)
      parts.push(
        `YES ${yesNum.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
      );
    if (noNum > 0)
      parts.push(
        `NO ${noNum.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
      );
    return parts.join(" / ");
  })();

  if (market.status === "resolved") {
    const winningShares = market.outcome ? yesNum : noNum;
    const pnl = winningShares - costNum;
    const isWin = winningShares > 0;
    const color = isWin
      ? "text-predict-yes"
      : "text-predict-no";
    const label = isWin
      ? `Won +${pnl.toLocaleString("en-US", { maximumFractionDigits: 2 })} NUSDC`
      : `Lost ${(-costNum).toLocaleString("en-US", { maximumFractionDigits: 2 })} NUSDC`;
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-theme-text-muted">My position: {sideText}</span>
        <span className={`font-semibold ${color}`}>{label}</span>
      </div>
    );
  }

  if (market.status === "cancelled") {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-theme-text-muted">My position: {sideText}</span>
        <span className="font-semibold text-notice-text">
          Refundable
        </span>
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

function getStatusBadge(status: string, outcome?: boolean): React.ReactNode {
  if (status === "resolved") {
    const label = outcome ? "YES Won" : "NO Won";
    const color = outcome
      ? "bg-predict-yes-bg text-predict-yes"
      : "bg-predict-no-bg text-predict-no";
    return (
      <span className={`text-xs font-medium px-2 py-1 rounded ${color}`}>
        {label}
      </span>
    );
  }

  if (status === "closed") {
    return (
      <span className="text-xs font-medium px-2 py-1 rounded bg-notice-bg text-notice-text">
        Awaiting Result
      </span>
    );
  }

  return (
    <span className="text-xs font-medium px-2 py-1 rounded bg-predict-yes-bg text-predict-yes">
      Open
    </span>
  );
}
