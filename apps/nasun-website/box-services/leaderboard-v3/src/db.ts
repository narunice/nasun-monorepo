// PG data-access layer for the box leaderboard read service. Replaces the DynamoDB read functions in
// services/dynamodb-client.ts + utils/snapshot-utils.ts with byte-parity queries over the box nasun_dal
// lb_* mirror (Phase 1). READ ONLY -- never writes (the role is nasun_compute_ro).
//
// Mirror layout (Phase 1 dal-load): the full DDB item lives in `attributes` jsonb; a few fields are also
// promoted to typed columns (account_id/platform/username/original_username/display_name/is_registered on
// lb_accounts; season_id/sk/status on lb_seasons; snapshot_key/sk on lb_snapshots). The reconstructors
// overlay the promoted columns on top of `attributes` so the returned object is byte-identical to the DDB
// item the lambda would have read.

import postgres from 'postgres';
import type { Account, DailySnapshot, Post, Season, SeasonAccountScore } from '../shared/types';
import { PG } from './config';
import { getTodayDateString } from '../shared/utils/date';

export const sql = postgres({
  host: PG.host, port: PG.port, database: PG.database, username: PG.username, password: PG.password,
  max: 6, idle_timeout: 30, connect_timeout: 15, prepare: false, onnotice: () => {},
  // jsonb arrives as parsed JS objects (numbers stay numbers) -- no manual JSON.parse needed.
  connection: { statement_timeout: 15000, lock_timeout: 8000, idle_in_transaction_session_timeout: 15000 },
});

// ---- Reconstructors (promoted columns overlay `attributes`) --------------------------------------

type SeasonRow = { season_id: string; sk: string; status: string | null; attributes: Record<string, unknown> };
type AccountRow = {
  account_id: string; platform: string; username: string; original_username: string | null;
  display_name: string | null; is_registered: boolean | null; attributes: Record<string, unknown>;
};

function rowToSeason(r: SeasonRow): Season {
  const a = (r.attributes || {}) as Record<string, unknown>;
  // status is the promoted column, but fall back to attributes (symmetry with rowToAccount) so a NULL
  // promoted column never clobbers a real attributes.status.
  return { ...a, seasonId: r.season_id, sk: r.sk, status: r.status ?? (a.status as string) } as Season;
}

function rowToAccount(r: AccountRow): Account {
  const a = (r.attributes || {}) as Record<string, unknown>;
  return {
    ...a,
    accountId: r.account_id,
    platform: r.platform,
    username: r.username,
    originalUsername: r.original_username ?? (a.originalUsername as string | undefined),
    displayName: r.display_name ?? (a.displayName as string | undefined),
    isRegistered: r.is_registered ?? (a.isRegistered as boolean | undefined),
  } as Account;
}

// ---- Seasons -------------------------------------------------------------------------------------

export async function getActiveSeason(): Promise<Season | null> {
  const rows = await sql<SeasonRow[]>`
    SELECT season_id, sk, status, attributes FROM lb_seasons
    WHERE sk = 'METADATA' AND status = 'active' LIMIT 1`;
  return rows.length ? rowToSeason(rows[0]) : null;
}

export async function getSeasonById(seasonId: string): Promise<Season | null> {
  const rows = await sql<SeasonRow[]>`
    SELECT season_id, sk, status, attributes FROM lb_seasons
    WHERE season_id = ${seasonId} AND sk = 'METADATA' LIMIT 1`;
  return rows.length ? rowToSeason(rows[0]) : null;
}

export async function getAllPublicSeasons(): Promise<
  Array<{ seasonId: string; name?: string; startDate?: string; endDate?: string; status?: string; isDefault?: boolean }>
> {
  const rows = await sql<SeasonRow[]>`
    SELECT season_id, sk, status, attributes FROM lb_seasons
    WHERE sk = 'METADATA' AND status <> 'archived'`;
  // Pass attributes through verbatim (do NOT fabricate isDefault:false / '' for absent fields -- the
  // lambda projects the raw DDB item, so missing keys are omitted from the JSON, not defaulted).
  const seasons = rows.map((r) => {
    const a = r.attributes as Record<string, unknown>;
    return {
      seasonId: r.season_id,
      name: a.name as string | undefined,
      startDate: a.startDate as string | undefined,
      endDate: a.endDate as string | undefined,
      status: (r.status ?? undefined) as string | undefined,
      isDefault: a.isDefault as boolean | undefined,
    };
  });
  // Same sort as get-leaderboard.getAllPublicSeasons: active first, default first, then startDate desc.
  return seasons.sort((x, y) => {
    if (x.status === 'active' && y.status !== 'active') return -1;
    if (y.status === 'active' && x.status !== 'active') return 1;
    if (x.isDefault && !y.isDefault) return -1;
    if (y.isDefault && !x.isDefault) return 1;
    return (y.startDate || '').localeCompare(x.startDate || '');
  });
}

