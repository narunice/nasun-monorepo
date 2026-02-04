import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StoredMessage, ChatServerConfig } from './types.js';

let db: Database.Database | null = null;

// Nickname validation
const NICKNAME_REGEX = /^[a-zA-Z0-9_-]{2,16}$/;
const RESERVED_NICKNAMES = new Set([
  'admin', 'system', 'bot', 'pado', 'nasun', 'mod', 'moderator',
]);

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
): { ok: boolean; error?: string } {
  const validation = validateNickname(nickname);
  if (!validation.ok) return validation;

  try {
    const now = Date.now();
    getDb()
      .prepare(
        `INSERT INTO users (address, nickname, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET nickname = excluded.nickname, updated_at = excluded.updated_at`
      )
      .run(address, nickname, now, now);
    return { ok: true };
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
