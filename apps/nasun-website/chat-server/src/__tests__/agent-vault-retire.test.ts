import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// If any handler reaches the SSM backend, ssmSend fires. The retire gate must
// short-circuit before that, so a 503 with ssmSend uncalled is the proof.
// Resolves quietly so the not-retired path (gate off) proceeds harmlessly; the
// retired test asserts this was never called, which is the real guarantee.
const ssmSend = vi.fn(() => Promise.resolve({}));
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class { send = ssmSend; },
  PutParameterCommand: class { constructor(public input: unknown) {} },
  GetParameterCommand: class { constructor(public input: unknown) {} },
  DeleteParameterCommand: class { constructor(public input: unknown) {} },
}));

import {
  handleVaultUpload,
  handleVaultRestore,
  handleVaultResume,
  isVaultRetired,
} from '../agent-vault-routes.js';
import { initStore, closeStore, getDb } from '../store.js';
import { DEFAULT_CONFIG } from '../types.js';
import { runVaultPurge } from '../agent-vault-purge.js';

const AGENT = '0x' + '2'.repeat(64);

let server: Server;
let baseUrl: string;
let prevFlag: string | undefined;

beforeAll(async () => {
  prevFlag = process.env.AGENT_VAULT_RETIRED;
  server = createServer(async (req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/upload') return handleVaultUpload(req, res, cors);
    if (url.pathname === '/restore') return handleVaultRestore(req, res, cors, AGENT);
    if (url.pathname === '/resume') return handleVaultResume(req, res, cors, AGENT);
    res.writeHead(404); res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (prevFlag === undefined) delete process.env.AGENT_VAULT_RETIRED;
  else process.env.AGENT_VAULT_RETIRED = prevFlag;
});

beforeEach(() => ssmSend.mockClear());

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('agent-vault retire gate', () => {
  it('isVaultRetired reflects the env flag', () => {
    process.env.AGENT_VAULT_RETIRED = '1';
    expect(isVaultRetired()).toBe(true);
    delete process.env.AGENT_VAULT_RETIRED;
    expect(isVaultRetired()).toBe(false);
    process.env.AGENT_VAULT_RETIRED = '0';
    expect(isVaultRetired()).toBe(false); // only "1" enables
  });

  it('retired: all three activation paths return 503 without touching SSM', async () => {
    process.env.AGENT_VAULT_RETIRED = '1';
    for (const path of ['/upload', '/restore', '/resume']) {
      const r = await post(path, { agentSecretKey: 'x'.repeat(44) });
      expect(r.status, `${path} status`).toBe(503);
      expect((await r.json()).error, `${path} body`).toBe('vault_disabled');
    }
    expect(ssmSend, 'SSM must never be reached when retired').not.toHaveBeenCalled();
  });

  it('not retired: the retire gate does not fire (no 503/vault_disabled)', async () => {
    delete process.env.AGENT_VAULT_RETIRED;
    // Empty/invalid body makes the handler bail early on its own validation,
    // well before SSM; we only assert the retire gate itself stayed inert.
    for (const path of ['/upload', '/restore', '/resume']) {
      const r = await post(path, {});
      expect(r.status, `${path} not 503`).not.toBe(503);
      if (r.headers.get('content-type')?.includes('json')) {
        expect((await r.json()).error).not.toBe('vault_disabled');
      }
    }
  });
});

// --- purge behavior under retire ---------------------------------------------
// The kill-switch (forceImmediate) must still attempt the SSM delete while the
// prod account is alive; only the routine hourly sweep skips it.
function insertSoftDeleted(agent: string, deletedAt: number) {
  getDb().prepare(
    `INSERT INTO agent_keys
       (agent_address, wallet_address, capability_id, param_name, pm2_name, wake_port, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(agent, '0x' + 'a'.repeat(64), 'cap', `/nasun/ai-agent/${agent}`, `pm2-${agent}`, 4100, 1, deletedAt);
}

describe('agent-vault purge under retire', () => {
  let dbPath: string;
  const OLD = Date.now() - 8 * 24 * 60 * 60 * 1000; // past the 7-day grace

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'vault-purge-test-'));
    dbPath = join(dir, 'test.db');
    initStore({ ...DEFAULT_CONFIG, port: 0, dbPath, allowedOrigins: [] });
    ssmSend.mockClear();
  });

  afterEach(() => {
    closeStore();
    try { rmSync(dbPath.replace(/\/[^/]+$/, ''), { recursive: true, force: true }); } catch { /* noop */ }
    delete process.env.AGENT_VAULT_RETIRED;
  });

  it('routine sweep: retired skips SSM delete, still reaps the local row', async () => {
    process.env.AGENT_VAULT_RETIRED = '1';
    insertSoftDeleted('0x' + '1'.repeat(64), OLD);
    await runVaultPurge(false);
    expect(ssmSend).not.toHaveBeenCalled();
    const remaining = getDb().prepare('SELECT COUNT(*) c FROM agent_keys').get() as { c: number };
    expect(remaining.c).toBe(0);
  });

  it('kill-switch: retired still attempts the SSM delete', async () => {
    process.env.AGENT_VAULT_RETIRED = '1';
    insertSoftDeleted('0x' + '2'.repeat(64), Date.now()); // forceImmediate ignores grace
    await runVaultPurge(true);
    expect(ssmSend).toHaveBeenCalledTimes(1);
    const remaining = getDb().prepare('SELECT COUNT(*) c FROM agent_keys').get() as { c: number };
    expect(remaining.c).toBe(0);
  });
});
