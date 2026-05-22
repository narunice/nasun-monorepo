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
import { useAgentAerStats } from '../../hooks/useAgentAerStats';
import { authorizeAgentOnChain } from '../../services/agentAuthorizeOnChain';
import { formatNusdc, formatTimestamp } from '../../utils/format';
import { AgentFundsCard } from '../../components/funds/AgentFundsCard';
import { TradingPerformanceCard } from '../../components/performance/TradingPerformanceCard';
import { FirstRunChecklist } from '../../components/FirstRunChecklist';
import { HashRef } from '../../components/HashRef';
import { DeactivateAgentModal } from '../../components/modals/DeactivateAgentModal';
import { ActivityTab } from './ActivityTab';

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
  const { reactivateAgent, txStatus, txError, resetTxStatus } = useAgentActions();
  const aerStats = useAgentAerStats(walletAddress, agent.agentAddress, agent.capabilityId);
  const { signer } = useSigner();
  const [busy, setBusy] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
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

  const handleActivate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await reactivateAgent(agent.id);
      if (ok) onRefresh();
    } finally {
      setBusy(false);
      resetTxStatus();
    }
  };

  return (
    <div className="space-y-6">
      <FirstRunChecklist agent={agent} onJumpToActivity={onViewAllActivity} />

      <div className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{agent.name}</h3>
            <p className="text-sm text-uju-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{agent.role} -</span>
              <HashRef value={agent.agentAddress} kind="address" />
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
          <Stat label="Executions" value={aerStats.executions.toLocaleString()} />
          <Stat label="Spent" value={formatNusdc(aerStats.totalSpent)} />
          <Stat
            label="Last active"
            value={aerStats.lastActiveAt > 0 ? formatTimestamp(aerStats.lastActiveAt) : '-'}
          />
          <Stat label="Created" value={formatTimestamp(agent.createdAt)} />
        </div>

        <div className="flex flex-wrap gap-2 pt-3 border-t border-uju-border/60">
          {agent.isActive ? (
            <button
              type="button"
              onClick={() => setShowPauseModal(true)}
              className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors"
            >
              Pause agent
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={busy}
              className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors disabled:opacity-50"
            >
              {busy ? 'Activating...' : 'Activate agent'}
            </button>
          )}
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

      <TradingPerformanceCard agent={agent} />

      <div>
        <ActivityTab
          walletAddress={walletAddress}
          agentAddress={agent.agentAddress}
          agentCapabilityId={agent.capabilityId}
          limit={2}
          onViewAll={onViewAllActivity}
        />
      </div>

      {showPauseModal && (
        <DeactivateAgentModal
          agentAddress={agent.agentAddress}
          agentName={agent.name}
          walletAddress={walletAddress}
          agentProfileId={agent.id}
          onDeactivated={() => { setShowPauseModal(false); onRefresh(); }}
          onClose={() => setShowPauseModal(false)}
        />
      )}
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
