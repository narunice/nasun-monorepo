/**
 * Agent Activity tab — AER timeline filtered to this agent's executions.
 *
 * Each row renders an event-class glyph (cognition/execution/settlement),
 * an outcome dot (success/hold/failure), and a wake-trigger icon
 * (heartbeat vs manual session). Header offers an event_class filter so
 * users can scope to e.g. cognition-only when watching trader reasoning.
 *
 * When the AER object is missing envelope fields (legacy records or an
 * indexer that doesn't surface them yet), the row falls back to the
 * legacy purpose-as-summary, status-as-outcome rendering.
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
  /**
   * Capability object id bound to this agent. When set, AERs carrying a
   * matching `replay.replay_extras['capability_id']` are scoped to this
   * agent's tab; records without a capabilityId fall back to the legacy
   * wallet/agent address match so heartbeat and pre-v2 records still show.
   */
  agentCapabilityId?: string | null;
  /** When set, only the first N records render and the filter row is hidden. */
  limit?: number;
  /** Footer "View all" callback. Only shown when limit is set and more rows exist. */
  onViewAll?: () => void;
}

type EventClassFilter = 'all' | 'cognition' | 'execution';

const EVENT_CLASS = {
  cognition: 1,
  execution: 2,
  settlement: 3,
} as const;

const OUTCOME = {
  success: 1,
  hold: 2,
  failure: 3,
} as const;

const WAKE = {
  heartbeat: 1,
  // 2/3 reserved
  session: 4,
} as const;

function eventClassGlyph(cls?: number): { glyph: string; label: string; tone: string } {
  switch (cls) {
    case EVENT_CLASS.cognition:
      return { glyph: '◇', label: 'cognition', tone: 'text-sky-400' };
    case EVENT_CLASS.execution:
      return { glyph: '◆', label: 'execution', tone: 'text-amber-400' };
    case EVENT_CLASS.settlement:
      return { glyph: '▼', label: 'settlement', tone: 'text-emerald-400' };
    default:
      return { glyph: '·', label: 'unknown', tone: 'text-uju-secondary/50' };
  }
}

function outcomeDot(outcome?: number, fallbackStatus?: number): { glyph: string; tone: string; label: string } {
  if (outcome === OUTCOME.success) return { glyph: '●', tone: 'text-emerald-400', label: 'success' };
  if (outcome === OUTCOME.hold) return { glyph: '○', tone: 'text-uju-secondary', label: 'hold' };
  if (outcome === OUTCOME.failure) return { glyph: '✕', tone: 'text-red-400', label: 'failure' };
  // Legacy fallback: status 0 == settled OK in pre-envelope flow.
  return fallbackStatus === 0
    ? { glyph: '●', tone: 'text-emerald-400', label: 'settled' }
    : { glyph: '✕', tone: 'text-red-400', label: 'error' };
}

function wakeLabel(t?: number): string | null {
  if (t === WAKE.heartbeat) return 'heartbeat';
  if (t === WAKE.session) return 'message';
  return null;
}

