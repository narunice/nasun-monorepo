/**
 * TradingCapitalCard — deposit-only view of the agent's trading capital.
 *
 * Shows agent wallet NSN (gas) + escrow trade funds, with a single Deposit
 * action. Withdraws are intentionally not exposed here; this card lives
 * between Inference Balance and Sessions in SettingsTab so owners completing
 * setup can fund trading capital without leaving the settings flow.
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
import { useBudgetsQuery } from '../../hooks/useBudgets';
import { TransferAgentFundsDialog } from './TransferAgentFundsDialog';

/** 0.05 NASUN. Below this, owner cannot reliably sponsor a deposit tx. */
const LOW_NASUN_THRESHOLD_MIST = 50_000_000n;

/**
 * 0.05 NASUN. Below this, the agent cannot reliably pay gas for trade
 * transactions and the runtime will fail with "No valid gas coins".
 */
const AGENT_LOW_GAS_THRESHOLD_MIST = 50_000_000n;

interface TradingCapitalCardProps {
  agent: AgentProfile;
  walletAddress: string;
}

export function TradingCapitalCard({ agent, walletAddress }: TradingCapitalCardProps) {
  const balances = useAgentWalletBalances(agent.agentAddress);
  // Trading deposits (NUSDC/NBTC) land in the escrow shared object, not in
  // agent.agentAddress. Without this hook the card would show 0 right after a
  // successful deposit (2026-05-20 incident).
  const capability = useCapability(agent.capabilityId);
  const escrowBalances = useAgentEscrowBalances(capability.data?.escrowId ?? null);
  const { data: allBudgets } = useBudgetsQuery(walletAddress);
  const { data: ownerNasun } = useOwnerNasunBalance(walletAddress);
  const isLowGas = ownerNasun !== undefined && ownerNasun < LOW_NASUN_THRESHOLD_MIST;
  const [depositOpen, setDepositOpen] = useState(false);

  const agentNasunRaw = useMemo(
    () => balances.data?.find((b) => b.symbol === 'NASUN')?.totalBalanceRaw ?? 0n,
    [balances.data],
  );
  const isAgentLowGas =
    balances.data !== undefined && agentNasunRaw < AGENT_LOW_GAS_THRESHOLD_MIST;

  const activeBudgets = useMemo(() => {
    if (!allBudgets) return [];
    return allBudgets.filter(
      (b) => b.agent.toLowerCase() === agent.agentAddress.toLowerCase() && b.isActive,
    );
  }, [allBudgets, agent.agentAddress]);

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-white">Trading Capital</h3>
          <p className="text-sm text-uju-secondary">
            Agent wallet (NSN gas) + Escrow (trade funds). Deposit capital here so the
            agent can pay gas and execute trades.
          </p>
        </div>

        {isLowGas && (
          <div className="px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            Your wallet has low NSN for gas. Use the wallet faucet before depositing.
          </div>
        )}

        {isAgentLowGas && (
          <div className="px-3 py-2 text-sm rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            Agent has low NSN for trading gas. Deposit NSN to the agent wallet so the agent can execute trades.
          </div>
        )}

        <div className="rounded-xl border border-uju-border/60 bg-uju-card p-4 space-y-3">
          {balances.isLoading || !balances.data ? (
            <div className="h-16 rounded bg-uju-bg/60 animate-pulse" />
          ) : (
            <ul className="space-y-1.5">
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
              {escrowBalances.isLoading ? (
                <li className="text-sm text-uju-secondary/70 italic">Loading escrow...</li>
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

          <div className="pt-1 border-t border-uju-border/60">
            <button
              type="button"
              onClick={() => setDepositOpen(true)}
              className="w-full px-3 py-2 text-sm rounded border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors"
            >
              Deposit
            </button>
          </div>
        </div>
      </div>

      {depositOpen && (
        <TransferAgentFundsDialog
          agent={agent}
          walletAddress={walletAddress}
          mode="deposit"
          agentBalances={balances.data ?? []}
          activeBudgets={activeBudgets}
          onClose={() => setDepositOpen(false)}
          onSuccess={() => setDepositOpen(false)}
        />
      )}
    </>
  );
}
