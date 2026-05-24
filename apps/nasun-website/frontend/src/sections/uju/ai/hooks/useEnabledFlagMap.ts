/**
 * Batch-friendly read of trader-config `enabled` flags for every agent owned
 * by a wallet. Returns Map<agentAddressLower, enabled>.
 *
 * Why not just useTraderConfig per agent: filter-chip counts in AgentsList
 * need to bucket *all* agents into active/paused/inactive up-front, which
 * we cannot do with N parent-level hook calls (React rules). One IDB
 * listConfigs is much cheaper than N server fetches anyway, and the
 * Phase 5 reconcileLocalCacheOnce keeps IDB in agreement with chat-server
 * within one session of the user opening the page.
 *
 * Reads from IndexedDB only — for the filter-bucket display this is
 * authoritative-enough; individual AgentCards still call useTraderConfig
 * to render details (per-card UI keeps its own server-first read).
 */
import { useEffect, useState } from 'react';
import { listConfigs } from '../services/traderConfigStorage';

export function useEnabledFlagMap(
  walletAddress: string | null | undefined,
): Map<string, boolean> {
  const [map, setMap] = useState<Map<string, boolean>>(() => new Map());

  useEffect(() => {
    if (!walletAddress) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listConfigs(walletAddress);
        if (cancelled) return;
        const next = new Map<string, boolean>();
        for (const row of rows) {
          next.set(row.agentAddress.toLowerCase(), row.enabled === true);
        }
        setMap(next);
      } catch {
        // IDB unreachable (private mode, etc.) — empty map is the safe
        // default; deriveAgentStatus reads `undefined` → 'paused' for any
        // active agent, which is the conservative bucket.
        if (!cancelled) setMap(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  return map;
}
