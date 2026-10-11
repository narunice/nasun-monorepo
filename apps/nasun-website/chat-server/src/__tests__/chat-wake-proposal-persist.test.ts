/**
 * Coverage for persisting a proposal raised through the WEB chat surface.
 *
 * Until 2026-10-09 only the Telegram path called createPendingProposal, so a
 * proposal raised from the browser was returned in the job outcome but never
 * written to `baram_pending_proposals`. There was no proposal_id for the user
 * to confirm or cancel, and the on-chain pending lock the runtime had already
 * taken survived its full TTL, skipping every cycle in that window.
 *
 * These tests pin the row down: it is written on a proposal-bearing outcome,
 * skipped otherwise, keyed to the caller's own agent/session, and never throws
 * on the duplicate that an idempotent retry produces.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { initStore, closeStore, getDb } from '../store.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';
import { __testing__ } from '../chat-wake.js';
import { getActivePendingProposal, getProposalById } from '../baram-proposals.js';
import type { WakeResult } from '../wake-proxy.js';

const { persistProposal } = __testing__;

const AGENT = '0x' + '1'.repeat(64);
const OTHER_AGENT = '0x' + '2'.repeat(64);
const SID = 'sid-01HQ';
const ULID_A = '01HQZX3VFKJ8QW9N2M4P5R6S7T';
const ULID_INTENT = '01HQZX3VFKJ8QW9N2M4P5R6S8V';
const ULID_STALE = '01HQZX3VFKJ8QW9N2M4P5R6S9W';
const ULID_SECOND = '01HQZX3VFKJ8QW9N2M4P5R6SAX';
const HASH = '0x' + 'f'.repeat(64);

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    proposal_id: ULID_A,
    intent_id: ULID_INTENT,
    action_type: 'spot_swap_v1',
    summary: 'Buy 10 NUSDC of NBTC on conservative DCA.',
    side: 'BUY' as const,
    symbol: 'NBTC',
    size_quote_raw: '10000000',
    max_slippage_bps: 100,
    confidence: 0.72,
    reasoning_hash: HASH,
    market_snapshot_hash: HASH,
    model_version: 'llama-3.3-70b-versatile',
    prompt_template_hash: HASH,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function okOutcome(proposal?: unknown): WakeResult {
  return {
    ok: true,
    status: 'proposal',
    summary: 'I have a trade to propose.',
    proposal: proposal as WakeResult['proposal'],
  };
}

let config: ChatServerConfig;

function makeConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'chat-wake-proposal-test-'));
  return {
    ...DEFAULT_CONFIG,
    port: 0,
    dbPath: join(dir, 'test.db'),
    allowedOrigins: ['http://localhost:5174'],
  };
}

beforeEach(() => {
  config = makeConfig();
  initStore(config);
});

afterEach(() => {
  closeStore();
  try {
    rmSync(config.dbPath, { force: true });
    rmSync(config.dbPath + '-wal', { force: true });
    rmSync(config.dbPath + '-shm', { force: true });
  } catch {
    /* best effort */
  }
});

