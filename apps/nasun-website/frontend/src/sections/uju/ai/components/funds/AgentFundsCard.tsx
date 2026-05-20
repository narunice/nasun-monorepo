/**
 * AgentFundsCard — agent's two funding pots at a glance.
 *
 * Trading Wallet: NBTC/NUSDC/NASUN held at the agent's address; the agent
 * trades with this capital and pays its own gas.
 * Inference Balance: pre-funded NUSDC the agent draws from to pay AI
 * executors. Separate from trading capital.
 *
 * Commit 1 ships read-only with disabled action buttons. Commit 2 wires
 * Deposit and Withdraw via TransferAgentFundsDialog.
 */

import { useMemo, useState } from 'react';
import type { AgentProfile } from '../../hooks/useAgentProfiles';
import {
  useAgentWalletBalances,
  useOwnerNasunBalance,
  formatTokenBalance,
} from '../../hooks/useAgentWalletBalances';
import { useAgentEscrowBalances } from '../../hooks/useAgentEscrowBalances';
import { useCapability } from '../../hooks/useCapability';
import { useBudgetsQuery, type BudgetInfo } from '../../hooks/useBudgets';
import { formatNusdcValue, truncateAddress } from '../../utils/format';
import {
  TransferAgentFundsDialog,
  type TransferMode,
} from './TransferAgentFundsDialog';

/** 0.05 NASUN. Below this, owner cannot reliably sponsor a deposit/withdraw tx. */
const LOW_NASUN_THRESHOLD_MIST = 50_000_000n;

/**
 * 0.05 NASUN. Below this, the agent cannot reliably pay gas for trade
 * transactions and the runtime will fail with "No valid gas coins". Distinct
 * from the owner-side threshold above: the owner sponsors deposits, but the
 * agent must hold its own NASUN to trade.
 */
const AGENT_LOW_GAS_THRESHOLD_MIST = 50_000_000n;

interface AgentFundsCardProps {
  agent: AgentProfile;
  walletAddress: string;
  onOpenInferenceTab: () => void;
}

