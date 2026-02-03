/**
 * Perpetual Positions List Component
 * Displays user's open positions with P&L
 */

import { useState, useCallback } from 'react';
import { usePerpMarketContext } from '../context/PerpMarketContext';
import { usePerpPositionsWithMetrics } from '../hooks/usePerpPositions';
import { usePerpOrder } from '../hooks/usePerpOrder';
import { RISK_LEVEL, fromContractPrice, fromContractAmount } from '../constants';
import type { PositionWithMetrics } from '../types';

interface PerpPositionListProps {
  onCloseSuccess?: (txDigest: string) => void;
  onCloseError?: (error: Error) => void;
}

export function PerpPositionList({
  onCloseSuccess,
  onCloseError,
}: PerpPositionListProps) {
  const { selectedMarketId, currentPrice } = usePerpMarketContext();
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);

  // Create price map for metrics calculation
  const priceMap = new Map<string, number>();
  if (selectedMarketId && currentPrice > 0) {
    priceMap.set(selectedMarketId, currentPrice);
  }

  const { positions, isLoading, error } = usePerpPositionsWithMetrics(priceMap);

  // Filter positions for current market
  const marketPositions = selectedMarketId
    ? positions.filter((p) => p.marketId === selectedMarketId)
    : positions;

  // Order hook for closing positions
  const { closePosition } = usePerpOrder({
    marketId: selectedMarketId || '',
    onSuccess: (digest) => {
      setClosingPositionId(null);
      onCloseSuccess?.(digest);
    },
    onError: (err) => {
      setClosingPositionId(null);
      onCloseError?.(err);
    },
  });

  const handleClose = useCallback(
    async (position: PositionWithMetrics) => {
      if (!selectedMarketId || closingPositionId) return;

      setClosingPositionId(position.id);
      try {
        await closePosition({
          positionId: position.id,
          currentPrice: position.currentPrice,
        });
      } catch {
        setClosingPositionId(null);
      }
    },
    [selectedMarketId, closePosition, closingPositionId],
  );

  if (isLoading) {
    return (
      <div className="p-4 text-center text-theme-text-muted">
        Loading positions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-400">
        Error loading positions: {error.message}
      </div>
    );
  }

  if (marketPositions.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-theme-text-muted">No open positions</p>
        <p className="text-sm text-theme-text-disabled mt-1">
          Open a position using the order form
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {marketPositions.map((position) => (
        <PositionCard
          key={position.id}
          position={position}
          onClose={() => handleClose(position)}
          isClosing={closingPositionId === position.id}
        />
      ))}
    </div>
  );
}

interface PositionCardProps {
  position: PositionWithMetrics;
  onClose: () => void;
  isClosing: boolean;
}

function PositionCard({ position, onClose, isClosing }: PositionCardProps) {
  const entryPrice = fromContractPrice(position.entryPrice);
  const collateral = fromContractAmount(position.collateral);
  const size = Number(position.size) / 100_000_000;

  const pnlDisplay = position.unrealizedPnlNegative
    ? `-$${position.unrealizedPnl.toFixed(2)}`
    : `+$${position.unrealizedPnl.toFixed(2)}`;

  const roeDisplay =
    (position.roe >= 0 ? '+' : '') + position.roe.toFixed(2) + '%';

  const riskColor = getRiskColor(position.riskLevel);

  return (
    <div className="p-4 bg-theme-bg-secondary rounded-lg border border-theme-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 text-xs font-bold rounded ${
              position.isLong
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {position.isLong ? 'LONG' : 'SHORT'}
          </span>
          <span className="text-sm font-medium">{position.leverage}x</span>
        </div>
        <span className={`px-2 py-0.5 text-xs rounded ${riskColor}`}>
          {position.riskLevel.toUpperCase()}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-theme-text-muted text-xs">Size</p>
          <p className="font-medium">{size.toFixed(4)} BTC</p>
        </div>
        <div>
          <p className="text-theme-text-muted text-xs">Entry Price</p>
          <p className="font-medium">${entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-theme-text-muted text-xs">Collateral</p>
          <p className="font-medium">${collateral.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-theme-text-muted text-xs">Margin Ratio</p>
          <p className={`font-medium ${riskColor.replace('bg-', 'text-').replace('/20', '')}`}>
            {(position.marginRatio / 100).toFixed(2)}%
          </p>
        </div>
      </div>

      {/* P&L Section */}
      <div className="mt-3 pt-3 border-t border-theme-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-theme-text-muted text-xs">Unrealized P&L</p>
            <p
              className={`text-lg font-bold ${
                position.unrealizedPnlNegative ? 'text-red-400' : 'text-green-400'
              }`}
            >
              {pnlDisplay}
            </p>
          </div>
          <div className="text-right">
            <p className="text-theme-text-muted text-xs">ROE</p>
            <p
              className={`font-bold ${
                position.roe < 0 ? 'text-red-400' : 'text-green-400'
              }`}
            >
              {roeDisplay}
            </p>
          </div>
        </div>
      </div>

      {/* Liquidation Price */}
      <div className="mt-3 pt-3 border-t border-theme-border flex items-center justify-between">
        <div>
          <p className="text-theme-text-muted text-xs">Liquidation Price</p>
          <p className="font-medium text-orange-400">
            ${position.liquidationPrice.toFixed(2)}
          </p>
        </div>
        <button
          onClick={onClose}
          disabled={isClosing}
          className="px-4 py-2 text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors disabled:opacity-50"
        >
          {isClosing ? (
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
              Closing...
            </span>
          ) : (
            'Close'
          )}
        </button>
      </div>
    </div>
  );
}

function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case RISK_LEVEL.HEALTHY:
      return 'bg-green-500/20 text-green-400';
    case RISK_LEVEL.WARNING:
      return 'bg-yellow-500/20 text-yellow-400';
    case RISK_LEVEL.DANGER:
      return 'bg-orange-500/20 text-orange-400';
    case RISK_LEVEL.CRITICAL:
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-pd2/20 text-theme-text-muted';
  }
}
