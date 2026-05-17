/**
 * OverviewTab - first surface on agent detail.
 *
 * Stacks three slices the owner needs at a glance:
 *  1. Agent summary card (stats + Pause/Activate quick action)
 *  2. Recent activity preview (5 most recent AER, "View all" → Activity tab)
 *  3. Full chat surface (the primary daily-driver interaction)
 *
 * Heavier capability controls (wake-mode radio, revoke) live in Settings tab.
 */

import { useState } from 'react';
import { useSigner } from '@nasun/wallet';
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import { useAgentActions } from '../../hooks/useAgentActions';
import { authorizeAgentOnChain } from '../../services/agentAuthorizeOnChain';
import { formatNusdc, truncateAddress, formatTimestamp } from '../../utils/format';
import { AgentFundsCard } from '../../components/funds/AgentFundsCard';
import { ActivityTab } from './ActivityTab';
import { ChatTab } from './ChatTab';

interface OverviewTabProps {
  agent: AgentProfile;
  walletAddress: string;
  onRefresh: () => void;
  onViewAllActivity: () => void;
  onOpenSettings: () => void;
  /** Optional override; defaults to the Settings tab handler. */
  onOpenInferenceTab?: () => void;
}

export function OverviewTab({
  agent,
  walletAddress,
  onRefresh,
  onViewAllActivity,
  onOpenSettings,
  onOpenInferenceTab,
}: OverviewTabProps) {
  const { deactivateAgent, reactivateAgent, txStatus, txError, resetTxStatus } = useAgentActions();
  const { signer } = useSigner();
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const handleAuthorizeOnChain = async () => {
    if (authBusy) return;
    if (!signer) {
      setAuthMsg({ kind: 'err', text: 'Wallet not connected.' });
      return;
    }
    if (!agent.capabilityId) {
      setAuthMsg({ kind: 'err', text: 'This agent has no on-chain capability.' });
      return;
    }
    setAuthBusy(true);
    setAuthMsg(null);
    try {
      const digest = await authorizeAgentOnChain(
        signer,
        walletAddress,
        agent.capabilityId,
        agent.agentAddress,
      );
      setAuthMsg({ kind: 'ok', text: `Authorized. tx=${digest.slice(0, 12)}...` });
    } catch (err) {
      setAuthMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Authorization failed',
      });
    } finally {
      setAuthBusy(false);
    }
  };

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

        <div className="flex flex-wrap gap-2 pt-3 border-t border-uju-border/60">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors disabled:opacity-50"
          >
            {agent.isActive ? 'Pause agent' : 'Activate agent'}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors"
          >
            Settings
          </button>
          <button
            type="button"
            onClick={handleAuthorizeOnChain}
            disabled={authBusy || !agent.capabilityId}
            title="One-time on-chain authorization that lets this agent install pending-proposal locks with its own keypair (required for chat-message proposal flow)."
            className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors disabled:opacity-50"
          >
            {authBusy ? 'Authorizing...' : 'Authorize on-chain'}
          </button>
          {txStatus === 'error' && txError && (
            <span className="text-sm text-red-400 self-center">{txError}</span>
          )}
          {authMsg && (
            <span className={`text-sm self-center ${authMsg.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {authMsg.text}
            </span>
          )}
        </div>
      </div>

      <AgentFundsCard
        agent={agent}
        walletAddress={walletAddress}
        onOpenInferenceTab={onOpenInferenceTab ?? onOpenSettings}
      />

      <div>
        <ActivityTab
          walletAddress={walletAddress}
          agentAddress={agent.agentAddress}
          agentCapabilityId={agent.capabilityId}
          limit={5}
          onViewAll={onViewAllActivity}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Chat</h3>
        <ChatTab
          walletAddress={walletAddress}
          agentId={agent.id}
          capabilityId={agent.capabilityId}
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
