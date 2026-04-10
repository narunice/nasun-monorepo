import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StoredMessage, ChatServerConfig, NicknameRateLimit } from './types.js';

let db: Database.Database | null = null;

// HTML entity encoding to prevent stored XSS
function sanitizeContent(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#96;');
}

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
  db.pragma('foreign_keys = ON'); // per-connection setting, must be before table creation

  // Startup self-test: verify FK enforcement is active
  const fkStatus = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
  if (!fkStatus[0]?.foreign_keys) {
    throw new Error('FATAL: foreign_keys pragma failed to enable');
  }

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

    CREATE TABLE IF NOT EXISTS follows (
      follower TEXT NOT NULL,
      followed TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (follower, followed)
    );

    CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower);
    CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed);
  `);

  // Migration: add nickname rate limit columns (safe to re-run)
  try { db.exec('ALTER TABLE users ADD COLUMN nickname_window_start INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN nickname_change_count INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

  // Nasun ecosystem profile cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS nasun_profiles (
      address TEXT PRIMARY KEY,
      identity_id TEXT,
      resolved_display_name TEXT,
      profile_image_url TEXT,
      fetched_at INTEGER NOT NULL
    );
  `);

  nasunProfileApiUrl = config.nasunProfileApiUrl;
  if (nasunProfileApiUrl) {
    console.log(`[nasun-profile] API URL: ${nasunProfileApiUrl}`);
  } else {
    console.log('[nasun-profile] API URL: NOT SET (display name sync disabled)');
  }

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
    .run(msg.roomId, msg.sender, sanitizeContent(msg.content), msg.messageType, msg.replyToId, msg.timestamp);

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

// ===== Reactions API =====

