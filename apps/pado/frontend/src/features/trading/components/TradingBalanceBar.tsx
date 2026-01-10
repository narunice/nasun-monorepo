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
 * - Inline Faucet buttons with tooltips (NBTC, NUSDC)
 * - Pro mode: In Orders display
 */

import { useState, useEffect } from 'react';
import { useWallet, useZkLogin, useMultiBalance } from '@nasun/wallet';
import { useFaucet } from '../hooks';

type FaucetConfirmState = 'none' | 'nbtc' | 'nusdc';

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
  const [isMobile, setIsMobile] = useState(false);
  const [faucetConfirm, setFaucetConfirm] = useState<FaucetConfirmState>('none');

  // Detect mobile viewport for double-click protection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-reset confirmation after 3 seconds
  useEffect(() => {
    if (faucetConfirm !== 'none') {
      const timer = setTimeout(() => setFaucetConfirm('none'), 3000);
      return () => clearTimeout(timer);
    }
  }, [faucetConfirm]);

  // Wallet connection state
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  // Wallet balances
  const { data: multiBalance, isLoading: isWalletLoading } = useMultiBalance();

  // Faucet handlers
  const {
    isNbtcLoading,
    isNusdcLoading,
    handleNbtcFaucet,
    handleNusdcFaucet,
  } = useFaucet();

  // Mobile faucet click handlers with double-click protection
  const handleNbtcClick = () => {
    if (isMobile && faucetConfirm !== 'nbtc') {
      setFaucetConfirm('nbtc');
      return;
    }
    setFaucetConfirm('none');
    handleNbtcFaucet();
  };

  const handleNusdcClick = () => {
    if (isMobile && faucetConfirm !== 'nusdc') {
      setFaucetConfirm('nusdc');
      return;
    }
    setFaucetConfirm('none');
    handleNusdcFaucet();
  };

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
        Connect wallet to view balance
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

        {/* Faucet Buttons + Breakdown Toggle */}
        <div className="flex items-center gap-2">
          {/* NBTC Faucet (only for NBTC market) */}
          {baseSymbol === 'NBTC' && (
            <button
              onClick={handleNbtcClick}
              disabled={isNbtcLoading}
              title={faucetConfirm === 'nbtc' ? 'Tap again to confirm' : 'Get test NBTC (Devnet)'}
              className={`px-2 py-0.5 text-xs font-medium rounded transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed
                         ${faucetConfirm === 'nbtc'
                           ? 'bg-orange-500/40 text-orange-300 ring-1 ring-orange-400/50'
                           : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                         }`}
            >
              {isNbtcLoading ? '...' : faucetConfirm === 'nbtc' ? 'Confirm?' : '+NBTC'}
            </button>
          )}

          {/* NUSDC Faucet */}
          <button
            onClick={handleNusdcClick}
            disabled={isNusdcLoading}
            title={faucetConfirm === 'nusdc' ? 'Tap again to confirm' : 'Get test NUSDC (Devnet)'}
            className={`px-2 py-0.5 text-xs font-medium rounded transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed
                       ${faucetConfirm === 'nusdc'
                         ? 'bg-purple-500/40 text-purple-300 ring-1 ring-purple-400/50'
                         : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                       }`}
          >
            {isNusdcLoading ? '...' : faucetConfirm === 'nusdc' ? 'Confirm?' : '+NUSDC'}
          </button>

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
      </div>

      {/* Auto-deposit Hint (shown when collapsed) */}
      {!showBreakdown && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-theme-text-muted flex items-center gap-1">
            <span>ⓘ</span>
            <span>Includes wallet (auto-deposited when needed)</span>
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
