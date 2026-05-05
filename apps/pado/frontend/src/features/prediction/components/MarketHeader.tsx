/**
 * MarketHeader Component
 * Displays market information header with countdown timer
 */

import { useState, useEffect } from "react";
import type { PredictionMarket, Orderbook } from "../types";
import { calculateProbabilityFromOrderbook } from "../types";
import { useShareMarket } from "../hooks/useShareMarket";

interface MarketHeaderProps {
  market: PredictionMarket;
  yesOrderbook?: Orderbook | null;
  noOrderbook?: Orderbook | null;
  lastTradePriceBps?: number | null;
}

export function MarketHeader({
  market,
  yesOrderbook,
  noOrderbook,
  lastTradePriceBps,
}: MarketHeaderProps) {
  const { shareMarket } = useShareMarket();
  const [timeRemaining, setTimeRemaining] = useState(
    getTimeRemaining(market.closeTime),
  );
  const { yesProbability, noProbability, hasRealOrders } =
    calculateProbabilityFromOrderbook(
      yesOrderbook ?? null,
      noOrderbook ?? null,
      lastTradePriceBps,
    );

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(market.closeTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [market.closeTime]);

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4 md:p-6">
      {/* Category & Status */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-pd1 dark:text-pd3 bg-pd5 dark:bg-pd0/30 px-2 py-1 rounded">
          {market.category}
        </span>
        <StatusBadge status={market.status} outcome={market.outcome} />
      </div>

      {/* Question + Share */}
      <div className="flex items-start gap-2 mb-4">
        <h1 className="flex-1 text-xl md:text-2xl font-bold text-theme-text-primary">
          {market.question}
        </h1>
        <button
          onClick={() => {
            const askBps = yesOrderbook?.asks?.[0]?.price ?? null;
            shareMarket(market, askBps != null ? Number(askBps) : null);
          }}
          aria-label="Share market on X"
          title="Share on X"
          className="flex-shrink-0 p-2 rounded-md text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </button>
      </div>

      {/* Description */}
      {market.description && (
        <p className="text-sm text-theme-text-secondary mb-4">
          {market.description}
        </p>
      )}

      {market.status === "open" ? (
        <>
          {/* Probability Display */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4">
            <div className="bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-500/30 rounded-lg p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-400 tabular-nums">
                {yesProbability.toFixed(1)}%
              </div>
              <div className="text-xs sm:text-sm font-medium text-green-700 dark:text-green-400">
                YES
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                {noProbability.toFixed(1)}%
              </div>
              <div className="text-xs sm:text-sm font-medium text-red-600 dark:text-red-400">
                NO
              </div>
            </div>
          </div>

          {!hasRealOrders && (
            <div className="text-center text-sm text-yellow-600 dark:text-yellow-400 mb-4">
              No orders yet — showing default 50/50
            </div>
          )}

          {/* Probability Bar */}
          <div className="mb-4">
            <div className="h-3 bg-red-500 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${yesProbability}%` }}
              />
            </div>
          </div>

          {/* Timer & Stats */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <ClockIcon />
              <span className="text-theme-text-secondary">{timeRemaining}</span>
            </div>
            <div className="flex items-center gap-4 text-theme-text-muted">
              <span>
                Supply: {formatNumber(market.yesSupply + market.noSupply)}
              </span>
            </div>
          </div>
          {/* Resolve deadline (only visible after closeTime has passed) */}
          {(() => {
            const label = getResolveDeadlineLabel(market);
            if (!label) return null;
            return (
              <div className="mt-2 text-xs text-theme-text-muted">{label}</div>
            );
          })()}
        </>
      ) : (
        /* Resolved / Cancelled state — outcome takes center stage */
        <OutcomeDisplay
          status={market.status}
          outcome={market.outcome}
          supply={market.yesSupply + market.noSupply}
        />
      )}
    </div>
  );
}

function OutcomeDisplay({
  status,
  outcome,
  supply,
}: {
  status: string;
  outcome?: boolean;
  supply: bigint;
}) {
  if (status === "resolved") {
    const isYes = Boolean(outcome);
    return (
      <div
        className={`rounded-xl p-5 text-center border ${
          isYes
            ? "bg-green-50 border-green-300 dark:bg-green-900/50 dark:border-green-500/50"
            : "bg-red-50 border-red-300 dark:bg-red-900/50 dark:border-red-500/50"
        }`}
      >
        <div
          className={`text-3xl font-bold mb-1 ${
            isYes
              ? "text-green-700 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }`}
        >
          {isYes ? "YES" : "NO"} Won
        </div>
        <div className="text-sm text-gray-600 dark:text-theme-text-muted">
          Total supply: {formatNumber(supply)} shares
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5 text-center bg-yellow-50 border border-yellow-300 dark:bg-yellow-900/50 dark:border-yellow-500/50">
      <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400 mb-1">
        Cancelled
      </div>
      <div className="text-sm text-gray-600 dark:text-theme-text-muted">
        All collateral is refundable
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  outcome,
}: {
  status: string;
  outcome?: boolean;
}) {
  if (status === "resolved") {
    const label = outcome ? "YES Won" : "NO Won";
    const color = outcome
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    return (
      <span className={`text-xs font-medium px-2 py-1 rounded ${color}`}>
        {label}
      </span>
    );
  }

  if (status === "closed") {
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

function ClockIcon() {
  return (
    <svg
      className="w-4 h-4 text-theme-text-muted"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Returns a static "Resolves by {date}" label when the market has passed its
 * close time but is not yet resolved/cancelled. Static (not live-ticking)
 * because resolveDeadline is typically days away and the live tick is
 * unnecessary cost.
 */
function getResolveDeadlineLabel(market: PredictionMarket): string | null {
  if (market.status !== "open") return null;
  const now = Date.now();
  if (now < market.closeTime) return null;
  if (market.resolveDeadline > 0 && now < market.resolveDeadline) {
    return `Resolves by ${new Date(market.resolveDeadline).toLocaleString("en-US")}`;
  }
  return "Awaiting resolution";
}

function getTimeRemaining(closeTime: number): string {
  const now = Date.now();
  const diff = closeTime - now;

  if (diff <= 0) return "Closed";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatNumber(value: bigint): string {
  const num = Number(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
