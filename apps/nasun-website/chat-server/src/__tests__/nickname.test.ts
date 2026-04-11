import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initStore, closeStore, getDb, upsertUser,
  validateNickname, getNickname, setNickname, isNicknameAvailable,
  getNicknamesBatch, getNicknameRateLimit,
} from '../store.js';
import { type ChatServerConfig, DEFAULT_CONFIG } from '../types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeConfig(): ChatServerConfig {
  const tempDir = mkdtempSync(join(tmpdir(), 'chat-nick-'));
  return {
    ...DEFAULT_CONFIG,
    port: 0,
    dbPath: join(tempDir, 'test.db'),
    allowedOrigins: ['http://localhost'],
  };
}

let config: ChatServerConfig;

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
    rmSync(config.dbPath.replace(/\/[^/]+$/, ''), { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ===== validateNickname =====

describe('validateNickname', () => {
  it('accepts valid nicknames', () => {
    expect(validateNickname('alice')).toEqual({ ok: true });
    expect(validateNickname('Bob_123')).toEqual({ ok: true });
    expect(validateNickname('a-b')).toEqual({ ok: true });
    expect(validateNickname('ab')).toEqual({ ok: true }); // min 2 chars
    expect(validateNickname('a'.repeat(16))).toEqual({ ok: true }); // max 16 chars
  });

  it('rejects too short', () => {
    expect(validateNickname('a').ok).toBe(false);
    expect(validateNickname('').ok).toBe(false);
  });

  it('rejects too long', () => {
    expect(validateNickname('a'.repeat(17)).ok).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(validateNickname('hello world').ok).toBe(false); // space
    expect(validateNickname('hello@world').ok).toBe(false);
    expect(validateNickname('hello.world').ok).toBe(false);
    expect(validateNickname('hello!').ok).toBe(false);
    expect(validateNickname('<script>').ok).toBe(false);
  });

  it('rejects reserved names', () => {
    expect(validateNickname('admin')).toEqual({ ok: false, error: 'reserved' });
    expect(validateNickname('ADMIN')).toEqual({ ok: false, error: 'reserved' });
    expect(validateNickname('system')).toEqual({ ok: false, error: 'reserved' });
    expect(validateNickname('bot')).toEqual({ ok: false, error: 'reserved' });
    expect(validateNickname('nasun')).toEqual({ ok: false, error: 'reserved' });
    expect(validateNickname('moderator')).toEqual({ ok: false, error: 'reserved' });
  });

  it('allows non-reserved names that start with reserved words', () => {
    expect(validateNickname('admins').ok).toBe(true);
    expect(validateNickname('botter').ok).toBe(true);
  });
});

// ===== setNickname + getNickname =====

describe('setNickname', () => {
  it('sets nickname for user with existing users row', () => {
    upsertUser('0xAAA', 'Alice');
    const result = setNickname('0xAAA', 'alice');
    expect(result.ok).toBe(true);
    expect(getNickname('0xAAA')).toBe('alice');
  });

  it('returns null for user without nickname', () => {
    upsertUser('0xBBB', 'Bob');
    expect(getNickname('0xBBB')).toBeNull();
  });

  it('rejects duplicate nickname (case insensitive)', () => {
    upsertUser('0xAAA', 'Alice');
    upsertUser('0xBBB', 'Bob');
    setNickname('0xAAA', 'alice');

    const result = setNickname('0xBBB', 'Alice'); // same name, different case
    expect(result.ok).toBe(false);
    expect(result.error).toBe('already_taken');
  });

  it('allows same user to re-set to same name', () => {
    upsertUser('0xAAA', 'Alice');
    setNickname('0xAAA', 'alice');
    // Changing to exact same name should not fail (rate limit allows it)
    const result = setNickname('0xAAA', 'alice');
    // This actually triggers rate-limit-like behavior since it's a "change"
    // but the nickname itself doesn't conflict because it's the same user
    // The UNIQUE constraint won't fire. Result depends on rate limit logic.
    expect(result.ok).toBe(true);
  });

  it('rejects invalid nickname format', () => {
    upsertUser('0xAAA', 'Alice');
    const result = setNickname('0xAAA', 'a'); // too short
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_format');
  });

  it('rejects reserved nickname', () => {
    upsertUser('0xAAA', 'Alice');
    const result = setNickname('0xAAA', 'admin');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('reserved');
  });

  it('returns rateLimit info on success', () => {
    upsertUser('0xAAA', 'Alice');
    const result = setNickname('0xAAA', 'alice');
    expect(result.ok).toBe(true);
    expect(result.rateLimit).toBeDefined();
    expect(result.rateLimit!.canChange).toBe(true);
  });
});

// ===== isNicknameAvailable =====

describe('isNicknameAvailable', () => {
  it('returns true for unused nickname', () => {
    expect(isNicknameAvailable('newname')).toBe(true);
  });

  it('returns false for taken nickname', () => {
    upsertUser('0xAAA', 'Alice');
    setNickname('0xAAA', 'alice');
    expect(isNicknameAvailable('alice')).toBe(false);
  });

  it('case insensitive check', () => {
    upsertUser('0xAAA', 'Alice');
    setNickname('0xAAA', 'alice');
    expect(isNicknameAvailable('ALICE')).toBe(false);
    expect(isNicknameAvailable('Alice')).toBe(false);
  });
});

// ===== getNicknamesBatch =====

describe('getNicknamesBatch', () => {
  it('returns empty map for no addresses', () => {
    expect(getNicknamesBatch([]).size).toBe(0);
  });

  it('returns nicknames for addresses that have them', () => {
    upsertUser('0xAAA', 'Alice');
    upsertUser('0xBBB', 'Bob');
    setNickname('0xAAA', 'alice');
    // 0xBBB has no nickname

    const map = getNicknamesBatch(['0xAAA', '0xBBB', '0xCCC']);
    expect(map.get('0xAAA')).toBe('alice');
    expect(map.has('0xBBB')).toBe(false); // no nickname
    expect(map.has('0xCCC')).toBe(false); // not even a user
  });

  it('handles batch of many addresses', () => {
    for (let i = 0; i < 20; i++) {
      const addr = `0x${i.toString(16).padStart(4, '0')}`;
      upsertUser(addr, `User${i}`);
      if (i % 2 === 0) setNickname(addr, `nick${i}`);
    }

    const addresses = Array.from({ length: 20 }, (_, i) => `0x${i.toString(16).padStart(4, '0')}`);
    const map = getNicknamesBatch(addresses);
    expect(map.size).toBe(10); // every other user
  });
});

// ===== getNicknameRateLimit =====

describe('getNicknameRateLimit', () => {
  it('returns canChange=true for new user', () => {
    const rl = getNicknameRateLimit('0xNEW');
    expect(rl.canChange).toBe(true);
    expect(rl.changesRemaining).toBe(10);
    expect(rl.lockedUntil).toBeNull();
  });

  it('decrements remaining after change', () => {
    upsertUser('0xAAA', 'Alice');
    setNickname('0xAAA', 'nick1'); // first set: free, but starts window (count=1)
    setNickname('0xAAA', 'nick2'); // second set: count=2

    const rl = getNicknameRateLimit('0xAAA');
    expect(rl.canChange).toBe(true);
    expect(rl.changesRemaining).toBe(8); // 10 - 2 = 8
  });

  it('locks after exhausting changes within grace window', () => {
    upsertUser('0xAAA', 'Alice');
    // First set is free
    setNickname('0xAAA', 'nick0');
    // Then 10 changes within grace window
    for (let i = 1; i <= 10; i++) {
      setNickname('0xAAA', `nick${i}`);
    }

    const rl = getNicknameRateLimit('0xAAA');
    expect(rl.canChange).toBe(false);
    expect(rl.changesRemaining).toBe(0);
    expect(rl.lockedUntil).toBeGreaterThan(Date.now());
  });

  it('rate_limited error when locked', () => {
    upsertUser('0xAAA', 'Alice');
    setNickname('0xAAA', 'nick0');
    for (let i = 1; i <= 10; i++) {
      setNickname('0xAAA', `nick${i}`);
    }

    const result = setNickname('0xAAA', 'onemore');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('rate_limited');
    expect(result.rateLimit?.canChange).toBe(false);
  });
});

// ===== Schema migration =====

describe('schema migration', () => {
  it('follows table is created', () => {
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('follows');
  });

  it('users table has nickname column', () => {
    const cols = getDb()
      .prepare("PRAGMA table_info(users)")
      .all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('nickname');
    expect(colNames).toContain('nickname_window_start');
    expect(colNames).toContain('nickname_change_count');
  });
});
