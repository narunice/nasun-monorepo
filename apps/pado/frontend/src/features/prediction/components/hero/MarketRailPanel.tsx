import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { MarketWithOrderbook } from "../../hooks/useMarkets";
import {
  calculateProbabilityFromOrderbook,
  calculateProbabilityFromBestPrices,
} from "../../types";
import { resolveMarketIcon } from "../../lib/market-icon";
import { splitTitle } from "../../lib/title-split";
import { formatVolumeCompact } from "../../../../lib/format";

interface MarketRailPanelProps {
  markets: MarketWithOrderbook[];
}

type Mode = "trending" | "closing";

const MAX_ROWS = 5;

export function MarketRailPanel({ markets }: MarketRailPanelProps) {
  const [mode, setMode] = useState<Mode>("trending");

  const trending = useMemo(() => {
    const open = markets.filter(({ market }) => market.status === "open");
    const sorted = [...open].sort((a, b) =>
      b.market.totalVolume > a.market.totalVolume ? 1 : -1,
    );
    return sorted.slice(0, MAX_ROWS);
  }, [markets]);

  const closing = useMemo(() => {
    const now = Date.now();
    const open = markets.filter(
      ({ market }) => market.status === "open" && market.closeTime > now,
    );
    const sorted = [...open].sort(
      (a, b) => a.market.closeTime - b.market.closeTime,
    );
    return sorted.slice(0, MAX_ROWS);
  }, [markets]);

  const rows = mode === "trending" ? trending : closing;

  return (
    <div className="w-full bg-theme-bg-secondary border border-theme-border rounded-2xl h-full overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-white/15 shrink-0">
        <div className="flex items-center gap-0.5 bg-gray-200 dark:bg-gray-800/70 rounded-lg p-0.5 w-fit">
          <TabButton
            active={mode === "trending"}
            onClick={() => setMode("trending")}
          >
            Trending
          </TabButton>
          <TabButton
            active={mode === "closing"}
            onClick={() => setMode("closing")}
          >
            Closing Soon
          </TabButton>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {rows.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm text-theme-text-muted">
              No open markets
            </span>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-white/15 h-full flex flex-col">
            {rows.map((entry) => (
              <MarketRow key={entry.market.id} entry={entry} mode={mode} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap " +
        (active
          ? "bg-gray-700 text-white dark:bg-sky-200 dark:text-gray-900 shadow-sm"
          : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white")
      }
    >
      {children}
    </button>
  );
}

function MarketRow({
  entry,
  mode,
}: {
  entry: MarketWithOrderbook;
  mode: Mode;
}) {
  const location = useLocation();
  const { market, yesOrderbook, noOrderbook } = entry;
  const { yesProbability, hasRealQuotes } =
    yesOrderbook || noOrderbook
      ? calculateProbabilityFromOrderbook(yesOrderbook, noOrderbook, null)
      : calculateProbabilityFromBestPrices(market.bestPrices, null);

  const icon = resolveMarketIcon(market.category, market.question);
  const { main } = splitTitle(market.question);
  const probColor = !hasRealQuotes
    ? "text-theme-text-muted"
    : yesProbability >= 50
      ? "text-predict-yes"
      : "text-predict-no";

  return (
    <li className="flex-1 flex">
      <Link
        to={`/predict/${market.id}${location.search}`}
        className="flex-1 flex items-center gap-3 px-4 py-2.5 hover:bg-theme-bg-tertiary transition-colors"
      >
        {icon?.src ? (
          <div
            className={
              icon.kind === "crypto"
                ? "w-7 h-7 rounded-full bg-theme-bg-tertiary flex items-center justify-center shrink-0 overflow-hidden"
                : "w-7 h-7 rounded-md bg-white flex items-center justify-center shrink-0 overflow-hidden shadow-sm p-1"
            }
          >
            <img
              src={icon.src}
              alt={icon.symbol}
              className={
                icon.kind === "crypto"
                  ? "w-5 h-5"
                  : "w-full h-full object-contain"
              }
            />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-md bg-theme-bg-tertiary flex items-center justify-center shrink-0">
            <span className="text-[9px] font-bold text-theme-text-muted uppercase">
              {market.category.slice(0, 3)}
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-theme-text-primary line-clamp-1">
            {main}
          </p>
          <p className="text-[11px] text-theme-text-muted tabular-nums">
            {mode === "trending"
              ? `Vol ${formatVolumeCompact(market.totalVolume)}`
              : formatTimeRemaining(market.closeTime)}
          </p>
        </div>

        <span
          className={`text-sm font-bold tabular-nums shrink-0 ${probColor}`}
        >
          {hasRealQuotes ? `${yesProbability.toFixed(0)}%` : "—"}
        </span>
      </Link>
    </li>
  );
}

function formatTimeRemaining(closeTime: number): string {
  const diff = closeTime - Date.now();
  if (diff <= 0) return "Closing";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}
