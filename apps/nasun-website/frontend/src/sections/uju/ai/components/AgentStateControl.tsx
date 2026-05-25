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

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@nasun/wallet';
import { suiClient } from '@/lib/sui-client';
import { useTraderConfig } from '../hooks/useTraderConfig';
import { useAgentState } from '../hooks/useAgentState';
import { useCreateAgentBlocked } from '../alpha/useCreateAgentBlocked';
import { buildDeactivateAgentTransaction } from '../services/transactionBuilder';
import type { AgentProfile } from '../hooks/useAgentProfiles';
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
  /** AgentProfile object id. Required to build the cleanup deactivate PTB
   *  when an on-chain profile is detected without a server-side vault row
   *  (the "orphaned" / interrupted-setup case). */
  profileId?: string | null;
  /** On-chain AgentProfile.is_active (from useAgentProfiles). The chat-server
   *  state endpoint cannot resolve is_active for an orphaned profile (no
   *  vault row = no profile_id to query), so without this prop the UI cannot
   *  detect the post-cleanup transition (on-chain flipped to false, but
   *  chat-server keeps returning state='unknown'). */
  onChainIsActive?: boolean | null;
}

export function AgentStateControl({
  agentAddress,
  onCreateNewAgent,
  walletAddress = null,
  profileId = null,
  onChainIsActive = null,
}: AgentStateControlProps) {
  const { state, runtime, data, loading: stateLoading, error: stateError, invalidate } =
    useAgentState(agentAddress);
  const { config, save, loading: cfgLoading, error: cfgError } = useTraderConfig(agentAddress);
  const queryClient = useQueryClient();
  const signer = useSigner();
  // Gate the post-kill CTA on the same alpha predicate the form-level
  // useCreateAgent and QuickstartView Register button use, so the killed
  // state doesn't dangle a "Create new agent" affordance that immediately
  // bounces off the alpha waitlist (2026-05-25 incident: killed users saw
  // an enabled CTA but were silently parked at queue position #57).
  const createBlock = useCreateAgentBlocked(walletAddress);
  const [pending, setPending] = useState<'pause' | 'activate' | 'cleanup' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const cleanupInFlight = useRef(false);

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

  // Orphaned-agent cleanup. Signs `agent_profile::deactivate_agent` on-chain
  // so a profile that was created but never reached the vault-upload step
  // (2026-05-25 incident: elonunmk's 0x4ede9168... — alpha gate was 'waiting'
  // when the user reached step 2 of quickstart, so step 1's profile became
  // permanently stranded) can be retired and replaced via the normal
  // "Create new agent" flow. No capability revoke is bundled because an
  // orphaned profile by definition has no functional capability holder
  // (no vault, no agent process); deactivating the profile alone flips
  // chain-side is_active=false which lets reconcileAgentState resolve to
  // 'killed' on the next poll.
  const handleCleanupOrphan = useCallback(async () => {
    if (cleanupInFlight.current) return;
    if (!profileId) {
      setLocalError('Missing profile id — cannot build cleanup transaction.');
      return;
    }
    if (!signer.address) {
      setLocalError('Connect a wallet to clean up this stranded agent.');
      return;
    }
    cleanupInFlight.current = true;
    setLocalError(null);
    setPending('cleanup');
    try {
      const tx = buildDeactivateAgentTransaction(profileId);
      tx.setSender(signer.address);
      const txBytes = await tx.build({ client: suiClient });
      const { signature } = await signer.sign(txBytes);
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true },
      });
      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Cleanup transaction failed');
      }
      await suiClient.waitForTransaction({ digest: result.digest });
      // Eager-patch useAgentProfiles cache so isOrphaned flips off immediately
      // instead of waiting 15s for the next poll. Without this the UI keeps
      // showing the orange "Deactivate & start over" button after a successful
      // cleanup; clicking it would call deactivate_agent again, which Move
      // aborts with E_ALREADY_INACTIVE. Mirrors useCapability.revoke's
      // cache-patch pattern (apps/.../hooks/useCapability.ts:191).
      //
      // Key by walletAddress prop, not signer.address: useAgentProfiles is
      // called with the prop in AgentDetail, so the cache entry lives under
      // the prop's key. signer.address normally equals walletAddress, but
      // a per-app wallet binding could in theory differ.
      const cacheKeyAddr = walletAddress ?? signer.address;
      if (profileId && cacheKeyAddr) {
        queryClient.setQueryData<AgentProfile[]>(
          ['nasun-ai', 'agentProfiles', cacheKeyAddr],
          (prev) =>
            prev?.map((p) => (p.id === profileId ? { ...p, isActive: false } : p)) ?? prev,
        );
      }
      await invalidate();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'cleanup_failed');
    } finally {
      cleanupInFlight.current = false;
      setPending(null);
    }
  }, [profileId, signer, invalidate, queryClient, walletAddress]);

  // Orphaned detection: chat-server returns state='unknown' for an agent
  // it has no record of (no agent_keys row), so it cannot resolve isActive
  // and bails. The frontend reaches this screen only via useAgentProfiles,
  // which already confirmed the AgentProfile exists on chain and is owned
  // by the user — so an 'unknown'+no-vault combo is unambiguously the
  // "setup interrupted between on-chain create and vault upload" case.
  //
  // After cleanup runs, on-chain is_active flips to false but chat-server
  // STILL returns state='unknown' (no vault row was ever created, so it
  // never gains the profile_id needed to call readAgentProfileIsActive).
  // We gate orphan detection on onChainIsActive !== false so the post-
  // cleanup transition reaches the killed state below without requiring
  // a backend change.
  const isOrphaned =
    state === 'unknown' &&
    data?.vault.present === false &&
    profileId !== null &&
    onChainIsActive !== false;

  // The matching post-cleanup case: same 'unknown'+no-vault shape, but
  // on-chain is_active just became false. Promote to 'killed' so the
  // existing kill-state UI (with the alpha-gate-aware "Create new agent"
  // CTA from a2e0344d) takes over.
  const isStrandedCleaned =
    state === 'unknown' &&
    data?.vault.present === false &&
    profileId !== null &&
    onChainIsActive === false;

  const effectiveState: typeof state = isStrandedCleaned ? 'killed' : state;

  const badgeClasses =
    effectiveState === 'activated' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    : effectiveState === 'paused' ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
    : effectiveState === 'killed' ? 'bg-red-500/15 text-red-300 border-red-500/30'
    : isOrphaned ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
    : 'bg-uju-bg/40 text-uju-secondary border-uju-border/40';

  const badgeText =
    effectiveState === 'activated' ? `Activated · ${runtime === 'running' ? 'Running' : 'Spawning'}`
    : effectiveState === 'paused' ? 'Paused'
    : effectiveState === 'killed' ? 'Killed'
    : isOrphaned ? 'Setup interrupted'
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
          {effectiveState === 'activated' && (
            <button
              type="button"
              onClick={() => void handlePause()}
              disabled={busy}
              className="rounded-lg border border-uju-border/60 px-3 py-1.5 text-sm text-uju-secondary hover:bg-uju-bg/60 disabled:opacity-50"
            >
              {pending === 'pause' ? 'Pausing…' : 'Pause agent'}
            </button>
          )}
          {effectiveState === 'paused' && (
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
          {effectiveState === 'killed' && (
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
          {effectiveState === 'unknown' && !isOrphaned && (
            <button
              type="button"
              onClick={() => void invalidate()}
              disabled={busy}
              className="rounded-lg border border-uju-border/60 px-3 py-1.5 text-sm text-uju-secondary hover:bg-uju-bg/60 disabled:opacity-50"
            >
              Retry
            </button>
          )}
          {isOrphaned && (
            <button
              type="button"
              onClick={() => void handleCleanupOrphan()}
              disabled={busy || !signer.address}
              title={!signer.address ? 'Connect a wallet to clean up' : undefined}
              className="rounded-lg bg-orange-500/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {pending === 'cleanup' ? 'Cleaning up…' : 'Deactivate & start over'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
          {error}
        </div>
      )}
      {effectiveState === 'killed' && (
        <p className="text-xs text-uju-secondary">
          {createBlock.blocked && createBlock.message
            ? createBlock.message
            : isStrandedCleaned
              ? 'Stranded profile deactivated. Create a new agent to start fresh — make sure to complete BOTH signatures (on-chain create + vault upload).'
              : 'This agent is permanently killed. Create a new agent to use Nasun AI again.'}
        </p>
      )}
      {isOrphaned && (
        <p className="text-xs text-uju-secondary">
          The on-chain profile exists, but quickstart never finished — the
          encrypted key was not delivered to our server, so no agent process
          can run. Sign one tx to deactivate this stranded profile, then use
          "Create new agent" to start fresh.
        </p>
      )}
    </div>
  );
}
