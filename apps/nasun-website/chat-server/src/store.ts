import Database from 'better-sqlite3';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { StoredMessage, ChatServerConfig } from './types.js';

// Profile cache constants
// 5 min TTL is the fallback for cases where the nasun-website Lambda's
// invalidate webhook fails or is missed (network blip). The webhook is the
// happy path; on success we invalidate immediately via invalidateNasunProfile.
const PROFILE_TTL_MS = 5 * 60 * 1000;            // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 30 * 60 * 1000;    // 30 minutes for failed/null lookups
const FETCH_TIMEOUT_MS = 5000;
const PROFILE_FETCH_CONCURRENCY = 10;
const inFlightRequests = new Map<string, Promise<void>>();

let db: Database.Database | null = null;
let nasunProfileApiUrl = '';
let publicAvatarsBaseUrl = '';

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
  // Stage D: cache the user-uploaded avatar key. Resolved to URL in payload
  // builder via PUBLIC_AVATARS_BASE_URL env var. Stays NULL when the user
  // has no custom avatar (cascade falls through to twitter/google).
  try { db.exec('ALTER TABLE nasun_profiles ADD COLUMN custom_avatar_key TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE nasun_profiles ADD COLUMN custom_avatar_banned INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

  // Baram (Nasun AI) Telegram session tokens.
  // sid is the source of truth; revoked_at NULL = active. JWTs issued from this
  // table are short-lived (5 min) caches — sid lookup is authoritative on every
  // sensitive op. tg_user_id is populated only after the user opens the bot
  // deep link, so its index excludes NULL rows (most rows during the link
  // pending window).
  db.exec(`
    CREATE TABLE IF NOT EXISTS baram_sessions (
      sid TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      agent TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      tg_user_id TEXT,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_baram_sessions_wallet ON baram_sessions(wallet);
    CREATE INDEX IF NOT EXISTS idx_baram_sessions_tg_user
      ON baram_sessions(tg_user_id) WHERE tg_user_id IS NOT NULL;
  `);

  nasunProfileApiUrl = config.nasunProfileApiUrl;
  if (nasunProfileApiUrl) {
    console.log(`[nasun-profile] API URL: ${nasunProfileApiUrl}`);
  } else {
    console.log('[nasun-profile] API URL: NOT SET (display name sync disabled)');
  }

  publicAvatarsBaseUrl = (process.env.PUBLIC_AVATARS_BASE_URL || '').replace(/\/+$/, '');

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

export function getUserReactionsBatch(messageId: number, addresses: string[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  if (addresses.length === 0) return result;
  for (const addr of addresses) result.set(addr, null);
  const rows = getDb()
    .prepare('SELECT address, emoji_code FROM reactions WHERE message_id=? AND address IN (SELECT value FROM json_each(?))')
    .all(messageId, JSON.stringify(addresses)) as Array<{ address: string; emoji_code: string }>;
  for (const row of rows) result.set(row.address, row.emoji_code);
  return result;
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
  // Priority follows @nasun/profile-core/resolveAvatarUrl:
  //   1. custom_avatar_key (when not banned) — applied in the loop below
  //   2. nasun_profiles.profile_image_url — canonical, sourced from
  //      get-user-profile Lambda (already standard-resolved)
  //   3. users.profile_image_url — legacy chat-connect snapshot, may be stale
  //      after a social unlink. Only used if (2) is missing for first-time
  //      cache-miss rows.
  const rows = getDb()
    .prepare(
      `SELECT
        input.address AS address,
        COALESCE(np.profile_image_url, u.profile_image_url) AS profile_image_url,
        np.custom_avatar_key,
        np.custom_avatar_banned
       FROM (SELECT value AS address FROM json_each(?)) AS input
       LEFT JOIN users u ON u.address = input.address
       LEFT JOIN nasun_profiles np ON np.address = input.address
       WHERE u.profile_image_url IS NOT NULL OR np.profile_image_url IS NOT NULL
          OR (np.custom_avatar_key IS NOT NULL AND np.custom_avatar_banned = 0)`
    )
    .all(JSON.stringify(addresses)) as Array<{
      address: string;
      profile_image_url: string | null;
      custom_avatar_key: string | null;
      custom_avatar_banned: number;
    }>;
  const result = new Map<string, string>();
  for (const row of rows) {
    if (row.custom_avatar_key && row.custom_avatar_banned === 0 && publicAvatarsBaseUrl) {
      result.set(row.address, `${publicAvatarsBaseUrl}/${row.custom_avatar_key.replace(/^\/+/, '')}`);
    } else if (row.profile_image_url) {
      result.set(row.address, row.profile_image_url);
    }
  }
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

export function upsertNasunProfile(
  address: string,
  displayName: string | null,
  imageUrl: string | null,
  twitterHandle: string | null = null,
  customAvatarKey: string | null = null,
  customAvatarBanned: boolean = false,
): void {
  getDb()
    .prepare(
      `INSERT INTO nasun_profiles (address, resolved_display_name, profile_image_url, twitter_handle, custom_avatar_key, custom_avatar_banned, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         resolved_display_name = excluded.resolved_display_name,
         profile_image_url = excluded.profile_image_url,
         twitter_handle = COALESCE(excluded.twitter_handle, twitter_handle),
         custom_avatar_key = excluded.custom_avatar_key,
         custom_avatar_banned = excluded.custom_avatar_banned,
         fetched_at = excluded.fetched_at`
    )
    .run(address, displayName, imageUrl, twitterHandle, customAvatarKey, customAvatarBanned ? 1 : 0, Date.now());
}

/**
 * Invalidate the cached nasun_profiles row for one wallet address. Called by
 * the internal webhook handler when nasun-website's PATCH /user-profile
 * succeeds. Setting `fetched_at = 0` forces the next read to refetch.
 */
export function invalidateNasunProfile(address: string): void {
  const normalized = address.toLowerCase();
  getDb()
    .prepare(`UPDATE nasun_profiles SET fetched_at = 0 WHERE address = ?`)
    .run(normalized);
}

/**
 * Read a cached profile (for custom_avatar_key resolution in payload builder).
 * Returns null when no row or the row is stale beyond TTL.
 */
export function getNasunProfileCached(address: string): {
  resolvedDisplayName: string | null;
  profileImageUrl: string | null;
  twitterHandle: string | null;
  customAvatarKey: string | null;
  customAvatarBanned: boolean;
} | null {
  const normalized = address.toLowerCase();
  const row = getDb()
    .prepare(
      `SELECT resolved_display_name, profile_image_url, twitter_handle, custom_avatar_key, custom_avatar_banned, fetched_at
       FROM nasun_profiles WHERE address = ?`
    )
    .get(normalized) as
    | {
        resolved_display_name: string | null;
        profile_image_url: string | null;
        twitter_handle: string | null;
        custom_avatar_key: string | null;
        custom_avatar_banned: number;
        fetched_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    resolvedDisplayName: row.resolved_display_name,
    profileImageUrl: row.profile_image_url,
    twitterHandle: row.twitter_handle,
    customAvatarKey: row.custom_avatar_key,
    customAvatarBanned: row.custom_avatar_banned === 1,
  };
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
        const data = await res.json() as {
          resolvedDisplayName?: string | null;
          profileImageUrl?: string | null;
          twitterHandle?: string | null;
          customAvatarKey?: string | null;
          customAvatarBanned?: boolean | null;
        };
        upsertNasunProfile(
          normalized,
          data.resolvedDisplayName ?? null,
          data.profileImageUrl ?? null,
          data.twitterHandle ?? null,
          data.customAvatarKey ?? null,
          data.customAvatarBanned ?? false,
        );
      } else {
        upsertNasunProfile(normalized, null, null, null, null);
      }
    } catch {
      upsertNasunProfile(normalized, null, null, null, null);
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
  for (let i = 0; i < stale.length; i += PROFILE_FETCH_CONCURRENCY) {
    const batch = stale.slice(i, i + PROFILE_FETCH_CONCURRENCY);
    await Promise.allSettled(batch.map((a) => fetchAndCacheProfile(a)));
  }
}

export function getDisplayName(address: string): string | null {
  return getNasunDisplayName(address);
}

export function getDisplayNamesBatch(addresses: string[]): Map<string, string> {
  if (addresses.length === 0) return new Map();
  const d = getDb();

  const rows = d
    .prepare(
      `SELECT addr, np.resolved_display_name as display_name
       FROM (SELECT value as addr FROM json_each(?)) AS input
       LEFT JOIN nasun_profiles np ON np.address = input.addr
       WHERE np.resolved_display_name IS NOT NULL`
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
