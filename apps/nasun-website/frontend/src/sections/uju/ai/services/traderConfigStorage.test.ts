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

import {
  getConfigByAgentDetailed,
  saveConfig,
  deleteConfig,
  TraderConfigSyncError,
  type ConfigSigner,
} from './traderConfigStorage';
import type { TraderConfig } from '../types/trader';

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

// Phase 4 (2026-05-23) — save/delete await server confirmation.
// Behaviour previously was fire-and-forget which silently created
// IndexedDB-only ghost agents (Jane bug, 2026-05-23). Tests below lock
// in the new contract.

const stubSigner = (): ConfigSigner => ({
  signPersonal: async () => ({ signature: '0xfeedfacecafebabe'.repeat(8) }),
});

function makeConfig(overrides: Partial<TraderConfig> = {}): TraderConfig {
  return {
    id: AGENT,
    walletAddress: WALLET,
    agentAddress: AGENT,
    name: 'Santa',
    pair: 'NBTC_NUSDC',
    perTradeMaxQuoteRaw: '2000000',
    dailyMaxQuoteRaw: '20000000',
    intervalMinutes: 31,
    model: 'llama-3.3-70b-versatile',
    promptTemplate: null,
    executorAddress: '0xexec',
    executorEndpoint: 'https://example/',
    budgetId: '0xbudget',
    enabled: false,
    strategyPresetId: 'conservative_dca',
    maxSlippageBps: 50,
    stopLossBps: 500,
    takeProfitBps: 1000,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('saveConfig — server-first contract', () => {
  it('rejects with TraderConfigSyncError when no signer is provided', async () => {
    await expect(saveConfig(makeConfig(), null)).rejects.toBeInstanceOf(
      TraderConfigSyncError,
    );
  });

  it('rejects with TraderConfigSyncError on HTTP 500', async () => {
    mockFetchOnce(500, { error: 'internal' });
    await expect(saveConfig(makeConfig(), stubSigner())).rejects.toBeInstanceOf(
      TraderConfigSyncError,
    );
  });

  it('rejects with TraderConfigSyncError on HTTP 401 (bad signature)', async () => {
    mockFetchOnce(401, { error: 'bad_signature' });
    const err = await saveConfig(makeConfig(), stubSigner()).catch((e) => e);
    expect(err).toBeInstanceOf(TraderConfigSyncError);
    expect((err as TraderConfigSyncError).status).toBe(401);
  });

  it('rejects with TraderConfigSyncError on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const err = await saveConfig(makeConfig(), stubSigner()).catch((e) => e);
    expect(err).toBeInstanceOf(TraderConfigSyncError);
    expect((err as Error).message).toContain('network_error');
  });

  it('resolves on HTTP 200 (server accepted save)', async () => {
    mockFetchOnce(200, { ok: true, reconcile: { action: 'spawn', reason: 'enabled_true_pm2_absent' } });
    await expect(saveConfig(makeConfig({ enabled: true }), stubSigner())).resolves.toBeUndefined();
  });

  it('POSTs to the chat-server config endpoint with wallet-sig envelope', async () => {
    const seen: { url?: string; method?: string; body?: any } = {};
    global.fetch = vi.fn(async (input: any, init: any) => {
      seen.url = String(input);
      seen.method = init?.method;
      seen.body = init?.body ? JSON.parse(init.body) : null;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    await saveConfig(makeConfig(), stubSigner());
    expect(seen.url).toContain('/api/nasun-ai/config');
    expect(seen.method).toBe('POST');
    expect(seen.body.agentAddress).toBe(AGENT);
    expect(seen.body.walletAddress).toBe(WALLET);
    expect(seen.body.signature).toBeTruthy();
    expect(typeof seen.body.ts).toBe('number');
  });
});

describe('deleteConfig — server-first contract', () => {
  it('rejects with TraderConfigSyncError when no signer is provided', async () => {
    await expect(deleteConfig(WALLET, AGENT, AGENT, null)).rejects.toBeInstanceOf(
      TraderConfigSyncError,
    );
  });

  it('rejects with TraderConfigSyncError on server reject', async () => {
    mockFetchOnce(403, { error: 'agent_owned_by_other_wallet' });
    const err = await deleteConfig(WALLET, AGENT, AGENT, stubSigner()).catch((e) => e);
    expect(err).toBeInstanceOf(TraderConfigSyncError);
    expect((err as TraderConfigSyncError).status).toBe(403);
  });

  it('skips server call when agentAddress is undefined (legacy callers)', async () => {
    // No fetch mock needed: should never invoke fetch.
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    // IndexedDB delete may throw in jsdom-without-IDB; we only assert
    // that fetch was not called.
    await deleteConfig(WALLET, 'some-id', undefined, stubSigner()).catch(() => {});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves on HTTP 200', async () => {
    mockFetchOnce(200, { ok: true });
    await expect(
      deleteConfig(WALLET, AGENT, AGENT, stubSigner()),
    ).resolves.toBeUndefined();
  });
});
