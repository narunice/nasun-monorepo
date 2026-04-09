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

  // Verify FK enforcement
  const fkStatus = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
  if (!fkStatus[0]?.foreign_keys) {
    throw new Error('FATAL: foreign_keys pragma failed to enable');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      reply_to_id INTEGER,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_ts
      ON messages(timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_id_desc
      ON messages(id DESC);

    CREATE TABLE IF NOT EXISTS users (
      identity_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      provider TEXT,
      last_seen_at INTEGER
    );
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
      `INSERT INTO messages (sender_id, sender_name, content, message_type, reply_to_id, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(msg.senderId, msg.senderName, msg.content, msg.messageType, msg.replyToId, msg.timestamp);

  return { ...msg, id: result.lastInsertRowid as number };
}

export function getRecentMessages(
  limit: number = 50,
  beforeId?: number
): StoredMessage[] {
  const query = beforeId
    ? `SELECT id, sender_id as senderId, sender_name as senderName, content,
         message_type as messageType, reply_to_id as replyToId, timestamp
       FROM messages WHERE id < ? ORDER BY id DESC LIMIT ?`
    : `SELECT id, sender_id as senderId, sender_name as senderName, content,
         message_type as messageType, reply_to_id as replyToId, timestamp
       FROM messages ORDER BY id DESC LIMIT ?`;

  const params = beforeId ? [beforeId, limit] : [limit];
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

export function upsertUser(identityId: string, displayName: string, provider?: string): void {
  getDb()
    .prepare(
      `INSERT INTO users (identity_id, display_name, provider, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(identity_id) DO UPDATE SET
         display_name = excluded.display_name,
         last_seen_at = excluded.last_seen_at`
    )
    .run(identityId, displayName, provider ?? null, Date.now());
}

export function closeStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}
