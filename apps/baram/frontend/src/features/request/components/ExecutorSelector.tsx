/**
 * ExecutorSelector - Component for selecting an executor from the registry
 */

import { useExecutors, ExecutorInfo } from '../hooks/useExecutors';
import { TierBadge, DormantBadge } from '@/components/badges/TierBadge';

interface ExecutorSelectorProps {
  selectedExecutor: string | null;
  onSelect: (executor: ExecutorInfo) => void;
  disabled?: boolean;
}

function ExecutorCard({
  executor,
  isSelected,
  onSelect,
  disabled,
}: {
  executor: ExecutorInfo;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const successRate = executor.completedJobs + executor.failedJobs > 0
    ? Math.round((executor.completedJobs / (executor.completedJobs + executor.failedJobs)) * 100)
    : 100;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full p-3 rounded-lg border text-left transition-all ${
        isSelected
          ? 'border-baram-1 bg-baram-1/10'
          : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] hover:border-[var(--color-text-muted)]'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="font-medium text-[var(--color-text-primary)]">
            {executor.name}
          </div>
          <TierBadge tier={executor.tier} tierName={executor.tierName} />
          {executor.isDormant && <DormantBadge />}
        </div>
        <div className="flex items-center gap-2">
          {executor.teeType > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-500/20 text-green-400">
              {executor.teeTypeName}
            </span>
          )}
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
            executor.reputation >= 700
              ? 'bg-green-500/20 text-green-400'
              : executor.reputation >= 400
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {executor.reputation}/1000
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
        <span className="font-mono text-[var(--color-text-muted)]">
          {executor.operator.slice(0, 10)}...{executor.operator.slice(-8)}
        </span>
        <span>
          {executor.completedJobs} jobs ({successRate}% success)
        </span>
        <span className="text-[var(--color-text-muted)]">
          {executor.supportedModels.join(', ')}
        </span>
      </div>
    </button>
  );
}

export function ExecutorSelector({
  selectedExecutor,
  onSelect,
  disabled,
}: ExecutorSelectorProps) {
  const { executors, isLoading, error, refresh } = useExecutors();

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-[var(--color-text-muted)]">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm">Loading executors...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-[var(--color-error)] mb-2">{error}</p>
        <button
          onClick={refresh}
          className="text-sm text-baram-1 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (executors.length === 0) {
    return (
      <div className="p-4 text-center text-[var(--color-text-muted)]">
        <p className="text-sm">No active executors available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-[var(--color-text-muted)] px-1">
        Tier reflects staking commitment and track record, not a guarantee of output quality.
      </div>
      {executors.map((executor) => (
        <ExecutorCard
          key={executor.operator}
          executor={executor}
          isSelected={selectedExecutor === executor.operator}
          onSelect={() => onSelect(executor)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
