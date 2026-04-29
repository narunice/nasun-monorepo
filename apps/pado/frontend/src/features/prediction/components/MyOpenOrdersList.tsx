/**
 * MyOpenOrdersList (round-7 R7-C3 — Limit-mode cancel UX gate)
 *
 * Shows the user's resting limit orders for a market with a Cancel button on each.
 * Without this, Limit-mode users have no way to recover NUSDC locked in resting
 * orders short of running a manual PTB.
 */

import { useState, useCallback } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useMyOpenOrders } from '../hooks/useMyOpenOrders';
import { usePredictionTrade } from '../hooks/usePredictionTrade';
import { NUSDC_DECIMALS } from '../constants';
import type { PredictionMarket } from '../types';

interface Props {
  market: PredictionMarket;
}

export function MyOpenOrdersList({ market }: Props) {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const passkeyAddress = usePasskeyStore((s) => s.address);

  const owner = isZkConnected
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  const { data: orders, isLoading, refetch } = useMyOpenOrders(market.id, owner);
  const { isLoading: isTrading, cancelOrder } = usePredictionTrade();
  const [error, setError] = useState<string | null>(null);

  const handleCancel = useCallback(
    async (o: { isYes: boolean; isBid: boolean; priceBps: number; orderId: number }) => {
      setError(null);
      const result = await cancelOrder(market.id, o.isYes, o.isBid, o.priceBps, o.orderId);
      if (!result.success) setError(result.error || 'Cancel failed');
      else refetch();
    },
    [market.id, cancelOrder, refetch],
  );

  if (!owner) return null;
  if (market.status !== 'open') return null;

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-theme-text-primary">My Open Orders</h3>
        <button
          onClick={() => refetch()}
          className="text-xs text-theme-text-muted hover:text-theme-text-secondary"
        >
          Refresh
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-theme-text-muted">Loading...</p>
      )}

      {!isLoading && (!orders || orders.length === 0) && (
        <p className="text-sm text-theme-text-muted">No open orders</p>
      )}

      {orders && orders.length > 0 && (
        <div className="space-y-2">
          {orders.map((o) => {
            const shares = Number(o.amount) / Math.pow(10, NUSDC_DECIMALS);
            const pricePct = o.priceBps / 100;
            const sideLabel = o.isBid ? 'Buy' : 'Sell';
            const outcomeLabel = o.isYes ? 'YES' : 'NO';
            const outcomeColor = o.isYes ? 'text-green-500' : 'text-red-500';
            return (
              <div
                key={`${o.isYes}-${o.isBid}-${o.priceBps}-${o.orderId}`}
                className="flex items-center justify-between gap-3 p-3 bg-theme-bg-tertiary rounded-lg"
              >
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-theme-text-primary">{sideLabel}</span>
                    <span className={`font-bold ${outcomeColor}`}>{outcomeLabel}</span>
                    <span className="text-theme-text-muted">@ {pricePct.toFixed(2)}%</span>
                  </div>
                  <div className="text-xs text-theme-text-muted mt-0.5 font-mono">
                    {shares.toLocaleString('en-US', { maximumFractionDigits: 2 })} shares
                  </div>
                </div>
                <button
                  onClick={() => handleCancel(o)}
                  disabled={isTrading}
                  className="shrink-0 px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="mt-3 text-red-500 text-sm bg-red-500/10 rounded-lg p-2">{error}</div>}
    </div>
  );
}
