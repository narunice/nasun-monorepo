// Regression guard: maybeNotifyHeartbeat must be called from the autonomous
// interval entry (runTraderCyclePresetEntry) but NEVER from the wake-triggered
// entry (runHeartbeatFromWake). chat-server already replies to the user's
// Telegram in-band via wake-proxy's HTTP response; a notify call here would
// produce a duplicate push.
//
// We mock both ../presets/trader-cycle.js (so we don't run a real cycle) and
// ../notify.js (so we can assert call presence). The traderRuntime module
// constant is built from the mocked newTraderCycleRuntime at import time.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TraderCycleResult } from '../presets/trader-cycle.js';

const fakeResult: TraderCycleResult = {
  outcome: 'succeeded',
  txDigest: 'abc',
  finalEventClass: 2,
  decision: { action: 'BUY', sizeNUSDC: 100, reason: 'test' },
};

vi.mock('../presets/trader-cycle.js', () => ({
  runTraderCycle: vi.fn(async () => fakeResult),
  newTraderCycleRuntime: vi.fn(() => ({
    intentChain: {},
    state: {},
    cachedEscrowInitialSharedVersion: { value: null },
    cachedCapabilityInitialSharedVersion: { value: null },
  })),
}));

vi.mock('../notify.js', () => ({
  maybeNotifyHeartbeat: vi.fn(async () => undefined),
}));

vi.mock('../lifecycle.js', () => ({
  requestShutdown: vi.fn(),
}));

import { runTraderCyclePresetEntry, runHeartbeatFromWake } from './trader-runner.js';
import { maybeNotifyHeartbeat } from '../notify.js';
import type { SuiClient } from '@mysten/sui/client';
import type { Config } from '../config.js';
import type { WakeContext } from '../wake-router.js';

const fakeClient = {} as SuiClient;
const fakeConfig = {} as Config;
const fakeWakeCtx = {} as WakeContext;

beforeEach(() => {
  vi.mocked(maybeNotifyHeartbeat).mockClear();
});

describe('trader-runner notify wiring', () => {
  it('runTraderCyclePresetEntry triggers maybeNotifyHeartbeat', async () => {
    await runTraderCyclePresetEntry(fakeClient, fakeConfig);
    // void-fired; allow microtask to drain
    await Promise.resolve();
    expect(maybeNotifyHeartbeat).toHaveBeenCalledTimes(1);
    const [resultArg] = vi.mocked(maybeNotifyHeartbeat).mock.calls[0];
    expect(resultArg.outcome).toBe('succeeded');
  });

  it('runHeartbeatFromWake does NOT trigger maybeNotifyHeartbeat', async () => {
    await runHeartbeatFromWake(fakeClient, fakeConfig, fakeWakeCtx);
    await Promise.resolve();
    expect(maybeNotifyHeartbeat).not.toHaveBeenCalled();
  });
});
