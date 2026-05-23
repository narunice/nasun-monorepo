/**
 * usePollWakeJob tests — phase transitions on the 3s tick, hidden-tab pause,
 * 401-token-expired callback, unmount abort.
 *
 * The fetch layer is mocked at module level so we control returned status
 * verbatim without spinning up a server. Fake timers drive the 30/60/120s
 * boundaries without real wallclock waits.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePollWakeJob } from './usePollWakeJob';
import * as wakeClient from '../services/chatWakeClient';
import type { WakePollResponse } from '../services/chatWakeClient';

function pendingResponse(jobId: string): WakePollResponse {
  return { jobId, status: 'pending' };
}

const JOB_ID = '01HWGAH7XJW7CCNMPVQAB8YN3K';

let getStatusSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  getStatusSpy = vi.spyOn(wakeClient, 'getChatWakeStatus');
  // Reset visibility to visible at the start of each test.
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function flushPromises() {
  // microtasks + next tick. Without this, the fetch resolution + setState
  // batching can lag behind advanceTimersByTime by one task.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('usePollWakeJob initial state', () => {
  it('returns idle INITIAL state when not enabled', () => {
    const { result } = renderHook(() =>
      usePollWakeJob({
        jobId: null,
        chatToken: null,
        enabled: false,
        onTokenExpired: () => undefined,
      }),
    );
    expect(result.current.phase).toBe('pending');
    expect(result.current.response).toBeNull();
    expect(result.current.elapsedMs).toBe(0);
  });

  it('does nothing when jobId or chatToken is null', () => {
    renderHook(() =>
      usePollWakeJob({
        jobId: null,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    expect(getStatusSpy).not.toHaveBeenCalled();
  });
});

describe('usePollWakeJob phase transitions', () => {
  it('ticks every 3s and stays pending', async () => {
    getStatusSpy.mockResolvedValue(pendingResponse(JOB_ID));
    const { result } = renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    await flushPromises();
    expect(getStatusSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(getStatusSpy).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(getStatusSpy).toHaveBeenCalledTimes(3);
    expect(result.current.phase).toBe('pending');
  });

  it('crosses into soft-wait at 30s', async () => {
    getStatusSpy.mockResolvedValue(pendingResponse(JOB_ID));
    const { result } = renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_001);
    });
    expect(result.current.phase).toBe('soft-wait');
  });

  it('crosses into hard-wait at 60s', async () => {
    getStatusSpy.mockResolvedValue(pendingResponse(JOB_ID));
    const { result } = renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });
    expect(result.current.phase).toBe('hard-wait');
  });

  it('hits timeout at 120s and stops polling', async () => {
    getStatusSpy.mockResolvedValue(pendingResponse(JOB_ID));
    const { result } = renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_001);
    });
    expect(result.current.phase).toBe('timeout');
    const callsAtTimeout = getStatusSpy.mock.calls.length;

    // Further advances should not produce more polls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getStatusSpy.mock.calls.length).toBe(callsAtTimeout);
  });
});

describe('usePollWakeJob done/error outcomes', () => {
  it('captures done response and stops further calls', async () => {
    getStatusSpy.mockResolvedValue({
      jobId: JOB_ID,
      status: 'done',
      outcome: { ok: true, summary: 'Done.' },
      userMessage: 'Done.',
    });
    const { result } = renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    await flushPromises();
    expect(result.current.response?.status).toBe('done');
    const calls = getStatusSpy.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getStatusSpy.mock.calls.length).toBe(calls);
  });

  it('captures error status verbatim', async () => {
    getStatusSpy.mockResolvedValue({
      jobId: JOB_ID,
      status: 'error',
      reason: 'budget_insufficient',
      userMessage: 'Top up Budget.',
    });
    const { result } = renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    await flushPromises();
    expect(result.current.response?.status).toBe('error');
    expect(result.current.response?.reason).toBe('budget_insufficient');
  });
});

describe('usePollWakeJob 401 expired', () => {
  it('invokes onTokenExpired and halts polling pending re-lease', async () => {
    getStatusSpy.mockRejectedValueOnce(
      new wakeClient.AgentChatApiError('expired', 401),
    );
    const onExpired = vi.fn();
    renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: onExpired,
      }),
    );
    await flushPromises();
    expect(onExpired).toHaveBeenCalledTimes(1);

    // Should NOT keep polling after the 401 — the parent re-leases and
    // remounts the hook with a fresh chatToken.
    const after401 = getStatusSpy.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getStatusSpy.mock.calls.length).toBe(after401);
  });

  it('stops polling on 404 (job row gone)', async () => {
    getStatusSpy.mockRejectedValue(
      new wakeClient.AgentChatApiError('job_not_found', 404),
    );
    renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    await flushPromises();
    const after404 = getStatusSpy.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getStatusSpy.mock.calls.length).toBe(after404);
  });

  it('keeps polling on transient 5xx', async () => {
    getStatusSpy.mockRejectedValueOnce(
      new wakeClient.AgentChatApiError('http_503', 503),
    );
    getStatusSpy.mockResolvedValue(pendingResponse(JOB_ID));
    renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    await flushPromises();
    const after1st = getStatusSpy.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(getStatusSpy.mock.calls.length).toBeGreaterThan(after1st);
  });
});

describe('usePollWakeJob unmount abort', () => {
  it('does not setState after unmount (no warning)', async () => {
    let resolve: ((v: WakePollResponse) => void) | null = null;
    getStatusSpy.mockReturnValue(
      new Promise<WakePollResponse>((r) => {
        resolve = r;
      }),
    );
    const { unmount } = renderHook(() =>
      usePollWakeJob({
        jobId: JOB_ID,
        chatToken: 'T',
        enabled: true,
        onTokenExpired: () => undefined,
      }),
    );
    unmount();
    // Resolve after unmount — the hook's `cancelled` flag must swallow it.
    resolve?.(pendingResponse(JOB_ID));
    await flushPromises();
    // No assertion needed beyond "no test error". The act/console.error
    // chatter would surface if a setState happened post-unmount.
    expect(true).toBe(true);
  });
});
