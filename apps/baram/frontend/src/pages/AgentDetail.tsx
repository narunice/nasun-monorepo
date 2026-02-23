/**
 * AgentDetail - Detailed view for a single agent profile
 * Shows overview, budget details with spending limits, and activity
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWalletSession } from '../hooks/useWalletSession';
import { useAgentProfiles } from '../features/agents/hooks/useAgentProfiles';
import { useAgentBudgets, useSpendingLimits } from '../features/agents/hooks/useAgentBudgets';
import { formatNusdcValue as formatNUSDC, truncateAddress as formatAddress, formatTimestamp } from '../utils/format';

type Tab = 'overview' | 'budget' | 'activity';

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { walletAddress } = useWalletSession();
  const { data: agents } = useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const agent = agents?.find(a => a.id === id);
  const budget = budgets?.find(b => agent && b.agent === agent.agentAddress);
  const { data: spendingLimits } = useSpendingLimits(budget?.id ?? null);

  if (!agent) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link to="/agents" className="text-xs text-[var(--color-accent)] hover:underline">
          Back to Agents
        </Link>
        <p className="text-sm text-[var(--color-text-muted)] mt-8 text-center">Agent not found.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'budget', label: 'Budget' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link to="/agents" className="text-xs text-[var(--color-accent)] hover:underline">
        Agents
      </Link>

      {/* Agent header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{agent.name}</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">
            {formatAddress(agent.agentAddress)}
          </p>
        </div>
        <span
          className={`text-[10px] px-2 py-1 rounded ${
            agent.isActive
              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]'
          }`}
        >
          {agent.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab agent={agent} budget={budget ?? null} />
      )}
      {activeTab === 'budget' && (
        <BudgetTab budget={budget ?? null} spendingLimits={spendingLimits ?? null} />
      )}
      {activeTab === 'activity' && (
        <ActivityTab agent={agent} />
      )}
    </div>
  );
}

function OverviewTab({ agent, budget }: {
  agent: { role: string; capabilities: string[]; createdAt: number; totalExecutions: number; totalSpent: number; agentAddress: string };
  budget: { balance: number; totalSpent: number; requestCount: number; isActive: boolean } | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Identity */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
        <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Identity</h4>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Role</dt>
            <dd className="text-[var(--color-text-primary)]">{agent.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Address</dt>
            <dd className="text-[var(--color-text-primary)] font-mono">{formatAddress(agent.agentAddress)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Registered</dt>
            <dd className="text-[var(--color-text-primary)]">{formatTimestamp(agent.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)] mb-1">Capabilities</dt>
            <dd className="flex gap-1.5 flex-wrap">
              {agent.capabilities.map(cap => (
                <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                  {cap}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </div>

      {/* Stats */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
        <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Statistics</h4>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Executions</dt>
            <dd className="text-[var(--color-text-primary)]">{agent.totalExecutions}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Total Spent</dt>
            <dd className="text-[var(--color-text-primary)]">{formatNUSDC(agent.totalSpent)} NUSDC</dd>
          </div>
          {budget && (
            <>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Budget Remaining</dt>
                <dd className="text-[var(--color-text-primary)]">{formatNUSDC(budget.balance)} NUSDC</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Budget Status</dt>
                <dd className={budget.isActive ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                  {budget.isActive ? 'Active' : 'Inactive'}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}

function BudgetTab({ budget, spendingLimits }: {
  budget: { id: string; balance: number; totalSpent: number; maxPerRequest: number; requestCount: number; createdAt: number; expiresAt: number } | null;
  spendingLimits: import('../features/agents/hooks/useAgentBudgets').SpendingLimits | null;
}) {
  if (!budget) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
        No budget delegated to this agent.
      </p>
    );
  }

  const totalDeposit = budget.balance + budget.totalSpent;

  return (
    <div className="space-y-4">
      {/* Budget overview */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
        <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Budget Overview</h4>
        <div className="flex justify-between text-sm text-[var(--color-text-primary)] mb-2">
          <span>Balance</span>
          <span className="font-semibold">{formatNUSDC(budget.balance)} / {formatNUSDC(totalDeposit)} NUSDC</span>
        </div>
        <div className="h-3 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all"
            style={{ width: `${Math.min(100, (budget.balance / (totalDeposit || 1)) * 100)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-xs">
          <div>
            <p className="text-[var(--color-text-muted)]">Max / Request</p>
            <p className="text-[var(--color-text-primary)] font-medium">{formatNUSDC(budget.maxPerRequest)} NUSDC</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">Requests</p>
            <p className="text-[var(--color-text-primary)] font-medium">{budget.requestCount}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">Budget ID</p>
            <p className="text-[var(--color-text-primary)] font-mono">{formatAddress(budget.id)}</p>
          </div>
        </div>
      </div>

      {/* Spending Limits */}
      {spendingLimits && (
        <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
          <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Spending Limits</h4>
          <div className="space-y-3">
            <LimitGauge label="Daily" spent={spendingLimits.dailySpent} limit={spendingLimits.dailyLimit} />
            <LimitGauge label="Weekly" spent={spendingLimits.weeklySpent} limit={spendingLimits.weeklyLimit} />
            <LimitGauge label="Monthly" spent={spendingLimits.monthlySpent} limit={spendingLimits.monthlyLimit} />
          </div>
        </div>
      )}
    </div>
  );
}

function LimitGauge({ label, spent, limit }: { label: string; spent: number; limit: number }) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const isNear = pct >= 80;
  const isOver = pct >= 100;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span className={isOver ? 'text-[var(--color-error)]' : isNear ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'}>
          {formatNUSDC(spent)} / {formatNUSDC(limit)} NUSDC
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOver ? 'bg-[var(--color-error)]' : isNear ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-accent)]'
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function ActivityTab({ agent }: { agent: { totalExecutions: number; lastActiveAt: number } }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-[var(--color-text-muted)]">
        {agent.totalExecutions} executions
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">
        Last active: {agent.lastActiveAt ? formatTimestamp(agent.lastActiveAt) : 'Never'}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-4">
        Detailed activity timeline coming soon.
      </p>
    </div>
  );
}

