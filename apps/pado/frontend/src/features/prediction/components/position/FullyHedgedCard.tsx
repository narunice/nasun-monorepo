/**
 * FullyHedgedCard - Shows when user holds both YES and NO positions
 */

import type { PredictionMarket, Position } from '../../types';
import { NUSDC_DECIMALS } from '../../constants';

interface FullyHedgedCardProps {
  yesPosition: Position;
  noPosition: Position;
  market: PredictionMarket;
  onSellYes: () => void;
  onSellNo: () => void;
  isLoading: boolean;
}

export function FullyHedgedCard({ yesPosition, noPosition, market, onSellYes, onSellNo, isLoading }: FullyHedgedCardProps) {
  const yesShares = Number(yesPosition.shares) / Math.pow(10, NUSDC_DECIMALS);
  const noShares = Number(noPosition.shares) / Math.pow(10, NUSDC_DECIMALS);
  const hedgedShares = Math.min(yesShares, noShares);

  return (
    <div className="bg-gradient-to-r from-pd2/10 to-purple-500/10 border border-pd2/30 rounded-xl p-4">
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
          <span className="font-bold text-predict-yes">
            {hedgedShares.toLocaleString('en-US', { maximumFractionDigits: 2 })} NUSDC
          </span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-theme-text-muted">Risk</span>
          <span className="text-pd3 font-medium">None</span>
        </div>
      </div>

      {/* Position breakdown */}
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
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={onSellYes}
              disabled={isLoading}
              className="flex-1 min-h-[44px] py-2.5 px-2 bg-predict-no-bg hover:bg-predict-no-bg-strong text-predict-no rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Sell YES → Bet NO
            </button>
            <button
              onClick={onSellNo}
              disabled={isLoading}
              className="flex-1 min-h-[44px] py-2.5 px-2 bg-predict-yes-bg hover:bg-predict-yes-bg-strong text-predict-yes rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Sell NO → Bet YES
            </button>
          </div>
        </>
      )}
    </div>
  );
}
