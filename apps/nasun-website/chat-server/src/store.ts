import Database from 'better-sqlite3';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { StoredMessage, ChatServerConfig, NicknameRateLimit } from './types.js';

// Nickname validation
const NICKNAME_REGEX = /^[a-zA-Z0-9_-]{2,16}$/;
const RESERVED_NICKNAMES = new Set([
  'admin', 'system', 'bot', 'pado', 'nasun', 'mod', 'moderator',
]);

// Nickname rate limit constants
const GRACE_WINDOW_MS = 60 * 60 * 1000;           // 1 hour
const LOCK_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CHANGES_IN_WINDOW = 10;

// Profile cache constants
const PROFILE_TTL_MS = 30 * 60 * 1000;           // 30 minutes
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;     // 5 minutes for failed lookups
const FETCH_TIMEOUT_MS = 5000;
const inFlightRequests = new Map<string, Promise<void>>();

let db: Database.Database | null = null;
let nasunProfileApiUrl = '';

export function initStore(config: ChatServerConfig): void {
  mkdirSync(dirname(config.dbPath), { recursive: true });

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');

  const fkStatus = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
  if (!fkStatus[0]?.foreign_keys) {
    throw new Error('FATAL: foreign_keys pragma failed to enable');
  }

  // Recover leftover WAL frames from previous unclean shutdown.
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }

  // Detect DB corruption early — chat.db is small (<10MB), completes in <100ms.
  const integrityRows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  if (integrityRows[0]?.integrity_check !== 'ok') {
    const absPath = resolve(config.dbPath);
    const corruptPath = `${absPath}.corrupt.${Date.now()}`;
    console.error(`[Store] DB integrity check FAILED. Preserving corrupt file at: ${corruptPath}`);
    db.close();
    renameSync(absPath, corruptPath);
    // NOTE: This discards all chat history. Tradeoff: availability > data retention.
    db = new Database(absPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    const fkRecovery = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    if (!fkRecovery[0]?.foreign_keys) {
      throw new Error('FATAL: foreign_keys pragma failed after corrupt DB recovery');
    }
    // Falls through to db.exec(CREATE TABLE IF NOT EXISTS ...) + migrations below.
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

    CREATE TABLE IF NOT EXISTS follows (
      follower TEXT NOT NULL,
      followed TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (follower, followed)
    );

    CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower);
    CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed);
  `);

  // Migration: add nickname columns to users table (safe to re-run)
  try { db.exec('ALTER TABLE users ADD COLUMN nickname TEXT COLLATE NOCASE'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN nickname_window_start INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN nickname_change_count INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

  // Case-insensitive unique index for nickname (CREATE IF NOT EXISTS is safe to re-run)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname COLLATE NOCASE) WHERE nickname IS NOT NULL');

  // Migration: genesis pass badge
  try { db.exec('ALTER TABLE users ADD COLUMN has_genesis_pass INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

  // Migration: genesis pass cache timestamp (0 = never checked, triggers immediate refresh)
  try { db.exec('ALTER TABLE users ADD COLUMN gp_checked_at INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

  // Migration: profile image URL
  try { db.exec('ALTER TABLE users ADD COLUMN profile_image_url TEXT'); } catch { /* already exists */ }

  // Nasun ecosystem profile cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS nasun_profiles (
      address TEXT PRIMARY KEY,
      resolved_display_name TEXT,
      profile_image_url TEXT,
      fetched_at INTEGER NOT NULL
    );
  `);
  try { db.exec('ALTER TABLE nasun_profiles ADD COLUMN twitter_handle TEXT'); } catch { /* already exists */ }

  nasunProfileApiUrl = config.nasunProfileApiUrl;
  if (nasunProfileApiUrl) {
    console.log(`[nasun-profile] API URL: ${nasunProfileApiUrl}`);
  } else {
    console.log('[nasun-profile] API URL: NOT SET (display name sync disabled)');
  }

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

