/**
 * E2E coverage for the `perWallet` field added to GET /alpha/status.
 *
 * Drives `handleAlphaRequest` end-to-end (route lookup → SQL → JSON write)
 * against an in-process SQLite database with the alpha-migration applied.
 * The goal is to lock in the contract the frontend depends on for the
 * "Create Agent" pre-gate — namely that perWallet.canCreate is correct
 * under every state branch + every fail-open boundary (gate off, missing
 * schema, missing columns).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';

import { initStore, closeStore, getDb } from '../store.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';
import { handleAlphaRequest, __testing__ as alphaTesting } from '../alpha-routes.js';
import {
  countMyActiveAgents,
  getPerWalletCap,
  isAlphaGateEnabled,
  enforceAlphaGuards,
  lookupExemptWallets,
  withSlotReservation,
  GuardError,
} from '../alpha-guards.js';

// === fixtures ===

const WALLET_A = '0x' + 'a'.repeat(64); // primary test wallet
const WALLET_B = '0x' + 'b'.repeat(64); // isolation test wallet
const WALLET_EXEMPT = '0x' + 'e'.repeat(64);
const AGENT_1 = '0x' + '1'.repeat(64);
const AGENT_2 = '0x' + '2'.repeat(64);
const AGENT_3 = '0x' + '3'.repeat(64);
const AGENT_EXEMPT = '0x' + '9'.repeat(64);

// === mock req/res ===

class MockReq extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined> = {};
  socket = { remoteAddress: '127.0.0.1' } as { remoteAddress?: string };
  constructor(method: string, path: string) {
    super();
    this.method = method;
    this.url = path;
  }
  destroy(): void {
    /* noop */
  }
}

class MockRes {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = '';
  headersSent = false;
  writeHead(status: number, headers?: Record<string, string>): this {
    this.statusCode = status;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) this.headers[k] = String(v);
    }
    this.headersSent = true;
    return this;
  }
  end(payload?: string): void {
    if (payload) this.body = payload;
  }
}

async function callStatus(wallet: string): Promise<{ status: number; body: any }> {
  const path = `/api/nasun-ai/alpha/status?wallet=${wallet}`;
  const url = new URL(`http://localhost${path}`);
  const req = new MockReq('GET', path);
  const res = new MockRes();
  // Cast through unknown — the route only touches the subset our mocks provide.
  const matched = await handleAlphaRequest(req as unknown as any, res as unknown as any, url, {});
  expect(matched).toBe(true);
  const body = res.body ? JSON.parse(res.body) : null;
  return { status: res.statusCode, body };
}

// === schema setup ===

function applyAlphaMigration(): void {
  const db = getDb();
  // Mirror scripts/alpha-migration.sql but tolerate already-applied state so
  // individual tests can opt out of certain steps to simulate partial
  // migrations.
  const cols = db.prepare('PRAGMA table_info(agent_keys)').all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has('expires_at')) db.exec('ALTER TABLE agent_keys ADD COLUMN expires_at INTEGER');
  if (!colNames.has('slot_exempt'))
    db.exec('ALTER TABLE agent_keys ADD COLUMN slot_exempt INTEGER NOT NULL DEFAULT 0');
  if (!colNames.has('warned_at')) db.exec('ALTER TABLE agent_keys ADD COLUMN warned_at INTEGER');
  if (!colNames.has('paused_at')) db.exec('ALTER TABLE agent_keys ADD COLUMN paused_at INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS alpha_waitlist (
      wallet_address    TEXT PRIMARY KEY,
      joined_at         INTEGER NOT NULL,
      status            TEXT NOT NULL CHECK(status IN ('waiting','invited','expired')),
      invited_at        INTEGER,
      invite_expires_at INTEGER,
      miss_count        INTEGER NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cron_status (
      name      TEXT PRIMARY KEY,
      last_run  INTEGER NOT NULL
    );
  `);
}

interface AgentSeed {
  agent: string;
  wallet: string;
  exempt?: boolean;
  paused?: boolean;
  deleted?: boolean;
  expiresAt?: number | null;
}

function seedAgent(s: AgentSeed): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO agent_keys (
        agent_address, wallet_address, capability_id, param_name, pm2_name,
        wake_port, created_at, last_used_at, deleted_at,
        expires_at, slot_exempt, warned_at, paused_at
      ) VALUES (?, ?, NULL, ?, ?, 3000, ?, NULL, ?, ?, ?, NULL, ?)`,
    )
    .run(
      s.agent.toLowerCase(),
      s.wallet.toLowerCase(),
      `param-${s.agent.slice(2, 10)}`,
      `pm-${s.agent.slice(2, 10)}`,
      now,
      s.deleted ? now : null,
      s.expiresAt ?? null,
      s.exempt ? 1 : 0,
      s.paused ? now : null,
    );
}

