/**
 * TradingBalanceBar
 *
 * Compact inline balance display for trading page.
 * Shows unified available balance with optional breakdown.
 *
 * Features:
 * - Unified balance (Wallet + Trading combined)
 * - Auto-deposit hint for reduced financial anxiety
 * - Expandable breakdown (click to see split)
 * - Pro mode: In Orders display
 */

import { useState } from 'react';
import { useWallet, useZkLogin, useMultiBalance } from '@nasun/wallet';

interface TradingBalanceBarProps {
  /** Base token symbol (e.g., 'NBTC', 'NASUN') */
  baseSymbol: string;
  /** Trading balance - base token (from BalanceManager) */
  tradingBase?: number;
  /** Trading balance - quote token (from BalanceManager) */
  tradingQuote?: number;
  /** Locked in orders - base token (Pro mode) */
  lockedBase?: number;
  /** Locked in orders - quote token (Pro mode) */
  lockedQuote?: number;
  /** Display mode - affects In Orders visibility */
  mode?: 'simple' | 'pro';
}

export function TradingBalanceBar({
  baseSymbol,
  tradingBase = 0,
  tradingQuote = 0,
  lockedBase = 0,
  lockedQuote = 0,
  mode = 'simple',
}: TradingBalanceBarProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Wallet connection state
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  // Wallet balances
  const { data: multiBalance, isLoading: isWalletLoading } = useMultiBalance();

  // Calculate wallet balances
  const walletBase = parseFloat(multiBalance?.tokens[baseSymbol]?.formatted ?? '0');
  const walletQuote = parseFloat(multiBalance?.tokens['NUSDC']?.formatted ?? '0');

  // Calculate unified (total available) balances
  const totalBase = walletBase + tradingBase;
  const totalQuote = walletQuote + tradingQuote;

  const isPro = mode === 'pro';
  const hasLockedFunds = lockedBase > 0 || lockedQuote > 0;

  // Not connected state
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center px-3 py-2 bg-theme-bg-tertiary/50 rounded-lg text-sm text-theme-text-muted">
        Connect wallet to start trading
      </div>
    );
  }

  // Loading state
  if (isWalletLoading) {
    return (
      <div className="px-3 py-2 bg-theme-bg-tertiary/50 rounded-lg">
        <div className="animate-pulse flex items-center gap-4">
          <div className="h-4 bg-theme-bg-tertiary rounded w-32" />
          <div className="h-4 bg-theme-bg-tertiary rounded w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-tertiary/50 rounded-lg">
      {/* Main Balance Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2 gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm">
          <span className="text-theme-text-muted">Available:</span>
          <span className="font-mono text-theme-text-primary">
            {totalBase.toFixed(4)} {baseSymbol}
          </span>
          <span className="text-theme-text-muted hidden sm:inline">|</span>
          <span className="font-mono text-theme-text-primary">
            {totalQuote.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NUSDC
          </span>
        </div>

        {/* Breakdown Toggle */}
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="p-1 text-theme-text-muted hover:text-theme-text-primary transition-colors"
          title={showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
        >
          <svg
            className={`w-4 h-4 transition-transform ${showBreakdown ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Auto-deposit Hint (shown when collapsed) */}
      {!showBreakdown && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-theme-text-muted flex items-center gap-1">
            <span>ⓘ</span>
            <span>Shows total available (wallet + trading). Auto-deposits when you trade.</span>
          </p>
        </div>
      )}

      {/* Breakdown Section */}
      {showBreakdown && (
        <div className="px-3 py-2 border-t border-theme-border/50 text-xs space-y-1">
          {/* Wallet Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-theme-text-muted">Wallet:</span>
            <span className="font-mono text-theme-text-secondary">
              {walletBase.toFixed(4)} {baseSymbol}
              <span className="text-theme-text-muted mx-2">|</span>
              {walletQuote.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NUSDC
            </span>
          </div>

          {/* Trading Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-theme-text-muted">Trading:</span>
            <span className="font-mono text-blue-400">
              {tradingBase.toFixed(4)} {baseSymbol}
              <span className="text-theme-text-muted mx-2">|</span>
              {tradingQuote.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NUSDC
            </span>
          </div>

          {/* In Orders Row (Pro mode only) */}
          {isPro && hasLockedFunds && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-yellow-500/80">In Orders:</span>
              <span className="font-mono text-yellow-500/80">
                {lockedBase.toFixed(4)} {baseSymbol}
                <span className="text-theme-text-muted mx-2">|</span>
                {lockedQuote.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NUSDC
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
