/**
 * AERTimeline - List of AI Execution Reports with filtering
 */

import { useState } from 'react';
import { useWalletSession } from '../hooks/useWalletSession';
import { useAERRecords, type AERRecord } from '../features/aer/hooks/useAERRecords';
import { formatNusdcValue as formatNUSDC, truncateAddress as formatAddress, formatTimeDetailed as formatTime } from '../utils/format';

type Filter = 'all' | 'settled' | 'disputed' | 'slashed';

function AERRow({ record, isExpanded, onToggle }: { record: AERRecord; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className="border-b border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg-tertiary)]/50 transition-colors"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 text-[var(--color-text-primary)] font-mono text-xs">
          #{record.requestId}
        </td>
        <td className="px-3 py-2.5 text-[var(--color-text-secondary)] text-xs">
          {record.modelName || '-'}
        </td>
        <td className="px-3 py-2.5 text-[var(--color-text-secondary)] text-xs font-mono">
          {formatAddress(record.executor)}
        </td>
        <td className="px-3 py-2.5 text-right text-[var(--color-text-primary)] text-xs">
          {formatNUSDC(record.paymentAmount)}
        </td>
        <td className="px-3 py-2.5 text-xs">
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
            record.status === 0
              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : record.status === 1
              ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
              : 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
          }`}>
            {record.statusName}
          </span>
          {record.teeVerified && (
            <span className="ml-1.5 text-[10px] text-[var(--color-success)]" title="TEE Verified">
              TEE
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right text-[var(--color-text-muted)] text-xs">
          {record.executionTimeMs}ms
        </td>
        <td className="px-3 py-2.5 text-right text-[var(--color-text-muted)] text-xs">
          {formatTime(record.settledAt)}
        </td>
      </tr>

      {/* Expanded details */}
      {isExpanded && (
        <tr className="border-b border-[var(--color-border)]">
          <td colSpan={7} className="px-3 py-3 bg-[var(--color-bg-tertiary)]/30">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-[var(--color-text-muted)]">Report ID</p>
                <p className="text-[var(--color-text-primary)] font-mono mt-0.5">{formatAddress(record.id)}</p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)]">Authorizer</p>
                <p className="text-[var(--color-text-primary)] font-mono mt-0.5">{formatAddress(record.authorizer)}</p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)]">Executor Tier</p>
                <p className="text-[var(--color-text-primary)] mt-0.5">{record.executorTier}</p>
              </div>
              {record.purpose && (
                <div>
                  <p className="text-[var(--color-text-muted)]">Purpose</p>
                  <p className="text-[var(--color-text-primary)] mt-0.5">{record.purpose}</p>
                </div>
              )}
              {record.budgetId && (
                <div>
                  <p className="text-[var(--color-text-muted)]">Budget</p>
                  <p className="text-[var(--color-text-primary)] font-mono mt-0.5">{formatAddress(record.budgetId)}</p>
                </div>
              )}
              {record.budgetRemaining > 0 && (
                <div>
                  <p className="text-[var(--color-text-muted)]">Budget Remaining</p>
                  <p className="text-[var(--color-text-primary)] mt-0.5">{formatNUSDC(record.budgetRemaining)} NUSDC</p>
                </div>
              )}
              <div>
                <p className="text-[var(--color-text-muted)]">Requested At</p>
                <p className="text-[var(--color-text-primary)] mt-0.5">{formatTime(record.requestedAt)}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function AERTimeline() {
  const { walletAddress, isConnected } = useWalletSession();
  const { data: records, isLoading } = useAERRecords(walletAddress);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-[var(--color-text-muted)]">
          Connect your wallet to view execution reports.
        </p>
      </div>
    );
  }

  const filteredRecords = (records ?? []).filter(r => {
    if (filter === 'settled') return r.status === 0;
    if (filter === 'disputed') return r.status === 1;
    if (filter === 'slashed') return r.status === 2;
    return true;
  });

  const totalCost = filteredRecords.reduce((sum, r) => sum + r.paymentAmount, 0);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'settled', label: 'Settled' },
    { key: 'disputed', label: 'Disputed' },
    { key: 'slashed', label: 'Slashed' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Execution Reports</h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {filteredRecords.length} records | {formatNUSDC(totalCost)} NUSDC total
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              filter === f.key
                ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)] text-center py-8">Loading...</p>
      ) : filteredRecords.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
          No execution reports found.
        </p>
      ) : (
        <div className="bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-3 py-2 text-[var(--color-text-muted)] text-[10px] font-medium uppercase tracking-wider">ID</th>
                <th className="text-left px-3 py-2 text-[var(--color-text-muted)] text-[10px] font-medium uppercase tracking-wider">Model</th>
                <th className="text-left px-3 py-2 text-[var(--color-text-muted)] text-[10px] font-medium uppercase tracking-wider">Executor</th>
                <th className="text-right px-3 py-2 text-[var(--color-text-muted)] text-[10px] font-medium uppercase tracking-wider">Cost</th>
                <th className="text-left px-3 py-2 text-[var(--color-text-muted)] text-[10px] font-medium uppercase tracking-wider">Status</th>
                <th className="text-right px-3 py-2 text-[var(--color-text-muted)] text-[10px] font-medium uppercase tracking-wider">Latency</th>
                <th className="text-right px-3 py-2 text-[var(--color-text-muted)] text-[10px] font-medium uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(record => (
                <AERRow
                  key={record.id}
                  record={record}
                  isExpanded={expandedId === record.id}
                  onToggle={() => setExpandedId(expandedId === record.id ? null : record.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
