/**
 * DangerZoneCard - capability pause-mode radio + revoke confirm + summary.
 *
 * Shared by OverviewTab (quick wake-mode toggle) and SettingsTab (full surface).
 * capabilityId === null means the agent is legacy (no on-chain capability linked)
 * and we render a hint card explaining the gap.
 */

import { useEffect, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import { useCapability } from '../hooks/useCapability';
import { useAgentProfiles } from '../hooks/useAgentProfiles';
import { formatNusdc } from '../utils/format';
import { RevokeCapabilityModal } from './modals/RevokeCapabilityModal';

interface DangerZoneCardProps {
  capabilityId: string | null;
  /**
   * AgentProfile object id. When present, the Kill switch atomically
   * deactivates the AgentProfile alongside revoking the capability so the
   * sidebar/Overview badge flips from "paused" to "inactive" on the same
   * wallet signature. Optional for legacy callers that only need the
   * capability-revoke side; with it omitted, AgentProfile.is_active stays
   * true and the agent will continue to render as paused until manually
   * deactivated elsewhere.
   */
  agentProfileId?: string | null;
}

export function DangerZoneCard({ capabilityId, agentProfileId }: DangerZoneCardProps) {
  const {
    data: cap,
    isLoading,
    fetchError,
    txStatus,
    txError,
    setPauseMode,
    revoke,
    finalizeDeactivate,
    resetTxStatus,
  } = useCapability(capabilityId);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<number | null>(null);

  // Zombie-finalize signal: capability already revoked but the AgentProfile
  // still reports is_active=true. Happens to agents whose Kill switch was
  // pressed on an older client that only ran capability::revoke. We surface
  // a small "Finalize" CTA so the user can flip is_active without us having
  // to write a one-off CLI fix per affected agent.
  const { address: walletAddress } = useSigner();
  const { data: profiles } = useAgentProfiles(walletAddress ?? null);
  const thisProfile = agentProfileId
    ? profiles?.find((p) => p.id === agentProfileId) ?? null
    : null;
  const needsFinalize =
    !!cap?.revoked && !!agentProfileId && thisProfile?.isActive === true;

  // Auto-close the modal once the on-chain revoke is reflected in the
  // refreshed capability state. The modal stays open while the tx is in
  // flight so the user can see "Revoking..." progress and any tx error.
  useEffect(() => {
    if (revokeModalOpen && cap?.revoked) {
      setRevokeModalOpen(false);
    }
  }, [revokeModalOpen, cap?.revoked]);

  if (!capabilityId) {
    return (
      <div className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-2">
        <h3 className="text-sm font-semibold text-white">Authority</h3>
        <p className="text-sm text-uju-secondary">
          This agent has no capability linked yet. Capability is an on-chain object that defines
          what the agent is permitted to do. Link one to enable pause and revoke controls.
        </p>
      </div>
    );
  }

  const txBusy = txStatus === 'signing' || txStatus === 'executing';
  const pauseModeTag = cap
    ? ({ active: 0, execution_only: 1, wake_blocked: 2, full_suspend: 3, unknown: -1 } as const)[
        cap.pauseMode
      ]
    : -1;

  const wakeModes: Array<{ mode: 0 | 2; label: string; helper: string }> = [
    { mode: 0, label: 'Active', helper: 'Agent wakes on schedule and may execute actions.' },
    { mode: 2, label: 'Pause all wakes', helper: 'Runtime skips this agent at every cycle.' },
  ];
  const reservedModes: Array<{ mode: 1 | 3; label: string; helper: string }> = [
    { mode: 1, label: 'Execution only', helper: 'Reserved (Plan E2)' },
    { mode: 3, label: 'Full suspend', helper: 'Reserved (Plan E2)' },
  ];

  const handleSelectMode = async (mode: 0 | 2) => {
    if (txBusy) return;
    resetTxStatus();
    setPendingMode(mode);
    try {
      await setPauseMode(mode);
    } finally {
      setPendingMode(null);
    }
  };

  const handleOpenRevoke = () => {
    if (txBusy) return;
    resetTxStatus();
    setRevokeModalOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (txBusy) return;
    await revoke(agentProfileId ?? undefined);
  };

  return (
    <div className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Agent controls</h3>
        {cap?.revoked && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Revoked</span>
        )}
      </div>

      {isLoading && !cap && (
        <p className="text-sm text-uju-secondary">Loading capability...</p>
      )}
      {fetchError && (
        <p className="text-sm text-red-400">Failed to load capability: {fetchError}</p>
      )}

      {cap && (
        <>
          <CapabilitySummary cap={cap} />

          <div className="space-y-2 pt-3 border-t border-uju-border/60">
            <p className="text-xs uppercase tracking-wider text-uju-secondary/70">Wake mode</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {wakeModes.map(({ mode, label, helper }) => {
                const active = pauseModeTag === mode;
                const submitting = pendingMode === mode && txBusy;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleSelectMode(mode)}
                    disabled={txBusy || cap.revoked}
                    className={`text-left p-3 rounded-lg border transition-colors disabled:opacity-50 ${
                      active
                        ? 'border-emerald-400/60 bg-emerald-500/5'
                        : 'border-uju-border/60 hover:bg-uju-bg'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">{label}</span>
                      {active && (
                        <span className="text-xs text-emerald-400">Selected</span>
                      )}
                      {submitting && (
                        <span className="text-xs text-uju-secondary">Signing...</span>
                      )}
                    </div>
                    <p className="text-sm text-uju-secondary mt-1">{helper}</p>
                  </button>
                );
              })}
              {reservedModes.map(({ mode, label, helper }) => (
                <div
                  key={mode}
                  className="text-left p-3 rounded-lg border border-uju-border/40 bg-uju-bg/40 opacity-60"
                >
                  <span className="text-sm text-white">{label}</span>
                  <p className="text-sm text-uju-secondary mt-1">{helper}</p>
                </div>
              ))}
            </div>
            {txStatus === 'error' && txError && (
              <p className="text-sm text-red-400">{txError}</p>
            )}
          </div>

          {/* Kill switch. Treated as a distinct surface from Wake Mode so the
              irreversible action is visually unmissable but framed as a
              calm safety control, not a warning siren. Amber/coral accents
              over the standard card chrome carry the seriousness without
              the alarm-red tone of a destructive prompt. */}
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center"
                aria-hidden="true"
              >
                {/* Power icon — universal "stop" signal without the skull/⚠ */}
                <svg className="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v10" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.5 7a8 8 0 1 0 13 0" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-100">Kill switch</p>
                <p className="text-sm text-amber-100/70 mt-0.5">
                  Permanently revokes this agent's on-chain authority. The next runtime cycle
                  will abort before any trade signs. Use this if you suspect the agent has been
                  compromised or you want to retire it. It cannot be undone — to run the agent
                  again you would re-register a new capability.
                </p>
              </div>
            </div>
            {cap.revoked ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-amber-100/80 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <svg className="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Kill switch engaged. This agent can no longer execute on-chain actions.</span>
                </div>
                {needsFinalize && agentProfileId && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                    <p className="text-xs text-amber-100/80">
                      The agent profile is still marked active on chain. Sidebar and status badges
                      will keep showing this agent as paused until you finalize the kill.
                    </p>
                    <button
                      type="button"
                      onClick={() => void finalizeDeactivate(agentProfileId)}
                      disabled={txBusy}
                      className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {txBusy ? 'Finalizing…' : 'Finalize: deactivate profile'}
                    </button>
                    {txStatus === 'error' && txError && (
                      <p className="text-xs text-red-400">{txError}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleOpenRevoke}
                disabled={txBusy}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v10" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.5 7a8 8 0 1 0 13 0" />
                </svg>
                Engage kill switch
              </button>
            )}
          </div>
        </>
      )}

      {revokeModalOpen && capabilityId && (
        <RevokeCapabilityModal
          capabilityId={capabilityId}
          txBusy={txBusy}
          txError={txStatus === 'error' ? txError : null}
          onConfirm={handleConfirmRevoke}
          onClose={() => setRevokeModalOpen(false)}
        />
      )}
    </div>
  );
}

function CapabilitySummary({
  cap,
}: {
  cap: NonNullable<ReturnType<typeof useCapability>['data']>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Pause mode" value={cap.pauseMode} />
        <Stat label="Version" value={cap.version.toString()} />
        <Stat
          label="Max notional"
          value={formatNusdc(Number(cap.riskLimits.maxNotionalPerAction))}
        />
        <Stat
          label="Max daily loss"
          value={formatNusdc(Number(cap.riskLimits.maxDailyLoss))}
        />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-uju-secondary/70 mb-1.5">
          Allowed actions
        </p>
        {cap.allowedActions.length === 0 ? (
          <p className="text-sm text-uju-secondary">None</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {cap.allowedActions.map((a) => (
              <span
                key={a}
                className="text-xs px-1.5 py-0.5 rounded bg-uju-bg text-uju-secondary"
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wider text-uju-secondary/70">{label}</p>
      <p className="text-sm text-white truncate mt-0.5">{value}</p>
    </div>
  );
}
