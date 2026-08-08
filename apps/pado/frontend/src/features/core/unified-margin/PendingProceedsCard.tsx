/**
 * PendingProceedsCard
 *
 * Shows funds sitting pool-side rather than in the trading account, which is
 * where every other balance view looks. Without this a user whose maker order
 * filled while they were away sees the proceeds nowhere and reasonably concludes
 * the money is gone. Renders nothing when there is nothing pending.
 */

import { usePendingProceeds } from './usePendingProceeds';

function formatAmount(raw: bigint, decimals: number): string {
  const value = Number(raw) / 10 ** decimals;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals > 6 ? 8 : 2,
  });
}

export function PendingProceedsCard() {
  const { entries, usd, hasPending, claimable, isClaiming, claimError, claim } =
    usePendingProceeds();

  if (!hasPending) return null;

  const anyWorkingOrders = entries.some((e) => e.hasOpenOrders);
  const canClaim = claimable.length > 0;

  return (
    <div className="bg-theme-bg-secondary border border-yellow-500/40 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-theme-text-primary">
            Funds held in the order book
          </h3>
          <p className="text-xs text-theme-text-muted mt-0.5 leading-relaxed">
            These are yours. Proceeds from filled orders stay with the market until
            you pull them back into your trading account.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-theme-text-muted">Value</div>
          <div className="text-base font-semibold text-theme-text-primary">
            ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {entries.map((e) => (
          <div
            key={`${e.balanceManagerId}:${e.poolKey}`}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-theme-text-secondary">
              {e.pool.baseToken.symbol} / {e.pool.quoteToken.symbol}
              {e.hasOpenOrders && (
                <span className="ml-2 text-xs text-theme-text-muted">open orders</span>
              )}
            </span>
            <span className="text-theme-text-primary tabular-nums">
              {e.quoteRaw > 0n && (
                <>
                  {formatAmount(e.quoteRaw, e.pool.quoteToken.decimals)}{' '}
                  {e.pool.quoteToken.symbol}
                </>
              )}
              {e.quoteRaw > 0n && e.baseRaw > 0n && ' + '}
              {e.baseRaw > 0n && (
                <>
                  {formatAmount(e.baseRaw, e.pool.baseToken.decimals)} {e.pool.baseToken.symbol}
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      {anyWorkingOrders && (
        <p className="text-xs text-theme-text-muted">
          Markets marked "open orders" also hold collateral for orders that are still
          working. Cancel those orders to release everything in that market.
        </p>
      )}

      {claimError && <p className="text-xs text-red-500">{claimError}</p>}

      <button
        onClick={() => void claim()}
        disabled={isClaiming || !canClaim}
        className="w-full py-2 rounded-lg bg-theme-accent text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {isClaiming
          ? 'Moving funds...'
          : canClaim
            ? 'Move to trading account'
            : 'Cancel your open orders to release these funds'}
      </button>
    </div>
  );
}
