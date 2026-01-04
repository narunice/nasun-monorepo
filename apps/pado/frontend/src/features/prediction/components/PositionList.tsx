/**
 * PositionList Component
 * Displays user's prediction market positions with sell and claim functionality
 *
 * UX Design based on Kalshi/Polymarket:
 * - Show "Payoff at Resolution" instead of P&L
 * - Display "Fully Hedged" when user holds both YES and NO
 * - Use NUSDC price instead of percentage
 */

import { useState, useCallback, useMemo } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import type { PredictionMarket, Position } from '../types';
import { calculateProbability } from '../types';
import { usePredictionTrade } from '../hooks/usePredictionTrade';
import { NUSDC_DECIMALS } from '../constants';

interface PositionListProps {
  market: PredictionMarket;
  positions: Position[];
  onSuccess?: () => void;
}

// ========================================
// PayoffCard - Shows single position with payoff structure
// ========================================
interface PayoffCardProps {
  position: Position;
  market: PredictionMarket;
  onSell: (positionId: string) => void;
  onClaim: (positionId: string) => void;
  isLoading: boolean;
}

function PayoffCard({ position, market, onSell, onClaim, isLoading }: PayoffCardProps) {
  const shares = Number(position.shares) / Math.pow(10, NUSDC_DECIMALS);
  const costBasis = Number(position.costBasis) / Math.pow(10, NUSDC_DECIMALS);
  const avgPrice = position.shares > 0n ? costBasis / shares : 0;

  const isWinning = market.status === 'resolved' && position.isYes === market.outcome;
  const isLosing = market.status === 'resolved' && position.isYes !== market.outcome;
  const outcomeLabel = position.isYes ? 'YES' : 'NO';
  const oppositeLabel = position.isYes ? 'NO' : 'YES';

  return (
    <div className={`p-4 rounded-xl border ${
      position.isYes
        ? 'bg-green-500/10 border-green-500/30'
        : 'bg-red-500/10 border-red-500/30'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${
            position.isYes ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className={`font-bold ${
            position.isYes ? 'text-green-500' : 'text-red-500'
          }`}>
            {outcomeLabel} Position
          </span>
        </div>
      </div>

      {/* Position Info */}
      <div className="space-y-2 text-sm mb-3">
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Shares</span>
          <span className="font-mono text-theme-text-primary">
            {shares.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Avg Price</span>
          <span className="font-mono text-theme-text-primary">
            {avgPrice.toFixed(2)} NUSDC
          </span>
        </div>
      </div>

      {/* Payoff at Resolution */}
      <div className="mt-3 pt-3 border-t border-theme-border/50">
        <p className="text-xs text-theme-text-muted mb-2">Payoff at Resolution</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-theme-text-secondary">If {outcomeLabel} wins →</span>
            <span className="text-green-500 font-mono">
              {shares.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-theme-text-secondary">If {oppositeLabel} wins →</span>
            <span className="text-red-500 font-mono">0 NUSDC</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-4">
        {market.status === 'open' && (
          <button
            onClick={() => onSell(position.id)}
            disabled={isLoading}
            className="w-full py-2 bg-theme-bg-tertiary hover:bg-theme-bg-primary text-theme-text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : 'Sell Position'}
          </button>
        )}

        {isWinning && (
          <button
            onClick={() => onClaim(position.id)}
            disabled={isLoading}
            className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Claiming...' : `Claim ${shares.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC`}
          </button>
        )}

        {isLosing && (
          <div className="w-full py-2 bg-gray-600/50 text-gray-400 rounded-lg text-sm font-medium text-center">
            Position Lost
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// FullyHedgedCard - Shows when user holds both YES and NO
// ========================================
interface FullyHedgedCardProps {
  yesPosition: Position;
  noPosition: Position;
  market: PredictionMarket;
  onSellYes: () => void;
  onSellNo: () => void;
  isLoading: boolean;
}

function FullyHedgedCard({ yesPosition, noPosition, market, onSellYes, onSellNo, isLoading }: FullyHedgedCardProps) {
  const yesShares = Number(yesPosition.shares) / Math.pow(10, NUSDC_DECIMALS);
  const noShares = Number(noPosition.shares) / Math.pow(10, NUSDC_DECIMALS);
  const hedgedShares = Math.min(yesShares, noShares);

  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">⚖️</span>
        <span className="font-bold text-theme-text-primary">Fully Hedged Position</span>
      </div>

      {/* Explanation */}
      <p className="text-sm text-theme-text-secondary mb-4">
        You hold both YES and NO. Your payout is fixed regardless of outcome.
      </p>

      {/* Guaranteed Payout */}
      <div className="bg-theme-bg-secondary rounded-lg p-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-theme-text-muted">Guaranteed Payout</span>
          <span className="font-bold text-green-500">
            {hedgedShares.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
          </span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-theme-text-muted">Risk</span>
          <span className="text-blue-400 font-medium">None</span>
        </div>
      </div>

      {/* Position breakdown (smaller text) */}
      <div className="text-xs text-theme-text-muted mb-3 space-y-1">
        <div className="flex justify-between">
          <span>YES shares:</span>
          <span className="font-mono">{yesShares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between">
          <span>NO shares:</span>
          <span className="font-mono">{noShares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Action buttons */}
      {market.status === 'open' && (
        <>
          <p className="text-xs text-theme-text-muted mb-2">To take a position:</p>
          <div className="flex gap-2">
            <button
              onClick={onSellYes}
              disabled={isLoading}
              className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Sell YES → Bet NO
            </button>
            <button
              onClick={onSellNo}
              disabled={isLoading}
              className="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Sell NO → Bet YES
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function PositionList({ market, positions, onSuccess }: PositionListProps) {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { isLoading, placeSellOrder, claimWinnings } = usePredictionTrade();
  const [sellModalPosition, setSellModalPosition] = useState<string | null>(null);
  const [sellPriceNusdc, setSellPriceNusdc] = useState(''); // Changed from % to NUSDC
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Calculate current probability for default price
  const yesProbability = calculateProbability(market.yesSupply, market.noSupply);
  const noProbability = 100 - yesProbability;

  // Detect hedged positions (YES + NO pairs)
  const { hedgedPair, unhedgedPositions } = useMemo(() => {
    const yesPos = positions.find(p => p.isYes);
    const noPos = positions.find(p => !p.isYes);

    if (yesPos && noPos) {
      // Both YES and NO exist = hedged
      return { hedgedPair: { yes: yesPos, no: noPos }, unhedgedPositions: [] };
    }
    // Only one type exists
    return { hedgedPair: null, unhedgedPositions: positions };
  }, [positions]);

  // Get the position being sold for modal display
  const sellingPosition = useMemo(() => {
    if (!sellModalPosition) return null;
    return positions.find(p => p.id === sellModalPosition);
  }, [sellModalPosition, positions]);

  const handleSellClick = useCallback((positionId: string) => {
    const position = positions.find(p => p.id === positionId);
    if (position) {
      setSellModalPosition(positionId);
      // Default price in NUSDC (convert probability to decimal)
      const defaultPrice = (position.isYes ? yesProbability : noProbability) / 100;
      setSellPriceNusdc(defaultPrice.toFixed(2));
    }
  }, [positions, yesProbability, noProbability]);

  const handleSellConfirm = useCallback(async () => {
    if (!sellModalPosition) return;
    setError(null);

    const priceNusdc = parseFloat(sellPriceNusdc);
    if (!priceNusdc || priceNusdc <= 0 || priceNusdc >= 1) {
      setError('Price must be between 0.01 and 0.99 NUSDC');
      return;
    }

    // Convert NUSDC to percentage for the API
    const pricePercent = priceNusdc * 100;
    const result = await placeSellOrder(market.id, sellModalPosition, pricePercent);
    if (result.success) {
      setSellModalPosition(null);
      setSellPriceNusdc('');
      // Show syncing state while blockchain updates
      setIsSyncing(true);
      setTimeout(() => {
        setIsSyncing(false);
        onSuccess?.();
      }, 1500);
    } else {
      setError(result.error || 'Failed to place sell order');
    }
  }, [sellModalPosition, sellPriceNusdc, market.id, placeSellOrder, onSuccess]);

  const handleClaim = useCallback(async (positionId: string) => {
    setError(null);
    const result = await claimWinnings(market.id, positionId);
    if (result.success) {
      // Show syncing state while blockchain updates
      setIsSyncing(true);
      setTimeout(() => {
        setIsSyncing(false);
        onSuccess?.();
      }, 1500);
    } else {
      setError(result.error || 'Failed to claim winnings');
    }
  }, [market.id, claimWinnings, onSuccess]);

  if (status !== 'unlocked' && !isZkConnected) {
    return null;
  }

  if (positions.length === 0) {
    return (
      <div className="bg-theme-bg-secondary rounded-xl p-4">
        <h3 className="text-lg font-semibold text-theme-text-primary mb-2">My Positions</h3>
        <p className="text-sm text-theme-text-muted">No positions in this market</p>
      </div>
    );
  }

  // Calculate sell order summary for modal
  const sellOrderSummary = useMemo(() => {
    if (!sellingPosition || !sellPriceNusdc) return null;

    const priceNusdc = parseFloat(sellPriceNusdc) || 0;
    const shares = Number(sellingPosition.shares) / Math.pow(10, NUSDC_DECIMALS);
    const receiveAmount = shares * priceNusdc;
    const outcomeLabel = sellingPosition.isYes ? 'YES' : 'NO';
    const oppositeLabel = sellingPosition.isYes ? 'NO' : 'YES';

    // Check if there's an opposite position (hedged scenario)
    const oppositePosition = positions.find(p => p.isYes !== sellingPosition.isYes);
    const oppositeShares = oppositePosition
      ? Number(oppositePosition.shares) / Math.pow(10, NUSDC_DECIMALS)
      : 0;

    return {
      shares,
      priceNusdc,
      receiveAmount,
      outcomeLabel,
      oppositeLabel,
      remainingOppositeShares: oppositeShares,
      probabilityPercent: Math.round(priceNusdc * 100),
    };
  }, [sellingPosition, sellPriceNusdc, positions]);

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4">My Positions</h3>

      {/* Market resolved banner */}
      {market.status === 'resolved' && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          market.outcome
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          Market Resolved: <strong>{market.outcome ? 'YES' : 'NO'}</strong> wins!
        </div>
      )}

      {/* Position cards */}
      <div className="space-y-3">
        {/* Show FullyHedgedCard if both YES and NO exist */}
        {hedgedPair && (
          <FullyHedgedCard
            yesPosition={hedgedPair.yes}
            noPosition={hedgedPair.no}
            market={market}
            onSellYes={() => handleSellClick(hedgedPair.yes.id)}
            onSellNo={() => handleSellClick(hedgedPair.no.id)}
            isLoading={isLoading}
          />
        )}

        {/* Show PayoffCard for single positions */}
        {unhedgedPositions.map(position => (
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

      {/* Syncing indicator */}
      {isSyncing && (
        <div className="mt-4 text-blue-400 text-sm bg-blue-500/10 rounded-lg p-2 flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Syncing with blockchain...
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-4 text-red-500 text-sm bg-red-500/10 rounded-lg p-2">
          {error}
        </div>
      )}

      {/* Sell Modal - Updated with NUSDC price input */}
      {sellModalPosition && sellingPosition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-theme-bg-secondary rounded-xl p-6 max-w-sm w-full mx-4">
            <h4 className="text-lg font-semibold text-theme-text-primary mb-4">
              Sell {sellingPosition.isYes ? 'YES' : 'NO'} Position
            </h4>

            {/* Price Input - NUSDC */}
            <div className="mb-4">
              <label className="block text-sm text-theme-text-muted mb-1">
                Price per {sellingPosition.isYes ? 'YES' : 'NO'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={sellPriceNusdc}
                  onChange={(e) => setSellPriceNusdc(e.target.value)}
                  placeholder="0.50"
                  min="0.01"
                  max="0.99"
                  step="0.01"
                  className="w-full px-3 py-2 pr-20 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            {/* Order Summary */}
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

                {/* Position After Trade */}
                <div className="pt-2 mt-2 border-t border-theme-border/50">
                  <p className="text-xs text-theme-text-muted mb-1">After this trade:</p>
                  {sellOrderSummary.remainingOppositeShares > 0 ? (
                    <>
                      <p className="text-theme-text-secondary">
                        You will hold: <span className="font-medium">{sellOrderSummary.oppositeLabel} only</span>
                      </p>
                      <p className="text-blue-400 font-medium">
                        You are betting on: {sellOrderSummary.oppositeLabel}
                      </p>
                    </>
                  ) : (
                    <p className="text-theme-text-secondary">
                      You will have no position in this market
                    </p>
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
                className="flex-1 py-2 bg-theme-bg-tertiary hover:bg-theme-bg-primary text-theme-text-primary rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSellConfirm}
                disabled={isLoading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
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
