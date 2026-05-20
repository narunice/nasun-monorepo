/**
 * Derive per-agent execution stats from AER records.
 *
 * The on-chain `AgentProfile.total_executions` / `total_spent` /
 * `last_active_at` counters are wired to `increment_stats`, which is
 * declared in the Move contract but **never actually called** by the
 * settlement path. That means the on-chain stats stay frozen at 0 / 0 /
 * created_at forever, while the AER registry meanwhile records every
 * execution. We compute the real numbers from AER records instead so
 * the Overview / Dashboard tabs reflect what actually happened.
 *
 * Filtering mirrors ActivityTab's scoping logic exactly so a record
 * that shows up in the activity feed is also counted here.
 */

import { useMemo } from 'react';
import { useAerRecords } from './useAerRecords';

export interface AgentAerStats {
  /** Number of AER records scoped to this agent. */
  executions: number;
  /** Sum of paymentAmount across scoped AERs (NUSDC raw units, 1e6). */
  totalSpent: number;
  /** Latest settledAt timestamp across scoped AERs (ms), or 0 if none. */
  lastActiveAt: number;
  isLoading: boolean;
}

export function useAgentAerStats(
  walletAddress: string | null | undefined,
  agentAddress: string | null | undefined,
  agentCapabilityId: string | null | undefined,
): AgentAerStats {
  const { data, isLoading } = useAerRecords(walletAddress ?? null);

  return useMemo(() => {
    if (!data || !walletAddress || !agentAddress) {
      return { executions: 0, totalSpent: 0, lastActiveAt: 0, isLoading };
    }
    const walletLower = walletAddress.toLowerCase();
    const agentLower = agentAddress.toLowerCase();
    const capLower = agentCapabilityId ? agentCapabilityId.toLowerCase() : null;

    let executions = 0;
    let totalSpent = 0;
    let lastActiveAt = 0;
    for (const r of data) {
      const a = typeof r.authorizer === 'string' ? r.authorizer.toLowerCase() : '';
      const recCap = typeof r.capabilityId === 'string' ? r.capabilityId.toLowerCase() : '';
      const matches = recCap
        ? capLower != null && recCap === capLower && a === walletLower
        : a === agentLower ||
          (typeof r.executor === 'string' && r.executor.toLowerCase() === agentLower);
      if (!matches) continue;
      executions += 1;
      totalSpent += r.paymentAmount || 0;
      if (r.settledAt > lastActiveAt) lastActiveAt = r.settledAt;
    }
    return { executions, totalSpent, lastActiveAt, isLoading };
  }, [data, walletAddress, agentAddress, agentCapabilityId, isLoading]);
}
