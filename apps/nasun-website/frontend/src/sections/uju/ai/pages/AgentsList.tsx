/**
 * AgentsList - List AgentProfile objects owned by the connected wallet, with budget gauge.
 * Ported from baram pages/AgentList.tsx; navigation lifted to a parent prop so AiTab
 * can drive sub-route changes via the `view` query param without pulling in react-router here.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAgentProfiles, type AgentProfile } from '../hooks/useAgentProfiles';
import { useAgentBudgets, type BudgetInfo } from '../hooks/useAgentBudgets';
import { useAgentAerStats } from '../hooks/useAgentAerStats';
import { useCreateAgent } from '../hooks/useCreateAgent';
import { useEnabledFlagMap, agentAddressSignature } from '../hooks/useEnabledFlagMap';
import { useCreateAgentBlocked } from '../alpha/useCreateAgentBlocked';
import { CreateAgentModal } from '../components/modals/CreateAgentModal';
import { formatNusdcValue, truncateAddress, formatDate } from '../utils/format';
import { deriveAgentStatus, type AgentDisplayStatus } from '../utils/agentStatus';

interface AgentsListProps {
  walletAddress: string;
  /** Open the registration modal. AiTab sets ?view=register so the URL is shareable. */
  showRegister: boolean;
  onShowRegister: () => void;
  onCloseRegister: () => void;
  onSelectAgent?: (agentId: string) => void;
}

