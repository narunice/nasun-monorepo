/**
 * Baram Budget pre-check (Plan D §D-6 §A6).
 *
 * Before forwarding a cognition wake to agent-runner, the chat-server pings
 * the on-chain Budget object via RPC to make sure the agent has enough
 * balance to cover a request. Avoids spending the user's daily message cap
 * on calls that will fail downstream with Budget.E_INSUFFICIENT_BALANCE.
 *
 * Cached for 30 seconds per agent — Budget balance changes slowly (only on
 * AER settlement), so refreshing on every message is wasteful. Cache evicts
 * lazily on read.
 */

import { SuiClient } from '@mysten/sui/client';
import { DEFAULT_CONFIG } from './types.js';

const CACHE_TTL_MS = 30_000;
const MIN_BALANCE_BUFFER_RAW = parseInt(process.env.BARAM_BUDGET_MIN_BALANCE_RAW || '1000000', 10); // 1 NUSDC default

interface CachedBudget {
  balance: number;
  isActive: boolean;
  fetchedAt: number;
}

const cache = new Map<string, CachedBudget>();
let client: SuiClient | null = null;

function getClient(): SuiClient {
  if (!client) {
    const rpcUrl = process.env.RPC_URL || DEFAULT_CONFIG.rpcUrl;
    client = new SuiClient({ url: rpcUrl });
  }
  return client;
}

export interface BudgetCheckResult {
  ok: boolean;
  reason?: 'no_budget_id' | 'not_found' | 'inactive' | 'insufficient' | 'rpc_error';
  balance?: number;
  required?: number;
}

/**
 * Verify the agent's Budget has enough headroom for at least one request.
 *
 * Returns `{ ok: true }` if the Budget is active and balance >= MIN_BUFFER.
 * When `budgetId` is null (legacy agent that hasn't reported it yet), we
 * fail open with `ok: true` so legacy heartbeats keep working until the
 * agent-runner is restarted with the new payload.
 */
export async function checkBudgetSufficient(budgetId: string | null): Promise<BudgetCheckResult> {
  if (!budgetId) {
    // Fail-open: pre-D-6 agents won't report budget_id until restarted.
    // Downstream agent-runner still enforces budget on-chain.
    return { ok: true, reason: 'no_budget_id' };
  }

  const now = Date.now();
  const cached = cache.get(budgetId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return verdictFromCache(cached);
  }

  try {
    const obj = await getClient().getObject({ id: budgetId, options: { showContent: true } });
    if (obj.data?.content?.dataType !== 'moveObject') {
      return { ok: false, reason: 'not_found' };
    }
    const fields = obj.data.content.fields as Record<string, unknown>;
    const fresh: CachedBudget = {
      balance: Number(fields.balance ?? 0),
      isActive: Boolean(fields.is_active),
      fetchedAt: now,
    };
    cache.set(budgetId, fresh);
    return verdictFromCache(fresh);
  } catch (err) {
    console.warn('[baram-budget] RPC fetch failed:', (err as Error).message);
    return { ok: false, reason: 'rpc_error' };
  }
}

function verdictFromCache(c: CachedBudget): BudgetCheckResult {
  if (!c.isActive) {
    return { ok: false, reason: 'inactive', balance: c.balance };
  }
  if (c.balance < MIN_BALANCE_BUFFER_RAW) {
    return { ok: false, reason: 'insufficient', balance: c.balance, required: MIN_BALANCE_BUFFER_RAW };
  }
  return { ok: true, balance: c.balance };
}

/**
 * Invalidate the cached entry for a budget. The agent-runner should call this
 * (via a side channel) after a successful AER landing if we want immediate
 * accuracy; for now the 30s TTL is acceptable.
 */
export function invalidateBudgetCache(budgetId: string): void {
  cache.delete(budgetId);
}

export function __clearAllForTest(): void {
  cache.clear();
  client = null;
}
