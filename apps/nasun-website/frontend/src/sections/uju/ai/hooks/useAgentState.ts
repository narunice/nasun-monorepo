/**
 * Phase 8 — unified agent state hook.
 *
 * Single GET against chat-server. The 3-state model (activated/paused/
 * killed) is derived backend-side from on-chain AgentProfile.is_active +
 * server-side config.enabled, so a polling browser cannot drift between
 * three hooks each with their own cadence.
 *
 * Polling cadence: 5s for the first minute after mount / refresh()
 * (catches reconcile actions taken on the chat-server in response to a
 * mutation), then 30s steady state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAgentState,
  type AgentDerivedState,
  type AgentRuntime,
  type AgentStateResponse,
} from '../services/agentStateClient';

const FAST_INTERVAL_MS = 5_000;
const SLOW_INTERVAL_MS = 30_000;
const FAST_WINDOW_MS = 60_000;
const CATCHUP_DELAY_MS = 1_000;

export interface UseAgentStateResult {
  state: AgentDerivedState;
  runtime: AgentRuntime;
  data: AgentStateResponse | null;
  loading: boolean;
  error: string | null;
  /** Force an immediate fetch + enter the fast-poll window. */
  refresh: () => Promise<void>;
  /**
   * Invalidate + fetch once now and once again after CATCHUP_DELAY_MS so
   * the UI catches a backend reconcile that takes ~spawn-time to complete.
   */
  invalidate: () => Promise<void>;
}

export function useAgentState(agentAddress: string | null): UseAgentStateResult {
  const [data, setData] = useState<AgentStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fastUntilRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catchupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const tick = useCallback(async () => {
    if (!agentAddress) return;
    setLoading(true);
    try {
      const next = await fetchAgentState(agentAddress);
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

  const invalidate = useCallback(async () => {
    await refresh();
    // Catch reconcile that completes a beat after the mutation handler
    // returned (PM2 spawn is async even though we await the orchestrator
    // call). Tracked so an unmount during the gap clears the timer.
    if (catchupTimerRef.current) clearTimeout(catchupTimerRef.current);
    catchupTimerRef.current = setTimeout(() => {
      catchupTimerRef.current = null;
      void tick();
    }, CATCHUP_DELAY_MS);
  }, [refresh, tick]);

  // Reset cached state on agent change so the previous agent's badge does
  // not leak across navigation (mirrors useAgentVaultStatus 2026-05-23 fix).
  useEffect(() => {
    setData(null);
    setError(null);
  }, [agentAddress]);

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
      if (catchupTimerRef.current) {
        clearTimeout(catchupTimerRef.current);
        catchupTimerRef.current = null;
      }
    };
  }, [agentAddress, tick]);

  return {
    state: data?.state ?? 'unknown',
    runtime: data?.runtime ?? 'stopped',
    data,
    loading,
    error,
    refresh,
    invalidate,
  };
}