export function upsertUser(address: string, displayName: string, profileImageUrl?: string): void {
  getDb()
    .prepare(
      `INSERT INTO users (address, display_name, profile_image_url, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         display_name = excluded.display_name,
         profile_image_url = COALESCE(excluded.profile_image_url, profile_image_url),
         last_seen_at = excluded.last_seen_at`
    )
    .run(address, displayName, profileImageUrl ?? null, Date.now());
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

  if (!row || !row.nickname_window_start) {
    return { canChange: true, changesRemaining: MAX_CHANGES_IN_WINDOW, lockedUntil: null };
  }

  const now = Date.now();
  const windowStart = row.nickname_window_start;
  const changeCount = row.nickname_change_count;

  if (now - windowStart < GRACE_WINDOW_MS) {
    const remaining = MAX_CHANGES_IN_WINDOW - changeCount;
    if (remaining <= 0) {
      const lockedUntil = windowStart + GRACE_WINDOW_MS + LOCK_DURATION_MS;
      return { canChange: false, changesRemaining: 0, lockedUntil };
    }
    return { canChange: true, changesRemaining: remaining, lockedUntil: null };
  }

  const lockEnd = windowStart + GRACE_WINDOW_MS + LOCK_DURATION_MS;
  if (now < lockEnd) {
    return { canChange: false, changesRemaining: 0, lockedUntil: lockEnd };
  }

  return { canChange: true, changesRemaining: MAX_CHANGES_IN_WINDOW, lockedUntil: null };
}

export function getNickname(address: string): string | null {
  const row = getDb()
    .prepare('SELECT nickname FROM users WHERE address = ?')
    .get(address) as { nickname: string | null } | undefined;
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

  const d = getDb();

  const txn = d.transaction(() => {
    // Check rate limit (skip for first-time set)
    const existingNickname = getNickname(address);
    if (existingNickname !== null) {
      const rateLimit = getNicknameRateLimit(address);
      if (!rateLimit.canChange) {
        return { ok: false as const, error: 'rate_limited', rateLimit };
      }
    }

    const now = Date.now();

    const row = d
      .prepare('SELECT nickname_window_start, nickname_change_count FROM users WHERE address = ?')
      .get(address) as { nickname_window_start: number | null; nickname_change_count: number } | undefined;

    let windowStart = now;
    let changeCount = 1;

    if (row && row.nickname_window_start) {
      const elapsed = now - row.nickname_window_start;
      const lockEnd = row.nickname_window_start + GRACE_WINDOW_MS + LOCK_DURATION_MS;

      if (elapsed < GRACE_WINDOW_MS) {
        windowStart = row.nickname_window_start;
        changeCount = row.nickname_change_count + 1;
      } else if (now >= lockEnd) {
        windowStart = now;
        changeCount = 1;
      }
    }

    // Upsert: user row may already exist from upsertUser()
    d.prepare(
      `UPDATE users SET nickname = ?, nickname_window_start = ?, nickname_change_count = ?
       WHERE address = ?`
    ).run(nickname, windowStart, changeCount, address);

    const rateLimit = getNicknameRateLimit(address);
    return { ok: true as const, rateLimit };
  });

  try {
    return txn();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return { ok: false, error: 'already_taken' };
    }
    throw err;
  }
}

