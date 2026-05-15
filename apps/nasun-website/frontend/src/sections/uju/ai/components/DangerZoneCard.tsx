/**
 * DangerZoneCard - capability pause-mode radio + revoke confirm + summary.
 *
 * Shared by OverviewTab (quick wake-mode toggle) and SettingsTab (full surface).
 * capabilityId === null means the agent is legacy (no on-chain capability linked)
 * and we render a hint card explaining the gap.
 */

import { useState } from 'react';
import { useCapability } from '../hooks/useCapability';
import { formatNusdc } from '../utils/format';

interface DangerZoneCardProps {
  capabilityId: string | null;
}

export function DangerZoneCard({ capabilityId }: DangerZoneCardProps) {
  const {
    data: cap,
    isLoading,
    fetchError,
    txStatus,
    txError,
    setPauseMode,
    revoke,
    resetTxStatus,
  } = useCapability(capabilityId);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [pendingMode, setPendingMode] = useState<number | null>(null);

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

  const handleRevoke = async () => {
    if (txBusy) return;
    resetTxStatus();
    await revoke();
    setConfirmRevoke(false);
  };

  return (
    <div className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Authority / Danger zone</h3>
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

          <div className="space-y-2 pt-3 border-t border-uju-border/60">
            <p className="text-xs uppercase tracking-wider text-uju-secondary/70">Revoke</p>
            <p className="text-sm text-uju-secondary">
              Revoking the capability disables this agent permanently. The next runtime cycle will
              abort with E_CAPABILITY_REVOKED. This action cannot be undone.
            </p>
            {cap.revoked ? (
              <p className="text-sm text-red-400">Capability has been revoked.</p>
            ) : confirmRevoke ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={txBusy}
                  className="px-4 py-2 text-sm rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {txBusy ? 'Revoking...' : 'Yes, revoke permanently'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRevoke(false)}
                  disabled={txBusy}
                  className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRevoke(true)}
                disabled={txBusy}
                className="px-4 py-2 text-sm rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Revoke capability
              </button>
            )}
          </div>
        </>
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
