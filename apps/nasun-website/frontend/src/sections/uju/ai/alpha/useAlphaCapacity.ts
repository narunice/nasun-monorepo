/**
 * Polls the PUBLIC alpha capacity endpoint (/api/nasun-ai/alpha/capacity).
 *
 * Unlike useAlphaStatus this needs no wallet and is identical for every
 * viewer; it powers the always-visible capacity widget. Keeping it separate
 * from the per-wallet status means the queue numbers still render when a
 * user's status is unavailable (not on the waitlist, exempt, fetch error).
 */

import { useEffect, useState } from 'react';
import { fetchAlphaCapacity, type AlphaCapacity } from './alphaApiClient';

const POLL_MS = 60_000;

// `enabled` lets callers skip polling when the widget can't be shown (e.g. the
// AI tab renders NotConnected before any wallet). The hook itself is always
// called unconditionally; only the effect's work is gated.
export function useAlphaCapacity(enabled = true): AlphaCapacity | null {
  const [capacity, setCapacity] = useState<AlphaCapacity | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => {
      fetchAlphaCapacity()
        .then((c) => {
          if (active) setCapacity(c);
        })
        .catch(() => {
          // Transient/network errors keep the last good value; the widget
          // simply doesn't update this cycle rather than flickering to empty.
        });
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [enabled]);

  return capacity;
}
