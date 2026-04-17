/**
 * BalanceManager on-chain validation and recovery utilities
 */

import { getSuiClient } from '../../../lib/sui-client';
import { getBalanceManagerBalances } from '../../../lib/deepbook';
import { NETWORK_CONFIG } from '../../../config/network';

export interface OrphanBalanceManager {
  id: string;
  base: number;
  quote: number;
}

export interface FindResult {
  primaryId: string | null;
  /** Other BMs with non-zero balances that should be drained to the user's wallet */
  orphans: OrphanBalanceManager[];
}

/**
 * Validate that a BalanceManager object exists on-chain
 */
export async function validateBalanceManagerExists(id: string): Promise<boolean> {
  try {
    const client = getSuiClient();
    const obj = await client.getObject({ id });
    return obj.data !== null && obj.error === undefined;
  } catch {
    return false;
  }
}

/**
 * Find user's existing BalanceManager by querying BalanceManagerEvent.
 * BalanceManager is a shared object, so getOwnedObjects() won't work.
 *
 * When multiple BMs exist (caused by a past recovery bug), picks the one
 * with the highest balance and returns others with funds as orphans
 * so the caller can drain them back to the user's wallet.
 */
export async function findUserBalanceManager(
  userAddress: string
): Promise<FindResult> {
  const empty: FindResult = { primaryId: null, orphans: [] };
  try {
    const client = getSuiClient();
    const eventType = `${NETWORK_CONFIG.deepbookPackage}::balance_manager::BalanceManagerEvent`;

    // Paginate ascending (oldest first) so BM creation events are found
    // even when the user has hundreds of later transactions.
    const candidateIds: string[] = [];
    const seen = new Set<string>();
    let cursor: string | null | undefined = null;
    let hasMore = true;

    while (hasMore) {
      const result = await client.queryEvents({
        query: { Sender: userAddress },
        cursor: cursor ?? undefined,
        limit: 50,
        order: 'ascending',
      });

      for (const event of result.data) {
        if (event.type !== eventType) continue;
        const json = event.parsedJson as {
          balance_manager_id: string;
          owner: string;
        } | undefined;
        if (!json || json.owner !== userAddress) continue;
        if (seen.has(json.balance_manager_id)) continue;
        seen.add(json.balance_manager_id);
        candidateIds.push(json.balance_manager_id);
      }

      hasMore = result.hasNextPage;
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    if (candidateIds.length === 0) return empty;

    // Single BM: just validate existence
    if (candidateIds.length === 1) {
      const exists = await validateBalanceManagerExists(candidateIds[0]);
      return exists ? { primaryId: candidateIds[0], orphans: [] } : empty;
    }

    // Multiple BMs: verify ownership and check balances in parallel
    console.info(`[findUserBalanceManager] Found ${candidateIds.length} BMs, checking balances...`);

    const checks = await Promise.all(
      candidateIds.map(async (id) => {
        try {
          const obj = await client.getObject({ id, options: { showContent: true } });
          if (!obj.data || obj.error) return { id, valid: false, base: 0, quote: 0 };
          const content = obj.data.content;
          if (content?.dataType !== 'moveObject') return { id, valid: false, base: 0, quote: 0 };
          const fields = content.fields as Record<string, unknown>;
          if (fields.owner !== userAddress) return { id, valid: false, base: 0, quote: 0 };

          const bal = await getBalanceManagerBalances(id);
          return { id, valid: true, base: bal.base, quote: bal.quote };
        } catch {
          return { id, valid: false, base: 0, quote: 0 };
        }
      })
    );

    // Pick BM with highest total balance as primary
    let bestId: string | null = null;
    let bestTotal = -1;

    for (const c of checks) {
      if (!c.valid) continue;
      const total = c.base + c.quote;
      if (total > bestTotal) {
        bestTotal = total;
        bestId = c.id;
      }
    }

    if (!bestId) return empty;

    // Collect orphans: other valid BMs with non-zero balances
    const orphans: OrphanBalanceManager[] = [];
    for (const c of checks) {
      if (!c.valid || c.id === bestId) continue;
      if (c.base > 0 || c.quote > 0) {
        orphans.push({ id: c.id, base: c.base, quote: c.quote });
      }
    }

    if (orphans.length > 0) {
      console.warn(`[findUserBalanceManager] ${orphans.length} orphan BM(s) with funds detected. Will drain to wallet.`);
    }

    return { primaryId: bestId, orphans };
  } catch (error) {
    console.error('[findUserBalanceManager] Failed:', error);
    return empty;
  }
}
