/**
 * SettingsTab - aggregates all configuration surfaces under one tab.
 *
 * Flat stack (no accordions) so first-time owners see every knob in one scroll:
 *   - AI Agent config (TraderConfigForm)
 *   - Budget (EscrowTab)
 *   - Sessions (Telegram link / revoke)
 *   - Danger zone (capability pause + revoke)
 */

import type { AgentProfile } from '../../hooks/useAgentProfiles';
import type { BudgetInfo } from '../../hooks/useBudgets';
import { useTraderConfig } from '../../hooks/useTraderConfig';
import { TraderConfigForm } from '../../components/forms/TraderConfigForm';
import { DangerZoneCard } from '../../components/DangerZoneCard';
import { EscrowTab } from './EscrowTab';
import { SessionsTab } from './SessionsTab';

interface SettingsTabProps {
  agent: AgentProfile;
  budget: BudgetInfo | null;
  walletAddress: string;
}

export function SettingsTab({ agent, budget, walletAddress }: SettingsTabProps) {
  const { config, save, remove, refetch } = useTraderConfig(agent.agentAddress);

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

      <section>
        <DangerZoneCard capabilityId={agent.capabilityId} />
      </section>
    </div>
  );
}
