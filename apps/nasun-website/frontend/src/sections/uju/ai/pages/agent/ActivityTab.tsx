/**
 * Agent Activity tab - AER timeline filtered to this agent's executions.
 * Click an entry to open the ResultViewerModal with the stored result text.
 */

import { useMemo, useState } from 'react';
import { useAerRecords, type AERRecord } from '../../hooks/useAerRecords';
import { ResultViewerModal } from '../../components/modals/ResultViewerModal';
import { TierBadge } from '../../components/badges/TierBadge';
import { formatNusdc, formatTimestamp, truncateAddress } from '../../utils/format';
import { TIER_NAMES, type TierLevel } from '../../services/network';

interface ActivityTabProps {
  walletAddress: string;
  agentAddress: string;
}

export function ActivityTab({ walletAddress, agentAddress }: ActivityTabProps) {
  const { data, isLoading, error } = useAerRecords(walletAddress);
  const [selected, setSelected] = useState<AERRecord | null>(null);

  const records = useMemo(() => {
    if (!data) return [];
    const lower = agentAddress.toLowerCase();
    return data.filter(
      (r) => r.authorizer.toLowerCase() === lower || r.executor.toLowerCase() === lower,
    );
  }, [data, agentAddress]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-uju-card/60 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">
        Failed to load AER records: {String(error)}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="py-8 text-center rounded-xl border border-uju-border/60 border-dashed space-y-2">
        <p className="text-sm text-uju-secondary">No execution reports yet.</p>
        <p className="text-sm text-uju-secondary/70">
          Reports appear here after the agent settles its first AI request on-chain.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {records.map((r) => {
          const tier = Math.min(r.executorTier, 3) as TierLevel;
          return (
            <button
              type="button"
              key={r.id}
              onClick={() => setSelected(r)}
              className="w-full text-left bg-uju-card rounded-xl p-4 border border-uju-border/60 hover:border-pado-2/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">#{r.requestId}</span>
                    <span className="text-sm text-uju-secondary">{r.modelName || 'Unknown model'}</span>
                    <TierBadge tier={tier} tierName={TIER_NAMES[tier]} />
                    {r.teeVerified && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                        TEE
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-uju-secondary/70 mt-1">
                    Executor {truncateAddress(r.executor)} - {formatTimestamp(r.settledAt)}
                  </p>
                  {r.purpose && (
                    <p className="text-sm text-uju-secondary/70 mt-0.5 truncate">{r.purpose}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-white">{formatNusdc(r.paymentAmount)}</p>
                  <p
                    className={`text-xs mt-0.5 ${
                      r.status === 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {r.statusName}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <ResultViewerModal
          requestId={selected.requestId}
          record={selected}
          authorizer={walletAddress}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
