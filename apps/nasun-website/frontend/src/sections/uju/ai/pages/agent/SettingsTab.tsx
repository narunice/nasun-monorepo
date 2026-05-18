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
import { TraderConfigForm } from '../../components/forms/TraderConfigForm';
import { DangerZoneCard } from '../../components/DangerZoneCard';
import { ExportAgentKeyModal } from '../../components/modals/ExportAgentKeyModal';
import { ActivateAgentModal } from '../../components/modals/ActivateAgentModal';
import { DeactivateAgentModal } from '../../components/modals/DeactivateAgentModal';
import { RestoreAgentModal } from '../../components/modals/RestoreAgentModal';
import { TosAcknowledgementModal, hasAcceptedTos } from '../../components/modals/TosAcknowledgementModal';
import { useAgentVaultStatus } from '../../hooks/useAgentVaultStatus';
import { EscrowTab } from './EscrowTab';
import { SessionsTab } from './SessionsTab';

interface SettingsTabProps {
  agent: AgentProfile;
  budget: BudgetInfo | null;
  walletAddress: string;
}

export function SettingsTab({ agent, budget, walletAddress }: SettingsTabProps) {
  const { config, save, remove, refetch } = useTraderConfig(agent.agentAddress);
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
        <TraderConfigForm
          agentAddress={agent.agentAddress}
          agentName={agent.name}
          agentBudgetId={budget?.id ?? ''}
          initial={config}
          onSave={async (values) => {
            await save(values);
            await refetch();
          }}
          onDelete={config ? async () => { await remove(); } : undefined}
        />
      </section>

      <section>
        <EscrowTab walletAddress={walletAddress} agentAddress={agent.agentAddress} />
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
        <h3 className="text-sm font-semibold text-white">Server status</h3>
        <ServerStatusCard
          state={vault.state}
          graceEndsAt={vault.graceEndsAt}
          onActivate={requestActivate}
          onDeactivate={() => setDeactivateOpen(true)}
          onRestore={() => setRestoreOpen(true)}
        />
      </section>

      <section>
        <DangerZoneCard capabilityId={agent.capabilityId} />
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
          onActivated={() => void vault.refresh()}
          onClose={() => setActivateOpen(false)}
        />
      )}
      {deactivateOpen && (
        <DeactivateAgentModal
          agentAddress={agent.agentAddress}
          agentName={agent.name}
          walletAddress={walletAddress}
          onDeactivated={() => void vault.refresh()}
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
  onActivate: () => void;
  onDeactivate: () => void;
  onRestore: () => void;
}

function ServerStatusCard({ state, graceEndsAt, onActivate, onDeactivate, onRestore }: ServerStatusCardProps) {
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
    inactive: {
      label: 'Activated, awaiting first cycle',
      tone: 'text-amber-200',
      description: 'The encrypted key is stored on the server but the runtime has not reported a heartbeat yet. Usually clears within ~5 minutes.',
    },
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
