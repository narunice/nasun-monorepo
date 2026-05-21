/**
 * Adaptive-interval polling for the connected wallet's alpha state.
 *
 * Interval scales by state — invited/warned-active polls fast so the UI
 * surfaces lifecycle transitions promptly; waiting polls slowly to
 * minimize chat-server load with N queue members. none/expired don't
 * poll at all (user action triggers a refetch).
 *
 *   active (warned) / invited     → 30s
 *   active (not warned) / paused  → 60s
 *   waiting                       → 120s
 *   none / expired / exempt       → on-demand only
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAlphaStatus, type AlphaStatusResponse, type AlphaUserState } from './alphaApiClient';

function intervalForState(state: AlphaUserState, warned: boolean): number | null {
  if (state === 'invited') return 30_000;
  if (state === 'active') return warned ? 30_000 : 60_000;
  if (state === 'paused') return 60_000;
  if (state === 'waiting') return 120_000;
  return null;
}

export interface UseAlphaStatus {
  status: AlphaStatusResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAlphaStatus(walletAddress: string | null | undefined): UseAlphaStatus {
  const [status, setStatus] = useState<AlphaStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Track the latest fetch token so a stale response from a previous wallet
  // can't overwrite a fresh one.
  const seqRef = useRef(0);

  const run = useCallback(
    async (wallet: string) => {
      const seq = ++seqRef.current;
      setLoading(true);
      try {
        const data = await fetchAlphaStatus(wallet);
        if (seq !== seqRef.current) return;
        setStatus(data);
        setError(null);
      } catch (err) {
        if (seq !== seqRef.current) return;
        setError((err as Error).message || 'fetch_failed');
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [],
  );

  // Initial fetch + on wallet change. Bumping seqRef on a wallet swap
  // invalidates any in-flight request from the previous wallet.
  useEffect(() => {
    if (!walletAddress) {
      seqRef.current++;
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }
    void run(walletAddress);
  }, [walletAddress, run]);

  // Adaptive polling. Re-evaluates interval whenever the state changes,
  // which is the right scope — manual refetch() doesn't reset the timer.
  useEffect(() => {
    if (!walletAddress || !status) return;
    const ms = intervalForState(status.state, status.warned === true);
    if (ms === null) return;
    const id = window.setInterval(() => {
      void run(walletAddress);
    }, ms);
    return () => window.clearInterval(id);
  }, [walletAddress, status, run]);

  const refetch = useCallback(() => {
    if (walletAddress) void run(walletAddress);
  }, [walletAddress, run]);

  return { status, loading, error, refetch };
}
