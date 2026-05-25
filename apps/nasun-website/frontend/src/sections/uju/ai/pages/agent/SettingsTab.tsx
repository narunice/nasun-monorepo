/**
 * SettingsTab - aggregates all configuration surfaces under one tab.
 *
 * Flat stack (no accordions) so first-time owners see every knob in one scroll:
 *   - AI Agent config (TraderConfigForm)
 *   - Budget (EscrowTab)
 *   - Sessions (Telegram link / revoke)
 *   - Security / Export key
 *   - Danger zone (capability pause + revoke)
 */

import { useState } from 'react';
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import type { BudgetInfo } from '../../hooks/useBudgets';
import { useTraderConfig } from '../../hooks/useTraderConfig';
import { useCapability } from '../../hooks/useCapability';
import { TraderConfigForm } from '../../components/forms/TraderConfigForm';
import { DangerZoneCard } from '../../components/DangerZoneCard';
import { ExportAgentKeyModal } from '../../components/modals/ExportAgentKeyModal';
import { ActivateAgentModal } from '../../components/modals/ActivateAgentModal';
import { DeactivateAgentModal } from '../../components/modals/DeactivateAgentModal';
import { RestoreAgentModal } from '../../components/modals/RestoreAgentModal';
import { TosAcknowledgementModal, hasAcceptedTos } from '../../components/modals/TosAcknowledgementModal';
import { useAgentVaultStatus } from '../../hooks/useAgentVaultStatus';
import { AgentStateControl } from '../../components/AgentStateControl';
import { SessionsTab } from './SessionsTab';

interface SettingsTabProps {
  agent: AgentProfile;
  budget: BudgetInfo | null;
  walletAddress: string;
  /** Forwarded to AgentStateControl so the killed-state CTA can route the
   *  user into a fresh quickstart (post-cleanup or post-kill recovery). */
  onShowRegister?: () => void;
}