describe('persistProposal', () => {
  it('writes a pending row the web surface can act on', () => {
    persistProposal(okOutcome(makeProposal()), AGENT, SID);

    const row = getProposalById(ULID_A);
    expect(row).not.toBeNull();
    expect(row!.agent).toBe(AGENT);
    expect(row!.sessionId).toBe(SID);
    expect(row!.status).toBe('pending');
    expect(row!.proposal.side).toBe('BUY');
    expect(row!.proposal.size_quote_raw).toBe('10000000');
  });

  it('makes the proposal the agent\'s active one', () => {
    persistProposal(okOutcome(makeProposal()), AGENT, SID);

    expect(getActivePendingProposal(AGENT)?.proposal_id).toBe(ULID_A);
    // Isolation: another agent must not inherit it.
    expect(getActivePendingProposal(OTHER_AGENT)).toBeNull();
  });

  it('writes nothing when the outcome carries no proposal', () => {
    persistProposal({ ok: true, status: 'done', summary: 'Balance is 20 NUSDC.' }, AGENT, SID);

    const { n } = getDb()
      .prepare('SELECT COUNT(*) AS n FROM baram_pending_proposals')
      .get() as { n: number };
    expect(n).toBe(0);
  });

  it('swallows the duplicate an idempotent retry produces', () => {
    persistProposal(okOutcome(makeProposal()), AGENT, SID);
    // Same proposal delivered twice must not throw — the partial unique index
    // (one 'pending' row per agent) and the proposal_id PK both reject it.
    expect(() => persistProposal(okOutcome(makeProposal()), AGENT, SID)).not.toThrow();

    const { n } = getDb()
      .prepare('SELECT COUNT(*) AS n FROM baram_pending_proposals')
      .get() as { n: number };
    expect(n).toBe(1);
  });

  it('does not let an abandoned pending row block the next proposal', () => {
    // The unique index is partial on (agent) WHERE status='pending', not on
    // proposal_id. A proposal the user walked away from stays 'pending'
    // forever on the web path (nothing finalizes it), so without an expiry
    // sweep this agent could never raise another proposal.
    const stale = makeProposal({
      proposal_id: ULID_STALE,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    persistProposal(okOutcome(stale), AGENT, SID);
    expect(getProposalById(ULID_STALE)!.status).toBe('pending');

    persistProposal(okOutcome(makeProposal()), AGENT, SID);

    expect(getProposalById(ULID_STALE)!.status).toBe('expired');
    expect(getActivePendingProposal(AGENT)?.proposal_id).toBe(ULID_A);
  });

  it('keeps a live proposal when a second one arrives for the same agent', () => {
    // Opposite direction of the sweep: an unexpired proposal is still
    // actionable, so the incumbent must win rather than be replaced.
    persistProposal(okOutcome(makeProposal()), AGENT, SID);
    persistProposal(okOutcome(makeProposal({ proposal_id: ULID_SECOND })), AGENT, SID);

    expect(getActivePendingProposal(AGENT)?.proposal_id).toBe(ULID_A);
    expect(getProposalById(ULID_SECOND)).toBeNull();
  });

  it('ignores a proposal echoed by a failed wake', () => {
    // A not-ok wake can still carry a proposal. Storing it would occupy the
    // agent's single pending slot with a row the user is never shown.
    persistProposal(
      { ok: false, error: 'infer_failed', proposal: makeProposal() as never },
      AGENT,
      SID,
    );

    const { n } = getDb()
      .prepare('SELECT COUNT(*) AS n FROM baram_pending_proposals')
      .get() as { n: number };
    expect(n).toBe(0);
  });

  it('refuses a proposal whose expires_at cannot be parsed', () => {
    persistProposal(okOutcome(makeProposal({ expires_at: 'not-a-date' })), AGENT, SID);

    // A NaN expires_at would land as a NULL/NaN integer and make every later
    // expiry comparison undefined, so the row must not be written at all.
    const { n } = getDb()
      .prepare('SELECT COUNT(*) AS n FROM baram_pending_proposals')
      .get() as { n: number };
    expect(n).toBe(0);
  });

  it('stores expires_at as epoch ms so expiry checks can compare it', () => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    persistProposal(okOutcome(makeProposal({ expires_at: expiresAt })), AGENT, SID);

    const row = getDb()
      .prepare('SELECT expires_at FROM baram_pending_proposals WHERE proposal_id = ?')
      .get(ULID_A) as { expires_at: number };
    expect(row.expires_at).toBe(new Date(expiresAt).getTime());
    expect(row.expires_at).toBeGreaterThan(Date.now());
  });

  it('treats an already-expired proposal as inactive once stored', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    persistProposal(okOutcome(makeProposal({ expires_at: past })), AGENT, SID);

    // The row exists (audit trail) but is not offered as actionable.
    expect(getProposalById(ULID_A)).not.toBeNull();
    expect(getActivePendingProposal(AGENT)).toBeNull();
  });
});
