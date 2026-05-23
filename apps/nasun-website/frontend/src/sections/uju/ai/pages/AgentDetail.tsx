/**
 * AgentDetail - per-agent management surface.
 *
 * URL contract (AiTab routes):
 *   ?tab=ai&view=detail&agent=<profileId>
 *   ?tab=ai&view=detail&agent=<profileId>&sub=<overview|aer|settings>
 *
 * Legacy `sub` values (activity|dashboard|chat|escrow|sessions) are mapped to
 * the current IA via `normalizeSubTab()` so existing deep links continue to
 * land on a reasonable surface.
 *
 * Heavy baram-specific concerns (in-browser scheduler, localStorage escrow id
 * fallback, NFT gate) are intentionally dropped here. The AI agent runs in
 * nasun-ai-runtime on the server; the UI surfaces only the config + on-chain
 * artifacts.
 */

import { useMemo } from 'react';
import { useAgentProfiles } from '../hooks/useAgentProfiles';
import { useBudgetsQuery } from '../hooks/useBudgets';
import { OverviewTab } from './agent/OverviewTab';
import { ActivityTab } from './agent/ActivityTab';
import { SettingsTab } from './agent/SettingsTab';
import { AgentChat } from './agent/AgentChat';
import type { AlphaStatusResponse } from '../alpha/alphaApiClient';

export type AgentSubTab = 'overview' | 'aer' | 'chat' | 'settings';

/** Accepts legacy sub values and maps them onto the current 4-tab IA. */
export function normalizeSubTab(raw: string | null | undefined): AgentSubTab {
  switch (raw) {
    case 'overview':
    case 'aer':
    case 'chat':
    case 'settings':
      return raw;
    case 'activity':
      // Renamed 2026-05-23. Old deep links keep working.
      return 'aer';
    case 'dashboard':
      return 'overview';
    case 'escrow':
    case 'sessions':
      return 'settings';
    default:
      return 'overview';
  }
}

export const SUB_TABS: { key: AgentSubTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  // Chat sub-tab hidden pending proposal-confirm UX redesign — see
  // UjuNavigation.tsx for the corresponding top-level AI Chat tab. The
  // wake path itself remains operational on chat-server (PR1) but the
  // user can't confirm proposals from the web yet.
  // { key: 'chat', label: 'Chat' },
  { key: 'settings', label: 'Settings' },
  { key: 'aer', label: 'AER' },
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
      <div>
        {subTab === 'overview' && (
          <OverviewTab
            agent={agent}
            walletAddress={walletAddress}
            onRefresh={() => void refetch()}
            onViewAllActivity={() => onChangeSub('aer')}
          />
        )}
        {subTab === 'aer' && (
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
