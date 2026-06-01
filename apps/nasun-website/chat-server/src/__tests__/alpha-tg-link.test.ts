/**
 * Unit coverage for the alpha Telegram binding (alpha-tg-link.ts).
 *
 * Locks in the security-relevant invariants: a token is single-use, expires,
 * and binding enforces one Telegram account per wallet so DMs can't be routed
 * to a stranger's slot. Runs against an in-process SQLite DB; the module
 * lazily creates its own table via ensureAlphaTgBindingSchema().
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { initStore, closeStore, getDb } from '../store.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';
import {
  issueLinkToken,
  bindAlphaTelegram,
  getAlphaTgUserId,
  isAlphaTgBound,
} from '../alpha-tg-link.js';

const WALLET_A = '0x' + 'a'.repeat(64);
const WALLET_B = '0x' + 'b'.repeat(64);
const TG_1 = '111111';
const TG_2 = '222222';

let config: ChatServerConfig;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'alpha-tg-test-'));
  config = { ...DEFAULT_CONFIG, port: 0, dbPath: join(dir, 'test.db') };
  initStore(config);
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
});

describe('alpha-tg-link', () => {
  it('binds a freshly issued token and resolves the tg_user_id', () => {
    const { token } = issueLinkToken(WALLET_A);
    expect(token.startsWith('alpha_')).toBe(true);
    expect(isAlphaTgBound(WALLET_A)).toBe(false);

    const r = bindAlphaTelegram(token, TG_1);
    expect(r.ok).toBe(true);
    expect(r.wallet).toBe(WALLET_A.toLowerCase());
    expect(getAlphaTgUserId(WALLET_A)).toBe(TG_1);
    expect(isAlphaTgBound(WALLET_A)).toBe(true);
  });

  it('consumes the token: a second bind with the same token fails', () => {
    const { token } = issueLinkToken(WALLET_A);
    expect(bindAlphaTelegram(token, TG_1).ok).toBe(true);
    expect(bindAlphaTelegram(token, TG_2).ok).toBe(false);
    // First binding stands.
    expect(getAlphaTgUserId(WALLET_A)).toBe(TG_1);
  });

  it('rejects an expired token', () => {
    const { token } = issueLinkToken(WALLET_A);
    getDb()
      .prepare(`UPDATE alpha_tg_binding SET token_expires_at = ? WHERE wallet_address = ?`)
      .run(Date.now() - 1000, WALLET_A.toLowerCase());
    expect(bindAlphaTelegram(token, TG_1).ok).toBe(false);
    expect(isAlphaTgBound(WALLET_A)).toBe(false);
  });

  it('rejects an unknown token', () => {
    expect(bindAlphaTelegram('alpha_deadbeef', TG_1).ok).toBe(false);
  });

  it('re-issuing a token invalidates the previous one', () => {
    const { token: t1 } = issueLinkToken(WALLET_A);
    const { token: t2 } = issueLinkToken(WALLET_A);
    expect(t1).not.toBe(t2);
    expect(bindAlphaTelegram(t1, TG_1).ok).toBe(false);
    expect(bindAlphaTelegram(t2, TG_1).ok).toBe(true);
  });

  it('enforces one Telegram account per wallet (detaches the prior wallet)', () => {
    // TG_1 binds to wallet A.
    bindAlphaTelegram(issueLinkToken(WALLET_A).token, TG_1);
    expect(getAlphaTgUserId(WALLET_A)).toBe(TG_1);

    // Same TG_1 now binds to wallet B → A must be detached.
    const r = bindAlphaTelegram(issueLinkToken(WALLET_B).token, TG_1);
    expect(r.ok).toBe(true);
    expect(getAlphaTgUserId(WALLET_B)).toBe(TG_1);
    expect(getAlphaTgUserId(WALLET_A)).toBeNull();
    expect(isAlphaTgBound(WALLET_A)).toBe(false);
  });
});