export function AgentCard({
  agent,
  budget,
  runtimeEnabled,
  onSelect,
}: {
  agent: AgentProfile;
  budget?: BudgetInfo;
  /**
   * Trader-config enabled flag (chat-server pause axis). When omitted the
   * card falls back to a 2-state display because the parent did not load
   * the batch enabled map. Pass this when you have it so the badge stays
   * consistent with the sidebar's amber "Paused" rendering.
   */
  runtimeEnabled?: boolean;
  onSelect?: () => void;
}) {
  const budgetTotal = budget ? Math.max(1, budget.balance + budget.totalSpent) : 1;
  const spentPercent = budget
    ? Math.max(0, Math.min(100, (budget.totalSpent / budgetTotal) * 100))
    : 0;
  const isLow = budget && budget.balance > 0 ? budget.balance / budgetTotal < 0.2 : false;
  // On-chain AgentProfile.total_executions is never incremented (the Move
  // function exists but no caller wires it). Derive from AER records instead.
  const { executions } = useAgentAerStats(agent.owner, agent.agentAddress, agent.capabilityId);
  const status: AgentDisplayStatus =
    runtimeEnabled === undefined
      ? agent.isActive ? 'active' : 'inactive'
      : deriveAgentStatus(agent.isActive, runtimeEnabled);
  const badgeClass =
    status === 'active'
      ? 'bg-emerald-500/10 text-emerald-400'
      : status === 'paused'
        ? 'bg-amber-500/10 text-amber-300'
        : 'bg-uju-secondary/10 text-uju-secondary';
  const badgeText = status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : 'Inactive';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left bg-uju-card rounded-xl p-4 border border-uju-border/60 hover:border-pado-2/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{agent.name}</h3>
          <p className="text-xs text-uju-secondary mt-0.5">
            {agent.role} · {truncateAddress(agent.agentAddress)}
          </p>
        </div>
        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${badgeClass}`}>
          {badgeText}
        </span>
      </div>

      {agent.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {agent.capabilities.map((cap) => (
            <span key={cap} className="text-xs px-1.5 py-0.5 rounded bg-uju-bg text-uju-secondary">
              {cap}
            </span>
          ))}
        </div>
      )}

      {budget && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-uju-secondary mb-1">
            <span>Inference Balance</span>
            <span className={isLow ? 'text-amber-400' : ''}>
              {formatNusdcValue(budget.balance)} / {formatNusdcValue(budget.balance + budget.totalSpent)} NUSDC
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-uju-bg overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-400' : 'bg-pado-2'}`}
              style={{ width: `${Math.min(100, 100 - spentPercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-uju-secondary/60 mt-1">
            <span>{budget.requestCount} requests</span>
            <span>{formatNusdcValue(budget.totalSpent)} spent</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-uju-border/60">
        <span className="text-xs text-uju-secondary/60">Created {formatDate(agent.createdAt)}</span>
        <span className="text-xs text-uju-secondary/60">{executions} executions</span>
      </div>
    </button>
  );
}

export function AgentsList({
  walletAddress,
  showRegister,
  onShowRegister,
  onCloseRegister,
  onSelectAgent,
}: AgentsListProps) {
  const { data: agents, isLoading, refetch } = useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);
  const { createAgent, txStatus, txError, generatedAddress, fallbackKey, resetTxStatus } = useCreateAgent();
  // Public-alpha gate. Disables Register CTAs upfront so non-invited
  // users see the block before opening the modal. The functional gate is
  // enforced in useCreateAgent at submit time.
  const createBlock = useCreateAgentBlocked(walletAddress);

  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'inactive'>(
    'all',
  );
  const enabledFlags = useEnabledFlagMap(walletAddress, agentAddressSignature(agents));

  // Pre-compute counts so the filter chips can label themselves with the
  // size of each bucket. Falls back to 0 while agents are loading. Uses
  // the same 3-state derivation as each card and the sidebar so the
  // bucket sizes always match what the user sees rendered.
  const counts = useMemo(() => {
    const list = agents ?? [];
    let active = 0, paused = 0, inactive = 0;
    for (const a of list) {
      const enabled = enabledFlags.get(a.agentAddress.toLowerCase());
      const s = deriveAgentStatus(a.isActive, enabled);
      if (s === 'active') active++;
      else if (s === 'paused') paused++;
      else inactive++;
    }
    return { all: list.length, active, paused, inactive };
  }, [agents, enabledFlags]);

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    if (statusFilter === 'all') return agents;
    return agents.filter((a) => {
      const enabled = enabledFlags.get(a.agentAddress.toLowerCase());
      return deriveAgentStatus(a.isActive, enabled) === statusFilter;
    });
  }, [agents, enabledFlags, statusFilter]);

  // Reset tx state each time the modal opens so a stale 'success' from a prior
  // run does not flash the success view immediately on re-open.
  useEffect(() => {
    if (showRegister) resetTxStatus();
  }, [showRegister, resetTxStatus]);

  const handleCreate = async (params: Parameters<typeof createAgent>[0]) => {
    const digest = await createAgent(params);
    if (digest) refetch();
    return digest;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Nasun AI Agents</h2>
          <p className="text-sm text-uju-secondary">AI agents delegated to execute on your behalf</p>
        </div>
        <button
          onClick={onShowRegister}
          disabled={createBlock.blocked}
          title={createBlock.message ?? undefined}
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Register Agent
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-uju-card/60 animate-pulse" />
          ))}
        </div>
      ) : !agents || agents.length === 0 ? (
        <div className="py-10 text-center space-y-3 bg-uju-card/40 rounded-xl border border-uju-border/40">
          <p className="text-sm text-uju-secondary">No AI agents found for this wallet.</p>
          {createBlock.blocked ? (
            <p className="text-sm text-amber-300 px-4">{createBlock.message}</p>
          ) : (
            <button
              onClick={onShowRegister}
              className="inline-block text-sm text-pado-2 hover:underline"
            >
              Register your first agent
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-uju-card/60 border border-uju-border/60 w-fit">
            {(['all', 'active', 'paused', 'inactive'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  statusFilter === key
                    ? 'bg-pado-2 text-uju-bg'
                    : 'text-uju-secondary hover:text-white'
                }`}
              >
                {key === 'all'
                  ? 'All'
                  : key === 'active'
                    ? 'Active'
                    : key === 'paused'
                      ? 'Paused'
                      : 'Inactive'}
                <span className="ml-1.5 text-xs opacity-70">{counts[key]}</span>
              </button>
            ))}
          </div>

          {filteredAgents.length === 0 ? (
            <div className="py-10 text-center bg-uju-card/40 rounded-xl border border-uju-border/40">
              <p className="text-sm text-uju-secondary">
                No {statusFilter} agents.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  budget={budgets?.find((b) => b.agent === agent.agentAddress)}
                  runtimeEnabled={enabledFlags.get(agent.agentAddress.toLowerCase()) ?? false}
                  onSelect={onSelectAgent ? () => onSelectAgent(agent.id) : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showRegister && (
        <CreateAgentModal
          onClose={onCloseRegister}
          onCreate={handleCreate}
          txStatus={txStatus}
          txError={txError}
          generatedAddress={generatedAddress}
          fallbackKey={fallbackKey}
          walletAddress={walletAddress}
        />
      )}
    </div>
  );
}
