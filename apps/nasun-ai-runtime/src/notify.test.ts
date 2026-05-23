import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

import { maybeNotifyHeartbeat, formatHeartbeatHtml, __testing__ } from './notify.js';
import type { TraderCycleResult } from './presets/trader-cycle.js';

const SECRET_HEX = 'a'.repeat(64);
const WALLET = '0x' + '1'.repeat(64);

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    HEARTBEAT_PUSH_ENABLED: 'true',
    WALLET_ADDRESS: WALLET,
    CHAT_SERVER_BASE_URL: 'http://localhost:3101',
    BARAM_CHAT_SERVER_HMAC_SECRET: SECRET_HEX,
    STRATEGY: 'conservative_dca',
    ...overrides,
  };
}

function succeededBuy(overrides: Partial<TraderCycleResult> = {}): TraderCycleResult {
  return {
    outcome: 'succeeded',
    txDigest: 'abc123',
    finalEventClass: 2,
    decision: {
      action: 'BUY',
      sizeNUSDC: 120,
      reason: 'BTC dipped to support after Fed minutes.',
    },
    ...overrides,
  };
}

function mockFetchOk(json: Record<string, unknown> = { ok: true, delivered: true }) {
  return vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }));
}

describe('shouldNotify', () => {
  const { shouldNotify } = __testing__;

  it('skips when HEARTBEAT_PUSH_ENABLED is not "true"', () => {
    expect(shouldNotify(succeededBuy(), baseEnv({ HEARTBEAT_PUSH_ENABLED: 'false' }))).toBe(false);
    expect(shouldNotify(succeededBuy(), baseEnv({ HEARTBEAT_PUSH_ENABLED: undefined }))).toBe(false);
  });

  it('skips when WALLET_ADDRESS missing', () => {
    expect(shouldNotify(succeededBuy(), baseEnv({ WALLET_ADDRESS: undefined }))).toBe(false);
  });

  it('skips when CHAT_SERVER_BASE_URL missing', () => {
    expect(shouldNotify(succeededBuy(), baseEnv({ CHAT_SERVER_BASE_URL: undefined }))).toBe(false);
  });

  it('skips when BARAM_CHAT_SERVER_HMAC_SECRET missing', () => {
    expect(shouldNotify(succeededBuy(), baseEnv({ BARAM_CHAT_SERVER_HMAC_SECRET: undefined }))).toBe(false);
  });

  it('skips HOLD action even on succeeded outcome', () => {
    const r = succeededBuy({ decision: { action: 'HOLD', sizeNUSDC: 0, reason: 'low vol' } });
    expect(shouldNotify(r, baseEnv())).toBe(false);
  });

  it('skips non-succeeded outcomes (pending_lock, insufficient_balance, etc.)', () => {
    expect(shouldNotify({ outcome: 'pending_lock' }, baseEnv())).toBe(false);
    expect(shouldNotify({ outcome: 'insufficient_balance' }, baseEnv())).toBe(false);
    expect(shouldNotify({ outcome: 'infer_failed' }, baseEnv())).toBe(false);
    expect(shouldNotify({ outcome: 'parse_failed' }, baseEnv())).toBe(false);
  });

  it('allows succeeded BUY', () => {
    expect(shouldNotify(succeededBuy(), baseEnv())).toBe(true);
  });

  it('allows succeeded SELL', () => {
    const r = succeededBuy({ decision: { action: 'SELL', sizeNUSDC: 80, reason: 'tp hit' } });
    expect(shouldNotify(r, baseEnv())).toBe(true);
  });
});