function seedWaitlist(
  wallet: string,
  status: 'waiting' | 'invited' | 'expired',
  opts: { inviteExpiresAt?: number | null } = {},
): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO alpha_waitlist
         (wallet_address, joined_at, status, invited_at, invite_expires_at, miss_count, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      wallet.toLowerCase(),
      now,
      status,
      status === 'invited' ? now : null,
      status === 'invited' ? (opts.inviteExpiresAt ?? now + 60_000) : null,
      now,
    );
}

// === lifecycle ===

let config: ChatServerConfig;
let originalGateEnv: string | undefined;
let originalGpEnv: string | undefined;

function makeConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'alpha-pw-test-'));
  return {
    ...DEFAULT_CONFIG,
    port: 0,
    dbPath: join(dir, 'test.db'),
    allowedOrigins: ['http://localhost:5174'],
  };
}

beforeEach(() => {
  originalGateEnv = process.env.ALPHA_GATE_ENABLED;
  originalGpEnv = process.env.GENESIS_PASS_API_URL;
  // Default to ON so each test states its toggle explicitly.
  process.env.ALPHA_GATE_ENABLED = 'true';
  // Strip GP API so the 'none' branch resolves eligible=null synchronously.
  delete process.env.GENESIS_PASS_API_URL;
  config = makeConfig();
  initStore(config);
  alphaTesting.resetSchemaCache();
});

