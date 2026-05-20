/**
 * AdminResolveModal Component
 * Modal for resolving prediction markets (Admin only)
 */

import { useState, useCallback } from 'react';
import { usePredictionAdmin } from '../hooks/usePredictionAdmin';
import { useNow } from '@/hooks/useNow';
import type { PredictionMarket } from '../types';

interface AdminResolveModalProps {
  market: PredictionMarket;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (digest: string) => void;
}

export function AdminResolveModal({
  market,
  isOpen,
  onClose,
  onSuccess,
}: AdminResolveModalProps) {
  const { isLoading, resolveMarket } = usePredictionAdmin();
  const [selectedOutcome, setSelectedOutcome] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const now = useNow();

  // Round-6 plan §2.14: resolve is only valid in [closeTime, resolveDeadline].
  const beforeClose = now < market.closeTime;
  const pastDeadline = now > market.resolveDeadline;
  const isGated = beforeClose || pastDeadline;

  const handleResolve = useCallback(async () => {
    if (selectedOutcome === null) {
      setError('Please select an outcome');
      return;
    }
    if (isGated) {
      setError(beforeClose ? 'Wait for close time to pass.' : 'Resolve deadline has expired.');
      return;
    }

    setError(null);
    setSuccess(null);

    const result = await resolveMarket(market.id, selectedOutcome);

    if (result.success) {
      setSuccess(`Market resolved. Tx: ${result.digest?.slice(0, 8)}...`);
      setTimeout(() => {
        onSuccess?.(result.digest!);
        onClose();
      }, 2000);
    } else {
      setError(result.error || 'Failed to resolve market');
    }
  }, [market.id, selectedOutcome, resolveMarket, onSuccess, onClose, isGated, beforeClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-theme-bg-secondary rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
        <h2 className="text-xl font-bold text-theme-text-primary mb-4">
          Resolve Market
        </h2>

        {/* Market Info */}
        <div className="bg-theme-bg-tertiary rounded-lg p-4 mb-4">
          <p className="text-sm text-theme-text-muted mb-1">Question</p>
          <p className="text-theme-text-primary font-medium">{market.question}</p>
        </div>

        {/* Warning */}
        <div className="bg-notice-bg border border-notice-border rounded-lg p-3 mb-4">
          <p className="text-notice-text text-sm">
            This action is irreversible. Once resolved, the outcome cannot be changed.
          </p>
        </div>

        {/* Outcome Selection */}
        <div className="mb-4">
          <label className="block text-sm text-theme-text-muted mb-2">
            Select Winning Outcome
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedOutcome(true)}
              className={`flex-1 py-3 rounded-lg font-semibold text-white transition-all ${
                selectedOutcome === true
                  ? 'bg-predict-yes-bar ring-2 ring-predict-yes-strong ring-offset-2 ring-offset-theme-bg-secondary'
                  : 'bg-predict-yes-bar/60 hover:bg-predict-yes-bar/80'
              }`}
            >
              YES Wins
            </button>
            <button
              onClick={() => setSelectedOutcome(false)}
              className={`flex-1 py-3 rounded-lg font-semibold text-white transition-all ${
                selectedOutcome === false
                  ? 'bg-predict-no-bar ring-2 ring-predict-no-strong ring-offset-2 ring-offset-theme-bg-secondary'
                  : 'bg-predict-no-bar/60 hover:bg-predict-no-bar/80'
              }`}
            >
              NO Wins
            </button>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="text-predict-no-strong text-sm bg-predict-no-bg rounded-lg p-2 mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="text-predict-yes-strong text-sm bg-predict-yes-bg rounded-lg p-2 mb-4">
            {success}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2 rounded-lg font-medium text-theme-text-primary bg-theme-bg-tertiary hover:bg-theme-bg-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleResolve}
            disabled={isLoading || selectedOutcome === null || isGated}
            className="flex-1 py-2 rounded-lg font-medium text-white bg-pd1 hover:bg-pd1/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={beforeClose ? 'Wait for close time' : pastDeadline ? 'Resolve deadline expired' : undefined}
          >
            {isLoading ? 'Resolving...' : 'Resolve Market'}
          </button>
        </div>
      </div>
    </div>
  );
}