export function clearNickname(address: string): { ok: boolean; error?: string; rateLimit?: NicknameRateLimit } {
  const d = getDb();
  return d.transaction(() => {
    const existing = getNickname(address);
    if (existing === null) return { ok: false as const, error: 'no_nickname' };

    // Clearing (reset) is always allowed regardless of rate limit.
    // Rate limit only applies to setting/changing nicknames.

    const now = Date.now();
    const row = d
      .prepare('SELECT nickname_window_start, nickname_change_count FROM users WHERE address = ?')
      .get(address) as { nickname_window_start: number | null; nickname_change_count: number } | undefined;

    let windowStart = now;
    let changeCount = 1;
    if (row && row.nickname_window_start) {
      const elapsed = now - row.nickname_window_start;
      const lockEnd = row.nickname_window_start + GRACE_WINDOW_MS + LOCK_DURATION_MS;
      if (elapsed < GRACE_WINDOW_MS) {
        windowStart = row.nickname_window_start;
        changeCount = row.nickname_change_count + 1;
      } else if (now >= lockEnd) {
        windowStart = now;
        changeCount = 1;
      }
    }

    d.prepare(
      'UPDATE users SET nickname = NULL, nickname_window_start = ?, nickname_change_count = ? WHERE address = ?'
    ).run(windowStart, changeCount, address);

    return { ok: true as const, rateLimit: getNicknameRateLimit(address) };
  })();
}

export function getNicknamesBatch(addresses: string[]): Map<string, string> {
  if (addresses.length === 0) return new Map();

  const placeholders = addresses.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT address, nickname FROM users WHERE address IN (${placeholders}) AND nickname IS NOT NULL`)
    .all(...addresses) as Array<{ address: string; nickname: string }>;

  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.address, row.nickname);
  }
  return result;
}

// ===== Follows API =====

const MAX_FOLLOWED = 50;

export function toggleFollow(
  follower: string,
  followed: string
): { following: boolean; followerCount: number } {
  const d = getDb();

  const nFollower = follower.toLowerCase();
  const nFollowed = followed.toLowerCase();

  if (nFollower === nFollowed) throw new Error('SELF_FOLLOW');

  return d.transaction(() => {
    const existing = d
      .prepare('SELECT 1 FROM follows WHERE follower=? AND followed=?')
      .get(nFollower, nFollowed);

    if (existing) {
      d.prepare('DELETE FROM follows WHERE follower=? AND followed=?').run(nFollower, nFollowed);
      const count = d.prepare('SELECT COUNT(*) as c FROM follows WHERE followed=?').pluck().get(nFollowed) as number;
      return { following: false, followerCount: count };
    }

    const currentCount = d.prepare('SELECT COUNT(*) as c FROM follows WHERE follower=?').pluck().get(nFollower) as number;
    if (currentCount >= MAX_FOLLOWED) throw new Error('MAX_FOLLOWED_EXCEEDED');

    d.prepare('INSERT INTO follows (follower, followed) VALUES (?, ?)').run(nFollower, nFollowed);
    const count = d.prepare('SELECT COUNT(*) as c FROM follows WHERE followed=?').pluck().get(nFollowed) as number;
    return { following: true, followerCount: count };
  })();
}

export function getFollowing(address: string): string[] {
  const rows = getDb()
    .prepare('SELECT followed FROM follows WHERE follower=? ORDER BY created_at DESC')
    .all(address.toLowerCase()) as Array<{ followed: string }>;
  return rows.map((r) => r.followed);
}

export function getFollowerCounts(addresses: string[]): Map<string, number> {
  if (addresses.length === 0) return new Map();

  const normalized = addresses.map((a) => a.toLowerCase());
  const placeholders = normalized.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT followed, COUNT(*) as cnt FROM follows WHERE followed IN (${placeholders}) GROUP BY followed`)
    .all(...normalized) as Array<{ followed: string; cnt: number }>;

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(row.followed, row.cnt);
  }
  return result;
}

export function getFollowingCount(address: string): number {
  return getDb()
    .prepare('SELECT COUNT(*) as c FROM follows WHERE follower=?')
    .pluck()
    .get(address.toLowerCase()) as number;
}

