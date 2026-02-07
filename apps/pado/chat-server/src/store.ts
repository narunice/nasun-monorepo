import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StoredMessage, ChatServerConfig, NicknameRateLimit } from './types.js';

let db: Database.Database | null = null;

// Nickname validation
const NICKNAME_REGEX = /^[a-zA-Z0-9_-]{2,16}$/;
const RESERVED_NICKNAMES = new Set([
  'admin', 'system', 'bot', 'pado', 'nasun', 'mod', 'moderator',
]);

// Nickname rate limit constants
const GRACE_WINDOW_MS = 60 * 60 * 1000;           // 1 hour
const LOCK_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CHANGES_IN_WINDOW = 10;

export function initStore(config: ChatServerConfig): void {
  mkdirSync(dirname(config.dbPath), { recursive: true });

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL DEFAULT 0,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      reply_to_id INTEGER,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_ts
      ON messages(room_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_room_id
      ON messages(room_id, id DESC);

    CREATE TABLE IF NOT EXISTS users (
      address TEXT PRIMARY KEY,
      nickname TEXT UNIQUE NOT NULL COLLATE NOCASE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname
      ON users(nickname COLLATE NOCASE);
  `);

  // Migration: add nickname rate limit columns (safe to re-run)
  try { db.exec('ALTER TABLE users ADD COLUMN nickname_window_start INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN nickname_change_count INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

  // Purge old messages on startup
  purgeOldMessages(config.messageRetentionDays);
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Store not initialized. Call initStore() first.');
  return db;
}

export function insertMessage(msg: Omit<StoredMessage, 'id'>): StoredMessage {
  const result = getDb()
    .prepare(
      `INSERT INTO messages (room_id, sender, content, message_type, reply_to_id, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(msg.roomId, msg.sender, msg.content, msg.messageType, msg.replyToId, msg.timestamp);

  return { ...msg, id: result.lastInsertRowid as number };
}

export function getRecentMessages(
  roomId: number,
  limit: number = 50,
  beforeId?: number
): StoredMessage[] {
  const query = beforeId
    ? `SELECT id, room_id as roomId, sender, content, message_type as messageType,
         reply_to_id as replyToId, timestamp
       FROM messages WHERE room_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
    : `SELECT id, room_id as roomId, sender, content, message_type as messageType,
         reply_to_id as replyToId, timestamp
       FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT ?`;

  const params = beforeId ? [roomId, beforeId, limit] : [roomId, limit];
  const rows = getDb().prepare(query).all(...params) as StoredMessage[];

  // Return in ascending order (oldest first)
  return rows.reverse();
}

export function purgeOldMessages(retentionDays: number): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result = getDb()
    .prepare('DELETE FROM messages WHERE timestamp < ?')
    .run(cutoff);
  return result.changes;
}

// ===== Nickname API =====

export function validateNickname(nickname: string): { ok: boolean; error?: string } {
  if (!NICKNAME_REGEX.test(nickname)) {
    return { ok: false, error: 'invalid_format' };
  }
  if (RESERVED_NICKNAMES.has(nickname.toLowerCase())) {
    return { ok: false, error: 'reserved' };
  }
  return { ok: true };
}

export function getNicknameRateLimit(address: string): NicknameRateLimit {
  const row = getDb()
    .prepare('SELECT nickname_window_start, nickname_change_count FROM users WHERE address = ?')
    .get(address) as { nickname_window_start: number | null; nickname_change_count: number } | undefined;

  // No user or no window yet (first time setting)
  if (!row || !row.nickname_window_start) {
    return { canChange: true, changesRemaining: MAX_CHANGES_IN_WINDOW, lockedUntil: null };
  }

  const now = Date.now();
  const windowStart = row.nickname_window_start;
  const changeCount = row.nickname_change_count;

  // Within grace window (< 1 hour since first change in window)
  if (now - windowStart < GRACE_WINDOW_MS) {
    const remaining = MAX_CHANGES_IN_WINDOW - changeCount;
    if (remaining <= 0) {
      // Exhausted all changes within the grace window; locked until window + lock
      const lockedUntil = windowStart + GRACE_WINDOW_MS + LOCK_DURATION_MS;
      return { canChange: false, changesRemaining: 0, lockedUntil };
    }
    return { canChange: true, changesRemaining: remaining, lockedUntil: null };
  }

  // Grace window expired — check if lock is still active
  const lockEnd = windowStart + GRACE_WINDOW_MS + LOCK_DURATION_MS;
  if (now < lockEnd) {
    return { canChange: false, changesRemaining: 0, lockedUntil: lockEnd };
  }

  // Lock expired — can change again (new window will start)
  return { canChange: true, changesRemaining: MAX_CHANGES_IN_WINDOW, lockedUntil: null };
}

export function getNickname(address: string): string | null {
  const row = getDb()
    .prepare('SELECT nickname FROM users WHERE address = ?')
    .get(address) as { nickname: string } | undefined;
  return row?.nickname ?? null;
}

export function isNicknameAvailable(nickname: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM users WHERE nickname = ? COLLATE NOCASE')
    .get(nickname);
  return !row;
}

export function setNickname(
  address: string,
  nickname: string
): { ok: boolean; error?: string; rateLimit?: NicknameRateLimit } {
  const validation = validateNickname(nickname);
  if (!validation.ok) return validation;

  const db = getDb();

  // Wrap in a transaction to prevent TOCTOU race between rate limit check and write
  const txn = db.transaction(() => {
    // Check rate limit (skip for users without a nickname — first-time set is always allowed)
    const existingNickname = getNickname(address);
    if (existingNickname !== null) {
      const rateLimit = getNicknameRateLimit(address);
      if (!rateLimit.canChange) {
        return { ok: false as const, error: 'rate_limited', rateLimit };
      }
    }

    const now = Date.now();

    // Check if this is a new window start or continuation
    const row = db
      .prepare('SELECT nickname_window_start, nickname_change_count FROM users WHERE address = ?')
      .get(address) as { nickname_window_start: number | null; nickname_change_count: number } | undefined;

    let windowStart = now;
    let changeCount = 1;

    if (row && row.nickname_window_start) {
      const elapsed = now - row.nickname_window_start;
      const lockEnd = row.nickname_window_start + GRACE_WINDOW_MS + LOCK_DURATION_MS;

      if (elapsed < GRACE_WINDOW_MS) {
        // Still within grace window — continue the window
        windowStart = row.nickname_window_start;
        changeCount = row.nickname_change_count + 1;
      } else if (now >= lockEnd) {
        // Lock expired — start a new window
        windowStart = now;
        changeCount = 1;
      }
      // else: within lock period — should have been caught by rate limit check above
    }

    db
      .prepare(
        `INSERT INTO users (address, nickname, created_at, updated_at, nickname_window_start, nickname_change_count)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           nickname = excluded.nickname,
           updated_at = excluded.updated_at,
           nickname_window_start = excluded.nickname_window_start,
           nickname_change_count = excluded.nickname_change_count`
      )
      .run(address, nickname, now, now, windowStart, changeCount);

    const rateLimit = getNicknameRateLimit(address);
    return { ok: true as const, rateLimit };
  });

  try {
    return txn();
  } catch (err: unknown) {
    // UNIQUE constraint violation (case-insensitive)
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return { ok: false, error: 'already_taken' };
    }
    throw err;
  }
}

export function getNicknamesBatch(addresses: string[]): Map<string, string> {
  if (addresses.length === 0) return new Map();

  const placeholders = addresses.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT address, nickname FROM users WHERE address IN (${placeholders})`)
    .all(...addresses) as Array<{ address: string; nickname: string }>;

  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.address, row.nickname);
  }
  return result;
}

export function closeStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}
