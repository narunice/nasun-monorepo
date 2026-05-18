/**
 * useGenesisPassFor — Genesis Pass holder check for an arbitrary wallet.
 *
 * Unlike pado's useGenesisPass (which only checks the connected signer),
 * gostop leaderboards / round modals need the GP flag for *other* players'
 * wallets. We hit the same shared Lambda (`/genesis-pass/check?nasunAddress=…`)
 * the ecosystem already runs, with a per-wallet localStorage cache (1h TTL)
 * so repeat views don't redo the 3-hop DynamoDB lookup.
 *
 * Result is purely decorative — if VITE_GENESIS_PASS_API is unset or the
 * request fails, we silently return false and the badge simply does not
 * render.
 */

import { useEffect, useState } from 'react';

const GP_API =
  (import.meta.env.VITE_GENESIS_PASS_API as string | undefined) ?? '';
const CACHE_PREFIX = 'gostop:gp:';
const CACHE_TTL_MS = 60 * 60 * 1000;
// Nasun wallet = 0x + 64 hex chars. The check Lambda 400s otherwise.
const NASUN_ADDRESS_RE = /^0x[a-f0-9]{64}$/;

interface CacheEntry {
  v: boolean;
  t: number;
}

export function useGenesisPassFor(
  walletAddress: string | null | undefined,
): boolean {
  const [hasGenesisPass, setHasGenesisPass] = useState(false);

  useEffect(() => {
    if (!GP_API) return;
    if (!walletAddress) {
      setHasGenesisPass(false);
      return;
    }
    const addr = walletAddress.toLowerCase();
    if (!NASUN_ADDRESS_RE.test(addr)) {
      setHasGenesisPass(false);
      return;
    }

    const cacheKey = `${CACHE_PREFIX}${addr}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const entry = JSON.parse(cached) as CacheEntry;
        if (Date.now() - entry.t < CACHE_TTL_MS) {
          setHasGenesisPass(entry.v);
          return;
        }
      }
    } catch {
      /* malformed cache entry — fall through to network */
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${GP_API}/genesis-pass/check?nasunAddress=${encodeURIComponent(addr)}`,
        );
        if (cancelled || !res.ok) return;
        const json = (await res.json()) as {
          success?: boolean;
          data?: { hasGenesisPass?: boolean };
        };
        if (cancelled) return;
        const v = json.success === true && json.data?.hasGenesisPass === true;
        setHasGenesisPass(v);
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ v, t: Date.now() } satisfies CacheEntry),
          );
        } catch {
          /* localStorage quota — non-fatal */
        }
      } catch {
        /* network or parse error — badge simply will not render */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  return hasGenesisPass;
}
