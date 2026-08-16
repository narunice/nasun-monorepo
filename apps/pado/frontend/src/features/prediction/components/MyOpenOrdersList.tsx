/**
 * MyOpenOrdersList (round-7 R7-C3 — Limit-mode cancel UX gate)
 *
 * Shows the user's resting limit orders for a market with a Cancel button on each.
 * Without this, Limit-mode users have no way to recover NUSDC locked in resting
 * orders short of running a manual PTB.
 *
 * Renders for cancelled and resolved markets too. It used to bail out on
 * anything but `open`, which stranded the NUSDC locked in resting bids: the
 * contract exposes `claim_resting_order_refund` for exactly this, but nothing
 * called it, so 384k NUSDC across 26 cancelled markets had no route back to
 * its owners and the RestingOrderRefunded event count sat at zero.
 */

import { useState, useCallback, useMemo } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { usePredictionTrade } from '../hooks/usePredictionTrade';
import { NUSDC_DECIMALS } from '../constants';
import { formatCents } from '../utils/formatPrice';
import type { Orderbook, PredictionMarket } from '../types';

interface OrderRow {
  isYes: boolean;
  isBid: boolean;
  priceBps: number;
  orderId: number;
  amount: bigint;
  lockedNusdc: bigint;
  timestamp: number;
}

interface Props {
  market: PredictionMarket;
  /**
   * Both books, carrying per-order `owner`. The page already fetches them, so
   * this list needs no RPC of its own and stays correct no matter how old the
   * order is (an events-based lookup silently lost anything past the
   * fullnode's event retention).
   */
  yesOrderbook: Orderbook | null;
  noOrderbook: Orderbook | null;
  isBooksLoading?: boolean;
  hasBooksError?: boolean;
  onRefresh?: () => void;
}

