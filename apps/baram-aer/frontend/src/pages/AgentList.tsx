/**
 * AgentList - Display all agent profiles with their budget status
 */

import { Link } from 'react-router-dom';
import { useWalletSession } from '../hooks/useWalletSession';
import { useAgentProfiles } from '../features/agents/hooks/useAgentProfiles';
import { useAgentBudgets, type BudgetInfo } from '../features/agents/hooks/useAgentBudgets';
import { formatNusdcValue as formatNUSDC, truncateAddress as formatAddress, formatDate } from '../utils/format';

function AgentCard({
  agent,
  budget,
}: {
  agent: {
    id: string;
    name: string;
    role: string;
    agentAddress: string;
    capabilities: string[];
    isActive: boolean;
    createdAt: number;
    totalRequests: number;
    totalSpent: number;
  };
  budget?: BudgetInfo;
}) {
  const spentPercent = budget
    ? (budget.totalSpent / (budget.balance + budget.totalSpent || 1)) * 100
    : 0;

  const isLow = budget && budget.balance > 0
    ? budget.balance / (budget.balance + budget.totalSpent || 1) < 0.2
    : false;

  return (
    <Link
      to={`/agents/${agent.id}`}
      className="block bg-[var(--color-bg-secondary)] rounded-lg p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/30 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{agent.name}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {agent.role} | {formatAddress(agent.agentAddress)}
          </p>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            agent.isActive
              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]'
          }`}
        >
          {agent.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Capabilities */}
      <div className="flex gap-1.5 mt-3">
        {agent.capabilities.map((cap) => (
          <span
            key={cap}
            className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Budget gauge */}
      {budget && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
            <span>Budget</span>
            <span className={isLow ? 'text-[var(--color-warning)]' : ''}>
              {formatNUSDC(budget.balance)} / {formatNUSDC(budget.balance + budget.totalSpent)} NUSDC
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isLow ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-accent)]'
              }`}
              style={{ width: `${Math.min(100, 100 - spentPercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-1">
            <span>{budget.requestCount} requests</span>
            <span>{formatNUSDC(budget.totalSpent)} spent</span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--color-border)]">
        <span className="text-[10px] text-[var(--color-text-muted)]">
          Created {formatDate(agent.createdAt)}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {agent.totalRequests} total requests
        </span>
      </div>
    </Link>
  );
}

export function AgentList() {
  const { walletAddress, isConnected } = useWalletSession();
  const { data: agents, isLoading: agentsLoading } = useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-[var(--color-text-muted)]">
          Connect your wallet to view agents.
        </p>
      </div>
    );
  }

  if (agentsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-[var(--color-text-muted)]">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Agents</h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          {agents?.length ?? 0} registered
        </span>
      </div>

      {!agents || agents.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-[var(--color-text-muted)]">
            No agents registered yet.
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Run the demo agent script to create your first agent.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              budget={budgets?.find((b) => b.agent === agent.agentAddress)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