// ---- Accounts ------------------------------------------------------------------------------------

// Lowercase only, NO @-strip -- byte-parity with dynamodb-client.getAccountByUsername (used by
// get-account). The my-rank/rank-history handlers strip the leading @ themselves before calling, matching
// their original local helpers, so callers own the @-strip divergence between handlers.
export async function getAccountByUsername(platform: string, username: string): Promise<Account | null> {
  const normalized = username.toLowerCase();
  const rows = await sql<AccountRow[]>`
    SELECT account_id, platform, username, original_username, display_name, is_registered, attributes
    FROM lb_accounts WHERE platform = ${platform} AND username = ${normalized} LIMIT 1`;
  return rows.length ? rowToAccount(rows[0]) : null;
}

// Existence of a SeasonAccountScore SCORE record (parity with dynamodb-client.getSeasonAccountScore, used
// by get-my-rank only to decide the "rank will update" message). pk (season_id, account_id) is promoted.
export async function hasSeasonAccount(seasonId: string, accountId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM lb_season_accounts WHERE season_id = ${seasonId} AND account_id = ${accountId} LIMIT 1`;
  return rows.length > 0;
}

// Lightweight banned-id set (parity with dynamodb-client.getBannedAccountIds). isBanned lives in attributes.
export async function getBannedAccountIds(): Promise<Set<string>> {
  const rows = await sql<{ account_id: string }[]>`
    SELECT account_id FROM lb_accounts WHERE attributes->>'isBanned' = 'true'`;
  return new Set(rows.map((r) => r.account_id));
}

// Reconstruct a Post: promoted columns (post_id/post_url/season_id/created_at) overlay attributes. created_at
// is rebuilt as a UTC ISO string (the original DDB createdAt). attributes alone omits these promoted keys.
type PostRow = { post_id: string; post_url: string; season_id: string | null; created_at: string; attributes: Record<string, unknown> };
const POST_COLS = sql`post_id, post_url, season_id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, attributes`;
function rowToPost(r: PostRow): Post {
  return {
    ...(r.attributes as object),
    postId: r.post_id,
    postUrl: r.post_url,
    seasonId: r.season_id ?? undefined,
    createdAt: r.created_at,
  } as Post;
}

// Recent posts for an account, newest first (parity with dynamodb-client.getPostsByAccountId GSI query).
export async function getPostsByAccountId(accountId: string, limit = 10): Promise<Post[]> {
  const rows = await sql<PostRow[]>`
    SELECT ${POST_COLS} FROM lb_posts
    WHERE attributes->>'accountId' = ${accountId}
    ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(rowToPost);
}

export async function getPostById(postId: string): Promise<Post | null> {
  const rows = await sql<PostRow[]>`SELECT ${POST_COLS} FROM lb_posts WHERE post_id = ${postId} LIMIT 1`;
  return rows.length ? rowToPost(rows[0]) : null;
}

export async function getAccountById(accountId: string): Promise<Account | null> {
  const rows = await sql<AccountRow[]>`
    SELECT account_id, platform, username, original_username, display_name, is_registered, attributes
    FROM lb_accounts WHERE account_id = ${accountId} LIMIT 1`;
  return rows.length ? rowToAccount(rows[0]) : null;
}

// Raw user_profiles row (full attributes jsonb) for a twitter handle, preferring a row with a real
// (non-0x) username (parity with the lambda's twitterHandle-index scan + 0x-skip). Shared by write-db's
// account display-name refresh + the internal sync-profile port. twitter_handle is an indexed column; the
// leading @ is stripped (no-op for already-normalized callers).
export async function getProfileRowByHandle(twitterHandle: string): Promise<Record<string, unknown> | null> {
  const normalized = twitterHandle.toLowerCase().replace(/^@/, '');
  const rows = await sql<{ attributes: Record<string, unknown> }[]>`
    SELECT attributes FROM user_profiles WHERE twitter_handle = ${normalized} LIMIT 10`;
  if (!rows.length) return null;
  let best = rows[0].attributes;
  for (const r of rows) {
    const u = r.attributes.username as string | undefined;
    if (u && !u.startsWith('0x')) { best = r.attributes; break; }
  }
  return best;
}

