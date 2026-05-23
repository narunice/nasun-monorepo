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
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import { useAgentActions } from '../../hooks/useAgentActions';
import { useAgentAerStats } from '../../hooks/useAgentAerStats';
import { useTraderConfig } from '../../hooks/useTraderConfig';
import { formatNusdc, formatTimestamp } from '../../utils/format';
import { AgentFundsCard } from '../../components/funds/AgentFundsCard';
import { TradingPerformanceCard } from '../../components/performance/TradingPerformanceCard';
import { FirstRunChecklist } from '../../components/FirstRunChecklist';
import { HashRef } from '../../components/HashRef';
import { AgentStateControl } from '../../components/AgentStateControl';
import { ActivityTab } from './ActivityTab';

interface OverviewTabProps {
  agent: AgentProfile;
  walletAddress: string;
  onRefresh: () => void;
  onViewAllActivity: () => void;
}

export function OverviewTab({
  agent,
  walletAddress,
  onRefresh,
  onViewAllActivity,
}: OverviewTabProps) {
  const { reactivateAgent, txStatus, txError, resetTxStatus } = useAgentActions();
  const aerStats = useAgentAerStats(walletAddress, agent.agentAddress, agent.capabilityId);
  // Phase 7 (2026-05-23): the on-chain AgentProfile.is_active flag and
  // the trader config's enabled flag are independent. is_active=true with
  // enabled=false means "agent profile is registered on-chain but the
  // runtime is intentionally paused" — surface that as 'Paused' rather
  // than the green 'Active' badge so users do not expect a heartbeat that
  // will never come (2026-05-23 staging Santa confusion).
  const traderConfig = useTraderConfig(agent.agentAddress);
  const runtimeEnabled = traderConfig.config?.enabled === true;
  const [busy, setBusy] = useState(false);

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

  // Phase 7 v2: soft pause/resume — flip trader-config enabled only.
  // Vault key stays on the server so the user can resume with one click.
  // Distinct from Settings → Deactivate, which deletes the vault key.
  const handlePauseRuntime = async () => {
    if (busy) return;
    if (!traderConfig.config) return;
    setBusy(true);
    try {
      const { id: _id, walletAddress: _w, createdAt: _c, updatedAt: _u, ...rest } =
        traderConfig.config;
      await traderConfig.save({ ...rest, enabled: false });
    } finally {
      setBusy(false);
    }
  };
  const handleResumeRuntime = async () => {
    if (busy) return;
    if (!traderConfig.config) return;
    setBusy(true);
    try {
      const { id: _id, walletAddress: _w, createdAt: _c, updatedAt: _u, ...rest } =
        traderConfig.config;
      await traderConfig.save({ ...rest, enabled: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <FirstRunChecklist agent={agent} onJumpToActivity={onViewAllActivity} />

      {/* Phase 8 — unified Activate / Pause / Kill control. Source of truth
          is chat-server GET /api/nasun-ai/agent/:addr/state (single hook).
          Renders alongside the legacy buttons below during dogfood; the
          legacy controls will be removed in cleanup once this is stable. */}
      <AgentStateControl
        agentAddress={agent.agentAddress}
        agentName={agent.name}
        walletAddress={walletAddress}
        agentProfileId={agent.id}
      />

      <div className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white truncate">{agent.name}</h3>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  agent.isActive && runtimeEnabled
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : agent.isActive
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'bg-uju-secondary/10 text-uju-secondary'
                }`}
              >
                {agent.isActive && runtimeEnabled
                  ? 'Active'
                  : agent.isActive
                    ? 'Paused'
                    : 'Inactive'}
              </span>
            </div>
            <p className="text-sm text-uju-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{agent.role} -</span>
              <HashRef value={agent.agentAddress} kind="address" />
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {/* Direct link to @nasun_ai_bot DM. Each user has only one DM
                with the bot, and the agent's session is bound to that
                conversation, so opening the bot DM is the correct chat
                regardless of which agent is selected. */}
            <a
              href="https://t.me/nasun_ai_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
              </svg>
              Open Telegram
            </a>
            {/* Phase 7 v2 (2026-05-23): Pause/Resume here are SOFT — they
                flip the trader-config enabled flag only, leaving the vault
                key on the server so resuming is a single click. Hard
                removal (vault delete) stays in Settings → Deactivate. The
                third branch (!is_active) is the on-chain reactivation. */}
            {agent.isActive && runtimeEnabled ? (
              <button
                type="button"
                onClick={() => void handlePauseRuntime()}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors disabled:opacity-50"
              >
                {busy ? 'Pausing...' : 'Pause agent'}
              </button>
            ) : agent.isActive ? (
              <button
                type="button"
                onClick={() => void handleResumeRuntime()}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50"
              >
                {busy ? 'Activating...' : 'Activate agent'}
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
          </div>
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

        {txStatus === 'error' && txError && (
          <p className="text-sm text-red-400">{txError}</p>
        )}
      </div>

      <TradingPerformanceCard agent={agent} />

      <AgentFundsCard agent={agent} walletAddress={walletAddress} />

      <div>
        <ActivityTab
          walletAddress={walletAddress}
          agentAddress={agent.agentAddress}
          agentCapabilityId={agent.capabilityId}
          limit={2}
          onViewAll={onViewAllActivity}
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
