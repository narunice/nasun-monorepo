/**
 * CancelExpiredMarketCTA (round-6 plan §2.11)
 *
 * Anyone can call `cancel_expired_market` once `now > resolveDeadline` and the
 * market is still open. Surfaces a permissionless rescue button so users can
 * unblock refunds when the resolver is unresponsive.
 */

import { useState } from 'react';
import type { PredictionMarket } from '../types';
import { usePredictionTrade } from '../hooks/usePredictionTrade';
import { useNow } from '@/hooks/useNow';

interface Props {
  market: PredictionMarket;
  onSuccess?: () => void;
}

export function CancelExpiredMarketCTA({ market, onSuccess }: Props) {
  const now = useNow();
  const { isLoading, cancelExpiredMarket } = usePredictionTrade();
  const [error, setError] = useState<string | null>(null);

  if (market.status !== 'open' || now <= market.resolveDeadline) return null;

  const handleClick = async () => {
    setError(null);
    const result = await cancelExpiredMarket(market.id);
    if (result.success) onSuccess?.();
    else setError(result.error || 'Failed to cancel market');
  };

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-yellow-400 mb-2">
        Resolution deadline passed
      </h3>
      <p className="text-sm text-theme-text-secondary mb-3">
        The resolver did not settle this market in time. Anyone can cancel it now,
        which lets every Position holder claim back half their collateral and lets
        every resting order owner reclaim their locked NUSDC.
      </p>
      {error && <div className="text-red-500 text-sm bg-red-500/10 rounded-lg p-2 mb-3">{error}</div>}
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {isLoading ? 'Cancelling...' : 'Cancel expired market'}
      </button>
    </div>
  );
}
