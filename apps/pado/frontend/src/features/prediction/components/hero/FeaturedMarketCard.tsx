import { Link, useLocation } from "react-router-dom";
import type { PredictionMarket, Orderbook } from "../../types";
import {
  calculateProbabilityFromOrderbook,
  calculateProbabilityFromBestPrices,
} from "../../types";
import { useRecentFills } from "../../hooks/useRecentFills";
import { formatVolumeCompact } from "../../../../lib/format";
import { splitTitle } from "../../lib/title-split";
import { resolveMarketIcon } from "../../lib/market-icon";
import { ProbabilitySparkline } from "./ProbabilitySparkline";

interface FeaturedMarketCardProps {
  market: PredictionMarket;
  yesOrderbook: Orderbook | null;
  noOrderbook: Orderbook | null;
}

function formatTimeRemaining(closeTime: number): string {
  const diff = closeTime - Date.now();
  if (diff <= 0) return "Closing";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function FeaturedMarketCard({
  market,
  yesOrderbook,
  noOrderbook,
}: FeaturedMarketCardProps) {
  // Carry the current filter / sort / status search params into the detail
  // link so the detail page's "Back to Markets" preserves the user's view.
  const location = useLocation();
  const { data: fills = [], isLoading: fillsLoading } = useRecentFills(
    market.id,
  );
  const lastTradePriceBps =
    fills.length > 0
      ? fills[0].isYes
        ? fills[0].price
        : 10000 - fills[0].price
      : null;
  // Featured carousel currently receives null orderbooks from
  // `fetchMarketsWithOrderbooks` (lazy on detail). Fall back to the inline
  // best-price quartet stored on the Market object so the hero shows real
  // probability instead of 50/50 when nothing has traded recently.
  const { yesProbability, hasRealQuotes } =
    yesOrderbook || noOrderbook
      ? calculateProbabilityFromOrderbook(
          yesOrderbook,
          noOrderbook,
          lastTradePriceBps,
        )
      : calculateProbabilityFromBestPrices(
          market.bestPrices,
          lastTradePriceBps,
        );
  const noProbability = 100 - yesProbability;
  const { main: titleMain, subtitle: titleSubtitle } = splitTitle(
    market.question,
  );
  const icon = resolveMarketIcon(market.category, market.question);

  return (
    <Link
      to={`/predict/${market.id}${location.search}`}
      className="flex flex-col w-full h-full rounded-2xl bg-theme-bg-secondary border border-theme-border hover:border-pd2 dark:hover:border-pd3 p-4 sm:p-6 transition-all cursor-pointer"
    >
      {/* Header: category + time */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {icon?.src && (
            <div
              className={
                icon.kind === "crypto"
                  ? "w-9 h-9 rounded-full bg-theme-bg-tertiary flex items-center justify-center shrink-0 overflow-hidden"
                  : "w-9 h-9 rounded-md bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm p-1.5"
              }
            >
              <img
                src={icon.src}
                alt={icon.symbol}
                className={
                  icon.kind === "crypto"
                    ? "w-7 h-7"
                    : "w-full h-full object-contain"
                }
              />
            </div>
          )}
          <span className="text-sm font-medium text-pd1 dark:text-pd3 bg-pd5 dark:bg-pd0/30 px-2.5 py-1 rounded">
            {market.category}
          </span>
        </div>
        <span className="text-sm text-theme-text-muted tabular-nums">
          {formatTimeRemaining(market.closeTime)} left
        </span>
      </div>

      {/* Question */}
      <div className="mb-6">
        <p className="text-lg sm:text-xl font-semibold text-theme-text-primary line-clamp-2 leading-snug">
          {titleMain}
        </p>
        {titleSubtitle && (
          <p className="text-sm text-theme-text-muted mt-1.5 line-clamp-1">
            {titleSubtitle}
          </p>
        )}
      </div>

      {/* YES / NO probability bar — single stacked row */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between text-sm mb-1.5">
          <span className="font-semibold text-predict-yes">
            YES{" "}
            <span className="tabular-nums">{yesProbability.toFixed(1)}%</span>
          </span>
          <span className="font-semibold text-predict-no">
            <span className="tabular-nums">{noProbability.toFixed(1)}%</span> NO
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-predict-no-bar overflow-hidden">
          <div
            className="h-full bg-predict-yes-bar transition-all duration-700"
            style={{ width: `${yesProbability}%` }}
          />
        </div>
        {!hasRealQuotes && (
          <p className="text-xs text-theme-text-muted italic mt-1.5">
            No orders yet
          </p>
        )}
      </div>

      {/* Sparkline — fills remaining vertical space */}
      <div className="flex-1 overflow-hidden min-h-[120px]">
        <ProbabilitySparkline
          fills={fills}
          isLoading={fillsLoading}
          currentProbability={yesProbability}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm border-t border-theme-border/50 pt-3 mt-3">
        <span className="text-theme-text-muted">
          Vol: {formatVolumeCompact(market.totalVolume)} NUSDC
        </span>
        <span className="flex items-center gap-1 text-pd1 dark:text-pd3 font-medium">
          Trade
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            />
          </svg>
        </span>
      </div>
    </Link>
  );
}
