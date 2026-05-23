/**
 * Phase 8 — unified Activate / Pause / Kill control.
 *
 * Reads state from useAgentState (single chat-server GET, no multi-hook
 * composition) and offers exactly three actions matching the user's mental
 * model:
 *
 *   - Activate: paused → activated. PATCH config.enabled=true (no on-chain
 *                tx). Backend reconcile spawns PM2.
 *   - Pause:    activated → paused. PATCH config.enabled=false. Backend
 *                reconcile stops PM2. On-chain is_active untouched.
 *   - Kill:     wallet-signed deactivate_agent tx + vault soft-delete.
 *                Terminal — no restore. UI routes to "Create new agent".
 *                Uses the existing DeactivateAgentModal under the hood
 *                (which performs both steps already); we just rename the
 *                user-facing verb and treat killed as irreversible.
 *
 * Co-exists during the Phase 8 transition with the older controls in
 * OverviewTab / SettingsTab. Those will be removed in cleanup once this
 * is dogfooded.
 */

import { useCallback, useState } from 'react';
import { useTraderConfig } from '../hooks/useTraderConfig';
import { useAgentState } from '../hooks/useAgentState';
import { DeactivateAgentModal } from './modals/DeactivateAgentModal';
import type { TraderConfig } from '../types/trader';

/** Drop the persistence-only fields before re-saving via the upsert API. */
type TraderConfigPatch = Omit<TraderConfig, 'id' | 'walletAddress' | 'createdAt' | 'updatedAt'>;
function stripConfigMetadata(config: TraderConfig): TraderConfigPatch {
  const { id: _id, walletAddress: _w, createdAt: _c, updatedAt: _u, ...rest } = config;
  void _id; void _w; void _c; void _u;
  return rest;
}

interface AgentStateControlProps {
  agentAddress: string;
  agentName: string;
  walletAddress: string;
  agentProfileId: string;
  /** Optional: where the "Create new agent" CTA should route. */
  onCreateNewAgent?: () => void;
}

export function AgentStateControl({
  agentAddress,
  agentName,
  walletAddress,
  agentProfileId,
  onCreateNewAgent,
}: AgentStateControlProps) {
  const { state, runtime, data, loading: stateLoading, error: stateError, invalidate } =
    useAgentState(agentAddress);
  const { config, save, loading: cfgLoading, error: cfgError } = useTraderConfig(agentAddress);
  const [showKillModal, setShowKillModal] = useState(false);
  const [pending, setPending] = useState<'pause' | 'activate' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handlePause = useCallback(async () => {
    if (!config) {
      setLocalError('Trader config not loaded yet.');
      return;
    }
    setLocalError(null);
    setPending('pause');
    try {
      await save({ ...stripConfigMetadata(config), enabled: false });
      await invalidate();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'pause_failed');
    } finally {
      setPending(null);
    }
  }, [config, save, invalidate]);

  const handleActivate = useCallback(async () => {
    if (!config) {
      setLocalError('Trader config not loaded yet.');
      return;
    }
    setLocalError(null);
    setPending('activate');
    try {
      await save({ ...stripConfigMetadata(config), enabled: true });
      await invalidate();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'activate_failed');
    } finally {
      setPending(null);
    }
  }, [config, save, invalidate]);

  const handleKilled = useCallback(() => {
    setShowKillModal(false);
    void invalidate();
  }, [invalidate]);

  const badgeClasses =
    state === 'activated' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : state === 'paused' ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
    : state === 'killed' ? 'bg-red-500/15 text-red-300 border-red-500/30'
    : 'bg-uju-bg/40 text-uju-secondary border-uju-border/40';

  const badgeText =
    state === 'activated' ? `Activated · ${runtime === 'running' ? 'Running' : 'Spawning'}`
    : state === 'paused' ? 'Paused'
    : state === 'killed' ? 'Killed'
    : stateLoading ? 'Syncing…' : 'Unknown';

  const busy = pending !== null || cfgLoading;
  const vaultMissing = data?.vault.present === false;
  const activateBlocked = vaultMissing;
  const error = localError ?? cfgError ?? (stateError && !data ? stateError : null);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-uju-border/60 bg-uju-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${badgeClasses}`}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {badgeText}
        </span>
        {data?.pending && (
          <span className="text-xs text-uju-secondary">on-chain sync pending…</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {state === 'activated' && (
            <>
              <button
                type="button"
                onClick={() => void handlePause()}
                disabled={busy}
                className="rounded-lg border border-uju-border/60 px-3 py-1.5 text-sm text-uju-secondary hover:bg-uju-bg/60 disabled:opacity-50"
              >
                {pending === 'pause' ? 'Pausing…' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={() => setShowKillModal(true)}
                disabled={busy}
                className="rounded-lg bg-red-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                Kill
              </button>
            </>
          )}
          {state === 'paused' && (
            <>
              <button
                type="button"
                onClick={() => void handleActivate()}
                disabled={busy || activateBlocked}
                title={activateBlocked ? 'Vault key missing on server — re-upload to activate' : undefined}
                className="rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {pending === 'activate' ? 'Activating…' : 'Activate'}
              </button>
              <button
                type="button"
                onClick={() => setShowKillModal(true)}
                disabled={busy}
                className="rounded-lg border border-red-500/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                Kill
              </button>
            </>
          )}
          {state === 'killed' && (
            <button
              type="button"
              onClick={() => onCreateNewAgent?.()}
              disabled={!onCreateNewAgent}
              className="rounded-lg border border-uju-border/60 px-3 py-1.5 text-sm text-uju-secondary hover:bg-uju-bg/60 disabled:opacity-50"
            >
              Create new agent
            </button>
          )}
          {state === 'unknown' && (
            <button
              type="button"
              onClick={() => void invalidate()}
              disabled={busy}
              className="rounded-lg border border-uju-border/60 px-3 py-1.5 text-sm text-uju-secondary hover:bg-uju-bg/60 disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
          {error}
        </div>
      )}
      {state === 'killed' && (
        <p className="text-xs text-uju-secondary">
          This agent is permanently killed. Create a new agent to use Nasun AI again.
        </p>
      )}
      {showKillModal && (
        <DeactivateAgentModal
          agentAddress={agentAddress}
          agentName={agentName}
          walletAddress={walletAddress}
          agentProfileId={agentProfileId}
          onDeactivated={handleKilled}
          onClose={() => setShowKillModal(false)}
        />
      )}
    </div>
  );
}
