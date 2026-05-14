/**
 * AgentDetail - per-agent management surface with four sub-tabs.
 *
 * URL contract (AiTab routes):
 *   ?tab=ai&view=detail&agent=<profileId>
 *   ?tab=ai&view=detail&agent=<profileId>&sub=<dashboard|activity|escrow|sessions>
 *
 * Heavy baram-specific concerns (in-browser scheduler, localStorage escrow id
 * fallback, NFT gate) are intentionally dropped here. The trader bot runs in
 * nasun-ai-runtime on the server; the UI surfaces only the config + on-chain
 * artifacts.
 */

import { useMemo } from 'react';
import { useAgentProfiles } from '../hooks/useAgentProfiles';
import { useBudgetsQuery } from '../hooks/useBudgets';
import { truncateAddress } from '../utils/format';
import { DashboardTab } from './agent/DashboardTab';
import { ActivityTab } from './agent/ActivityTab';
import { EscrowTab } from './agent/EscrowTab';
import { SessionsTab } from './agent/SessionsTab';
import { ChatTab } from './agent/ChatTab';

export type AgentSubTab = 'dashboard' | 'activity' | 'escrow' | 'sessions' | 'chat';

const SUB_TABS: { key: AgentSubTab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'activity', label: 'Activity' },
  { key: 'chat', label: 'Chat' },
  { key: 'escrow', label: 'Escrow' },
  { key: 'sessions', label: 'Sessions' },
];

interface AgentDetailProps {
  walletAddress: string;
  agentId: string;
  subTab: AgentSubTab;
  onChangeSub: (sub: AgentSubTab) => void;
  onBack: () => void;
}

export function AgentDetail({
  walletAddress,
  agentId,
  subTab,
  onChangeSub,
  onBack,
}: AgentDetailProps) {
  const { data: agents, isLoading, refetch } = useAgentProfiles(walletAddress);
  const { data: budgets } = useBudgetsQuery(walletAddress);

  const agent = useMemo(() => agents?.find((a) => a.id === agentId) ?? null, [agents, agentId]);

  const budget = useMemo(() => {
    if (!agent || !budgets) return null;
    const match = budgets.find(
      (b) => b.agent.toLowerCase() === agent.agentAddress.toLowerCase() && b.isActive,
    );
    return match ?? null;
  }, [agent, budgets]);

  if (isLoading) {
    return <div className="h-32 rounded-xl bg-uju-card/60 animate-pulse" />;
  }

  if (!agent) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-pado-2 hover:underline"
        >
          ← Back to agents
        </button>
        <div className="py-12 text-center rounded-xl border border-uju-border/60 border-dashed">
          <p className="text-sm text-uju-secondary">Agent not found in this wallet.</p>
          <p className="text-sm text-uju-secondary/70 mt-1">
            It may have been transferred or you may be connected with a different account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-pado-2 hover:underline mb-1"
          >
            ← Back to agents
          </button>
          <h2 className="text-base font-semibold text-white truncate">{agent.name}</h2>
          <p className="text-sm text-uju-secondary mt-0.5">
            {agent.role} - {truncateAddress(agent.agentAddress)}
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-uju-border/60 overflow-x-auto" role="tablist">
        {SUB_TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            role="tab"
            aria-selected={subTab === t.key}
            onClick={() => onChangeSub(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              subTab === t.key
                ? 'border-pado-2 text-pado-2'
                : 'border-transparent text-uju-secondary hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {subTab === 'dashboard' && (
          <DashboardTab agent={agent} budget={budget} onRefresh={() => void refetch()} />
        )}
        {subTab === 'activity' && (
          <ActivityTab walletAddress={walletAddress} agentAddress={agent.agentAddress} />
        )}
        {subTab === 'escrow' && (
          <EscrowTab walletAddress={walletAddress} agentAddress={agent.agentAddress} />
        )}
        {subTab === 'sessions' && (
          <SessionsTab agentId={agent.id} agentAddress={agent.agentAddress} walletAddress={walletAddress} />
        )}
        {subTab === 'chat' && (
          <ChatTab walletAddress={walletAddress} agentId={agent.id} />
        )}
      </div>
    </div>
  );
}
