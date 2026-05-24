/**
 * DashboardTab - legacy 5-tab surface. Kept for one session as a fallback for
 * deep links arriving with ?sub=dashboard. New IA routes through OverviewTab +
 * SettingsTab; this file will be removed after P0-2 devnet e2e confirms the
 * cutover.
 */

import { useState } from 'react';
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import type { BudgetInfo } from '../../hooks/useBudgets';
import { useAgentActions } from '../../hooks/useAgentActions';
import { useAgentAerStats } from '../../hooks/useAgentAerStats';
import { useTraderConfig } from '../../hooks/useTraderConfig';
import { TraderConfigForm } from '../../components/forms/TraderConfigForm';
import { DangerZoneCard } from '../../components/DangerZoneCard';
import { formatNusdc, formatTimestamp } from '../../utils/format';
import { deriveAgentStatus } from '../../utils/agentStatus';
import { HashRef } from '../../components/HashRef';

interface DashboardTabProps {
  agent: AgentProfile;
  budget: BudgetInfo | null;
  onRefresh: () => void;
}

export function DashboardTab({ agent, budget, onRefresh }: DashboardTabProps) {
  const { deactivateAgent, reactivateAgent, txStatus, txError, resetTxStatus } = useAgentActions();
  const { config, save, remove, refetch } = useTraderConfig(agent.agentAddress);
  const aerStats = useAgentAerStats(agent.owner, agent.agentAddress, agent.capabilityId);
  const [busy, setBusy] = useState(false);

  const handleToggleActive = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = agent.isActive
        ? await deactivateAgent(agent.id)
        : await reactivateAgent(agent.id);
      if (ok) onRefresh();
    } finally {
      setBusy(false);
      resetTxStatus();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{agent.name}</h3>
            <p className="text-sm text-uju-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{agent.role} -</span>
              <HashRef value={agent.agentAddress} kind="address" />
            </p>
          </div>
          {(() => {
            const status = deriveAgentStatus(agent.isActive, config?.enabled);
            const cls =
              status === 'active'
                ? 'bg-emerald-500/10 text-emerald-400'
                : status === 'paused'
                  ? 'bg-amber-500/10 text-amber-300'
                  : 'bg-uju-secondary/10 text-uju-secondary';
            const text = status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : 'Inactive';
            return (
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${cls}`}>{text}</span>
            );
          })()}
        </div>

        {agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {agent.capabilities.map((cap) => (
              <span key={cap} className="text-xs px-1.5 py-0.5 rounded bg-uju-bg text-uju-secondary">
                {cap}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-uju-border/60">
          <Stat label="Executions" value={aerStats.executions.toLocaleString()} />
          <Stat label="Spent" value={formatNusdc(aerStats.totalSpent)} />
          <Stat
            label="Last active"
            value={aerStats.lastActiveAt > 0 ? formatTimestamp(aerStats.lastActiveAt) : '-'}
          />
          <Stat label="Created" value={formatTimestamp(agent.createdAt)} />
        </div>

        <div className="flex gap-2 pt-3 border-t border-uju-border/60">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors disabled:opacity-50"
          >
            {agent.isActive ? 'Pause agent' : 'Activate agent'}
          </button>
          {txStatus === 'error' && txError && (
            <span className="text-sm text-red-400 self-center">{txError}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
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
      </div>

      <DangerZoneCard capabilityId={agent.capabilityId} agentProfileId={agent.id} />
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