export function MyOpenOrdersList({
  market,
  yesOrderbook,
  noOrderbook,
  isBooksLoading = false,
  hasBooksError = false,
  onRefresh,
}: Props) {
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

  // Optimistic removal: a reclaimed/cancelled row disappears immediately
  // instead of lingering until the orderbook refetch lands.
  const [settledKeys, setSettledKeys] = useState<Set<string>>(new Set());
  const rowKey = (o: { isYes: boolean; isBid: boolean; priceBps: number; orderId: number }) =>
    `${o.isYes}-${o.isBid}-${o.priceBps}-${o.orderId}`;

  const orders = useMemo<OrderRow[]>(() => {
    if (!owner) return [];
    const mine: OrderRow[] = [];
    const target = owner.toLowerCase();
    for (const [book, isYes] of [
      [yesOrderbook, true],
      [noOrderbook, false],
    ] as const) {
      if (!book) continue;
      for (const [levels, isBid] of [
        [book.bids, true],
        [book.asks, false],
      ] as const) {
        for (const level of levels) {
          for (const o of level.orders) {
            if (o.owner.toLowerCase() !== target) continue;
            mine.push({
              isYes,
              isBid,
              priceBps: level.price,
              orderId: o.orderId,
              amount: o.amount,
              lockedNusdc: o.lockedNusdc,
              timestamp: o.timestamp,
            });
          }
        }
      }
    }
    return mine
      .filter((o) => !settledKeys.has(rowKey(o)))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [owner, yesOrderbook, noOrderbook, settledKeys]);

  const refresh = useCallback(() => {
    setSettledKeys(new Set());
    onRefresh?.();
  }, [onRefresh]);

  const { isLoading: isTrading, cancelOrder, claimRestingOrderRefund } = usePredictionTrade();
  const [error, setError] = useState<string | null>(null);

  // On a market that will never trade again the order is not "cancelled", it is
  // reclaimed. Both entry points refund a bid's locked NUSDC and hand an ask its
  // Position back, but claim_resting_order_refund asserts the market is
  // cancelled/resolved, so dispatching on status keeps a mis-click from
  // reaching the wrong one.
  const isSettled = market.status === 'cancelled' || market.status === 'resolved';

  const handleRecover = useCallback(
    async (o: { isYes: boolean; isBid: boolean; priceBps: number; orderId: number }) => {
      setError(null);
      const result = isSettled
        ? await claimRestingOrderRefund(market.id, o.isYes, o.isBid, o.priceBps, o.orderId)
        : await cancelOrder(market.id, o.isYes, o.isBid, o.priceBps, o.orderId);
      if (!result.success) {
        setError(result.error || (isSettled ? 'Reclaim failed' : 'Cancel failed'));
        return;
      }
      setSettledKeys((prev) => new Set(prev).add(rowKey(o)));
      onRefresh?.();
    },
    [market.id, isSettled, cancelOrder, claimRestingOrderRefund, onRefresh],
  );

  if (!owner) return null;

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-theme-text-primary">
          {isSettled ? 'My Unclaimed Orders' : 'My Open Orders'}
        </h3>
        <button
          onClick={refresh}
          className="text-xs text-theme-text-muted hover:text-theme-text-secondary"
        >
          Refresh
        </button>
      </div>

      {isBooksLoading && <p className="text-sm text-theme-text-muted">Loading...</p>}

      {!isBooksLoading && hasBooksError && (
        <p className="text-sm text-theme-error">
          Could not load the orderbook, so any orders you still hold here are not shown. Retry with
          Refresh.
        </p>
      )}

      {!isBooksLoading && !hasBooksError && orders.length === 0 && (
        <p className="text-sm text-theme-text-muted">
          {isSettled ? 'Nothing left to reclaim' : 'No open orders'}
        </p>
      )}

      {isSettled && orders.length > 0 && (
        <p className="text-sm text-theme-text-muted mb-3">
          This market has {market.status === 'cancelled' ? 'been cancelled' : 'resolved'}. Reclaim
          returns the NUSDC locked in a buy order, or the shares behind a sell order. It is separate
          from claiming your positions.
        </p>
      )}

      {orders.length > 0 && (
        <div className="space-y-2">
          {orders.map((o) => {
            const shares = Number(o.amount) / Math.pow(10, NUSDC_DECIMALS);
            const priceLabel = formatCents(o.priceBps, 2);
            const sideLabel = o.isBid ? 'Buy' : 'Sell';
            const outcomeLabel = o.isYes ? 'YES' : 'NO';
            const outcomeColor = o.isYes ? 'text-predict-yes' : 'text-predict-no';
            return (
              <div
                key={`${o.isYes}-${o.isBid}-${o.priceBps}-${o.orderId}`}
                className="flex items-center justify-between gap-3 p-3 bg-theme-bg-tertiary rounded-lg"
              >
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-theme-text-primary">{sideLabel}</span>
                    <span className={`font-bold ${outcomeColor}`}>{outcomeLabel}</span>
                    <span className="text-theme-text-muted">@ {priceLabel}</span>
                  </div>
                  <div className="text-xs text-theme-text-muted mt-0.5 font-mono">
                    {shares.toLocaleString('en-US', { maximumFractionDigits: 2 })} shares
                    {o.isBid && o.lockedNusdc > 0n && (
                      <>
                        {' · '}
                        {(Number(o.lockedNusdc) / Math.pow(10, NUSDC_DECIMALS)).toLocaleString(
                          'en-US',
                          { maximumFractionDigits: 2 },
                        )}{' '}
                        NUSDC locked
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRecover(o)}
                  disabled={isTrading}
                  className={`shrink-0 px-3 py-1.5 text-xs rounded font-medium disabled:opacity-50 ${
                    isSettled
                      ? 'bg-predict-yes-bg hover:bg-predict-yes-bg-strong text-predict-yes'
                      : 'bg-predict-no-bg hover:bg-predict-no-bg-strong text-predict-no'
                  }`}
                >
                  {isSettled ? (o.isBid ? 'Reclaim NUSDC' : 'Reclaim shares') : 'Cancel'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="mt-3 text-predict-no-strong text-sm bg-predict-no-bg rounded-lg p-2">{error}</div>}
    </div>
  );
}
