/**
 * PositionList Component
 * Displays user's prediction market positions with sell and claim functionality
 */

import { useState, useCallback } from 'react';
import { useWallet } from '@nasun/wallet';
import type { PredictionMarket, Position } from '../types';
import { calculateProbability } from '../types';
import { formatPositionAmount, usePositionValue } from '../hooks/usePredictionPositions';
import { usePredictionTrade } from '../hooks/usePredictionTrade';

interface PositionListProps {
  market: PredictionMarket;
  positions: Position[];
  onSuccess?: () => void;
}

interface PositionCardProps {
  position: Position;
  market: PredictionMarket;
  currentPrice: number;
  onSell: (positionId: string) => void;
  onClaim: (positionId: string) => void;
  isLoading: boolean;
}

function PositionCard({ position, market, currentPrice, onSell, onClaim, isLoading }: PositionCardProps) {
  const { totalShares, totalCost, currentValue, pnl, pnlPercent } = usePositionValue([position], currentPrice);

  const isWinning = market.status === 'resolved' && position.isYes === market.outcome;
  const isLosing = market.status === 'resolved' && position.isYes !== market.outcome;

  return (
    <div className={`p-3 rounded-lg border ${
      position.isYes
        ? 'bg-green-500/10 border-green-500/30'
        : 'bg-red-500/10 border-red-500/30'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${
            position.isYes ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className={`font-semibold ${
            position.isYes ? 'text-green-500' : 'text-red-500'
          }`}>
            {position.isYes ? 'YES' : 'NO'}
          </span>
        </div>
        <span className="text-sm text-theme-text-muted">
          {formatPositionAmount(totalShares)} shares
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div>
          <span className="text-theme-text-muted">Cost:</span>
          <span className="ml-1 text-theme-text-primary font-mono">
            {formatPositionAmount(totalCost)} NUSDC
          </span>
        </div>
        <div>
          <span className="text-theme-text-muted">Value:</span>
          <span className="ml-1 text-theme-text-primary font-mono">
            {formatPositionAmount(currentValue)} NUSDC
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-theme-text-muted">P&L:</span>
          <span className={`ml-1 font-mono ${
            pnl >= 0n ? 'text-green-500' : 'text-red-500'
          }`}>
            {pnl >= 0n ? '+' : ''}{formatPositionAmount(pnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Action buttons */}
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
          {isLoading ? 'Claiming...' : `Claim ${formatPositionAmount(position.shares)} NUSDC`}
        </button>
      )}

      {isLosing && (
        <div className="w-full py-2 bg-gray-600/50 text-gray-400 rounded-lg text-sm font-medium text-center">
          Position Lost
        </div>
      )}
    </div>
  );
}

export function PositionList({ market, positions, onSuccess }: PositionListProps) {
  const { status } = useWallet();
  const { isLoading, placeSellOrder, claimWinnings } = usePredictionTrade();
  const [sellModalPosition, setSellModalPosition] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Calculate current probability
  const yesProbability = calculateProbability(market.yesSupply, market.noSupply);
  const noProbability = 100 - yesProbability;

  const handleSellClick = useCallback((positionId: string) => {
    const position = positions.find(p => p.id === positionId);
    if (position) {
      setSellModalPosition(positionId);
      setSellPrice((position.isYes ? yesProbability : noProbability).toFixed(1));
    }
  }, [positions, yesProbability, noProbability]);

  const handleSellConfirm = useCallback(async () => {
    if (!sellModalPosition) return;
    setError(null);

    const priceNum = parseFloat(sellPrice);
    if (!priceNum || priceNum <= 0 || priceNum >= 100) {
      setError('Price must be between 0% and 100%');
      return;
    }

    const result = await placeSellOrder(market.id, sellModalPosition, priceNum);
    if (result.success) {
      setSellModalPosition(null);
      setSellPrice('');
      onSuccess?.();
    } else {
      setError(result.error || 'Failed to place sell order');
    }
  }, [sellModalPosition, sellPrice, market.id, placeSellOrder, onSuccess]);

  const handleClaim = useCallback(async (positionId: string) => {
    setError(null);
    const result = await claimWinnings(market.id, positionId);
    if (result.success) {
      onSuccess?.();
    } else {
      setError(result.error || 'Failed to claim winnings');
    }
  }, [market.id, claimWinnings, onSuccess]);

  if (status !== 'unlocked') {
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

  // Group positions by YES/NO
  const yesPositions = positions.filter(p => p.isYes);
  const noPositions = positions.filter(p => !p.isYes);

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
        {yesPositions.map(position => (
          <PositionCard
            key={position.id}
            position={position}
            market={market}
            currentPrice={yesProbability}
            onSell={handleSellClick}
            onClaim={handleClaim}
            isLoading={isLoading}
          />
        ))}
        {noPositions.map(position => (
          <PositionCard
            key={position.id}
            position={position}
            market={market}
            currentPrice={noProbability}
            onSell={handleSellClick}
            onClaim={handleClaim}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 text-red-500 text-sm bg-red-500/10 rounded-lg p-2">
          {error}
        </div>
      )}

      {/* Sell Modal */}
      {sellModalPosition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-theme-bg-secondary rounded-xl p-6 max-w-sm w-full mx-4">
            <h4 className="text-lg font-semibold text-theme-text-primary mb-4">
              Sell Position
            </h4>

            <div className="mb-4">
              <label className="block text-sm text-theme-text-muted mb-1">
                Sell Price (%)
              </label>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="0.0"
                min="0.1"
                max="99.9"
                step="0.1"
                className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSellModalPosition(null);
                  setSellPrice('');
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