// Returns distinct sender addresses that participated in chat on the given UTC date.
// Used by the ecosystem points scanner to detect chat participation.
export function getChatParticipants(dateStr: string): string[] {
  const dayStartMs = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT sender FROM messages
       WHERE timestamp >= ? AND timestamp < ?
         AND message_type != 'system'
         AND sender != 'SYSTEM'`
    )
    .all(dayStartMs, dayEndMs) as Array<{ sender: string }>;
  return rows.map((r) => r.sender);
}

// ===== Genesis Pass Badge =====

export function setGenesisPassStatus(address: string, hasPass: boolean): void {
  getDb()
    .prepare('UPDATE users SET has_genesis_pass = ?, gp_checked_at = ? WHERE address = ?')
    .run(hasPass ? 1 : 0, Date.now(), address);
}

export function getGenesisPassCheckedAt(address: string): number {
  const row = getDb()
    .prepare('SELECT gp_checked_at FROM users WHERE address = ?')
    .get(address) as { gp_checked_at: number } | undefined;
  return row?.gp_checked_at ?? 0;
}

export function getGenesisPassStatus(address: string): boolean {
  const row = getDb()
    .prepare('SELECT has_genesis_pass FROM users WHERE address = ?')
    .get(address) as { has_genesis_pass: number } | undefined;
  return (row?.has_genesis_pass ?? 0) === 1;
}

export function getGenesisPassBatch(addresses: string[]): Set<string> {
  if (addresses.length === 0) return new Set();
  const placeholders = addresses.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT address FROM users WHERE address IN (${placeholders}) AND has_genesis_pass = 1`)
    .all(...addresses) as Array<{ address: string }>;
  return new Set(rows.map((r) => r.address));
}

export function getProfileImagesBatch(addresses: string[]): Map<string, string> {
  if (addresses.length === 0) return new Map();
  const rows = getDb()
    .prepare(
      `SELECT
        input.address AS address,
        COALESCE(u.profile_image_url, np.profile_image_url) AS profile_image_url
       FROM (SELECT value AS address FROM json_each(?)) AS input
       LEFT JOIN users u ON u.address = input.address
       LEFT JOIN nasun_profiles np ON np.address = input.address
       WHERE u.profile_image_url IS NOT NULL OR np.profile_image_url IS NOT NULL`
    )
    .all(JSON.stringify(addresses)) as Array<{ address: string; profile_image_url: string }>;
  const result = new Map<string, string>();
  for (const row of rows) result.set(row.address, row.profile_image_url);
  return result;
}

export function getXHandlesBatch(addresses: string[]): Map<string, string> {
  if (addresses.length === 0) return new Map();
  const rows = getDb()
    .prepare(
      `SELECT address, twitter_handle FROM nasun_profiles
       WHERE address IN (SELECT value FROM json_each(?)) AND twitter_handle IS NOT NULL`
    )
    .all(JSON.stringify(addresses)) as Array<{ address: string; twitter_handle: string }>;
  const result = new Map<string, string>();
  for (const row of rows) result.set(row.address, row.twitter_handle);
  return result;
}

// ===== Nasun Profile Cache =====

function getNasunDisplayName(address: string): string | null {
  const row = getDb()
    .prepare('SELECT resolved_display_name FROM nasun_profiles WHERE address = ?')
    .get(address) as { resolved_display_name: string | null } | undefined;
  return row?.resolved_display_name || null;
}

export function getAddressesWithProfileName(addresses: string[]): Set<string> {
  if (addresses.length === 0) return new Set();
  const rows = getDb()
    .prepare(
      `SELECT address FROM nasun_profiles
       WHERE address IN (${addresses.map(() => '?').join(',')})
       AND resolved_display_name IS NOT NULL AND resolved_display_name != ''`
    )
    .all(...addresses) as Array<{ address: string }>;
  return new Set(rows.map((r) => r.address));
}

export function upsertNasunProfile(address: string, displayName: string | null, imageUrl: string | null, twitterHandle: string | null = null): void {
  getDb()
    .prepare(
      `INSERT INTO nasun_profiles (address, resolved_display_name, profile_image_url, twitter_handle, fetched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         resolved_display_name = excluded.resolved_display_name,
         profile_image_url = excluded.profile_image_url,
         twitter_handle = COALESCE(excluded.twitter_handle, twitter_handle),
         fetched_at = excluded.fetched_at`
    )
    .run(address, displayName, imageUrl, twitterHandle, Date.now());
}