export function AgentFundsCard({ agent, walletAddress, onOpenInferenceTab }: AgentFundsCardProps) {
  const balances = useAgentWalletBalances(agent.agentAddress);
  // Capability resolves agent -> escrow_id. Trading deposits (NUSDC/NBTC) land
  // in the escrow shared object, not in agent.agentAddress. Without this hook
  // the funds card would show 0 right after a successful deposit, which is
  // exactly the user-visible bug from the 2026-05-20 incident.
  const capability = useCapability(agent.capabilityId);
  const escrowBalances = useAgentEscrowBalances(capability.data?.escrowId ?? null);
  const { data: allBudgets } = useBudgetsQuery(walletAddress);
  const { data: ownerNasun } = useOwnerNasunBalance(walletAddress);
  const isLowGas = ownerNasun !== undefined && ownerNasun < LOW_NASUN_THRESHOLD_MIST;
  const [dialogMode, setDialogMode] = useState<TransferMode | null>(null);

  // Agent-side NASUN. The agent pays its own gas when trading; if this is
  // empty the runtime fails with "No valid gas coins" before any swap lands.
  const agentNasunRaw = useMemo(
    () => balances.data?.find((b) => b.symbol === 'NASUN')?.totalBalanceRaw ?? 0n,
    [balances.data],
  );
  const isAgentLowGas =
    balances.data !== undefined && agentNasunRaw < AGENT_LOW_GAS_THRESHOLD_MIST;

  const inference = useMemo(() => {
    if (!allBudgets) return { primary: null as BudgetInfo | null, count: 0 };
    const matches = allBudgets.filter(
      (b) => b.agent.toLowerCase() === agent.agentAddress.toLowerCase() && b.isActive,
    );
    if (matches.length === 0) return { primary: null, count: 0 };
    const primary = matches.reduce((a, b) => (b.balance > a.balance ? b : a));
    return { primary, count: matches.length };
  }, [allBudgets, agent.agentAddress]);

  return (
    <>
    <section className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-white">Funds</h3>
        <p className="text-sm text-uju-secondary">
          Trading Wallet holds your capital. Inference Balance covers the agent's AI fees.
        </p>
      </div>

      {isLowGas && (
        <div className="px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
          Your wallet has low NSN for gas. Use the wallet faucet before depositing or withdrawing.
        </div>
      )}

      {isAgentLowGas && (
        <div className="px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
          Agent has low NSN for trading gas. Deposit NSN to the agent wallet so the agent can execute trades.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-uju-border/60 bg-uju-bg/40 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Trading Capital</p>
              <p className="text-xs text-uju-secondary mt-0.5">
                Agent wallet (NSN gas) + Escrow (trade funds)
              </p>
            </div>
          </div>

          {balances.isLoading || !balances.data ? (
            <div className="h-16 rounded bg-uju-bg/60 animate-pulse" />
          ) : (
            <ul className="space-y-1.5">
              {/* Agent wallet (gas + any stray non-gas coins). NSN here is what
                 lets the agent sign trade PTBs at all. Non-gas tokens shown
                 here are "stuck" — they exist but cannot be spent by trades
                 (only Escrow funds spend); user should withdraw them. */}
              {balances.data
                .filter((b) => b.totalBalanceRaw > 0n)
                .map((b) => (
                  <li key={`w-${b.symbol}`} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-uju-secondary">
                      {b.symbol === 'NASUN' ? 'NSN' : b.symbol}
                      <span className="ml-1 text-xs text-uju-secondary/60">
                        {b.symbol === 'NASUN' ? '(gas)' : '(wallet)'}
                      </span>
                    </span>
                    <span className="text-white font-mono">{formatTokenBalance(b)}</span>
                  </li>
                ))}
              {/* Escrow balances. These are what `withdraw_for_action` actually
                 sources from. Non-zero entries are the trade-spendable capital. */}
              {escrowBalances.isLoading ? (
                <li className="text-xs text-uju-secondary/70 italic">Loading escrow…</li>
              ) : escrowBalances.data && escrowBalances.data.length > 0 ? (
                escrowBalances.data
                  .filter((b) => b.totalBalanceRaw > 0n)
                  .map((b) => (
                    <li key={`e-${b.type}`} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-uju-secondary">
                        {b.label}
                        <span className="ml-1 text-xs text-uju-secondary/60">(escrow)</span>
                      </span>
                      <span className="text-white font-mono">
                        {formatTokenBalance({
                          symbol: b.symbol ?? 'NUSDC',
                          name: b.label,
                          decimals: b.decimals,
                          type: b.type,
                          totalBalanceRaw: b.totalBalanceRaw,
                        })}
                      </span>
                    </li>
                  ))
              ) : null}
              {!balances.data.some((b) => b.totalBalanceRaw > 0n) &&
                (!escrowBalances.data || escrowBalances.data.every((b) => b.totalBalanceRaw === 0n)) && (
                  <li className="text-sm text-uju-secondary/70 italic">No funds yet.</li>
                )}
            </ul>
          )}

          <div className="flex gap-2 pt-1 border-t border-uju-border/60">
            <button
              type="button"
              onClick={() => setDialogMode('deposit')}
              className="flex-1 px-2 py-1.5 text-xs rounded border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors"
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setDialogMode('withdraw-trading')}
              disabled={
                !balances.data?.some((b) => b.totalBalanceRaw > 0n) &&
                !escrowBalances.data?.some((b) => b.totalBalanceRaw > 0n)
              }
              className="flex-1 px-2 py-1.5 text-xs rounded border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Withdraw
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-uju-border/60 bg-uju-bg/40 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Inference Balance</p>
              <p className="text-xs text-uju-secondary mt-0.5">
                NUSDC for AI executor fees
              </p>
            </div>
          </div>

          {inference.primary ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-uju-secondary">Balance</span>
                <span className="text-white font-mono">{formatNusdcValue(inference.primary.balance)} NUSDC</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-uju-secondary">Spent</span>
                <span className="text-white font-mono">{formatNusdcValue(inference.primary.totalSpent)} NUSDC</span>
              </div>
              {inference.count > 1 && (
                <p className="text-xs text-uju-secondary/70 pt-1">
                  +{inference.count - 1} more active. Manage all in Settings.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-uju-secondary">
              No active inference balance for this agent.
            </p>
          )}

          <div className="flex gap-2 pt-1 border-t border-uju-border/60">
            <button
              type="button"
              onClick={() => setDialogMode('top-up-inference')}
              disabled={inference.count === 0}
              className="flex-1 px-2 py-1.5 text-xs rounded border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Top up
            </button>
            <button
              type="button"
              onClick={onOpenInferenceTab}
              className="flex-1 px-2 py-1.5 text-xs rounded border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors"
            >
              Manage
            </button>
          </div>
        </div>
      </div>
    </section>

    {dialogMode && (
      <TransferAgentFundsDialog
        agent={agent}
        walletAddress={walletAddress}
        mode={dialogMode}
        agentBalances={balances.data ?? []}
        activeBudgets={inference.count > 0 ? (allBudgets?.filter(
          (b) => b.agent.toLowerCase() === agent.agentAddress.toLowerCase() && b.isActive,
        ) ?? []) : []}
        onClose={() => setDialogMode(null)}
        onSuccess={() => setDialogMode(null)}
      />
    )}
    </>
  );
}