// Admin-curated featured feed record (lb_seasons __FEATURED_FEED__ / CURATED). attributes holds {items,
// updatedAt, updatedBy}.
export async function getCuratedFeedRecord(): Promise<{ items: Array<{ postId: string; badge: string; order: number }>; updatedAt: string; updatedBy: string } | null> {
  const rows = await sql<{ attributes: Record<string, unknown> }[]>`
    SELECT attributes FROM lb_seasons WHERE season_id = '__FEATURED_FEED__' AND sk = 'CURATED' LIMIT 1`;
  if (!rows.length) return null;
  const a = rows[0].attributes;
  return {
    items: (a.items as Array<{ postId: string; badge: string; order: number }>) || [],
    updatedAt: (a.updatedAt as string) || '',
    updatedBy: (a.updatedBy as string) || '',
  };
}

// Search accounts by username substring (parity with search-accounts.searchAccounts: contains + !isBanned,
// exact-match-first then postCount desc).
export async function searchAccounts(query: string, limit: number): Promise<Account[]> {
  const normalized = query.toLowerCase().replace(/^@/, '');
  if (normalized.length < 2) return [];
  const rows = await sql<AccountRow[]>`
    SELECT account_id, platform, username, original_username, display_name, is_registered, attributes
    FROM lb_accounts
    WHERE position(${normalized} IN username) > 0
      AND (attributes->>'isBanned' IS DISTINCT FROM 'true')`;
  const accounts = rows.map(rowToAccount);
  return accounts
    .sort((a, b) => {
      if (a.username === normalized && b.username !== normalized) return -1;
      if (b.username === normalized && a.username !== normalized) return 1;
      return (b.postCount || 0) - (a.postCount || 0);
    })
    .slice(0, limit);
}

// ---- Snapshots -----------------------------------------------------------------------------------

const MAX_FALLBACK_DAYS = 7;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// Query a snapshot for a specific date. Returns entries sorted by sk (= rank order). attributes IS the
// full DailySnapshot (Phase 1 mirror), so the jsonb row is returned directly.
export async function querySnapshot(seasonId: string, snapshotDate: string): Promise<DailySnapshot[]> {
  const key = `${seasonId}#${snapshotDate}`;
  const rows = await sql<{ attributes: DailySnapshot }[]>`
    SELECT attributes FROM lb_snapshots WHERE snapshot_key = ${key} ORDER BY sk ASC`;
  return rows.map((r) => r.attributes);
}

// Absolute latest snapshot date available for a season (parity with snapshot-utils.findAbsoluteLatestDate).
async function findAbsoluteLatestDate(seasonId: string): Promise<string | null> {
  const rows = await sql<{ d: string }[]>`
    SELECT split_part(snapshot_key, '#', 2) AS d FROM lb_snapshots
    WHERE split_part(snapshot_key, '#', 1) = ${seasonId}
    GROUP BY d ORDER BY d DESC LIMIT 1`;
  return rows.length ? rows[0].d : null;
}

// 7-day fallback then absolute-latest (byte-parity with snapshot-utils.getLatestSnapshot). For a paused
// campaign every recent date is empty, so this resolves to the last real snapshot (e.g. 2026-04-09).
export async function getLatestSnapshot(
  seasonId: string,
  referenceDate?: string
): Promise<{ entries: DailySnapshot[]; date: string }> {
  for (let daysBack = 0; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
    let dateStr: string;
    if (referenceDate) {
      const d = new Date(referenceDate);
      d.setDate(d.getDate() - daysBack);
      dateStr = d.toISOString().split('T')[0];
    } else {
      const d = new Date();
      d.setTime(d.getTime() + KST_OFFSET_MS);
      d.setDate(d.getDate() - daysBack);
      dateStr = d.toISOString().split('T')[0];
    }
    const items = await querySnapshot(seasonId, dateStr);
    if (items.length > 0) return { entries: items, date: dateStr };
  }
  const abs = await findAbsoluteLatestDate(seasonId);
  if (abs) return { entries: await querySnapshot(seasonId, abs), date: abs };
  return { entries: [], date: getTodayDateString() };
}

// All snapshot rows for a date keyed by accountId (top-climbers).
export async function getSnapshotMap(seasonId: string, date: string): Promise<Map<string, DailySnapshot>> {
  const entries = await querySnapshot(seasonId, date);
  const map = new Map<string, DailySnapshot>();
  for (const s of entries) map.set(s.accountId, s);
  return map;
}

// A single account's snapshot for a date (my-rank). attributes->>'accountId' filter over the date partition.
export async function getUserSnapshot(
  seasonId: string,
  accountId: string,
  dateStr: string
): Promise<DailySnapshot | null> {
  const key = `${seasonId}#${dateStr}`;
  const rows = await sql<{ attributes: DailySnapshot }[]>`
    SELECT attributes FROM lb_snapshots
    WHERE snapshot_key = ${key} AND attributes->>'accountId' = ${accountId} LIMIT 1`;
  return rows.length ? rows[0].attributes : null;
}