export function toggleReaction(
  messageId: number,
  address: string,
  emojiCode: string
): Record<string, number> {
  const d = getDb();
  return d.transaction(() => {
    // Step 1: try to remove same emoji (toggle off)
    const deleted = d
      .prepare('DELETE FROM reactions WHERE message_id=? AND address=? AND emoji_code=?')
      .run(messageId, address, emojiCode);

    if (deleted.changes === 0) {
      // Step 2: not removed = different emoji or none -> insert or replace
      d.prepare(
        'INSERT OR REPLACE INTO reactions (message_id, address, emoji_code, created_at) VALUES (?, ?, ?, ?)'
      ).run(messageId, address, emojiCode, Date.now());
    }

    return getReactionSummaryForMessage(messageId);
  })();
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

  // Build summary map
  const result = new Map<number, { reactions: Record<string, number>; myReaction: string | null }>();
  for (const row of rows) {
    let entry = result.get(row.message_id);
    if (!entry) {
      entry = { reactions: {}, myReaction: null };
      result.set(row.message_id, entry);
    }
    entry.reactions[row.emoji_code] = row.cnt;
  }

  // Fetch viewer's reactions if address provided
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

// ===== Follows API =====

const MAX_FOLLOWED = 50;

export function toggleFollow(
  follower: string,
  followed: string
): { following: boolean; followerCount: number } {
  const d = getDb();

  // Lowercase only (preserve 0x prefix). normalizeAddress strips 0x, causing cross-table mismatch.
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

// ===== Nasun Ecosystem Profile Cache =====

let nasunProfileApiUrl = '';
const PROFILE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for failed lookups
const FETCH_TIMEOUT_MS = 5000;
const inFlightRequests = new Map<string, Promise<void>>();

export interface NasunProfile {
  displayName: string | null;
  profileImageUrl: string | null;
}

export function getNasunDisplayName(address: string): string | null {
  const row = getDb()
    .prepare('SELECT resolved_display_name FROM nasun_profiles WHERE address = ?')
    .get(address) as { resolved_display_name: string | null } | undefined;
  return row?.resolved_display_name || null; // Ensure never "" -> null
}

export function getNasunProfilesBatch(addresses: string[]): Map<string, NasunProfile> {
  if (addresses.length === 0) return new Map();

  const placeholders = addresses.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT address, resolved_display_name, profile_image_url FROM nasun_profiles WHERE address IN (${placeholders})`)
    .all(...addresses) as Array<{ address: string; resolved_display_name: string | null; profile_image_url: string | null }>;

  const result = new Map<string, NasunProfile>();
  for (const row of rows) {
    result.set(row.address, {
      displayName: row.resolved_display_name || null,
      profileImageUrl: row.profile_image_url || null,
    });
  }
  return result;
}

export function upsertNasunProfile(address: string, displayName: string | null, imageUrl: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO nasun_profiles (address, resolved_display_name, profile_image_url, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         resolved_display_name = excluded.resolved_display_name,
         profile_image_url = excluded.profile_image_url,
         fetched_at = excluded.fetched_at`
    )
    .run(address, displayName, imageUrl, Date.now());
}

/**
 * Unified display name: pado nickname (priority 1) > nasun resolved name (priority 2) > null.
 * Returns string | null. Never returns "" or undefined.
 */
export function getDisplayName(address: string): string | null {
  return getNickname(address) ?? getNasunDisplayName(address) ?? null;
}

/**
 * Batch display name lookup using SQLite LEFT JOIN.
 * Returns Map that may be missing keys for unknown addresses (same contract as getNicknamesBatch).
 */
export function getDisplayNamesBatch(addresses: string[]): Map<string, string> {
  if (addresses.length === 0) return new Map();

  const placeholders = addresses.map(() => '?').join(',');
  // Query both tables with a UNION approach: addresses that have either a nickname or nasun profile
  const rows = getDb()
    .prepare(
      `SELECT addr, COALESCE(u.nickname, np.resolved_display_name) as display_name
       FROM (SELECT value as addr FROM json_each(?)) AS input
       LEFT JOIN users u ON u.address = input.addr
       LEFT JOIN nasun_profiles np ON np.address = input.addr
       WHERE u.nickname IS NOT NULL OR np.resolved_display_name IS NOT NULL`
    )
    .all(JSON.stringify(addresses)) as Array<{ addr: string; display_name: string }>;

  const result = new Map<string, string>();
  for (const row of rows) {
    if (row.display_name) result.set(row.addr, row.display_name);
  }
  return result;
}

/**
 * Get addresses with stale or missing profiles from the cache.
 */
export function getStaleProfiles(addresses: string[], ttlMs: number): string[] {
  if (addresses.length === 0) return [];

  const cutoff = Date.now() - ttlMs;
  const negativeCutoff = Date.now() - NEGATIVE_CACHE_TTL_MS;
  const placeholders = addresses.map(() => '?').join(',');

  // Find addresses that are cached and fresh
  const freshRows = getDb()
    .prepare(
      `SELECT address, resolved_display_name, fetched_at FROM nasun_profiles
       WHERE address IN (${placeholders})`
    )
    .all(...addresses) as Array<{ address: string; resolved_display_name: string | null; fetched_at: number }>;

  const freshSet = new Set<string>();
  for (const row of freshRows) {
    // Positive cache: use normal TTL; Negative cache (null name): use shorter TTL
    const effectiveCutoff = row.resolved_display_name ? cutoff : negativeCutoff;
    if (row.fetched_at > effectiveCutoff) {
      freshSet.add(row.address);
    }
  }

  return addresses.filter((a) => !freshSet.has(a));
}

/**
 * Fetch a single profile from the nasun-website API and cache it.
 * Uses dedup Map to prevent concurrent requests for the same address.
 * Never throws -- errors are caught and logged at warn level.
 */
export async function fetchAndCacheProfile(address: string): Promise<void> {
  if (!nasunProfileApiUrl) return;

  const normalized = address.toLowerCase();
  if (inFlightRequests.has(normalized)) return inFlightRequests.get(normalized);

  const promise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(`${nasunProfileApiUrl}?walletAddress=${encodeURIComponent(normalized)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json() as { resolvedDisplayName?: string | null; profileImageUrl?: string | null };
        upsertNasunProfile(normalized, data.resolvedDisplayName ?? null, data.profileImageUrl ?? null);
      } else {
        // 404, 400, 5xx: negative cache to prevent repeated failed requests
        upsertNasunProfile(normalized, null, null);
      }
    } catch {
      // Network error, timeout, abort: keep stale cache if exists
      console.warn(`[nasun-profile] Failed to fetch profile for ${normalized}`);
    } finally {
      inFlightRequests.delete(normalized);
    }
  })();

  inFlightRequests.set(normalized, promise);
  return promise;
}

/**
 * Ensure profiles are cached for a batch of addresses.
 * Only fetches stale/missing entries. Max concurrency = number of stale addresses.
 */
export async function ensureProfilesCached(addresses: string[]): Promise<void> {
  const stale = getStaleProfiles(addresses, PROFILE_TTL_MS);
  if (stale.length === 0) return;
  await Promise.allSettled(stale.map((a) => fetchAndCacheProfile(a)));
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

export function closeStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}
