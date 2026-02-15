/**
 * TPSLKeeperBadge Component
 *
 * Shows TP/SL execution mode:
 * - "Browser Only" (default) — requires browser tab open
 * - "Server-Side" — keeper bot executes even when browser is closed
 *
 * Provides TradeCap delegation/revoke toggle.
 * Includes keeper bot heartbeat monitoring.
 */

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/common';
import type { UseTradeCapResult } from '../hooks/useTradeCap';
import { getKeeperStatus } from '../lib/tpsl-api';

interface TPSLKeeperBadgeProps {
  tradeCap: UseTradeCapResult;
}

export function TPSLKeeperBadge({ tradeCap }: TPSLKeeperBadgeProps) {
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { status, isKeeperAvailable, delegate, revoke } = tradeCap;

  // Keeper heartbeat — poll /api/tpsl/status every 30s (public endpoint)
  const { data: keeperStatus, isError: isKeeperDown, isPending: isKeeperPending } = useQuery({
    queryKey: ['keeperHeartbeat'],
    queryFn: getKeeperStatus,
    enabled: isKeeperAvailable,
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 25_000,
  });

  // Assume healthy until first check completes (avoid flashing "Offline" on mount)
  const isKeeperHealthy = isKeeperPending || (!isKeeperDown && keeperStatus?.status === 'running');

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
        showToast('TradeCap revoked. All TP/SL orders now require browser tab open.', 'info');
      } else {
        showToast(`Revoke failed: ${result.error}`, 'error');
      }
    } else {
      const result = await delegate();
      if (result.success) {
        showToast('TradeCap delegated. TP and SL orders will execute server-side.', 'success');
      } else {
        showToast(`Delegation failed: ${result.error}`, 'error');
      }
    }
  };

  // Badge color and label based on delegation + keeper health
  const getBadgeStyle = () => {
    if (!isDelegated) {
      return { className: 'bg-theme-bg-tertiary text-theme-text-muted hover:bg-theme-bg-secondary', dotClass: 'bg-theme-text-muted' };
    }
    if (!isKeeperHealthy) {
      return { className: 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25', dotClass: 'bg-yellow-400' };
    }
    return { className: 'bg-green-500/15 text-green-400 hover:bg-green-500/25', dotClass: 'bg-green-400' };
  };

  const getBadgeLabel = () => {
    if (isLoading) return 'Processing...';
    if (!isDelegated) return 'Browser';
    if (!isKeeperHealthy) return 'Server (Offline)';
    return 'Server';
  };

  const { className: badgeClass, dotClass } = getBadgeStyle();

  return (
    <div className="relative" ref={panelRef}>
      {/* Badge button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${badgeClass}`}
      >
        {/* Status indicator dot */}
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {getBadgeLabel()}
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

          {/* Keeper offline warning */}
          {isDelegated && !isKeeperHealthy && (
            <div className="text-xs text-yellow-400 leading-relaxed mb-2 flex items-start gap-1.5">
              <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>
                Keeper service is unreachable. Server-side TP/SL orders may not execute.
                Browser fallback is active.
              </span>
            </div>
          )}

          <div className="text-xs text-theme-text-muted leading-relaxed">
            {isDelegated ? (
              <>
                TP and SL orders execute on the Pado keeper (~10s interval).
                Stop-Limit and Trailing Stop remain browser-only.
              </>
            ) : (
              <>
                All TP/SL orders execute in your browser (~5s interval).
                Enable server mode to keep TP and SL active while offline.
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