export function SettingsTab({ agent, budget, walletAddress, onShowRegister }: SettingsTabProps) {
  const { config, source, error: configError, save, remove, refetch } = useTraderConfig(
    agent.agentAddress,
  );
  // Capability is the on-chain trust boundary the trader operates within.
  // When the user raises trader perTrade/dailyMax in the form, we mirror the
  // change onto the capability so the next swap PTB does not hit
  // E_PAYMENT_EXCEEDS_NOTIONAL_CAP (552). Lowering trader limits below the
  // capability cap is also safe (no on-chain mutation needed) — the cap
  // simply becomes a looser outer envelope, which the trader already
  // respects via its own size hint.
  const capability = useCapability(agent.capabilityId);
  const [exportOpen, setExportOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [tosOpen, setTosOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const vault = useAgentVaultStatus(agent.agentAddress);

  // Activation is gated by a one-time consent. If the user has already
  // accepted the alpha disclosure (localStorage key), skip straight to
  // the activation modal; otherwise show the ToS first.
  const requestActivate = () => {
    if (hasAcceptedTos()) {
      setActivateOpen(true);
    } else {
      setTosOpen(true);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">AI Agent Config</h3>
        <p className="text-sm text-uju-secondary">
          The agent is executed by Nasun AI runtime on the server. Update the config below and the
          runtime will pick it up on the next cycle.
        </p>
        {source === 'cache' && (
          <p className="text-xs text-amber-400">
            Showing locally cached values. Could not reach the server; what the runtime is actually
            using may differ. Retry to load the authoritative version.
          </p>
        )}
        {configError && (
          <p className="text-xs text-red-400">
            Save / load error: {configError}
          </p>
        )}
        {config && config.enabled === false && (
          <p className="text-xs text-uju-secondary/80">
            Agent is paused. No trades will run. Use Activate below to resume.
          </p>
        )}
        <TraderConfigForm
          agentAddress={agent.agentAddress}
          agentName={agent.name}
          agentBudgetId={budget?.id ?? ''}
          initial={config}
          onSave={async (values) => {
            // Phase 4: save now awaits server confirmation. If it rejects
            // (returns null), do NOT proceed to capability mutation —
            // raising on-chain risk limits while the off-chain config
            // save failed would leave the two stores divergent and let
            // the next session of this agent trade with cap > intent.
            const saved = await save(values);
            if (!saved) return;
            // Sync capability risk limits if the trader's new size hints
            // exceed the on-chain cap. Without this, a user who raises
            // perTrade in the form will hit abort 552 the next time the
            // trader tries to swap. We only raise the cap (never lower it
            // here) because lowering is a separate trust decision the user
            // should make through an explicit "tighten" action.
            const newPerTrade = BigInt(values.perTradeMaxQuoteRaw);
            const newDailyMax = BigInt(values.dailyMaxQuoteRaw);
            const cap = capability.data;
            if (
              cap &&
              (newPerTrade > cap.riskLimits.maxNotionalPerAction ||
                newDailyMax > cap.riskLimits.maxDailyLoss)
            ) {
              await capability.updateRiskLimits({
                maxNotionalPerAction:
                  newPerTrade > cap.riskLimits.maxNotionalPerAction
                    ? newPerTrade
                    : cap.riskLimits.maxNotionalPerAction,
                maxDailyLoss:
                  newDailyMax > cap.riskLimits.maxDailyLoss
                    ? newDailyMax
                    : cap.riskLimits.maxDailyLoss,
                maxSlippageBps: cap.riskLimits.maxSlippageBps,
                stopLossBps: cap.riskLimits.stopLossBps,
                takeProfitBps: cap.riskLimits.takeProfitBps,
              });
            }
            await refetch();
          }}
          onDelete={config ? async () => { await remove(); } : undefined}
        />
      </section>

      <section>
        <SessionsTab
          agentId={agent.id}
          agentAddress={agent.agentAddress}
          walletAddress={walletAddress}
          capabilityId={agent.capabilityId}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Agent status</h3>
        {/* Phase 8 — Activate / Pause only. Kill (terminal: wallet sig +
            vault delete) lives in DangerZoneCard at the bottom of this
            page so the routine pause control cannot be confused with the
            destructive one. State source: chat-server GET
            /api/nasun-ai/agent/:addr/state, which derives from on-chain
            AgentProfile.is_active + config.enabled. */}
        <AgentStateControl
          agentAddress={agent.agentAddress}
          walletAddress={walletAddress}
          profileId={agent.id}
          onChainIsActive={agent.isActive}
          onCreateNewAgent={onShowRegister}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Security</h3>
        <div className="rounded-xl border border-uju-border/60 bg-uju-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-white">Export agent key</p>
            <p className="text-sm text-uju-secondary mt-0.5">
              Reveal this agent's private key and recovery phrase so you can run it from a
              self-hosted runtime. Decryption uses the passphrase you set at creation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="shrink-0 px-3 py-2 rounded-lg border border-uju-border/60 text-sm text-pado-2 hover:bg-uju-bg/60 transition-colors"
          >
            Export key
          </button>
        </div>
      </section>

      <section>
        <DangerZoneCard capabilityId={agent.capabilityId} agentProfileId={agent.id} />
      </section>

      {exportOpen && (
        <ExportAgentKeyModal
          agentId={agent.id}
          agentAddress={agent.agentAddress}
          walletAddress={walletAddress}
          onClose={() => setExportOpen(false)}
        />
      )}
      {tosOpen && (
        <TosAcknowledgementModal
          onAccept={() => {
            setTosOpen(false);
            setActivateOpen(true);
          }}
          onCancel={() => setTosOpen(false)}
        />
      )}
      {activateOpen && (
        <ActivateAgentModal
          agentId={agent.id}
          agentAddress={agent.agentAddress}
          agentName={agent.name}
          capabilityId={agent.capabilityId}
          walletAddress={walletAddress}
          onActivated={() => {
            // Phase 6 wiring: flip enabled=true in the trader config so the
            // chat-server orchestrator's reconcile step actually spawns
            // PM2. Without this, vault upload would succeed but the
            // runtime would never start (enabled gate refuses spawn).
            // Phase 4: save now returns null on server reject; surface the
            // failure via the configError banner above so the user knows
            // their agent did not actually activate.
            void (async () => {
              if (config) {
                const { id: _id, walletAddress: _w, createdAt: _c, updatedAt: _u, ...rest } = config;
                const saved = await save({ ...rest, enabled: true });
                if (!saved) return;
              }
              void vault.refresh();
            })();
          }}
          onClose={() => setActivateOpen(false)}
        />
      )}
      {deactivateOpen && (
        <DeactivateAgentModal
          agentAddress={agent.agentAddress}
          agentName={agent.name}
          walletAddress={walletAddress}
          agentProfileId={agent.id}
          onDeactivated={() => {
            // Phase 6 wiring: flip enabled=false in the trader config so
            // the chat-server orchestrator's reconcile stops PM2 and the
            // runtime's per-cycle self-suicide gate honors the user
            // intent immediately on next cycle.
            // Phase 4: save now awaits server confirmation. If it fails
            // (rare here — vault DELETE has already stopped PM2), the
            // error surfaces via the configError banner but the agent is
            // still effectively stopped, so vault.refresh proceeds.
            void (async () => {
              if (config) {
                const { id: _id, walletAddress: _w, createdAt: _c, updatedAt: _u, ...rest } = config;
                await save({ ...rest, enabled: false });
              }
              void vault.refresh();
            })();
          }}
          onClose={() => setDeactivateOpen(false)}
        />
      )}
      {restoreOpen && (
        <RestoreAgentModal
          agentAddress={agent.agentAddress}
          agentName={agent.name}
          walletAddress={walletAddress}
          graceEndsAt={vault.graceEndsAt}
          onRestored={() => void vault.refresh()}
          onClose={() => setRestoreOpen(false)}
        />
      )}
    </div>
  );
}

interface ServerStatusCardProps {
  state: 'active' | 'inactive' | 'grace' | 'not_vaulted';
  graceEndsAt: number | null;
  /**
   * Trader-config enabled flag (Phase 6/7, 2026-05-23). When the vault
   * row exists (state=inactive) but the trader config has enabled=false,
   * the runtime will NOT spawn — the original "Activated, awaiting first
   * cycle" label is misleading there because no first cycle is coming
   * until the user clicks Activate. Pass null/undefined to fall back to
   * the legacy label.
   */
  configEnabled?: boolean | null;
  onActivate: () => void;
  /**
   * Soft resume — flip trader-config enabled:true without re-uploading
   * the vault key (which is already on the server). Distinct from
   * onActivate, which is for the not_vaulted state.
   */
  onResume: () => void;
  onDeactivate: () => void;
  onRestore: () => void;
}

function ServerStatusCard({
  state,
  graceEndsAt,
  configEnabled,
  onActivate,
  onResume,
  onDeactivate,
  onRestore,
}: ServerStatusCardProps) {
  // Phase 7: the `inactive` vault state semantically means "vault key
  // stored on server, no recent heartbeat". Pre-Phase-6 the only way to
  // reach that state was a fresh spawn between vault upload and first
  // heartbeat (~5 min) — hence the original "Activated, awaiting first
  // cycle" label. Phase 6 added an enabled-gate that lets the same
  // state describe a deliberately-paused agent. Distinguishing the two
  // is what prevents the user from waiting indefinitely for a heartbeat
  // that will never come (the 2026-05-23 staging Santa confusion).
  const inactiveMeta =
    configEnabled === false
      ? {
          label: 'Vault stored, agent paused',
          tone: 'text-uju-secondary',
          description:
            'The encrypted key is on the server but the runtime is intentionally not running because the agent is paused. Click Activate to start it.',
        }
      : {
          label: 'Activated, awaiting first cycle',
          tone: 'text-amber-200',
          description:
            'The encrypted key is stored on the server but the runtime has not reported a heartbeat yet. Usually clears within ~5 minutes.',
        };
  const stateMeta: Record<typeof state, { label: string; tone: string; description: string }> = {
    not_vaulted: {
      label: 'Not activated',
      tone: 'text-uju-secondary',
      description: 'This agent only runs from your local browser key. Activate it on the server to let Nasun runtime execute its trading cycle automatically.',
    },
    active: {
      label: 'Active',
      tone: 'text-emerald-300',
      description: 'Nasun runtime is running this agent on the server. The next cycle is scheduled automatically.',
    },
    inactive: inactiveMeta,
    grace: {
      label: 'Deactivated, recovery available',
      tone: 'text-amber-200',
      description: graceEndsAt
        ? `The encrypted key is preserved until ${new Date(graceEndsAt).toLocaleString('en-US')}. After that it is permanently deleted from the server.`
        : 'The encrypted key is preserved during the recovery window.',
    },
  };
  const meta = stateMeta[state];

  return (
    <div className="rounded-xl border border-uju-border/60 bg-uju-card p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className={`text-sm font-medium ${meta.tone}`}>{meta.label}</p>
        <p className="text-sm text-uju-secondary">{meta.description}</p>
      </div>
      <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center">
        {state === 'not_vaulted' && (
          <button
            type="button"
            onClick={onActivate}
            className="px-3 py-2 rounded-lg bg-pado-2 text-uju-bg text-sm font-medium hover:bg-pado-3 transition-colors"
          >
            Activate on server
          </button>
        )}
        {/* Phase 7 v2: when the agent is paused (vault present, enabled
            false), surface a quick Resume action alongside Deactivate so
            the user is not stuck with only the destructive option. */}
        {state === 'inactive' && configEnabled === false && (
          <button
            type="button"
            onClick={onResume}
            className="px-3 py-2 rounded-lg bg-pado-2 text-uju-bg text-sm font-medium hover:bg-pado-3 transition-colors"
          >
            Activate
          </button>
        )}
        {(state === 'active' || state === 'inactive') && (
          <button
            type="button"
            onClick={onDeactivate}
            className="px-3 py-2 rounded-lg border border-red-500/40 text-sm text-red-300 hover:bg-red-500/10 transition-colors"
          >
            Deactivate
          </button>
        )}
        {state === 'grace' && (
          <>
            <button
              type="button"
              onClick={onRestore}
              className="px-3 py-2 rounded-lg bg-pado-2 text-uju-bg text-sm font-medium hover:bg-pado-3 transition-colors"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={onActivate}
              className="px-3 py-2 rounded-lg border border-uju-border/60 text-sm text-uju-secondary hover:bg-uju-bg/60 transition-colors"
            >
              Re-upload key
            </button>
          </>
        )}
      </div>
    </div>
  );
}
