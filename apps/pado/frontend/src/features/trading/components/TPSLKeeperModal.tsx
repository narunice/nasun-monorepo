/**
 * TPSLKeeperModal
 *
 * First-time TP/SL activation modal.
 * Explains browser-only vs server-side execution modes
 * and lets the user delegate a TradeCap for 24/7 monitoring.
 */

import { useState } from 'react';
import { useToast } from '@/components/common';
import type { UseTradeCapResult } from '../hooks/useTradeCap';
import { formatErrorMessage } from '../utils/errorParser';

const STORAGE_KEY_PREFIX = 'pado:tpslKeeperModalSeen:';

function getStorageKey(address: string): string {
  return `${STORAGE_KEY_PREFIX}${address}`;
}

interface TPSLKeeperModalProps {
  isOpen: boolean;
  onClose: () => void;
  tradeCap: UseTradeCapResult;
  walletAddress?: string;
}

export function TPSLKeeperModal({ isOpen, onClose, tradeCap, walletAddress }: TPSLKeeperModalProps) {
  const { showToast } = useToast();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);

  if (!isOpen) return null;

  const markSeen = () => {
    if (!walletAddress) return;
    try { localStorage.setItem(getStorageKey(walletAddress), 'true'); } catch { /* noop */ }
  };

  const handleClose = () => {
    if (dontShowAgain) markSeen();
    onClose();
  };

  const handleEnableServer = async () => {
    setIsDelegating(true);
    const result = await tradeCap.delegate();
    setIsDelegating(false);

    if (result.success) {
      showToast('TradeCap delegated. TP and SL orders will execute server-side.', 'success');
      // Always mark as seen after successful delegation
      markSeen();
      onClose();
    } else {
      showToast(`Delegation failed: ${formatErrorMessage(result.error)}`, 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleClose}
    >
      <div
        className="bg-theme-bg-secondary rounded-xl p-5 max-w-md w-full mx-4 border border-theme-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary">
            TP/SL Execution Mode
          </h3>
          <button
            onClick={handleClose}
            className="text-theme-text-muted hover:text-theme-text-primary transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode comparison cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Browser Mode */}
          <div className="rounded-lg border border-theme-border p-3 bg-theme-bg-tertiary">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-xs font-medium text-theme-text-primary">Browser Mode</span>
            </div>
            <p className="text-xs text-theme-text-muted leading-relaxed">
              TP/SL monitored by your browser tab (~5s polling). Orders <span className="text-yellow-400 font-medium">stop</span> if you close the tab.
            </p>
          </div>

          {/* Server Mode */}
          <div className="rounded-lg border border-green-500/30 p-3 bg-green-500/5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-theme-text-primary">Server Mode</span>
            </div>
            <p className="text-xs text-theme-text-muted leading-relaxed">
              Executes TP/SL even when offline (~10s polling). Delegates a <span className="text-green-400 font-medium">TradeCap</span> to the Pado keeper.
            </p>
          </div>
        </div>

        {/* Notes — scope and limitations */}
        <div className="text-xs text-theme-text-muted leading-relaxed mb-4 px-1 space-y-1.5">
          <p>
            <span className="text-theme-text-secondary">Scope:</span> Server mode
            delegates a TradeCap granting trade permission across{' '}
            <span className="text-theme-text-secondary">all pools</span> on your
            BalanceManager. Your funds remain in your custody. Revocable anytime.
          </p>
          <p>
            <span className="text-theme-text-secondary">Limitations:</span>{' '}
            Stop-Limit and Trailing Stop orders always run in your browser,
            even in server mode. Only TP and SL are server-eligible.
          </p>
        </div>

        {/* Don't show again */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none px-1">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="rounded border-theme-border"
          />
          <span className="text-xs text-theme-text-muted">Don't show this again</span>
        </label>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleClose}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary transition-colors"
          >
            Use Browser Mode
          </button>
          <button
            onClick={handleEnableServer}
            disabled={isDelegating || tradeCap.status === 'loading'}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white transition-colors"
          >
            {isDelegating ? 'Delegating...' : 'Enable Server Mode'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Check if the keeper modal has been dismissed for this wallet */
export function isKeeperModalSeen(address?: string): boolean {
  if (!address) return false;
  try {
    return localStorage.getItem(getStorageKey(address)) === 'true';
  } catch {
    return false;
  }
}