afterEach(() => {
  closeStore();
  try {
    rmSync(config.dbPath, { force: true });
    rmSync(config.dbPath + '-wal', { force: true });
    rmSync(config.dbPath + '-shm', { force: true });
    rmSync(config.dbPath.replace(/\/[^/]+$/, ''), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.env.ALPHA_GATE_ENABLED = originalGateEnv;
  process.env.GENESIS_PASS_API_URL = originalGpEnv;
  vi.restoreAllMocks();
});

// === sanity ===

describe('alpha-guards primitives', () => {
  it('exports a stable PER_WALLET_CAP', () => {
    expect(getPerWalletCap()).toBe(1);
  });

  it('countMyActiveAgents returns 0 for an unknown wallet', () => {
    applyAlphaMigration();
    expect(countMyActiveAgents(WALLET_A)).toBe(0);
  });

  it('countMyActiveAgents ignores paused/deleted/exempt/other-wallet rows', () => {
    applyAlphaMigration();
    seedAgent({ agent: AGENT_1, wallet: WALLET_A, paused: true });
    seedAgent({ agent: AGENT_2, wallet: WALLET_A, deleted: true });
    seedAgent({ agent: AGENT_3, wallet: WALLET_A, exempt: true });
    seedAgent({ agent: AGENT_EXEMPT, wallet: WALLET_B });
    expect(countMyActiveAgents(WALLET_A)).toBe(0);
    expect(countMyActiveAgents(WALLET_B)).toBe(1);
  });

  it('reads ALPHA_GATE_ENABLED env truthfully', () => {
    process.env.ALPHA_GATE_ENABLED = 'true';
    expect(isAlphaGateEnabled()).toBe(true);
    process.env.ALPHA_GATE_ENABLED = 'false';
    expect(isAlphaGateEnabled()).toBe(false);
    process.env.ALPHA_GATE_ENABLED = '';
    expect(isAlphaGateEnabled()).toBe(false);
  });
});

// === perWallet field on /alpha/status ===

describe('/alpha/status — perWallet field', () => {
  describe('gate disabled', () => {
    it('returns canCreate=true for an empty wallet regardless of activeCount', async () => {
      process.env.ALPHA_GATE_ENABLED = 'false';
      applyAlphaMigration();
      const r = await callStatus(WALLET_A);
      expect(r.status).toBe(200);
      expect(r.body.perWallet).toEqual({ activeCount: 0, cap: 1, canCreate: true });
    });

    it('reports canCreate=true even when an active agent exists (gate off skips count)', async () => {
      process.env.ALPHA_GATE_ENABLED = 'false';
      applyAlphaMigration();
      seedAgent({ agent: AGENT_1, wallet: WALLET_A });
      const r = await callStatus(WALLET_A);
      expect(r.status).toBe(200);
      // gate-off short-circuits — perWallet should not surface a cap reached.
      expect(r.body.perWallet.canCreate).toBe(true);
      expect(r.body.perWallet.activeCount).toBe(0);
    });
  });

  describe('schema readiness boundaries', () => {
    it('fully unmigrated DB → schema_ready=false, but perWallet is still present and fail-open', async () => {
      // Skip applyAlphaMigration entirely. alpha_waitlist + new columns missing.
      const r = await callStatus(WALLET_A);
      expect(r.status).toBe(200);
      expect(r.body.state).toBe('none');
      expect(r.body.capacity.schema_ready).toBe(false);
      // SQL count fails (no slot_exempt/paused_at) → catch → canCreate=true.
      expect(r.body.perWallet).toEqual({ activeCount: 0, cap: 1, canCreate: true });
    });

    it('partial migration (waitlist exists but slot_exempt column missing) currently 500s — documented limit, not from perWallet logic', async () => {
      // This combination cannot happen in prod (alpha-migration.sql wraps all
      // steps in a single BEGIN/COMMIT), but if an operator runs the steps
      // manually out of order, handleAlphaStatus' active-agent SELECT
      // references `slot_exempt` unguarded and SQLite raises. computePerWallet
      // itself is fail-open (verified by the fully-unmigrated test above);
      // the 500 originates earlier in the active-agent lookup path. Lock
      // this in so a future PR that adds defensive guards has a target.
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS alpha_waitlist (
          wallet_address TEXT PRIMARY KEY, joined_at INTEGER NOT NULL,
          status TEXT NOT NULL, invited_at INTEGER, invite_expires_at INTEGER,
          miss_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cron_status (
          name TEXT PRIMARY KEY, last_run INTEGER NOT NULL
        );
      `);
      // Silence the expected console.error from the unguarded SQL throw —
      // the 500 path logs and we don't want red noise in CI output.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const r = await callStatus(WALLET_A);
      expect(r.status).toBe(500);
      expect(r.body).toEqual({ error: 'internal_error' });
      errSpy.mockRestore();
    });
  });

  describe('state branches (gate enabled, fully migrated)', () => {
    it('state=none + 0 agents → canCreate=true', async () => {
      applyAlphaMigration();
      const r = await callStatus(WALLET_A);
      expect(r.status).toBe(200);
      expect(r.body.state).toBe('none');
      expect(r.body.perWallet).toEqual({ activeCount: 0, cap: 1, canCreate: true });
    });

    it('state=active (1 agent, cap=1) → canCreate=false — the primary regression guard', async () => {
      applyAlphaMigration();
      seedAgent({ agent: AGENT_1, wallet: WALLET_A });
      const r = await callStatus(WALLET_A);
      expect(r.status).toBe(200);
      expect(r.body.state).toBe('active');
      expect(r.body.agent_address).toBe(AGENT_1.toLowerCase());
      expect(r.body.perWallet).toEqual({ activeCount: 1, cap: 1, canCreate: false });
    });

    it('state=paused (paused_at NOT NULL) → activeCount excludes it, canCreate=true', async () => {
      applyAlphaMigration();
      seedAgent({ agent: AGENT_1, wallet: WALLET_A, paused: true });
      const r = await callStatus(WALLET_A);
      expect(r.body.state).toBe('paused');
      // The state itself blocks Create via messageForState('paused'), but the
      // perWallet snapshot must remain accurate — paused agents do not occupy
      // a per-wallet slot.
      expect(r.body.perWallet).toEqual({ activeCount: 0, cap: 1, canCreate: true });
    });

    it('state=none after soft-delete (deleted_at NOT NULL) → canCreate=true', async () => {
      applyAlphaMigration();
      seedAgent({ agent: AGENT_1, wallet: WALLET_A, deleted: true });
      const r = await callStatus(WALLET_A);
      expect(r.body.state).toBe('none');
      expect(r.body.perWallet.activeCount).toBe(0);
      expect(r.body.perWallet.canCreate).toBe(true);
    });

    it('state=exempt → canCreate=true even when an exempt agent already exists', async () => {
      applyAlphaMigration();
      seedAgent({ agent: AGENT_EXEMPT, wallet: WALLET_EXEMPT, exempt: true });
      const r = await callStatus(WALLET_EXEMPT);
      expect(r.body.state).toBe('exempt');
      // computePerWallet short-circuits with activeCount=0 when isExempt=true.
      expect(r.body.perWallet).toEqual({ activeCount: 0, cap: 1, canCreate: true });
    });

    it('state=invited (no agent yet) → canCreate=true', async () => {
      applyAlphaMigration();
      seedWaitlist(WALLET_A, 'invited');
      const r = await callStatus(WALLET_A);
      expect(r.body.state).toBe('invited');
      expect(r.body.perWallet.canCreate).toBe(true);
    });

    it('state=waiting → canCreate=true (no agent occupies a slot)', async () => {
      applyAlphaMigration();
      seedWaitlist(WALLET_A, 'waiting');
      const r = await callStatus(WALLET_A);
      expect(r.body.state).toBe('waiting');
      expect(r.body.perWallet.canCreate).toBe(true);
    });

    it('state=expired → canCreate=true', async () => {
      applyAlphaMigration();
      seedWaitlist(WALLET_A, 'expired');
      const r = await callStatus(WALLET_A);
      expect(r.body.state).toBe('expired');
      expect(r.body.perWallet.canCreate).toBe(true);
    });
  });

  describe('isolation + normalization', () => {
    it('another wallet owning an active agent does NOT affect my canCreate', async () => {
      applyAlphaMigration();
      seedAgent({ agent: AGENT_1, wallet: WALLET_B });
      const r = await callStatus(WALLET_A);
      expect(r.body.state).toBe('none');
      expect(r.body.perWallet).toEqual({ activeCount: 0, cap: 1, canCreate: true });
    });

    it('lowercases wallet input — uppercase query produces the same answer as lowercase', async () => {
      applyAlphaMigration();
      seedAgent({ agent: AGENT_1, wallet: WALLET_A });
      const upper = '0x' + 'A'.repeat(64);
      const r = await callStatus(upper);
      expect(r.status).toBe(200);
      expect(r.body.state).toBe('active');
      expect(r.body.perWallet.canCreate).toBe(false);
    });

    it('rejects an invalid wallet with 400 (no perWallet leak)', async () => {
      applyAlphaMigration();
      const r = await callStatus('0xnotahex');
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'invalid_wallet' });
    });
  });

  describe('contract guarantees', () => {
    it('every successful response carries perWallet (no branch forgot to merge it)', async () => {
      applyAlphaMigration();
      // Cover the 5 user-facing branches in one sweep.
      const branches: Array<[() => void, string]> = [
        [() => {}, 'none'],
        [() => seedAgent({ agent: AGENT_1, wallet: WALLET_A }), 'active'],
        [() => seedAgent({ agent: AGENT_1, wallet: WALLET_A, paused: true }), 'paused'],
        [() => seedWaitlist(WALLET_A, 'waiting'), 'waiting'],
        [() => seedAgent({ agent: AGENT_EXEMPT, wallet: WALLET_A, exempt: true }), 'exempt'],
      ];
      for (const [seed, expectedState] of branches) {
        // Reset between iterations.
        getDb().exec('DELETE FROM agent_keys; DELETE FROM alpha_waitlist;');
        alphaTesting.resetSchemaCache();
        seed();
        const r = await callStatus(WALLET_A);
        expect(r.status, `branch=${expectedState}`).toBe(200);
        expect(r.body.state, `branch=${expectedState}`).toBe(expectedState);
        expect(r.body.perWallet, `branch=${expectedState}`).toBeDefined();
        expect(typeof r.body.perWallet.activeCount, `branch=${expectedState}`).toBe('number');
        expect(typeof r.body.perWallet.cap, `branch=${expectedState}`).toBe('number');
        expect(typeof r.body.perWallet.canCreate, `branch=${expectedState}`).toBe('boolean');
      }
    });

    it('cap value matches getPerWalletCap() — no client/server drift', async () => {
      applyAlphaMigration();
      const r = await callStatus(WALLET_A);
      expect(r.body.perWallet.cap).toBe(getPerWalletCap());
    });
  });

  describe('adversarial inputs', () => {
    it('rate-limit / capacity rejection paths still surface perWallet for status (no body leakage on errors)', async () => {
      // Status endpoint isn't rate-limited, but make sure a known 400 doesn't
      // expose perWallet fields (defense-in-depth against accidentally
      // returning the snapshot before validation).
      applyAlphaMigration();
      const path = `/api/nasun-ai/alpha/status`; // missing wallet param
      const url = new URL(`http://localhost${path}`);
      const req = new MockReq('GET', path);
      const res = new MockRes();
      await handleAlphaRequest(req as any, res as any, url, {});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'invalid_wallet' });
    });

    it('OPTIONS preflight returns 204 without touching perWallet code path', async () => {
      applyAlphaMigration();
      const path = `/api/nasun-ai/alpha/status?wallet=${WALLET_A}`;
      const url = new URL(`http://localhost${path}`);
      const req = new MockReq('OPTIONS', path);
      const res = new MockRes();
      await handleAlphaRequest(req as any, res as any, url, {});
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
    });

    it('unsupported method on a valid path → 405 (no perWallet leakage)', async () => {
      applyAlphaMigration();
      const path = `/api/nasun-ai/alpha/status?wallet=${WALLET_A}`;
      const url = new URL(`http://localhost${path}`);
      const req = new MockReq('DELETE', path);
      const res = new MockRes();
      await handleAlphaRequest(req as any, res as any, url, {});
      expect(res.statusCode).toBe(405);
    });

    it('wallet-level exempt fallback — admin creating a NEW agent_address bypasses system cap', () => {
      // Regression for the 2026-05-25 admin lockout: admin had one
      // slot_exempt=1 row (Jason Bourne). After killing every active agent,
      // a brand-new agent_address was being checked with
      // `lookupSlotExempt(agentAddress)` which returns false for any row
      // not yet inserted. The new wallet-level fallback rescues admin.
      applyAlphaMigration();
      // Seed an existing slot_exempt=1 row for the wallet (Jason Bourne analog).
      seedAgent({ agent: AGENT_EXEMPT, wallet: WALLET_EXEMPT, exempt: true });

      // Brand-new agent address that does NOT exist in agent_keys.
      const freshAgent = '0x' + 'f'.repeat(64);
      const ctx = enforceAlphaGuards(WALLET_EXEMPT, freshAgent);
      expect(ctx.slotExempt).toBe(true);
    });

    it('wallet-level exempt fallback is wallet-scoped — a different wallet does NOT inherit', () => {
      applyAlphaMigration();
      seedAgent({ agent: AGENT_EXEMPT, wallet: WALLET_EXEMPT, exempt: true });

      const freshAgent = '0x' + 'f'.repeat(64);
      // WALLET_A has no slot_exempt row, so it must fall through to the
      // waitlist/per-wallet checks — and with no invite present, throw.
      expect(() => enforceAlphaGuards(WALLET_A, freshAgent)).toThrow(GuardError);
    });

    it('wallet-level exempt requires deleted_at IS NULL — soft-deleted exempt row does NOT grant bypass', () => {
      applyAlphaMigration();
      // This is the precise pre-fix lockout shape: only slot_exempt row is
      // deleted. With the wallet-level fallback the wallet is no longer in
      // the exempt set, and a fresh agent_address falls through to the
      // (missing) waitlist + per-wallet checks.
      seedAgent({ agent: AGENT_EXEMPT, wallet: WALLET_EXEMPT, exempt: true, deleted: true });

      expect(lookupExemptWallets().has(WALLET_EXEMPT.toLowerCase())).toBe(false);
      const freshAgent = '0x' + 'f'.repeat(64);
      expect(() => enforceAlphaGuards(WALLET_EXEMPT, freshAgent)).toThrow(GuardError);
    });

    it('withSlotReservation honors wallet-level slotExempt — exempt wallet bypasses system cap', async () => {
      applyAlphaMigration();
      // Cap=1, already at cap with one non-exempt active agent.
      const originalCap = process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
      process.env.NASUN_AI_ALPHA_SYSTEM_CAP = '1';
      try {
        seedAgent({ agent: AGENT_1, wallet: WALLET_A }); // counts toward cap
        // Non-exempt new agent: should be rejected.
        await expect(
          withSlotReservation(false, async () => 'ok'),
        ).rejects.toThrow(/alpha_full/);
        // Exempt new agent: should succeed even though we are at cap.
        await expect(
          withSlotReservation(true, async () => 'ok'),
        ).resolves.toBe('ok');
      } finally {
        if (originalCap === undefined) delete process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
        else process.env.NASUN_AI_ALPHA_SYSTEM_CAP = originalCap;
      }
    });

    it('unknown subpath on the alpha namespace → 404, not a misrouted status', async () => {
      applyAlphaMigration();
      const path = `/api/nasun-ai/alpha/does-not-exist`;
      const url = new URL(`http://localhost${path}`);
      const req = new MockReq('GET', path);
      const res = new MockRes();
      const matched = await handleAlphaRequest(req as any, res as any, url, {});
      expect(matched).toBe(true);
      expect(res.statusCode).toBe(404);
    });
  });
});
