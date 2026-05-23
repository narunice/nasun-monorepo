/**
 * Polling driver for a single in-flight wake job.
 *
 * Lifecycle:
 *   - 3000ms tick GET /chat/wake/:jobId
 *   - 30s phase → 'soft-wait', 60s → 'hard-wait', 120s → 'timeout'
 *   - On 401 expired, signal the parent (onTokenExpired). The parent re-leases
 *     and starts a fresh poll with the same jobId — server stores outcomes
 *     against the jobId, so a new chatToken can still claim them.
 *   - On document.hidden ≥ 60s, pause the interval to bound chat-server load
 *     from background tabs. visibilitychange → resume.
 *   - On unmount, AbortController cancels the in-flight fetch.
 *
 * Returned state is read by `useChatWake` to feed AssistantMessage.wakePhase
 * and to flip the placeholder message to done/error.
 */

import { useEffect, useRef, useState } from 'react';
import {
  AgentChatApiError,
  getChatWakeStatus,
  type WakePollResponse,
} from '../services/chatWakeClient';

const TICK_MS = 3_000;
const SOFT_WAIT_MS = 30_000;
const HARD_WAIT_MS = 60_000;
const TIMEOUT_MS = 120_000;
const HIDDEN_PAUSE_MS = 60_000;

export type PollPhase = 'pending' | 'soft-wait' | 'hard-wait' | 'timeout';

export interface PollState {
  phase: PollPhase;
  /** Final response when status is done/error. Null while pending. */
  response: WakePollResponse | null;
  /** Set when the poll itself failed (not job status='error'). */
  pollError: AgentChatApiError | null;
  /** ms since polling started, for UI countdown. */
  elapsedMs: number;
}

export interface UsePollWakeJobInput {
  jobId: string | null;
  chatToken: string | null;
  enabled: boolean;
  onTokenExpired: () => void;
}

const INITIAL: PollState = { phase: 'pending', response: null, pollError: null, elapsedMs: 0 };

export function usePollWakeJob(input: UsePollWakeJobInput): PollState {
  const { jobId, chatToken, enabled, onTokenExpired } = input;
  const [state, setState] = useState<PollState>(INITIAL);
  // Latest expired-callback ref so the polling loop never closes over a
  // stale callback after a token re-lease.
  const onExpiredRef = useRef(onTokenExpired);
  useEffect(() => {
    onExpiredRef.current = onTokenExpired;
  }, [onTokenExpired]);

  useEffect(() => {
    if (!enabled || !jobId || !chatToken) {
      setState(INITIAL);
      return undefined;
    }

    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let abort: AbortController | null = null;
    let cancelled = false;
    let hiddenSince: number | null = document.hidden ? Date.now() : null;
    setState({ phase: 'pending', response: null, pollError: null, elapsedMs: 0 });

    const computePhase = (elapsedMs: number): PollPhase => {
      if (elapsedMs >= TIMEOUT_MS) return 'timeout';
      if (elapsedMs >= HARD_WAIT_MS) return 'hard-wait';
      if (elapsedMs >= SOFT_WAIT_MS) return 'soft-wait';
      return 'pending';
    };

    const tick = async () => {
      if (cancelled) return;
      const elapsedMs = Date.now() - startedAt;
      const phase = computePhase(elapsedMs);

      if (phase === 'timeout') {
        setState((prev) => ({ ...prev, phase: 'timeout', elapsedMs }));
        return;
      }

      // Pause when the tab has been hidden long enough to amortize the
      // re-poll cost. Resume happens via visibilitychange handler below.
      if (hiddenSince !== null && Date.now() - hiddenSince >= HIDDEN_PAUSE_MS) {
        setState((prev) => ({ ...prev, phase, elapsedMs }));
        timer = setTimeout(tick, TICK_MS);
        return;
      }

      abort = new AbortController();
      try {
        const res = await getChatWakeStatus(jobId, chatToken, abort.signal);
        if (cancelled) return;
        if (res.status === 'done' || res.status === 'error') {
          setState({ phase, response: res, pollError: null, elapsedMs });
          return;
        }
        setState({ phase, response: null, pollError: null, elapsedMs });
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name === 'AbortError') return;
        if (err instanceof AgentChatApiError) {
          if (err.code === 'expired') {
            // Bubble up so the parent re-leases. Don't schedule another
            // tick — the parent will reseed this hook with a fresh token.
            onExpiredRef.current();
            return;
          }
          setState((prev) => ({ ...prev, phase, pollError: err, elapsedMs }));
          // Continue polling on transient errors (network blip, 5xx) but
          // stop on 404 — the job row is gone, no value in re-asking.
          if (err.httpStatus === 404) return;
        } else {
          setState((prev) => ({
            ...prev,
            phase,
            pollError: new AgentChatApiError('client_network_error', 0),
            elapsedMs,
          }));
        }
      }
      if (cancelled) return;
      timer = setTimeout(tick, TICK_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
      } else if (hiddenSince !== null) {
        hiddenSince = null;
        // Tab just came back. Cancel any pending sleep and tick immediately
        // so the user sees fresh status without waiting up to TICK_MS.
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        void tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (abort) abort.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, jobId, chatToken]);

  return state;
}
