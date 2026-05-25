/**
 * Phase 8 — unified Activate / Pause control.
 *
 * Reads state from useAgentState (single chat-server GET, no multi-hook
 * composition) and offers Activate (paused → activated) and Pause (activated
 * → paused). Both flip config.enabled — no on-chain tx, no wallet sig.
 * Backend reconcile handles PM2 spawn/stop.
 *
 * Kill (terminal action: wallet-signed deactivate_agent + vault soft-delete)
 * lives in the DangerZone at the bottom of the Settings page, not here, so
 * the routine controls cannot be confused with the destructive one.
 */

import { useCallback, useState } from 'react';
import { useTraderConfig } from '../hooks/useTraderConfig';
import { useAgentState } from '../hooks/useAgentState';
import { useCreateAgentBlocked } from '../alpha/useCreateAgentBlocked';
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
  /** Optional: where the "Create new agent" CTA should route after killed. */
  onCreateNewAgent?: () => void;
  /** Owner wallet, used to query the alpha gate state for the killed-CTA. */
  walletAddress?: string | null;
}

export function AgentStateControl({
  agentAddress,
  onCreateNewAgent,
  walletAddress = null,
}: AgentStateControlProps) {
  const { state, runtime, data, loading: stateLoading, error: stateError, invalidate } =
    useAgentState(agentAddress);
  const { config, save, loading: cfgLoading, error: cfgError } = useTraderConfig(agentAddress);
  // Gate the post-kill CTA on the same alpha predicate the form-level
  // useCreateAgent and QuickstartView Register button use, so the killed
  // state doesn't dangle a "Create new agent" affordance that immediately
  // bounces off the alpha waitlist (2026-05-25 incident: killed users saw
  // an enabled CTA but were silently parked at queue position #57).
  const createBlock = useCreateAgentBlocked(walletAddress);
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
            <button
              type="button"
              onClick={() => void handlePause()}
              disabled={busy}
              className="rounded-lg border border-uju-border/60 px-3 py-1.5 text-sm text-uju-secondary hover:bg-uju-bg/60 disabled:opacity-50"
            >
              {pending === 'pause' ? 'Pausing…' : 'Pause agent'}
            </button>
          )}
          {state === 'paused' && (
            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={busy || activateBlocked}
              title={activateBlocked ? 'Vault key missing on server — re-upload to activate' : undefined}
              className="rounded-lg bg-emerald-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending === 'activate' ? 'Activating…' : 'Activate agent'}
            </button>
          )}
          {state === 'killed' && (
            <button
              type="button"
              onClick={() => onCreateNewAgent?.()}
              disabled={!onCreateNewAgent || createBlock.blocked}
              title={createBlock.blocked && createBlock.message ? createBlock.message : undefined}
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
          {createBlock.blocked && createBlock.message
            ? createBlock.message
            : 'This agent is permanently killed. Create a new agent to use Nasun AI again.'}
        </p>
      )}
    </div>
  );
}
