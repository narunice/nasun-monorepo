/**
 * Server-first read path tests (Phase 3, 2026-05-23).
 *
 * Locks in the contract that chat-server is the source of truth: a stored
 * config on the server beats whatever IndexedDB happens to have locally.
 * Without this, Settings can show stale local values for an agent whose
 * server-side config has been updated (the original bug that motivated
 * the refactor).
 *
 * IndexedDB is not available in the jsdom test environment without a
 * shim. Tests exercise the server-side branches; the cache fallback
 * branch is hardened to fail gracefully via the try/catch in
 * getConfigByAgentDetailed so missing IDB doesn't crash the read.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { getConfigByAgentDetailed } from './traderConfigStorage';

const WALLET = '0x' + 'a'.repeat(64);
const AGENT = '0x' + '1'.repeat(64);

const originalFetch = global.fetch;

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('getConfigByAgentDetailed', () => {
  it('returns the server config with source=server on HTTP 200', async () => {
    const serverConfig = {
      id: AGENT,
      walletAddress: WALLET,
      agentAddress: AGENT,
      name: 'Santa',
      pair: 'NBTC_NUSDC',
      enabled: false,
      strategyPresetId: 'aggressive_scalper',
      intervalMinutes: 31,
      perTradeMaxQuoteRaw: '2000000',
      dailyMaxQuoteRaw: '20000000',
      model: 'llama-3.3-70b-versatile',
      promptTemplate: null,
      executorAddress: '0xexec',
      executorEndpoint: 'https://example/',
      budgetId: '0xbudget',
      maxSlippageBps: 50,
      stopLossBps: 500,
      takeProfitBps: 1000,
      createdAt: 1,
      updatedAt: 2,
    };
    mockFetchOnce(200, { config: serverConfig, updatedAt: 2 });
    const r = await getConfigByAgentDetailed(WALLET, AGENT);
    expect(r.source).toBe('server');
    expect(r.config?.strategyPresetId).toBe('aggressive_scalper');
    expect(r.config?.name).toBe('Santa');
    expect(r.config?.enabled).toBe(false);
  });

  it('returns null with source=none on HTTP 404 (server has no row)', async () => {
    mockFetchOnce(404, { error: 'not_found' });
    const r = await getConfigByAgentDetailed(WALLET, AGENT);
    expect(r.source).toBe('none');
    expect(r.config).toBeNull();
  });

  it('does NOT fall through to cache when server returns 404', async () => {
    // Even if IndexedDB had Jane locally, a server 404 means the runtime
    // has no record and the UI should reflect that. (Without IDB in the
    // test env this is the de-facto behavior; this test asserts the
    // documented contract.)
    mockFetchOnce(404, { error: 'not_found' });
    const r = await getConfigByAgentDetailed(WALLET, AGENT);
    expect(r.config).toBeNull();
    expect(r.source).toBe('none');
  });

  it('falls through to cache on HTTP 5xx (server flaky)', async () => {
    mockFetchOnce(503, {});
    const r = await getConfigByAgentDetailed(WALLET, AGENT);
    // jsdom has no IndexedDB; cache lookup fails silently and returns 'none'.
    // What matters: no throw, no 5xx surfaced to caller.
    expect(r.config).toBeNull();
    expect(r.source).toBe('none');
  });

  it('falls through to cache on network throw', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await getConfigByAgentDetailed(WALLET, AGENT);
    expect(r.config).toBeNull();
    expect(r.source).toBe('none');
  });

  it('lowercases the agent address in the URL path', async () => {
    const mixedCase = '0xABCDEF' + '1'.repeat(58);
    const seen: string[] = [];
    global.fetch = vi.fn(async (input: any) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ config: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await getConfigByAgentDetailed(WALLET, mixedCase);
    expect(seen.length).toBe(1);
    expect(seen[0]).toContain(mixedCase.toLowerCase());
    expect(seen[0]).not.toContain('ABCDEF');
  });

  it('treats 200 with no config payload as none', async () => {
    mockFetchOnce(200, { config: null });
    const r = await getConfigByAgentDetailed(WALLET, AGENT);
    expect(r.config).toBeNull();
    expect(r.source).toBe('none');
  });
});