// Count banned accounts at-or-above a raw rank on a snapshot (parity with snapshot-utils.countBannedAboveRank).
export async function countBannedAboveRank(
  seasonId: string,
  snapshotDate: string,
  rawRank: number,
  bannedIds: Set<string>
): Promise<number> {
  if (bannedIds.size === 0) return 0;
  const key = `${seasonId}#${snapshotDate}`;
  const maxSk = `RANK#${String(rawRank).padStart(4, '0')}`;
  const rows = await sql<{ account_id: string }[]>`
    SELECT attributes->>'accountId' AS account_id FROM lb_snapshots
    WHERE snapshot_key = ${key} AND sk <= ${maxSk}`;
  let count = 0;
  for (const r of rows) if (bannedIds.has(r.account_id)) count++;
  return count;
}

// User's rank history across dates (parity with get-rank-history.getRankHistoryFromSnapshots GSI query).
// Uses the idx_lbsnap_account functional index on (attributes->>'accountId'); ascending by snapshotDate.
export async function getRankHistoryFromSnapshots(
  accountId: string,
  seasonId: string,
  startDate: string
): Promise<DailySnapshot[]> {
  const rows = await sql<{ attributes: DailySnapshot }[]>`
    SELECT attributes FROM lb_snapshots
    WHERE attributes->>'accountId' = ${accountId}
      AND attributes->>'snapshotDate' >= ${startDate}
      AND split_part(snapshot_key, '#', 1) = ${seasonId}
    ORDER BY attributes->>'snapshotDate' ASC`;
  return rows.map((r) => r.attributes);
}

// ---- Snapshot generation reads (cron) ------------------------------------------------------------

// All season-account SCORE records for a season, reconstructed as SeasonAccountScore. lastSeenAt is
// rebuilt from the promoted timestamptz as a UTC ISO string (to_char) byte-faithful to the original DDB
// string -- critical for the freshnessMultiplier day-delta. isRegistered/isTelegramMember are promoted
// columns (stripped from attributes); the rest of the score fields live in attributes (numbers preserved).
export async function getSeasonAccountScores(seasonId: string): Promise<SeasonAccountScore[]> {
  const rows = await sql<
    { account_id: string; last_seen: string; is_registered: boolean | null; is_telegram_member: boolean | null; attributes: Record<string, unknown> }[]
  >`
    SELECT account_id,
      to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen,
      is_registered, is_telegram_member, attributes
    FROM lb_season_accounts WHERE season_id = ${seasonId}`;
  return rows.map((r) => ({
    ...(r.attributes as object),
    accountId: r.account_id,
    seasonId,
    lastSeenAt: r.last_seen,
    isRegistered: r.is_registered ?? undefined,
    isTelegramMember: r.is_telegram_member ?? undefined,
  })) as SeasonAccountScore[];
}

// Posts for batch-decay, grouped by accountId, filtered created_at <= referenceDate (the snapshot-window
// boundary -- a post created between the prod post-scan and snapshotTime must NOT count). createdAt is
// collapsed to the UTC date (the decay function only reads createdAt.split('T')[0]). postScore/postType
// come from attributes; created_at is the promoted column.
export async function getPostsForDecay(
  seasonId: string,
  referenceDateIso: string
): Promise<Map<string, Array<{ postScore: number; createdAt: string; postType: Post['postType'] }>>> {
  const rows = await sql<{ aid: string; d: string; ps: number; pt: Post['postType'] }[]>`
    SELECT attributes->>'accountId' AS aid,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d,
      (attributes->>'postScore')::float AS ps,
      attributes->>'postType' AS pt
    FROM lb_posts WHERE season_id = ${seasonId} AND created_at <= ${referenceDateIso}`;
  const byAccount = new Map<string, Array<{ postScore: number; createdAt: string; postType: Post['postType'] }>>();
  for (const p of rows) {
    const arr = byAccount.get(p.aid);
    const entry = { postScore: p.ps, createdAt: `${p.d}T00:00:00Z`, postType: p.pt };
    if (arr) arr.push(entry);
    else byAccount.set(p.aid, [entry]);
  }
  return byAccount;
}

// Filter banned accounts and re-assign display ranks (copied verbatim from snapshot-utils.computeDisplayRanks,
// the only pure function in that DDB-coupled module; inlined to keep the AWS SDK out of the bundle).
export function computeDisplayRanks(snapshots: DailySnapshot[], bannedIds: Set<string>): DailySnapshot[] {
  return snapshots
    .filter((s) => !bannedIds.has(s.accountId))
    .map((s, index) => ({ ...s, rank: index + 1 }));
}
