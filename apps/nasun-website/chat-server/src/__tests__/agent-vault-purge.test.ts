// The purge cron is the only thing that hard-deletes an agent's key, so these
// pin the two invariants that matter: a row is never reaped while a readable
// secret outlives it, and the grace window is actually honoured. The endpoint
// prune is covered too, because it had no caller at all until 2026-10-06 and
// the table had been growing since the feature shipped.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initStore, closeStore, getDb } from '../store.js';
import { DEFAULT_CONFIG } from '../types.js';
import { runVaultPurge } from '../agent-vault-purge.js';
import { hasSecret, putSecret, secretPathFor } from '../agent-vault-store.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const KEY = 'suiprivkey1qtestkeymaterialplaceholder';

let tmp: string;
let prevVault: string | undefined;

const agent = (n: number) => '0x' + n.toString(16).padStart(64, '0');

function insertAgent(n: number, deletedAt: number | null): string {
  const a = agent(n);
  getDb().prepare(
    `INSERT INTO agent_keys
       (agent_address, wallet_address, capability_id, param_name, pm2_name,
        wake_port, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(a, '0x' + 'f'.repeat(64), null, secretPathFor(a), `nasun-ai-agent-${n}`,
        4400 + n, Date.now(), deletedAt);
  return a;
}

function insertEndpoint(addr: string, lastSeen: number): void {
  getDb().prepare(
    `INSERT INTO baram_agent_endpoints (agent, http_url, last_seen) VALUES (?, ?, ?)`,
  ).run(addr, 'http://127.0.0.1:4400', lastSeen);
}

const endpointCount = () =>
  (getDb().prepare(`SELECT COUNT(*) AS n FROM baram_agent_endpoints`).get() as { n: number }).n;

const agentRowCount = () =>
  (getDb().prepare(`SELECT COUNT(*) AS n FROM agent_keys`).get() as { n: number }).n;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'vault-purge-test-'));
  prevVault = process.env.AGENT_VAULT_DIR;
  process.env.AGENT_VAULT_DIR = join(tmp, 'vault');
  initStore({ ...DEFAULT_CONFIG, dbPath: join(tmp, 'chat.db') });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  closeStore();
  if (prevVault === undefined) delete process.env.AGENT_VAULT_DIR;
  else process.env.AGENT_VAULT_DIR = prevVault;
  rmSync(tmp, { recursive: true, force: true });
});

describe('runVaultPurge grace window', () => {
  it('leaves an active agent and its secret alone', async () => {
    const a = insertAgent(1, null);
    await putSecret(a, KEY, { overwrite: false });

    await runVaultPurge();

    expect(agentRowCount()).toBe(1);
    expect(await hasSecret(a)).toBe(true);
  });

  it('leaves a soft-deleted agent inside the grace window alone', async () => {
    const a = insertAgent(2, Date.now() - 1000);
    await putSecret(a, KEY, { overwrite: false });

    await runVaultPurge();

    expect(agentRowCount()).toBe(1);
    expect(await hasSecret(a)).toBe(true);
  });

  it('removes the secret before the row once the window has elapsed', async () => {
    const a = insertAgent(3, Date.now() - SEVEN_DAYS_MS - 1000);
    await putSecret(a, KEY, { overwrite: false });

    await runVaultPurge();

    // The ordering invariant: a reaped row must never leave a readable key.
    expect(await hasSecret(a)).toBe(false);
    expect(agentRowCount()).toBe(0);
  });

  it('reaps a row whose secret never existed on this host', async () => {
    // The pre-AWS-exit rows: their keys only lived as SSM parameters, so there
    // is nothing to unlink and the row must still be collected.
    const a = insertAgent(4, Date.now() - SEVEN_DAYS_MS - 1000);
    expect(await hasSecret(a)).toBe(false);

    await runVaultPurge();

    expect(agentRowCount()).toBe(0);
  });

  it('forceImmediate ignores the grace window', async () => {
    const a = insertAgent(5, Date.now() - 1000);
    await putSecret(a, KEY, { overwrite: false });

    await runVaultPurge(true);

    expect(await hasSecret(a)).toBe(false);
    expect(agentRowCount()).toBe(0);
  });
});

describe('stale wake-endpoint prune', () => {
  it('drops endpoints past the hard cutoff', async () => {
    insertEndpoint(agent(10), Date.now() - 10 * 60 * 1000);
    expect(endpointCount()).toBe(1);

    await runVaultPurge();

    expect(endpointCount()).toBe(0);
  });

  it('keeps a freshly heartbeating endpoint', async () => {
    insertEndpoint(agent(11), Date.now());

    await runVaultPurge();

    expect(endpointCount()).toBe(1);
  });

  it('collects orphans left behind by earlier purges', async () => {
    // This is the state found in production: seven endpoint rows whose
    // agent_keys row had already been reaped, surviving for months because
    // pruneStaleEndpoints had no caller.
    insertEndpoint(agent(12), Date.now() - 24 * 60 * 60 * 1000);
    insertEndpoint(agent(13), Date.now() - 90 * 24 * 60 * 60 * 1000);
    expect(agentRowCount()).toBe(0);

    await runVaultPurge();

    expect(endpointCount()).toBe(0);
  });
});
