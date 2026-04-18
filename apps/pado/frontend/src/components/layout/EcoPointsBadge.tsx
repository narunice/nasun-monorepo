/**
 * EcoPointsBadge - Compact Ecosystem Points display for Header.
 * Fetches score from explorer-api via wallet address lookup.
 */

import { useState, useEffect } from 'react';
import { useSignerAddress, useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';

const EXPLORER_API = import.meta.env.VITE_EXPLORER_API_URL || '';

interface EcoScore {
  score: number;
  isPenalized: boolean;
  disabled: boolean;
}

export function EcoPointsBadge() {
  const address = useSignerAddress();
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = isZkLoggedIn || (status === 'unlocked' && account) || isPasskeyUnlocked;
  const [data, setData] = useState<EcoScore | null>(null);

  useEffect(() => {
    if (!isConnected || !address || !EXPLORER_API) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${EXPLORER_API}/ecosystem/score/wallet/${address}`, {
          redirect: 'follow',
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled && json.data) {
          setData({
            score: json.data.allTime?.ecosystemScore ?? 0,
            isPenalized: json.data.isPenalized ?? false,
            disabled: json.data.disabled ?? false,
          });
        }
      } catch {
        // Silent fail
      }
    })();

    return () => { cancelled = true; };
  }, [address, isConnected]);

  if (!isConnected || data === null) return null;

  const penalized = data.isPenalized || data.disabled;

  const tooltip = penalized
    ? 'Ecosystem Points (Inactive - be active 2 days to recover)'
    : `Ecosystem Points: ${data.score.toLocaleString('en-US', { maximumFractionDigits: 0 })} (All Time)`;

  return (
    <div
      className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium cursor-default ${
        penalized
          ? 'bg-zinc-500/10 text-zinc-500'
          : 'bg-emerald-500/10 text-emerald-400'
      }`}
      title={tooltip}
    >
      {data.score.toLocaleString('en-US', { maximumFractionDigits: 0 })} pts
    </div>
  );
}
