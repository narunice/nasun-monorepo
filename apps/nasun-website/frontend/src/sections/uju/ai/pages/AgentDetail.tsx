/**
 * AgentDetail - per-agent management surface.
 *
 * URL contract (AiTab routes):
 *   ?tab=ai&view=detail&agent=<profileId>
 *   ?tab=ai&view=detail&agent=<profileId>&sub=<overview|activity|settings>
 *
 * Legacy `sub` values (dashboard|chat|escrow|sessions) are mapped to the new
 * 3-tab IA via `normalizeSubTab()` so existing deep links continue to land on
 * a reasonable surface.
 *
 * Heavy baram-specific concerns (in-browser scheduler, localStorage escrow id
 * fallback, NFT gate) are intentionally dropped here. The AI agent runs in
 * nasun-ai-runtime on the server; the UI surfaces only the config + on-chain
 * artifacts.
 */

import { useMemo } from 'react';
import { useAgentProfiles } from '../hooks/useAgentProfiles';
import { useBudgetsQuery } from '../hooks/useBudgets';
import { HashRef } from '../components/HashRef';
import { OverviewTab } from './agent/OverviewTab';
import { ActivityTab } from './agent/ActivityTab';
import { SettingsTab } from './agent/SettingsTab';
import { AgentChat } from './agent/AgentChat';
import type { AlphaStatusResponse } from '../alpha/alphaApiClient';

export type AgentSubTab = 'overview' | 'activity' | 'chat' | 'settings';

/** Accepts legacy sub values and maps them onto the current 4-tab IA. */
export function normalizeSubTab(raw: string | null | undefined): AgentSubTab {
  switch (raw) {
    case 'overview':
    case 'activity':
    case 'chat':
    case 'settings':
      return raw;
    case 'dashboard':
      return 'overview';
    case 'escrow':
    case 'sessions':
      return 'settings';
    default:
      return 'overview';
  }
}

const SUB_TABS: { key: AgentSubTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
  // Chat sub-tab hidden pending proposal-confirm UX redesign — see
  // UjuNavigation.tsx for the corresponding top-level AI Chat tab. The
  // wake path itself remains operational on chat-server (PR1) but the
  // user can't confirm proposals from the web yet.
  // { key: 'chat', label: 'Chat' },
  { key: 'settings', label: 'Settings' },
];

interface AgentDetailProps {
  walletAddress: string;
  agentId: string;
  subTab: AgentSubTab;
  onChangeSub: (sub: AgentSubTab) => void;
  onBack: () => void;
  /** When true, the back link reads "Back to Quickstart" instead of "Back to agents". */
  fromQuickstart?: boolean;
  /** Alpha state for this wallet. Threaded from AiTab so AgentChat can render
   * a gate banner / disable input when wake-mode isn't allowed. */
  alphaStatus?: AlphaStatusResponse | null;
}

export function AgentDetail({
  walletAddress,
  agentId,
  subTab,
  onChangeSub,
  onBack,
  fromQuickstart,
  alphaStatus = null,
}: AgentDetailProps) {
  const backLabel = fromQuickstart ? '← Back to Quickstart' : '← Back to agents';
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
          {backLabel}
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
            {backLabel}
          </button>
          <h2 className="text-base font-semibold text-white truncate">{agent.name}</h2>
          <p className="text-sm text-uju-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>{agent.role} -</span>
            <HashRef value={agent.agentAddress} kind="address" />
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
        {subTab === 'overview' && (
          <OverviewTab
            agent={agent}
            walletAddress={walletAddress}
            onRefresh={() => void refetch()}
            onViewAllActivity={() => onChangeSub('activity')}
            onOpenSettings={() => onChangeSub('settings')}
          />
        )}
        {subTab === 'activity' && (
          <ActivityTab
            walletAddress={walletAddress}
            agentAddress={agent.agentAddress}
            agentCapabilityId={agent.capabilityId}
          />
        )}
        {subTab === 'chat' && (
          <AgentChat
            walletAddress={walletAddress}
            agentId={agentId}
            agentAddress={agent.agentAddress}
            capabilityId={agent.capabilityId}
            alphaStatus={alphaStatus}
            isAgentActive={agent.isActive}
          />
        )}
        {subTab === 'settings' && (
          <SettingsTab agent={agent} budget={budget} walletAddress={walletAddress} />
        )}
      </div>
    </div>
  );
}
