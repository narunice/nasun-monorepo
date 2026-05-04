/**
 * UnifiedBalanceCard
 *
 * Summary card showing total balance across all sources:
 * - Wallet (NASUN, NBTC, NUSDC)
 * - Trading (BalanceManager)
 * - Pado Balance (MarginAccount)
 *
 * UX Principles (Phase 16.1):
 * - Progressive Disclosure: Basic info by default, details on demand
 * - Plain Language: No technical jargon exposed to users
 * - Visual Hierarchy: Size = importance
 *
 * @version 1.1.0 (Phase 16.1 - UX Improvement)
 */

import { useState } from "react";
import { useWallet, useZkLogin, usePasskeyStore } from "@nasun/wallet";
import { useUnifiedBalance, formatTokenBreakdown } from "./useUnifiedBalance";
import { usePadoAccount } from "./usePadoAccount";
import { formatUsdValue, formatPercentage } from "../../../lib/prices";
import type { TokenSymbol } from "../../../lib/prices";
import { TokenIcon } from "@/components/common";

function BalanceBreakdown({
  bmNusdcUsd,
  maNusdcUsd,
  bmNbtcHuman,
}: {
  bmNusdcUsd: number;
  maNusdcUsd: number;
  bmNbtcHuman: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
      >
        {open ? "Hide breakdown" : "Show breakdown"}
      </button>
      {open && (
        <div className="mt-2 space-y-1 pl-4 border-l border-theme-border">
          <div className="flex justify-between text-xs text-theme-text-muted">
            <span>Trading</span>
            <span>
              {bmNbtcHuman > 0 && `${bmNbtcHuman.toFixed(8)} NBTC + `}
              {bmNusdcUsd.toFixed(2)} NUSDC
            </span>
          </div>
          <div className="flex justify-between text-xs text-theme-text-muted">
            <span>Margin</span>
            <span>{maNusdcUsd.toFixed(2)} NUSDC</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface UnifiedBalanceCardProps {
  /** Show compact view (header) vs full view (wallet page) */
  compact?: boolean;
  /** Show token breakdown table */
  showBreakdown?: boolean;
}

export function UnifiedBalanceCard({
  compact = false,
  showBreakdown = true,
}: UnifiedBalanceCardProps) {
  const { status, account: walletAccount } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();

  // Progressive disclosure state
  const [showFundDetails, setShowFundDetails] = useState(true);

  const {
    totalValue,
    available,
    inMargin,
    inPado,
    totalPnl24h,
    totalChange24h,
    breakdown,
    isLoading,
  } = useUnifiedBalance();

  const padoAccount = usePadoAccount();

  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected =
    (status === "unlocked" && walletAccount) ||
    isZkLoggedIn ||
    isPasskeyUnlocked;

  // Calculate fund distribution
  const inWallet = available - inMargin; // Wallet portion of available
  const allFundsInWallet = inPado === 0;

  // Calculate percentages for display
  const totalFunds = totalValue > 0 ? totalValue : 1;
  const walletPercent = Math.round((inWallet / totalFunds) * 100);
  const padoPercent = Math.round((inPado / totalFunds) * 100);

  // Breakdown values for "Show breakdown" disclosure (raw NUSDC from usePadoAccount)
  const bmNusdcUsd = Number(padoAccount.breakdown.bm.quoteRaw) / 1e6;
  const maNusdcUsd = Number(padoAccount.breakdown.ma.nusdcRaw) / 1e6;
  const bmNbtcHuman = Number(padoAccount.breakdown.bm.baseRaw) / 1e8;

  // Not connected
  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="text-center text-theme-text-muted py-4">
          Connect wallet to view your balance
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-theme-bg-tertiary rounded w-1/3 mb-2"></div>
          <div className="h-8 bg-theme-bg-tertiary rounded w-1/2 mb-4"></div>
          <div className="h-20 bg-theme-bg-tertiary rounded mb-4"></div>
        </div>
      </div>
    );
  }

  // Compact view (for header)
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-theme-text-secondary">Net Worth:</div>
        <div className="font-semibold text-theme-text-primary">
          {formatUsdValue(totalValue)}
        </div>
        <div
          className={`text-xs ${
            totalChange24h >= 0 ? "text-green-500" : "text-red-500"
          }`}
        >
          {formatPercentage(totalChange24h)}
        </div>
      </div>
    );
  }

  // Full view (for wallet page)
  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-theme-text-primary">
          Total Balance
        </h3>
        <div className="flex items-center gap-2">
          {padoAccount.isEnabled && (
            <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
              Pado Active
            </span>
          )}
          {padoAccount.isPartiallyEnabled && (
            <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
              Pado: legacy account
            </span>
          )}
        </div>
      </div>

      {/* Total Value */}
      <div className="mb-6">
        <div className="text-3xl font-bold text-theme-text-primary mb-1">
          {formatUsdValue(totalValue)}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-medium ${
              totalPnl24h >= 0 ? "text-green-500" : "text-red-500"
            }`}
          >
            {formatUsdValue(totalPnl24h, { showSign: true })} (
            {formatPercentage(totalChange24h)})
          </span>
          <span className="text-xs text-theme-text-muted">24h</span>
        </div>
      </div>

      {/* Available to Use - Primary Metric */}
      <div className="bg-theme-bg-tertiary rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-theme-text-secondary">
            Available to Use
          </div>
        </div>
        <div className="text-2xl font-bold text-theme-text-primary mb-1">
          {formatUsdValue(available)}
        </div>
        <div className="text-xs text-theme-text-muted">
          Ready for trading, transfers, and withdrawals
        </div>
      </div>

      {/* Fund Location - Progressive Disclosure */}
      <div className="mb-6">
        <button
          onClick={() => setShowFundDetails(!showFundDetails)}
          className="w-full flex items-center justify-between py-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
        >
          <span>Fund Location</span>
          <span className="flex items-center gap-2">
            {allFundsInWallet ? (
              <span className="text-xs text-green-500">
                All funds in wallet
              </span>
            ) : (
              <span className="text-xs text-theme-text-muted">
                Distributed across accounts
              </span>
            )}
            <svg
              className={`w-4 h-4 transition-transform ${showFundDetails ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </span>
        </button>

        {/* Expanded Fund Details */}
        {showFundDetails && (
          <div className="mt-3 space-y-2">
            {/* In Wallet */}
            <div className="flex items-center justify-between py-2 px-3 bg-theme-bg-tertiary rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm text-theme-text-primary">
                  In Nasun Wallet
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-theme-text-primary">
                  {formatUsdValue(inWallet)}
                </span>
                <span className="text-xs text-theme-text-muted ml-2">
                  {walletPercent}%
                </span>
              </div>
            </div>

            {/* In Pado Balance (combined BM + MA) */}
            <div className="py-2 px-3 bg-theme-bg-tertiary rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pd2"></div>
                  <span className="text-sm text-theme-text-primary">
                    In Pado Balance
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-pd3">
                    {formatUsdValue(inPado)}
                  </span>
                  {inPado > 0 && (
                    <span className="text-xs text-theme-text-muted ml-2">
                      {padoPercent}%
                    </span>
                  )}
                </div>
              </div>
              {/* "Show breakdown" sub-disclosure for power users */}
              {inPado > 0 && (
                <BalanceBreakdown
                  bmNusdcUsd={bmNusdcUsd}
                  maNusdcUsd={maNusdcUsd}
                  bmNbtcHuman={bmNbtcHuman}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Token Breakdown */}
      {showBreakdown && (
        <div>
          <div className="text-sm font-medium text-theme-text-secondary mb-3">
            Token Breakdown
          </div>
          <div className="space-y-3">
            {(Object.keys(breakdown) as TokenSymbol[]).map((symbol) => {
              const tokenData = breakdown[symbol];
              if (!tokenData || tokenData.total === 0) return null;

              const formatted = formatTokenBreakdown(tokenData, symbol);

              return (
                <div
                  key={symbol}
                  className="flex items-center justify-between py-2 border-b border-theme-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <TokenIcon symbol={symbol} size="md" gradient />
                    <div>
                      <div className="font-medium text-theme-text-primary">
                        {symbol}
                      </div>
                      <div className="text-xs text-theme-text-muted">
                        {formatted.balance} {symbol}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-theme-text-primary">
                      {formatted.value}
                    </div>
                    <div
                      className={`text-xs ${
                        tokenData.change24h >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {formatted.change}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tip for new users */}
      {!padoAccount.isEnabled && !padoAccount.isPartiallyEnabled && (
        <div className="mt-4 p-3 bg-pd2/5 border border-pd2/20 rounded-lg">
          <div className="text-sm text-theme-text-secondary">
            <span className="font-medium">Tip:</span> Enable Pado to use your
            funds across Trading, Predictions, and more.
          </div>
        </div>
      )}
    </div>
  );
}
