/**
 * TPSLKeeperBadge Component
 *
 * Shows TP/SL execution mode:
 * - "Browser Only" (default) — requires browser tab open
 * - "Server-Side" — keeper bot executes even when browser is closed
 *
 * Provides TradeCap delegation/revoke toggle.
 */

import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/components/common';
import type { UseTradeCapResult } from '../hooks/useTradeCap';

interface TPSLKeeperBadgeProps {
  tradeCap: UseTradeCapResult;
}

export function TPSLKeeperBadge({ tradeCap }: TPSLKeeperBadgeProps) {
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { status, isKeeperAvailable, delegate, revoke } = tradeCap;

  // Click-outside to close expanded panel
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);

  // Don't render if keeper is not configured
  if (!isKeeperAvailable) return null;

  const isDelegated = status === 'delegated';
  const isLoading = status === 'loading';

  const handleToggle = async () => {
    if (isLoading) return;

    if (isDelegated) {
      const result = await revoke();
      if (result.success) {
        showToast('TradeCap revoked. TP/SL will only work while browser is open.', 'info');
      } else {
        showToast(`Revoke failed: ${result.error}`, 'error');
      }
    } else {
      const result = await delegate();
      if (result.success) {
        showToast('TradeCap delegated. TP/SL orders will execute server-side.', 'success');
      } else {
        showToast(`Delegation failed: ${result.error}`, 'error');
      }
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Badge button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
          isDelegated
            ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
            : 'bg-theme-bg-tertiary text-theme-text-muted hover:bg-theme-bg-secondary'
        }`}
      >
        {/* Status indicator dot */}
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isDelegated ? 'bg-green-400' : 'bg-theme-text-muted'
          }`}
        />
        {isLoading ? 'Processing...' : isDelegated ? 'Server' : 'Browser'}
      </button>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-xl z-50 p-3">
          <div className="text-xs text-theme-text-muted mb-2">
            TP/SL Execution Mode
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-theme-text-primary">
              {isDelegated ? 'Server-Side' : 'Browser Only'}
            </div>

            {/* Toggle switch */}
            <button
              role="switch"
              aria-checked={isDelegated}
              aria-label="Toggle server-side TP/SL execution"
              onClick={handleToggle}
              disabled={isLoading}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isDelegated ? 'bg-green-500' : 'bg-theme-bg-tertiary'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  isDelegated ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="text-xs text-theme-text-muted leading-relaxed">
            {isDelegated ? (
              <>
                TP/SL orders execute on the server even when your browser is closed.
                A TradeCap has been delegated to the keeper bot.
              </>
            ) : (
              <>
                TP/SL orders only execute while this browser tab is open.
                Enable server-side to delegate a TradeCap to the keeper bot.
              </>
            )}
          </div>

          {isDelegated && tradeCap.tradeCapId && (
            <div className="mt-2 text-xs text-theme-text-muted font-mono truncate">
              TradeCap: {tradeCap.tradeCapId.slice(0, 10)}...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
