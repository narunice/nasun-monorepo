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
 * Every BalanceManager the address provably owns.
 *
 * BalanceManager is a shared object, so getOwnedObjects() can't return it
 * directly and there is no owner->id RPC. devnet prunes transactions/events
 * aggressively (~10 day window), so an event scan alone misses BMs created long
 * ago. Objects, however, are never pruned, so discovery layers three
 * prune-immune-or-bounded sources:
 *   1. DepositCap owned objects (created with the BM; survive pruning forever)
 *   2. chat-server persistent index (owner -> BM, written on first fill)
 *   3. recent BalanceManagerEvent scan (descending, bounded) for just-created
 *      BMs not yet indexed and without a cap
 *
 * Ownership is verified on chain for every candidate: a DepositCap is
 * transferable, so a candidate from the cap scan could point at a BM the caller
 * does not own.
 *
 * Split out from `findUserBalanceManager` because callers that need to see
 * *all* of a user's funds cannot work from the primary alone. Pending pool-side
 * proceeds are the case that forced this: those funds are invisible to the
 * balance ranking below (they are not in any BM bag), so a BM can rank last, or
 * not rank as an orphan at all, while holding the money the user is looking for.
 */
export async function findOwnedBalanceManagerIds(
  userAddress: string
): Promise<string[]> {
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

    if (candidateIds.length === 0) return [];

    const owned = await Promise.all(
      candidateIds.map(async (id) => {
        try {
          const obj = await client.getObject({ id, options: { showContent: true } });
          if (!obj.data || obj.error) return null;
          const content = obj.data.content;
          if (content?.dataType !== 'moveObject') return null;
          const fields = content.fields as Record<string, unknown>;
          return fields.owner === userAddress ? id : null;
        } catch {
          return null;
        }
      })
    );

    return owned.filter((id): id is string => id !== null);
  } catch (error) {
    console.error('[findOwnedBalanceManagerIds] Failed:', error);
    return [];
  }
}

/**
 * Pick the BalanceManager to trade through, plus any others still holding funds.
 *
 * When multiple BMs exist (a past recovery bug, or duplicate-creation), picks
 * the one with the highest balance and returns others with funds as orphans so
 * the caller can drain them back to the user's wallet.
 *
 * Ranking reads the default pool's base and quote only, so it is a heuristic:
 * holdings in other assets do not influence which BM wins, and pool-side settled
 * proceeds are invisible to it entirely. Callers that must account for every
 * asset should enumerate with `findOwnedBalanceManagerIds` instead.
 */
export async function findUserBalanceManager(
  userAddress: string,
  /**
   * Pre-discovered managers, to skip the three-source scan. Callers that already
   * enumerated (the recovery panel does, to list managers this ranking would
   * omit) would otherwise pay for the whole discovery twice.
   */
  discoveredIds?: string[]
): Promise<FindResult> {
  const empty: FindResult = { primaryId: null, orphans: [] };
  try {
    const ownedIds = discoveredIds ?? (await findOwnedBalanceManagerIds(userAddress));
    if (ownedIds.length === 0) return empty;

    const checks = await Promise.all(
      ownedIds.map(async (id) => {
        try {
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
