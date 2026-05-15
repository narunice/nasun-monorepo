/**
 * PR2.B — Poll the chat-server vault status endpoint for an agent.
 *
 * Cadence: 5s for the first minute (covers the spawn → first heartbeat
 * window), then 30s. Caller can `refresh()` to force an immediate fetch
 * after Activate/Deactivate/Restore mutations.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVaultStatus, type VaultStatusResponse, type VaultState } from '../services/agentVaultClient';

const FAST_INTERVAL_MS = 5_000;
const SLOW_INTERVAL_MS = 30_000;
const FAST_WINDOW_MS = 60_000;

interface UseAgentVaultStatus {
  state: VaultState;
  graceEndsAt: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAgentVaultStatus(agentAddress: string | null): UseAgentVaultStatus {
  const [data, setData] = useState<VaultStatusResponse>({ state: 'not_vaulted', graceEndsAt: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fastUntilRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const tick = useCallback(async () => {
    if (!agentAddress) return;
    setLoading(true);
    try {
      const next = await fetchVaultStatus(agentAddress);
      if (!mountedRef.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [agentAddress]);

  const refresh = useCallback(async () => {
    fastUntilRef.current = Date.now() + FAST_WINDOW_MS;
    await tick();
  }, [tick]);

  useEffect(() => {
    mountedRef.current = true;
    if (!agentAddress) return;
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      await tick();
      if (cancelled) return;
      const interval = Date.now() < fastUntilRef.current ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
      timerRef.current = setTimeout(loop, interval);
    };
    fastUntilRef.current = Date.now() + FAST_WINDOW_MS;
    void loop();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [agentAddress, tick]);

  return { state: data.state, graceEndsAt: data.graceEndsAt, loading, error, refresh };
}
