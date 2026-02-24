/**
 * AgentList - Display all agent profiles with their budget status
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWalletSession } from '../hooks/useWalletSession';
import { useAgentProfiles } from '../features/agents/hooks/useAgentProfiles';
import { useAgentBudgets, type BudgetInfo } from '../features/agents/hooks/useAgentBudgets';
import { useCreateAgent } from '../hooks/useCreateAgent';
import { CreateAgentModal } from '../components/modals/CreateAgentModal';
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
    totalExecutions: number;
    totalSpent: number;
  };
  budget?: BudgetInfo;
}) {
  const budgetTotal = budget ? Math.max(1, budget.balance + budget.totalSpent) : 1;
  const spentPercent = budget
    ? Math.max(0, Math.min(100, (budget.totalSpent / budgetTotal) * 100))
    : 0;

  const isLow = budget && budget.balance > 0
    ? budget.balance / budgetTotal < 0.2
    : false;

  return (
    <Link
      to={`/agents/${agent.id}`}
      className="block bg-[var(--color-bg-secondary)] rounded-lg p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/30 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm lg:text-base font-semibold text-[var(--color-text-primary)]">{agent.name}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {agent.role} | {formatAddress(agent.agentAddress)}
          </p>
        </div>
        <span
          className={`text-2xs px-1.5 py-0.5 rounded ${
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
            className="text-2xs px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
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
          <div className="flex justify-between text-2xs text-[var(--color-text-muted)] mt-1">
            <span>{budget.requestCount} requests</span>
            <span>{formatNUSDC(budget.totalSpent)} spent</span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--color-border)]">
        <span className="text-2xs text-[var(--color-text-muted)]">
          Created {formatDate(agent.createdAt)}
        </span>
        <span className="text-2xs text-[var(--color-text-muted)]">
          {agent.totalExecutions} executions
        </span>
      </div>
    </Link>
  );
}

export function AgentList() {
  const { walletAddress, isConnected } = useWalletSession();
  const { data: agents, isLoading: agentsLoading, refetch } = useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);
  const { createAgent, txStatus, txError, generatedAddress, fallbackKey, resetTxStatus } = useCreateAgent();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreate = async (params: {
    mode: 'generate' | 'import';
    agentAddress?: string;
    passphrase?: string;
    name: string;
    role: string;
    capabilities: string[];
  }) => {
    const digest = await createAgent(params);
    if (digest) {
      refetch?.();
    }
    return digest;
  };

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
        <h2 className="text-lg lg:text-xl font-semibold text-[var(--color-text-primary)]">Agents</h2>
        <button
          onClick={() => { resetTxStatus(); setShowCreateModal(true); }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          Register Agent
        </button>
      </div>

      {!agents || agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <svg className="w-10 h-10 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="8" r="4" strokeWidth={1.5} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" />
          </svg>
          <p className="text-sm text-[var(--color-text-muted)]">
            Register your first agent to start managing AI budgets.
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

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          txStatus={txStatus}
          txError={txError}
          generatedAddress={generatedAddress}
          fallbackKey={fallbackKey}
        />
      )}
    </div>
  );
}
