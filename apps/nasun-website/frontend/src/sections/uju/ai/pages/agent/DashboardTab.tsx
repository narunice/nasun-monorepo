/**
 * Agent Dashboard tab - summary stats + on-chain status + TraderConfigForm.
 *
 * The trader bot is now run server-side by nasun-ai-runtime; the dashboard
 * shows the latest stored config and lets the owner adjust it. Browser-side
 * scheduler from baram is intentionally dropped (Plan D pivot).
 */

import { useState } from 'react';
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import type { BudgetInfo } from '../../hooks/useBudgets';
import { useAgentActions } from '../../hooks/useAgentActions';
import { useTraderConfig } from '../../hooks/useTraderConfig';
import { TraderConfigForm } from '../../components/forms/TraderConfigForm';
import { formatNusdc, truncateAddress, formatTimestamp } from '../../utils/format';

interface DashboardTabProps {
  agent: AgentProfile;
  budget: BudgetInfo | null;
  onRefresh: () => void;
}

export function DashboardTab({ agent, budget, onRefresh }: DashboardTabProps) {
  const { deactivateAgent, reactivateAgent, txStatus, txError, resetTxStatus } = useAgentActions();
  const { config, save, remove, refetch } = useTraderConfig(agent.agentAddress);
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
            <p className="text-sm text-uju-secondary mt-0.5">
              {agent.role} - {truncateAddress(agent.agentAddress)}
            </p>
          </div>
          <span
            className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
              agent.isActive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-uju-secondary/10 text-uju-secondary'
            }`}
          >
            {agent.isActive ? 'Active' : 'Inactive'}
          </span>
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
          <Stat label="Executions" value={agent.totalExecutions.toLocaleString()} />
          <Stat label="Spent" value={formatNusdc(agent.totalSpent)} />
          <Stat label="Last active" value={formatTimestamp(agent.lastActiveAt)} />
          <Stat label="Created" value={formatTimestamp(agent.createdAt)} />
        </div>

        <div className="flex gap-2 pt-3 border-t border-uju-border/60">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors disabled:opacity-50"
          >
            {agent.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
          {txStatus === 'error' && txError && (
            <span className="text-sm text-red-400 self-center">{txError}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Trader Bot</h3>
        <p className="text-sm text-uju-secondary">
          The bot is executed by Nasun AI runtime on the server. Update the config below and the
          runtime will pick it up on the next cycle.
        </p>
        <TraderConfigForm
          agentAddress={agent.agentAddress}
          agentBudgetId={budget?.id ?? ''}
          initial={config}
          onSave={async (values) => {
            await save(values);
            await refetch();
          }}
          onDelete={config ? async () => { await remove(); } : undefined}
        />
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
