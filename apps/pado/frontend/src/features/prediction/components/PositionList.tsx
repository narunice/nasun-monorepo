/**
 * PositionList Component (round-6 plan §2.10)
 *
 * Multi-position aware: every Position NFT is rendered with its own row, so
 * users can sell, claim, or burn each lot independently. Hedge detection
 * sums shares across YES/NO and shows the guaranteed-payout summary above
 * the per-position list.
 */

import { useState, useCallback, useMemo } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import type { PredictionMarket, Position } from '../types';
import { calculateProbability } from '../types';
import { usePredictionTrade } from '../hooks/usePredictionTrade';
import { useTransactionSync } from '../../../hooks/useTransactionSync';
import { NUSDC_DECIMALS } from '../constants';
import { PayoffCard } from './position/PayoffCard';
import { FullyHedgedCard } from './position/FullyHedgedCard';

interface PositionListProps {
  market: PredictionMarket;
  positions: Position[];
  onSuccess?: () => void;
}

export function PositionList({ market, positions, onSuccess }: PositionListProps) {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const {
    isLoading,
    placeSellTaker,
    claimWinnings,
    burnLosingPosition,
    claimCancelledRefund,
  } = usePredictionTrade();

  const [sellModalPosition, setSellModalPosition] = useState<string | null>(null);
  const [sellPriceNusdc, setSellPriceNusdc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { isSyncing, startSync } = useTransactionSync(onSuccess);

  const yesProbability = calculateProbability(market.yesSupply, market.noSupply);
  const noProbability = 100 - yesProbability;

  // Hedge summary (shown when both YES and NO positions exist).
  const { totalYes, totalNo, hedgedShares, hasHedge } = useMemo(() => {
    let yesSum = 0n;
    let noSum = 0n;
    for (const p of positions) {
      if (p.isYes) yesSum += p.shares;
      else noSum += p.shares;
    }
    const hedge = yesSum < noSum ? yesSum : noSum;
    return { totalYes: yesSum, totalNo: noSum, hedgedShares: hedge, hasHedge: yesSum > 0n && noSum > 0n };
  }, [positions]);

  const sellingPosition = useMemo(
    () => positions.find((p) => p.id === sellModalPosition) ?? null,
    [sellModalPosition, positions],
  );

  const handleSellClick = useCallback(
    (positionId: string) => {
      const position = positions.find((p) => p.id === positionId);
      if (!position) return;
      setSellModalPosition(positionId);
      const defaultPrice = (position.isYes ? yesProbability : noProbability) / 100;
      setSellPriceNusdc(defaultPrice.toFixed(2));
    },
    [positions, yesProbability, noProbability],
  );

  const handleSellConfirm = useCallback(async () => {
    if (!sellModalPosition || !sellingPosition) return;
    setError(null);

    const priceNusdc = parseFloat(sellPriceNusdc);
    if (!priceNusdc || priceNusdc <= 0 || priceNusdc >= 1) {
      setError('Price must be between 0.01 and 0.99 NUSDC');
      return;
    }

    // NUSDC price -> bps (0.65 NUSDC = 6500 bps).
    const minPriceBps = Math.floor(priceNusdc * 10000);
    // Limit-style sell: rest the unfilled remainder as a maker order.
    const result = await placeSellTaker(market.id, sellModalPosition, minPriceBps, true);
    if (result.success) {
      setSellModalPosition(null);
      setSellPriceNusdc('');
      startSync();
    } else {
      setError(result.error || 'Failed to place sell order');
    }
  }, [sellModalPosition, sellingPosition, sellPriceNusdc, market.id, placeSellTaker, startSync]);

  const handleClaim = useCallback(
    async (positionId: string) => {
      setError(null);
      const position = positions.find((p) => p.id === positionId);
      if (!position) return;

      // Cancelled markets: claim collateral refund regardless of side.
      if (market.status === 'cancelled') {
        const result = await claimCancelledRefund(market.id, positionId);
        if (!result.success) setError(result.error || 'Failed to claim refund');
        else startSync();
        return;
      }

      const isWinning = market.status === 'resolved' && position.isYes === market.outcome;
      const result = isWinning
        ? await claimWinnings(market.id, positionId)
        : await burnLosingPosition(market.id, positionId);
      if (!result.success) setError(result.error || 'Failed to settle position');
      else startSync();
    },
    [market.id, market.status, market.outcome, positions, claimWinnings, burnLosingPosition, claimCancelledRefund, startSync],
  );

  const sellOrderSummary = useMemo(() => {
    if (!sellingPosition || !sellPriceNusdc) return null;

    const priceNusdc = parseFloat(sellPriceNusdc) || 0;
    const shares = Number(sellingPosition.shares) / Math.pow(10, NUSDC_DECIMALS);
    const receiveAmount = shares * priceNusdc;
    const outcomeLabel = sellingPosition.isYes ? 'YES' : 'NO';
    const oppositeLabel = sellingPosition.isYes ? 'NO' : 'YES';

    const oppositeTotalShares = sellingPosition.isYes ? totalNo : totalYes;
    const oppositeShares = Number(oppositeTotalShares) / Math.pow(10, NUSDC_DECIMALS);

    return {
      shares,
      priceNusdc,
      receiveAmount,
      outcomeLabel,
      oppositeLabel,
      remainingOppositeShares: oppositeShares,
      probabilityPercent: Math.round(priceNusdc * 100),
    };
  }, [sellingPosition, sellPriceNusdc, totalYes, totalNo]);

  if (status !== 'unlocked' && !isZkConnected && !isPasskeyUnlocked) {
    return null;
  }

  if (positions.length === 0) {
    return (
      <div className="bg-theme-bg-secondary rounded-xl p-4">
        <h3 className="text-lg font-semibold text-theme-text-primary mb-2">My Positions</h3>
        <p className="text-sm text-theme-text-muted">
          You have no positions in this market yet. Place your first trade to see it here.
        </p>
      </div>
    );
  }

  // For the FullyHedgedCard summary, surface the largest YES + largest NO positions
  // as representative; per-position settle still happens through the list below.
  const representativeYes = positions.find((p) => p.isYes);
  const representativeNo = positions.find((p) => !p.isYes);

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4">My Positions</h3>

      {market.status === 'resolved' && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm border ${
            market.outcome
              ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-500/20 dark:border-green-500/30 dark:text-green-400'
              : 'bg-red-50 border-red-300 text-red-700 dark:bg-red-500/20 dark:border-red-500/30 dark:text-red-400'
          }`}
        >
          Market Resolved: <strong>{market.outcome ? 'YES' : 'NO'}</strong> wins
        </div>
      )}
      {market.status === 'cancelled' && (
        <div className="mb-4 p-3 rounded-lg text-sm border bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-500/20 dark:border-yellow-500/30 dark:text-yellow-400">
          Market cancelled. Claim your collateral refund below.
        </div>
      )}

      <div className="space-y-3">
        {/* Hedge summary across all positions. */}
        {hasHedge && representativeYes && representativeNo && market.status === 'open' && (
          <FullyHedgedCard
            yesPosition={{ ...representativeYes, shares: totalYes }}
            noPosition={{ ...representativeNo, shares: totalNo }}
            market={market}
            onSellYes={() => representativeYes && handleSellClick(representativeYes.id)}
            onSellNo={() => representativeNo && handleSellClick(representativeNo.id)}
            isLoading={isLoading}
          />
        )}

        {/* Hedge summary value when resolved/cancelled — informational only. */}
        {hasHedge && market.status !== 'open' && (
          <div className="text-xs text-theme-text-muted bg-theme-bg-tertiary rounded-lg p-2">
            Hedged shares (guaranteed): {(Number(hedgedShares) / Math.pow(10, NUSDC_DECIMALS)).toFixed(2)} NUSDC
          </div>
        )}

        {/* Per-position rows so each Position NFT can be sold/claimed individually. */}
        {positions.map((position) => (
          <PayoffCard
            key={position.id}
            position={position}
            market={market}
            onSell={handleSellClick}
            onClaim={handleClaim}
            isLoading={isLoading}
          />
        ))}
      </div>

      {isSyncing && (
        <div className="mt-4 text-pd3 text-sm bg-pd2/25 rounded-lg p-2 flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Syncing with blockchain...
        </div>
      )}

      {error && (
        <div className="mt-4 text-red-500 text-sm bg-red-500/25 rounded-lg p-2">{error}</div>
      )}

      {sellModalPosition && sellingPosition && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-theme-bg-secondary rounded-xl p-4 sm:p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <h4 className="text-lg font-semibold text-theme-text-primary mb-4">
              Sell {sellingPosition.isYes ? 'YES' : 'NO'} Position
            </h4>

            <div className="mb-4">
              <label className="block text-sm text-theme-text-muted mb-1">
                Price per {sellingPosition.isYes ? 'YES' : 'NO'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  value={sellPriceNusdc}
                  onChange={(e) => setSellPriceNusdc(e.target.value)}
                  placeholder="0.50"
                  min="0.01"
                  max="0.99"
                  step="0.01"
                  className="w-full px-3 py-2.5 pr-20 text-base bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-pd2"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-text-muted text-sm">
                  NUSDC
                </span>
              </div>
              {sellPriceNusdc && (
                <p className="text-xs text-theme-text-muted mt-1">
                  ≈ {Math.round(parseFloat(sellPriceNusdc) * 100)}% implied probability
                </p>
              )}
            </div>

            {sellOrderSummary && (
              <div className="mb-4 p-3 bg-theme-bg-tertiary rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-theme-text-muted">Selling</span>
                  <span className="text-theme-text-primary font-mono">
                    {sellOrderSummary.shares.toLocaleString('en-US', { maximumFractionDigits: 2 })} {sellOrderSummary.outcomeLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-text-muted">You will receive</span>
                  <span className="text-green-500 font-mono font-medium">
                    {sellOrderSummary.receiveAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
                  </span>
                </div>

                <div className="pt-2 mt-2 border-t border-theme-border/50">
                  <p className="text-xs text-theme-text-muted mb-1">After this trade:</p>
                  {sellOrderSummary.remainingOppositeShares > 0 ? (
                    <>
                      <p className="text-theme-text-secondary">
                        You will hold: <span className="font-medium">{sellOrderSummary.oppositeLabel} only</span>
                      </p>
                      <p className="text-pd3 font-medium">
                        You are betting on: {sellOrderSummary.oppositeLabel}
                      </p>
                    </>
                  ) : (
                    <p className="text-theme-text-secondary">You will have no position in this market</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSellModalPosition(null);
                  setSellPriceNusdc('');
                  setError(null);
                }}
                className="flex-1 min-h-[44px] py-2.5 bg-theme-bg-tertiary hover:bg-theme-bg-primary text-theme-text-primary rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSellConfirm}
                disabled={isLoading}
                className="flex-1 min-h-[44px] py-2.5 bg-pd1 hover:bg-pd1/80 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {isLoading ? 'Selling...' : 'Confirm Sell'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