describe('formatHeartbeatHtml', () => {
  const explorerBase = 'https://explorer.nasun.io/devnet/tx';

  it('escapes HTML in decision.reason', () => {
    const r = succeededBuy({
      decision: { action: 'BUY', sizeNUSDC: 50, reason: '<script>alert(1)</script>' },
    });
    const html = formatHeartbeatHtml(r, 'conservative_dca', explorerBase);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes HTML in strategy label', () => {
    const html = formatHeartbeatHtml(succeededBuy(), '<b>evil</b>', explorerBase);
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;');
    expect(html).not.toContain('[Nasun AI · <b>evil</b>]');
  });

  it('Phase 7: includes agent name in header when provided', () => {
    const html = formatHeartbeatHtml(
      succeededBuy(),
      'aggressive_scalper',
      explorerBase,
      { agentName: 'Santa' },
    );
    expect(html).toContain('[Nasun AI · Santa · aggressive_scalper]');
  });

  it('Phase 7: omits name prefix when agentName empty/whitespace', () => {
    const html = formatHeartbeatHtml(
      succeededBuy(),
      'aggressive_scalper',
      explorerBase,
      { agentName: '   ' },
    );
    expect(html).toContain('[Nasun AI · aggressive_scalper]');
    expect(html).not.toContain('·  · ');
  });

  it('Phase 7: escapes HTML in agent name', () => {
    const html = formatHeartbeatHtml(
      succeededBuy(),
      'conservative_dca',
      explorerBase,
      { agentName: '<img src=x>' },
    );
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x>');
  });

  it('includes BUY ~N NUSDC header', () => {
    const html = formatHeartbeatHtml(succeededBuy(), 'conservative_dca', explorerBase);
    expect(html).toMatch(/BUY ~120 NUSDC/);
  });

  it('includes explorer link when txDigest present', () => {
    const html = formatHeartbeatHtml(succeededBuy(), 'conservative_dca', explorerBase);
    expect(html).toContain(`${explorerBase}/abc123`);
  });

  it('omits link when txDigest absent', () => {
    const r = succeededBuy({ txDigest: undefined });
    const html = formatHeartbeatHtml(r, 'conservative_dca', explorerBase);
    expect(html).not.toContain('View tx');
  });

  it('truncates a very long reason to keep total html within 4096 bytes', () => {
    const longReason = 'x'.repeat(8000);
    const r = succeededBuy({ decision: { action: 'BUY', sizeNUSDC: 1, reason: longReason } });
    const html = formatHeartbeatHtml(r, 'conservative_dca', explorerBase);
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThanOrEqual(__testing__.MAX_HTML_BYTES);
    expect(html).toContain('…');
  });

  it('falls back to "default" strategy label when env STRATEGY is empty', () => {
    const html = formatHeartbeatHtml(succeededBuy(), '', explorerBase);
    expect(html).toContain('[Nasun AI · default]');
  });
});

describe('maybeNotifyHeartbeat (fetch behavior)', () => {
  it('does not fetch when shouldNotify returns false', async () => {
    const fetchImpl = vi.fn();
    await maybeNotifyHeartbeat(
      { outcome: 'succeeded', decision: { action: 'HOLD', sizeNUSDC: 0, reason: '' } },
      baseEnv(),
      { fetchImpl: fetchImpl as unknown as typeof fetch, log: () => {} },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches with correct URL, headers, HMAC, and body on BUY succeeded', async () => {
    const fetchImpl = mockFetchOk();
    await maybeNotifyHeartbeat(succeededBuy(), baseEnv(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const urlArg = call[0];
    const optsArg = call[1];
    expect(urlArg).toBe('http://localhost:3101/api/nasun-ai/agent/push');
    expect(optsArg.method).toBe('POST');
    const headers = optsArg.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = optsArg.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.wallet).toBe(WALLET);
    expect(typeof parsed.html).toBe('string');
    // Verify HMAC equals signing of "push:" || body with the secret.
    const expected = createHmac('sha256', Buffer.from(SECRET_HEX, 'hex'))
      .update(Buffer.concat([Buffer.from('push:', 'utf8'), Buffer.from(body, 'utf8')]))
      .digest('hex');
    expect(headers['X-HMAC']).toBe(expected);
  });

  it('logs delivered=false reason when chat-server reports no_session', async () => {
    const fetchImpl = mockFetchOk({ ok: true, delivered: false, reason: 'no_session' });
    const logs: string[] = [];
    await maybeNotifyHeartbeat(succeededBuy(), baseEnv(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: (m) => logs.push(m),
    });
    expect(logs.some((m) => m.includes('delivered=false') && m.includes('no_session'))).toBe(true);
  });

  it('logs HTTP error without throwing on chat-server 5xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const logs: string[] = [];
    await expect(
      maybeNotifyHeartbeat(succeededBuy(), baseEnv(), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        log: (m) => logs.push(m),
      }),
    ).resolves.toBeUndefined();
    expect(logs.some((m) => m.includes('HTTP 500'))).toBe(true);
  });

  it('swallows fetch exceptions (timeout, network) with warn log', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('AbortError: timeout');
    });
    const logs: string[] = [];
    await expect(
      maybeNotifyHeartbeat(succeededBuy(), baseEnv(), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        log: (m) => logs.push(m),
      }),
    ).resolves.toBeUndefined();
    expect(logs.some((m) => m.includes('fetch failed'))).toBe(true);
  });
});