export function ActivityTab({
  walletAddress,
  agentAddress,
  agentCapabilityId,
  limit,
  onViewAll,
}: ActivityTabProps) {
  const { data, isLoading, error } = useAerRecords(walletAddress);
  const [selected, setSelected] = useState<AERRecord | null>(null);
  const [eventFilter, setEventFilter] = useState<EventClassFilter>('all');
  const isPreview = typeof limit === 'number';

  const { records, totalScoped } = useMemo(() => {
    if (!data) return { records: [], totalScoped: 0 };
    // Scope priority:
    //   1) capability_id (v2 chat path) — must match BOTH agent.capabilityId
    //      AND current wallet as authorizer. Capability-only match would
    //      surface other wallets' AERs (they pass on-chain because the
    //      capability is shared); ANDing the authorizer keeps the tab
    //      private to its owner. /result then succeeds because the same
    //      wallet signs the retrieval challenge.
    //   2) agent-keypair fallback for records without capability_id
    //      (nasun-ai-runtime heartbeats sign as the agent itself). A prior
    //      revision also accepted `authorizer == walletAddress` to cover
    //      legacy agent-runner heartbeats, but that leaked owner-signed
    //      chat AERs (e.g. cognition.chat.v1 from another agent's chat)
    //      into every agent tab. Owner-signed records without a
    //      capability_id are intentionally not surfaced here.
    const walletLower = walletAddress.toLowerCase();
    const agentLower = agentAddress.toLowerCase();
    const capLower = agentCapabilityId ? agentCapabilityId.toLowerCase() : null;
    const scoped = data.filter((r) => {
      const a = typeof r.authorizer === 'string' ? r.authorizer.toLowerCase() : '';
      const recCap = typeof r.capabilityId === 'string' ? r.capabilityId.toLowerCase() : '';
      if (recCap) {
        return capLower != null && recCap === capLower && a === walletLower;
      }
      const e = typeof r.executor === 'string' ? r.executor.toLowerCase() : '';
      return a === agentLower || e === agentLower;
    });
    const filtered =
      eventFilter === 'all'
        ? scoped
        : scoped.filter(
            (r) =>
              r.eventClass ===
              (eventFilter === 'cognition' ? EVENT_CLASS.cognition : EVENT_CLASS.execution),
          );
    return {
      records: typeof limit === 'number' ? filtered.slice(0, limit) : filtered,
      totalScoped: filtered.length,
    };
  }, [data, walletAddress, agentAddress, agentCapabilityId, eventFilter, limit]);

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

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">
          {isPreview ? 'Recent activity' : 'Activity'}
        </h3>
        {!isPreview && (
          <div className="flex gap-1 p-0.5 rounded-lg bg-uju-card/60 border border-uju-border/60">
            {(['all', 'cognition', 'execution'] as EventClassFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setEventFilter(f)}
                className={`px-2.5 py-1 text-sm rounded-md transition-colors ${
                  eventFilter === f
                    ? 'bg-pado-2 text-uju-bg'
                    : 'text-uju-secondary hover:text-white'
                }`}
              >
                {f === 'all' ? 'All' : f === 'cognition' ? 'Cognition' : 'Execution'}
              </button>
            ))}
          </div>
        )}
      </div>

      {records.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-uju-border/60 border-dashed space-y-2">
          <p className="text-sm text-uju-secondary">
            {eventFilter === 'all'
              ? 'No execution reports yet.'
              : `No ${eventFilter} events yet.`}
          </p>
          <p className="text-sm text-uju-secondary/70">
            Reports appear here after the agent settles its first action on-chain.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const tier = Math.min(r.executorTier, 3) as TierLevel;
            const cls = eventClassGlyph(r.eventClass);
            const out = outcomeDot(r.actionOutcome, r.status);
            const wake = wakeLabel(r.triggeredByType);
            const summary = r.actionSummary || r.purpose || r.actionType || '';
            return (
              <button
                type="button"
                key={r.id}
                onClick={() => setSelected(r)}
                className="w-full text-left bg-uju-card rounded-xl p-4 border border-uju-border/60 hover:border-pado-2/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 text-base ${cls.tone}`} aria-label={cls.label}>
                    {cls.glyph}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">#{r.requestId}</span>
                      {r.actionType && (
                        <span className="text-xs font-mono text-uju-secondary/80">{r.actionType}</span>
                      )}
                      <span className="text-sm text-uju-secondary">{r.modelName || 'Unknown model'}</span>
                      <TierBadge tier={tier} tierName={TIER_NAMES[tier]} />
                      {r.teeVerified && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                          TEE
                        </span>
                      )}
                      {wake && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-uju-bg text-uju-secondary/80">
                          {wake}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-uju-secondary/70 mt-1">
                      Executor {truncateAddress(r.executor)} · {formatTimestamp(r.settledAt)}
                    </p>
                    {summary && (
                      <p className="text-sm text-uju-secondary/70 mt-0.5 truncate">{summary}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-white">{formatNusdc(r.paymentAmount)}</p>
                    <p className={`text-sm mt-0.5 ${out.tone}`} aria-label={out.label}>
                      {out.glyph} <span className="text-xs">{out.label}</span>
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {isPreview && onViewAll && totalScoped > records.length && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-3 text-sm text-pado-2 hover:underline"
        >
          View all {totalScoped} events
        </button>
      )}

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
