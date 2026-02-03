/**
 * ResultDisplay - Shows AI computation result with post-execution executor info
 */

import { RequestResult } from '../hooks/useCreateRequest';
import { NETWORK_CONFIG } from '../../../config/network';
import { TierBadge } from '@/components/badges/TierBadge';
import type { ExecutorInfo } from '../hooks/useExecutors';

interface ResultDisplayProps {
  result: RequestResult;
  executor?: ExecutorInfo | null;
}

export function ResultDisplay({ result, executor }: ResultDisplayProps) {
  const explorerUrl = `${NETWORK_CONFIG.explorerUrl}/tx/${result.txDigest}`;

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Result
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">
            Request #{result.requestId}
          </span>
          <span className="text-xs text-[var(--color-success)] bg-[var(--color-success)]/10 px-2 py-0.5 rounded">
            Settled
          </span>
        </div>
      </div>

      {/* AI Response */}
      <div className="bg-[var(--color-bg-tertiary)] rounded-md p-4 mb-4">
        <p className="text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">
          {result.result}
        </p>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-[var(--color-text-muted)]">Execution Time</span>
          <p className="text-[var(--color-text-secondary)] mt-1">
            {result.executionTimeMs}ms
          </p>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Result Hash</span>
          <p className="text-[var(--color-text-secondary)] mt-1 font-mono text-xs truncate">
            {result.resultHash}
          </p>
        </div>
      </div>

      {/* Executor Info (post-execution transparency) */}
      {executor && (
        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <span>Processed by a Nasun-qualified Executor</span>
            <TierBadge tier={executor.tier} tierName={executor.tierName} />
            {executor.teeType > 0 && (
              <span className="text-xs text-br-1">
                {executor.teeTypeName}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Transaction Link */}
      <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-br-1 hover:text-br-2 transition-colors"
        >
          <span>View settlement transaction</span>
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
