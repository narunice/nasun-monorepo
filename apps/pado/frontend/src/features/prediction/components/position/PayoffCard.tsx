/**
 * PayoffCard - Shows single prediction position with payoff structure
 */

import type { PredictionMarket, Position } from '../../types';
import { NUSDC_DECIMALS } from '../../constants';
import { getExplorerObjectUrl } from '@/lib/explorer';

interface PayoffCardProps {
  position: Position;
  market: PredictionMarket;
  onSell: (positionId: string) => void;
  onClaim: (positionId: string) => void;
  isLoading: boolean;
}

export function PayoffCard({ position, market, onSell, onClaim, isLoading }: PayoffCardProps) {
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
        <a
          href={getExplorerObjectUrl(position.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="p-0.5 rounded text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary transition-colors inline-flex"
          title="View on Explorer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
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
          <div className="w-full py-2 bg-pd2/50 text-theme-text-muted rounded-lg text-sm font-medium text-center">
            Position Lost
          </div>
        )}
      </div>
    </div>
  );
}
