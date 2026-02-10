/**
 * ECRReceipt - Modal displaying ExecutionComplianceRecord as a receipt
 */

import { useEffect, useCallback } from 'react';
import { useECR } from '../hooks/useECR';
import { LocalReceiptContent } from '@/components/receipt/LocalReceiptContent';
import { OnChainReceiptContent } from '@/components/receipt/OnChainReceiptContent';
import type { MessageMetadata } from '@/types/chat';

interface ECRReceiptProps {
  requestId: number;
  metadata?: MessageMetadata;
  onClose: () => void;
}

export function ECRReceipt({ requestId, metadata, onClose }: ECRReceiptProps) {
  const { ecr, isLoading, error } = useECR(requestId);

  // Escape key to close (B-4)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const hasLocalData = !ecr && metadata && (metadata.resultHash || metadata.teeType);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--color-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Execution Report
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Request #{requestId}
          </p>
        </div>

        {/* Content */}
        <div className="px-5 pb-5">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <svg className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="ml-2 text-sm text-[var(--color-text-muted)]">Loading record...</span>
            </div>
          )}

          {error && (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-error)]">Failed to load record</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{error}</p>
            </div>
          )}

          {!isLoading && !error && !ecr && !hasLocalData && (
            <div className="py-8 text-center">
              <svg className="w-8 h-8 mx-auto text-[var(--color-text-muted)] mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-[var(--color-text-muted)]">Receipt not yet available</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                The execution report is created after settlement.
              </p>
            </div>
          )}

          {!isLoading && !error && hasLocalData && metadata && (
            <LocalReceiptContent metadata={metadata} onClose={onClose} />
          )}

          {ecr && (
            <OnChainReceiptContent ecr={ecr} onClose={onClose} />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
