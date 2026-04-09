/**
 * useGenesisPass Hook
 * Checks Genesis Pass ownership via nasun-website API.
 * Uses 3-hop DynamoDB lookup: Nasun address -> EVM address -> NFT ownership snapshot.
 * Results cached in localStorage (1h TTL).
 */

import { useState, useEffect } from 'react';
import { useSignerAddress } from '@nasun/wallet';

const GP_API = import.meta.env.VITE_GENESIS_PASS_API || '';
const CACHE_KEY = 'pado:gp-status';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  addr: string;
  value: boolean;
  ts: number;
}

export function useGenesisPass(): boolean {
  const address = useSignerAddress();
  const [hasGenesisPass, setHasGenesisPass] = useState(false);

  useEffect(() => {
    if (!address || !GP_API) return;
    let cancelled = false;

    // Check localStorage cache
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const entry: CacheEntry = JSON.parse(cached);
        if (entry.addr === address && Date.now() - entry.ts < CACHE_TTL_MS) {
          setHasGenesisPass(entry.value);
          return;
        }
      }
    } catch { /* ignore parse errors */ }

    (async () => {
      try {
        const res = await fetch(
          `${GP_API}/genesis-pass/check?nasunAddress=${encodeURIComponent(address)}`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;

        const value = json.success === true && json.data?.hasGenesisPass === true;
        setHasGenesisPass(value);

        try {
          const entry: CacheEntry = { addr: address, value, ts: Date.now() };
          localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
        } catch { /* localStorage full */ }
      } catch { /* silent fail - badge simply won't show */ }
    })();

    return () => { cancelled = true; };
  }, [address]);

  return hasGenesisPass;
}
