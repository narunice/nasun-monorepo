import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StoredMessage, ChatServerConfig } from './types.js';

let db: Database.Database | null = null;

export function initStore(config: ChatServerConfig): void {
  mkdirSync(dirname(config.dbPath), { recursive: true });

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  const fkStatus = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
  if (!fkStatus[0]?.foreign_keys) {
    throw new Error('FATAL: foreign_keys pragma failed to enable');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL DEFAULT 0,
      sender TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      reply_to_id INTEGER,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_ts
      ON messages(room_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_room_id_desc
      ON messages(room_id, id DESC);

    CREATE TABLE IF NOT EXISTS reactions (
      message_id INTEGER NOT NULL,
      address TEXT NOT NULL,
      emoji_code TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (message_id, address),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_reactions_message
      ON reactions(message_id, emoji_code);

    CREATE TABLE IF NOT EXISTS users (
      address TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      last_seen_at INTEGER
    );
  `);

  purgeOldMessages(config.messageRetentionDays);
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Store not initialized. Call initStore() first.');
  return db;
}

export function insertMessage(msg: Omit<StoredMessage, 'id'>): StoredMessage {
  const result = getDb()
    .prepare(
      `INSERT INTO messages (room_id, sender, sender_name, content, message_type, reply_to_id, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(msg.roomId, msg.sender, msg.senderName, msg.content, msg.messageType, msg.replyToId, msg.timestamp);

  return { ...msg, id: result.lastInsertRowid as number };
}

export function getRecentMessages(
  roomId: number,
  limit: number = 50,
  beforeId?: number
): StoredMessage[] {
  const query = beforeId
    ? `SELECT id, room_id as roomId, sender, sender_name as senderName, content,
         message_type as messageType, reply_to_id as replyToId, timestamp
       FROM messages WHERE room_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
    : `SELECT id, room_id as roomId, sender, sender_name as senderName, content,
         message_type as messageType, reply_to_id as replyToId, timestamp
       FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT ?`;

  const params = beforeId ? [roomId, beforeId, limit] : [roomId, limit];
  const rows = getDb().prepare(query).all(...params) as StoredMessage[];

  return rows.reverse();
}

export function purgeOldMessages(retentionDays: number): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result = getDb()
    .prepare('DELETE FROM messages WHERE timestamp < ?')
    .run(cutoff);
  return result.changes;
}

export function upsertUser(address: string, displayName: string): void {
  getDb()
    .prepare(
      `INSERT INTO users (address, display_name, last_seen_at)
       VALUES (?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         display_name = excluded.display_name,
         last_seen_at = excluded.last_seen_at`
    )
    .run(address, displayName, Date.now());
}

// ===== Reactions =====

export function toggleReaction(
  messageId: number,
  address: string,
  emojiCode: string
): Record<string, number> {
  const d = getDb();
  return d.transaction(() => {
    // Try to remove same emoji (toggle off)
    const deleted = d
      .prepare('DELETE FROM reactions WHERE message_id=? AND address=? AND emoji_code=?')
      .run(messageId, address, emojiCode);

    if (deleted.changes === 0) {
      // Not removed = different emoji or none -> insert or replace
      d.prepare(
        'INSERT OR REPLACE INTO reactions (message_id, address, emoji_code, created_at) VALUES (?, ?, ?, ?)'
      ).run(messageId, address, emojiCode, Date.now());
    }

    return getReactionSummaryForMessage(messageId);
  })();
}

export function getUserReaction(messageId: number, address: string): string | null {
  const row = getDb()
    .prepare('SELECT emoji_code FROM reactions WHERE message_id=? AND address=?')
    .get(messageId, address) as { emoji_code: string } | undefined;
  return row?.emoji_code ?? null;
}

export function getReactionSummaryForMessage(messageId: number): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT emoji_code, COUNT(*) as cnt FROM reactions WHERE message_id=? GROUP BY emoji_code')
    .all(messageId) as Array<{ emoji_code: string; cnt: number }>;

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.emoji_code] = row.cnt;
  }
  return result;
}

export function getReactionSummaries(
  messageIds: number[],
  viewerAddress?: string
): Map<number, { reactions: Record<string, number>; myReaction: string | null }> {
  if (messageIds.length === 0) return new Map();

  const placeholders = messageIds.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT message_id, emoji_code, COUNT(*) as cnt
       FROM reactions WHERE message_id IN (${placeholders})
       GROUP BY message_id, emoji_code`
    )
    .all(...messageIds) as Array<{ message_id: number; emoji_code: string; cnt: number }>;

  const result = new Map<number, { reactions: Record<string, number>; myReaction: string | null }>();
  for (const row of rows) {
    let entry = result.get(row.message_id);
    if (!entry) {
      entry = { reactions: {}, myReaction: null };
      result.set(row.message_id, entry);
    }
    entry.reactions[row.emoji_code] = row.cnt;
  }

  if (viewerAddress) {
    const myRows = getDb()
      .prepare(
        `SELECT message_id, emoji_code FROM reactions
         WHERE message_id IN (${placeholders}) AND address = ?`
      )
      .all(...messageIds, viewerAddress) as Array<{ message_id: number; emoji_code: string }>;

    for (const row of myRows) {
      let entry = result.get(row.message_id);
      if (!entry) {
        entry = { reactions: {}, myReaction: null };
        result.set(row.message_id, entry);
      }
      entry.myReaction = row.emoji_code;
    }
  }

  return result;
}

export function getMessageRoomId(messageId: number): number | null {
  const row = getDb()
    .prepare('SELECT room_id FROM messages WHERE id = ?')
    .get(messageId) as { room_id: number } | undefined;
  return row?.room_id ?? null;
}

export function closeStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}
