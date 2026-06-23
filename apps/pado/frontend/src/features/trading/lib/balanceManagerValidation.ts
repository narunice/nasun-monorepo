/**
 * BalanceManager on-chain validation and recovery utilities
 */

import { getSuiClient } from '../../../lib/sui-client';
import { getBalanceManagerBalances } from '../../../lib/deepbook';
import { NETWORK_CONFIG } from '../../../config/network';
import { fetchBalanceManagerIds } from '../../../lib/pado-api';

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
  const client = getSuiClient();
  const obj = await client.getObject({ id });
  // Only return false when the chain explicitly says object not found.
  // Let other errors propagate so callers don't misinterpret RPC failures as deletion.
  if (obj.error) {
    const code = (obj.error as { code?: string }).code;
    if (code === 'notExists' || code === 'deleted') return false;
    throw new Error(`RPC error for object ${id}: ${JSON.stringify(obj.error)}`);
  }
  return obj.data != null;
}

/**
 * Find user's existing BalanceManager(s). BalanceManager is a shared object, so
 * getOwnedObjects() can't return it directly and there is no owner->id RPC.
 *
 * devnet prunes transactions/events aggressively (~10 day window), so an event
 * scan alone misses BMs created long ago. Objects, however, are never pruned, so
 * discovery layers three prune-immune-or-bounded sources:
 *   1. DepositCap owned objects (created with the BM; survive pruning forever)
 *   2. chat-server persistent index (owner -> BM, written on first fill)
 *   3. recent BalanceManagerEvent scan (descending, bounded) for just-created
 *      BMs not yet indexed and without a cap
 *
 * When multiple BMs exist (a past recovery bug, or duplicate-creation), picks
 * the one with the highest balance and returns others with funds as orphans so
 * the caller can drain them back to the user's wallet.
 */
export async function findUserBalanceManager(
  userAddress: string
): Promise<FindResult> {
  const empty: FindResult = { primaryId: null, orphans: [] };
  try {
    const client = getSuiClient();

    const candidateIds: string[] = [];
    const seen = new Set<string>();
    const addCandidate = (id: string | null | undefined) => {
      if (id && !seen.has(id)) {
        seen.add(id);
        candidateIds.push(id);
      }
    };

    // Source 1: DepositCap owned objects. The cap stores its balance_manager_id
    // and, being an owned object, survives event pruning indefinitely.
    try {
      const capType = `${NETWORK_CONFIG.deepbookPackage}::balance_manager::DepositCap`;
      let cursor: string | null | undefined = null;
      for (let page = 0; page < 5; page++) {
        const owned = await client.getOwnedObjects({
          owner: userAddress,
          filter: { StructType: capType },
          options: { showContent: true },
          cursor,
          limit: 50,
        });
        for (const o of owned.data) {
          const content = o.data?.content;
          if (content?.dataType === 'moveObject') {
            const bmId = (content.fields as Record<string, unknown>).balance_manager_id;
            if (typeof bmId === 'string') addCandidate(bmId);
          }
        }
        if (!owned.hasNextPage || !owned.nextCursor) break;
        cursor = owned.nextCursor;
      }
    } catch (err) {
      console.warn('[findUserBalanceManager] DepositCap scan failed:', err);
    }

    // Source 2: chat-server persistent index. Covers BMs that have traded at any
    // time, even older than the on-chain event window.
    try {
      (await fetchBalanceManagerIds(userAddress)).forEach(addCandidate);
    } catch (err) {
      console.warn('[findUserBalanceManager] index lookup failed:', err);
    }

    // Source 3: recent BalanceManagerEvent (descending, bounded). Catches a
    // just-created BM that is not yet indexed and predates the deposit-cap flow.
    // Descending + a page cap means devnet pruning of old events cannot break it.
    try {
      const eventType = `${NETWORK_CONFIG.deepbookPackage}::balance_manager::BalanceManagerEvent`;
      let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
      for (let page = 0; page < 10; page++) {
        const result = await client.queryEvents({
          query: { Sender: userAddress },
          cursor,
          limit: 50,
          order: 'descending',
        });
        for (const event of result.data) {
          if (event.type !== eventType) continue;
          const json = event.parsedJson as {
            balance_manager_id: string;
            owner: string;
          } | undefined;
          if (json?.owner === userAddress) addCandidate(json.balance_manager_id);
        }
        if (!result.hasNextPage || !result.nextCursor) break;
        cursor = result.nextCursor;
      }
    } catch (err) {
      // Pruned/unavailable event region after a devnet reset: fall back to the
      // prune-immune sources above instead of failing the whole lookup.
      console.warn('[findUserBalanceManager] event scan stopped early:', err);
    }

    if (candidateIds.length === 0) return empty;

    // Verify ownership + balances for every candidate (including a lone one):
    // a DepositCap is transferable, so a candidate from the cap scan could point
    // to a BM the user does not own. Only owner-matching BMs are eligible.
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
