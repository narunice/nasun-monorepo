/**
 * Tests for aer-heartbeat.ts: watchdog start/stop, stale + grace + cooldown
 * windows, env-var parsing (sub-minute / NaN / negative / exponential fallback),
 * Telegram fallback chain, and cooldown engagement on send failure.
 *
 * Module has module-scope state (lastLandedAt, lastAlertAt, startedAt). Each
 * test calls startAerHeartbeatWatchdog() which resets that state, so tests are
 * order-independent within a fresh process. The setInterval timer is cleaned
 * up across tests by the idempotent clearInterval() inside the same function.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dotenv to keep env loading deterministic
vi.mock('dotenv/config', () => ({}));

// Mock telegram.js so we can observe outbound sends without network IO
vi.mock('./telegram.js', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(true),
}));

import { startAerHeartbeatWatchdog, recordAerLanded, _heartbeatState } from './aer-heartbeat.js';
import * as telegram from './telegram.js';

const sendMock = telegram.sendTelegramMessage as unknown as ReturnType<typeof vi.fn>;

const ENV_KEYS = [
  'TELEGRAM_ALERT_BOT_TOKEN',
  'TELEGRAM_ALERT_CHAT_ID',
  'TELEGRAM_BOT_TOKEN',
  'AER_HEARTBEAT_STALE_MIN',
  'AER_HEARTBEAT_COOLDOWN_MIN',
] as const;

function clearAlertEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

function startWatchdog(overrides: {
  intervalMinutes?: number;
  staleMs?: number;
  cooldownMs?: number;
  checkIntervalMs?: number;
  agentAddress?: string;
  log?: (msg: string) => void;
} = {}) {
  const log = overrides.log ?? vi.fn();
  startAerHeartbeatWatchdog({
    agentAddress: overrides.agentAddress ?? '0x' + 'a'.repeat(64),
    intervalMinutes: overrides.intervalMinutes ?? 5,
    log,
    staleMs: overrides.staleMs,
    cooldownMs: overrides.cooldownMs,
    checkIntervalMs: overrides.checkIntervalMs ?? 60_000,
  });
  return log as ReturnType<typeof vi.fn>;
}

describe('recordAerLanded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
    clearAlertEnv();
    sendMock.mockClear();
    sendMock.mockResolvedValue(true);
    startWatchdog();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearAlertEnv();
  });

  it('updates lastLandedAt to current time', () => {
    const before = _heartbeatState().lastLandedAt;
    vi.advanceTimersByTime(60_000);
    recordAerLanded();
    const after = _heartbeatState().lastLandedAt;
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(Date.now());
  });
});

describe('parseMinutesEnv via AER_HEARTBEAT_STALE_MIN', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
    clearAlertEnv();
    sendMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearAlertEnv();
  });

  it('rejects exponential notation that resolves below 1 minute', async () => {
    process.env.AER_HEARTBEAT_STALE_MIN = '1e-3';
    const log = startWatchdog({ intervalMinutes: 30 });
    // Stale should fall back to max(2*30, 5) = 60 minutes (NOT 60ms which would
    // happen if 1e-3 minutes was accepted). Verify via the watchdog start log.
    const startLog = log.mock.calls.find((c) => String(c[0]).startsWith('[heartbeat-watchdog] stale'));
    expect(startLog?.[0]).toContain('stale=60min');
  });

  it('rejects NaN strings', () => {
    process.env.AER_HEARTBEAT_STALE_MIN = 'not-a-number';
    const log = startWatchdog({ intervalMinutes: 5 });
    const startLog = log.mock.calls.find((c) => String(c[0]).startsWith('[heartbeat-watchdog] stale'));
    // 5min interval gives default of max(2*5, 5) = 10 minutes.
    expect(startLog?.[0]).toContain('stale=10min');
  });

  it('rejects negative values', () => {
    process.env.AER_HEARTBEAT_STALE_MIN = '-5';
    const log = startWatchdog({ intervalMinutes: 5 });
    const startLog = log.mock.calls.find((c) => String(c[0]).startsWith('[heartbeat-watchdog] stale'));
    expect(startLog?.[0]).toContain('stale=10min');
  });

  it('rejects zero', () => {
    process.env.AER_HEARTBEAT_STALE_MIN = '0';
    const log = startWatchdog({ intervalMinutes: 5 });
    const startLog = log.mock.calls.find((c) => String(c[0]).startsWith('[heartbeat-watchdog] stale'));
    expect(startLog?.[0]).toContain('stale=10min');
  });

  it('accepts valid minutes (overrides interval-derived default)', () => {
    process.env.AER_HEARTBEAT_STALE_MIN = '20';
    const log = startWatchdog({ intervalMinutes: 5 });
    const startLog = log.mock.calls.find((c) => String(c[0]).startsWith('[heartbeat-watchdog] stale'));
    expect(startLog?.[0]).toContain('stale=20min');
  });
});

describe('intervalMinutes-derived stale window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
    clearAlertEnv();
    sendMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearAlertEnv();
  });

  it('scales stale window to 2x interval (30min interval -> 60min stale)', () => {
    const log = startWatchdog({ intervalMinutes: 30 });
    const startLog = log.mock.calls.find((c) => String(c[0]).startsWith('[heartbeat-watchdog] stale'));
    expect(startLog?.[0]).toContain('stale=60min');
  });

  it('enforces 5-minute floor for sub-2.5min intervals', () => {
    const log = startWatchdog({ intervalMinutes: 2 });
    const startLog = log.mock.calls.find((c) => String(c[0]).startsWith('[heartbeat-watchdog] stale'));
    // max(2*2, 5) = 5
    expect(startLog?.[0]).toContain('stale=5min');
  });
});

describe('startup grace + stale + cooldown windows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
    clearAlertEnv();
    sendMock.mockClear();
    sendMock.mockResolvedValue(true);
    process.env.TELEGRAM_ALERT_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_ALERT_CHAT_ID = '-100123456';
  });
  afterEach(() => {
    vi.useRealTimers();
    clearAlertEnv();
  });

  it('does not alert during startup grace window', async () => {
    // intervalMinutes=5 -> staleMs=10min, graceMs=max(2*10, 2*5, 10) = 20min
    startWatchdog({ intervalMinutes: 5 });
    // Advance to 15 minutes; past stale but within grace
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('alerts once grace elapses and stale threshold is exceeded', async () => {
    startWatchdog({ intervalMinutes: 5 });
    // grace = 20min, stale = 10min. After 21 minutes total without an AER:
    // sinceStart > grace AND sinceLast > stale → alert fires.
    await vi.advanceTimersByTimeAsync(21 * 60_000);
    expect(sendMock).toHaveBeenCalled();
    const msg = sendMock.mock.calls[0][2] as string;
    expect(msg).toContain('AER heartbeat stalled');
  });

  it('cooldown suppresses repeated alerts within cooldown window', async () => {
    // staleMs=10, cooldownMs=30 (default), graceMs=20
    startWatchdog({ intervalMinutes: 5 });
    await vi.advanceTimersByTimeAsync(21 * 60_000); // first alert
    expect(sendMock).toHaveBeenCalledTimes(1);

    // Next watchdog tick fires every 60s; within cooldown (<30min since last alert),
    // sendMock must not be called again.
    await vi.advanceTimersByTimeAsync(25 * 60_000);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('cooldown elapsed allows a second alert', async () => {
    startWatchdog({ intervalMinutes: 5, cooldownMs: 10 * 60_000 }); // 10-min cooldown
    await vi.advanceTimersByTimeAsync(21 * 60_000); // first alert
    expect(sendMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(11 * 60_000); // past cooldown, still stale
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('recordAerLanded resets the stale clock and prevents alerts', async () => {
    startWatchdog({ intervalMinutes: 5 });
    // Advance partway through grace
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    recordAerLanded();
    // Advance another 9 minutes (just under stale window of 10min from the
    // reset). Still past startup grace, but sinceLast < staleMs → no alert.
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('Telegram channel and fallback chain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
    clearAlertEnv();
    sendMock.mockClear();
    sendMock.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    clearAlertEnv();
  });

  it('log-only mode when TELEGRAM_ALERT_CHAT_ID is unset', async () => {
    // No chat id at all
    process.env.TELEGRAM_ALERT_BOT_TOKEN = 'present-but-no-chat';
    const log = startWatchdog({ intervalMinutes: 5 });
    const startLog = log.mock.calls.find((c) => String(c[0]).startsWith('[heartbeat-watchdog] stale'));
    expect(startLog?.[0]).toContain('alert=log-only');

    await vi.advanceTimersByTimeAsync(21 * 60_000);
    expect(sendMock).not.toHaveBeenCalled();
    // Log line for the stale state should still be emitted.
    const staleLog = log.mock.calls.find((c) => String(c[0]).includes('STALE'));
    expect(staleLog).toBeDefined();
  });

  it('logs but does not send when TELEGRAM_ALERT_BOT_TOKEN is unset', async () => {
    process.env.TELEGRAM_ALERT_CHAT_ID = '-100abc';
    const log = startWatchdog({ intervalMinutes: 5 });
    await vi.advanceTimersByTimeAsync(21 * 60_000);
    expect(sendMock).not.toHaveBeenCalled();
    const staleLog = log.mock.calls.find((c) => String(c[0]).includes('STALE'));
    expect(staleLog).toBeDefined();
  });
});

describe('CR-2: cooldown engaged on send failure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
    clearAlertEnv();
    sendMock.mockClear();
    process.env.TELEGRAM_ALERT_BOT_TOKEN = 'test-bot';
    process.env.TELEGRAM_ALERT_CHAT_ID = '-100abc';
  });
  afterEach(() => {
    vi.useRealTimers();
    clearAlertEnv();
  });

  it('updates lastAlertAt even when Telegram send returns false', async () => {
    sendMock.mockResolvedValue(false);
    const log = startWatchdog({ intervalMinutes: 5, cooldownMs: 10 * 60_000 });
    await vi.advanceTimersByTimeAsync(21 * 60_000);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const failLog = log.mock.calls.find((c) => String(c[0]).includes('Telegram alert send failed'));
    expect(failLog).toBeDefined();

    // Within cooldown: no retry (this is the regression fix).
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sendMock).toHaveBeenCalledTimes(1);

    // After cooldown: retry allowed.
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