export function getStaleProfiles(addresses: string[], ttlMs: number): string[] {
  if (addresses.length === 0) return [];

  const cutoff = Date.now() - ttlMs;
  const negativeCutoff = Date.now() - NEGATIVE_CACHE_TTL_MS;

  const freshRows = getDb()
    .prepare(
      `SELECT address, resolved_display_name, fetched_at FROM nasun_profiles
       WHERE address IN (${addresses.map(() => '?').join(',')})`
    )
    .all(...addresses) as Array<{ address: string; resolved_display_name: string | null; fetched_at: number }>;

  const freshSet = new Set<string>();
  for (const row of freshRows) {
    const effectiveCutoff = row.resolved_display_name ? cutoff : negativeCutoff;
    if (row.fetched_at > effectiveCutoff) {
      freshSet.add(row.address);
    }
  }

  return addresses.filter((a) => !freshSet.has(a));
}

export async function fetchAndCacheProfile(address: string): Promise<void> {
  if (!nasunProfileApiUrl) return;

  const normalized = address.toLowerCase();
  if (inFlightRequests.has(normalized)) return inFlightRequests.get(normalized);

  const promise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(`${nasunProfileApiUrl}/v3/user-profile?walletAddress=${encodeURIComponent(normalized)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json() as { resolvedDisplayName?: string | null; profileImageUrl?: string | null; twitterHandle?: string | null };
        upsertNasunProfile(normalized, data.resolvedDisplayName ?? null, data.profileImageUrl ?? null, data.twitterHandle ?? null);
      } else {
        upsertNasunProfile(normalized, null, null, null);
      }
    } catch {
      console.warn(`[nasun-profile] Failed to fetch profile for ${normalized}`);
      upsertNasunProfile(normalized, null, null, null);
    } finally {
      inFlightRequests.delete(normalized);
    }
  })();

  inFlightRequests.set(normalized, promise);
  return promise;
}

export async function ensureProfilesCached(addresses: string[]): Promise<void> {
  const stale = getStaleProfiles(addresses, PROFILE_TTL_MS);
  if (stale.length === 0) return;
  await Promise.allSettled(stale.map((a) => fetchAndCacheProfile(a)));
}

// Unified display name: nasun_profiles (priority 1) > nickname (priority 2) > users.display_name (priority 3)
// Profile customDisplayName (via My Account) takes precedence over chat nickname.
export function getDisplayName(address: string): string | null {
  const nasunName = getNasunDisplayName(address);
  if (nasunName) return nasunName;
  const row = getDb()
    .prepare('SELECT nickname, display_name FROM users WHERE address = ?')
    .get(address) as { nickname: string | null; display_name: string } | undefined;
  if (row?.nickname) return row.nickname;
  return row?.display_name ?? null;
}

export function getDisplayNamesBatch(addresses: string[]): Map<string, string> {
  if (addresses.length === 0) return new Map();
  const d = getDb();

  const rows = d
    .prepare(
      `SELECT addr,
              COALESCE(np.resolved_display_name, u.nickname, u.display_name) as display_name
       FROM (SELECT value as addr FROM json_each(?)) AS input
       LEFT JOIN users u ON u.address = input.addr
       LEFT JOIN nasun_profiles np ON np.address = input.addr
       WHERE np.resolved_display_name IS NOT NULL OR u.nickname IS NOT NULL OR u.display_name IS NOT NULL`
    )
    .all(JSON.stringify(addresses)) as Array<{ addr: string; display_name: string }>;

  const result = new Map<string, string>();
  for (const row of rows) {
    if (row.display_name) result.set(row.addr, row.display_name);
  }
  return result;
}

export function closeStore(): void {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    db.close();
    db = null;
  }
}
