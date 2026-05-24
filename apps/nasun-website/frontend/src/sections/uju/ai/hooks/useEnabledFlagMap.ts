/**
 * Batch-friendly read of trader-config `enabled` flags for every agent owned
 * by a wallet. Returns Map<agentAddressLower, enabled>.
 *
 * Why not just useTraderConfig per agent: filter-chip counts in AgentsList
 * need to bucket *all* agents into active/paused/inactive up-front, which
 * we cannot do with N parent-level hook calls (React rules).
 *
 * SSOT: chat-server. We optimistically render IndexedDB first (cheap, no
 * network) and then immediately reconcile against chat-server in the
 * background. The reconcile rewrites IDB rows to match the server, so a
 * re-read after `reconcileLocalCacheWithServer` produces the same flag the
 * Settings tab gets from `GET /api/nasun-ai/agent/:addr/state`. Drift
 * between Settings ('Paused') and the sidebar/card ('Active') for the
 * same agent on the 2026-05-24 admin dogfood session was the regression
 * this fix targets — IDB had a stale enabled=true while chat-server held
 * enabled=false, and the IDB-only path lied to every grouped surface.
 *
 * Cost trade-off: one mount per visit = up to N parallel GETs (bounded
 * to RECONCILE_CONCURRENCY inside reconcileLocalCacheWithServer). For an
 * alpha with ≤8 system-wide agents per wallet this is cheap and the
 * correctness benefit dominates.
 */
import { useEffect, useState } from 'react';
import { listConfigs, reconcileLocalCacheWithServer } from '../services/traderConfigStorage';

function rowsToMap(rows: Array<{ agentAddress: string; enabled?: boolean }>): Map<string, boolean> {
  const next = new Map<string, boolean>();
  for (const row of rows) {
    next.set(row.agentAddress.toLowerCase(), row.enabled === true);
  }
  return next;
}

/**
 * Reload-trigger argument: pass a string that changes whenever the set of
 * agents the caller cares about changes. Typical value is a sorted, joined
 * list of agent addresses derived from useAgentProfiles. Without this,
 * the effect only re-runs on walletAddress change, so a newly created
 * agent (e.g. via QuickStart wizard) lands in useAgentProfiles but its
 * enabled flag stays missing from the map — deriveAgentStatus then falls
 * back to 'paused' and the default 'active' filter chip hides the new
 * agent until the user reloads (2026-05-24 Danny incident).
 */
export function useEnabledFlagMap(
  walletAddress: string | null | undefined,
  agentSignature: string = '',
): Map<string, boolean> {
  const [map, setMap] = useState<Map<string, boolean>>(() => new Map());

  useEffect(() => {
    if (!walletAddress) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      // 1) Optimistic IDB read so the grouped surfaces (sidebar list,
      // filter chips) paint without waiting for the network round-trip.
      try {
        const initial = await listConfigs(walletAddress);
        if (cancelled) return;
        setMap(rowsToMap(initial));
      } catch {
        // IDB unreachable (private mode, etc.) — empty map is the safe
        // default; deriveAgentStatus reads `undefined` → 'paused' for any
        // active agent, which is the conservative bucket.
        if (!cancelled) setMap(new Map());
      }
      // 2) Reconcile against chat-server, then re-read IDB. The reconcile
      // walks IDB rows in parallel, refreshes them from the server, and
      // deletes orphans — so the post-reconcile listConfigs gives us a
      // server-aligned snapshot that matches whatever Settings displays.
      try {
        await reconcileLocalCacheWithServer(walletAddress);
        if (cancelled) return;
        const aligned = await listConfigs(walletAddress);
        if (cancelled) return;
        setMap(rowsToMap(aligned));
      } catch {
        // Server unreachable — keep the optimistic map. Next mount retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, agentSignature]);

  return map;
}

/**
 * Stable signature for a list of agent addresses. Use as the second arg to
 * useEnabledFlagMap so the reconcile re-runs when the set changes (add,
 * remove, or replace), but NOT when the same set is returned by a
 * re-render with a new array reference.
 */
export function agentAddressSignature(
  agents: ReadonlyArray<{ agentAddress: string }> | undefined,
): string {
  if (!agents || agents.length === 0) return '';
  return agents
    .map((a) => a.agentAddress.toLowerCase())
    .sort()
    .join(',');
}
