// Box ports of the leaderboard-v3 admin/write handlers. Each is a pure function (method + params + body +
// admin -> { status, body }) over write-db.ts. The server gates these behind ADMIN_ENABLED (503 inert) +
// authenticateAdmin (401), then dispatches. Writes are validated write-then-read at the Phase 3 cutover.

import type {
  AccountRole, ContentSignal, PostType, AccountLanguage, Platform, BadgeType, CreateSeasonRequest, Season,
} from '../../src/types';
import { MAX_CURATED_ITEMS, SCORE_CONSTANTS } from '../../src/types';
import { normalizeUrl } from '../../src/utils/url-normalizer';
import { calculatePostScoreWithFollowers } from '../../src/services/score-calculator';
import { getDateNDaysAgo } from '../../src/utils/date';
import * as db from './db';
import * as wdb from './write-db';
import { sql } from './db';
import type { AdminUser } from './auth';
import { enrichCuratedItemsPublic } from './read-handlers';

type Body = Record<string, unknown>;
export type Result = { status: number; body: object };
const adminName = (a: AdminUser) => a.email || a.username || 'admin';

// ---- POST /v3/posts (create-post) ----------------------------------------------------------------

export async function createPostHandler(body: Body, admin: AdminUser): Promise<Result> {
  const validRoles: AccountRole[] = ['kol', 'proactive_ct', 'default'];
  const validSignals: ContentSignal[] = ['standard', 'insight', 'creative', 'high_reach'];
  const validTypes: PostType[] = ['original', 'quote', 'reply'];
  const validLangs: AccountLanguage[] = ['en', 'zh', 'ja', 'ko'];
  if (!body.postUrl || typeof body.postUrl !== 'string') return { status: 400, body: { success: false, error: 'postUrl is required' } };
  if (!body.accountRole || !validRoles.includes(body.accountRole as AccountRole)) return { status: 400, body: { success: false, error: `accountRole must be one of: ${validRoles.join(', ')}` } };
  if (!Array.isArray(body.contentSignals)) return { status: 400, body: { success: false, error: 'contentSignals must be an array' } };
  for (const s of body.contentSignals) if (!validSignals.includes(s as ContentSignal)) return { status: 400, body: { success: false, error: `Invalid signal: ${s}. Must be one of: ${validSignals.join(', ')}` } };
  let signals = body.contentSignals as ContentSignal[];
  if (!signals.includes('standard')) signals = ['standard', ...signals];
  let postType: PostType = 'original';
  if (body.postType !== undefined) {
    if (!validTypes.includes(body.postType as PostType)) return { status: 400, body: { success: false, error: `postType must be one of: ${validTypes.join(', ')}` } };
    postType = body.postType as PostType;
  }
  let language: AccountLanguage | undefined;
  if (body.language !== undefined) {
    if (!validLangs.includes(body.language as AccountLanguage)) return { status: 400, body: { success: false, error: `language must be one of: ${validLangs.join(', ')}` } };
    language = body.language as AccountLanguage;
  }
  let followerCount: number | undefined;
  if (body.followerCount !== undefined) {
    if (typeof body.followerCount !== 'number' || body.followerCount < 0) return { status: 400, body: { success: false, error: 'followerCount must be a non-negative number' } };
    followerCount = body.followerCount;
  }
  let seasonId: string | undefined;
  if (body.seasonId !== undefined) {
    if (typeof body.seasonId !== 'string' || !body.seasonId.trim()) return { status: 400, body: { success: false, error: 'seasonId must be a non-empty string' } };
    seasonId = body.seasonId.trim();
  }
  if (seasonId) {
    const season = await db.getSeasonById(seasonId);
    if (!season) return { status: 400, body: { success: false, error: 'Season not found' } };
    if (season.status === 'archived') return { status: 400, body: { success: false, error: 'Cannot assign posts to archived season' } };
  }
  const normalized = normalizeUrl(body.postUrl);
  if (!normalized.isValid) return { status: 400, body: { success: false, error: normalized.error || 'Invalid URL' } };
  const existingAccount = await db.getAccountByUsername(normalized.platform, normalized.username);
  if (existingAccount?.isBanned) return { status: 403, body: { success: false, error: 'This account is banned and cannot register posts', username: normalized.username } };
  const dup = await wdb.getPostByUrl(normalized.normalizedUrl);
  if (dup) return { status: 409, body: { success: false, error: 'This post has already been registered', isDuplicate: true, post: dup } };
  const { post, account } = await wdb.createPost({
    normalizedUrl: normalized.normalizedUrl, rawUrl: body.postUrl, platform: normalized.platform, username: normalized.username,
    originalUsername: normalized.originalUsername, accountRole: body.accountRole as AccountRole, contentSignals: signals,
    postType, createdBy: adminName(admin), seasonId, language, followerCount,
  });
  return { status: 201, body: { success: true, post, account } };
}

// ---- /v3/admin/blacklist -------------------------------------------------------------------------

export async function blacklistHandler(method: string, accountIdPath: string | undefined, body: Body, admin: AdminUser): Promise<Result> {
  if (method === 'GET') {
    const accounts = await wdb.getBannedAccounts();
    return { status: 200, body: { success: true, accounts, total: accounts.length } };
  }
  if (method === 'POST') {
    if (!body.accountId) return { status: 400, body: { success: false, error: 'accountId is required' } };
    const account = await db.getAccountById(body.accountId as string);
    if (!account) return { status: 404, body: { success: false, error: 'Account not found' } };
    if (account.isBanned) return { status: 409, body: { success: false, error: 'Account is already banned' } };
    const updated = await wdb.banAccount({ accountId: body.accountId as string, reason: body.reason as string | undefined, bannedBy: adminName(admin) });
    return { status: 200, body: { success: true, account: { accountId: updated.accountId, username: updated.username, banReason: updated.banReason, bannedAt: updated.bannedAt, bannedBy: updated.bannedBy } } };
  }
  if (method === 'DELETE') {
    if (!accountIdPath) return { status: 400, body: { success: false, error: 'accountId is required' } };
    const account = await db.getAccountById(accountIdPath);
    if (!account) return { status: 404, body: { success: false, error: 'Account not found' } };
    if (!account.isBanned) return { status: 409, body: { success: false, error: 'Account is not banned' } };
    const updated = await wdb.unbanAccount(accountIdPath);
    return { status: 200, body: { success: true, account: { accountId: updated.accountId, username: updated.username } } };
  }
  return { status: 405, body: { success: false, error: 'Method not allowed' } };
}

// ---- POST /v3/admin/adjust-score -----------------------------------------------------------------

export async function adjustScoreHandler(body: Body): Promise<Result> {
  if (!body.username || typeof body.username !== 'string') return { status: 400, body: { success: false, error: 'username is required' } };
  const username = body.username.trim().replace(/^@/, '').toLowerCase();
  if (username.length === 0 || username.length > 50) return { status: 400, body: { success: false, error: 'Invalid username format' } };
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return { status: 400, body: { success: false, error: 'Username must contain only letters, numbers, and underscores' } };
  if (body.score === undefined || typeof body.score !== 'number' || isNaN(body.score)) return { status: 400, body: { success: false, error: 'score is required and must be a number' } };
  const score = Math.round(body.score * 10) / 10;
  if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) return { status: 400, body: { success: false, error: 'reason is required' } };
  if (body.reason.length > 500) return { status: 400, body: { success: false, error: 'reason must be 500 characters or less' } };
  const requestedSeasonId = typeof body.seasonId === 'string' ? body.seasonId.trim() : undefined;

  const account = await db.getAccountByUsername('twitter', username);
  if (!account) return { status: 404, body: { success: false, error: `Account not found: @${username}. Register a post first to create the account.` } };
  if (account.isBanned) return { status: 400, body: { success: false, error: `Account @${username} is banned: ${account.banReason || 'No reason provided'}` } };
  let seasonId: string;
  if (requestedSeasonId) {
    const season = await db.getSeasonById(requestedSeasonId);
    if (!season) return { status: 404, body: { success: false, error: `Season not found: ${requestedSeasonId}` } };
    seasonId = season.seasonId;
  } else {
    const active = await db.getActiveSeason();
    if (!active) return { status: 400, body: { success: false, error: 'No active season found' } };
    seasonId = active.seasonId;
  }
  await wdb.adjustAccountAdjustmentScore(account.accountId, score);
  await wdb.adjustSeasonAdjustmentScore(seasonId, account.accountId, score, {
    username: account.username, platform: account.platform, originalUsername: account.originalUsername,
    displayName: account.displayName, profileImageUrl: account.profileImageUrl, isRegistered: account.isRegistered, isTelegramMember: account.isTelegramMember,
  });
  return { status: 200, body: { success: true, data: { accountId: account.accountId, username: account.originalUsername || username, adjustedScore: score, reason: body.reason.trim(), seasonId } } };
}

// ---- /v3/admin/seasons ---------------------------------------------------------------------------

export async function seasonsHandler(method: string, seasonId: string | undefined, action: 'activate' | 'end' | undefined, body: Body, admin: AdminUser): Promise<Result> {
  if (method === 'POST' && !seasonId) {
    if (!body.seasonId || !body.name || !body.startDate || !body.endDate) return { status: 400, body: { error: 'Missing required fields: seasonId, name, startDate, endDate' } };
    const ns = body.startDate as string, ne = body.endDate as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ns) || !/^\d{4}-\d{2}-\d{2}$/.test(ne)) return { status: 400, body: { error: 'Dates must be in YYYY-MM-DD format' } };
    if (ns >= ne) return { status: 400, body: { error: 'startDate must be before endDate' } };
    const season = await wdb.createSeason(body as unknown as CreateSeasonRequest, adminName(admin));
    return { status: 201, body: { success: true, season } };
  }
  if (method === 'GET' && !seasonId) {
    const seasons = await wdb.getAllSeasons();
    seasons.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    return { status: 200, body: { seasons } };
  }
  if (method === 'GET' && seasonId && !action) {
    const season = await wdb.getSeason(seasonId);
    if (!season) return { status: 404, body: { error: `Season ${seasonId} not found` } };
    return { status: 200, body: { season } };
  }
  if (method === 'PATCH' && seasonId) {
    const season = await wdb.updateSeason(seasonId, body as Partial<Season>);
    return { status: 200, body: { success: true, season } };
  }
  if (method === 'DELETE' && seasonId) {
    await wdb.deleteSeason(seasonId);
    return { status: 200, body: { success: true, message: `Season ${seasonId} deleted` } };
  }
  if (method === 'POST' && seasonId && action === 'activate') {
    return { status: 200, body: { success: true, season: await wdb.activateSeason(seasonId) } };
  }
  if (method === 'POST' && seasonId && action === 'end') {
    return { status: 200, body: { success: true, season: await wdb.endSeason(seasonId) } };
  }
  return { status: 404, body: { error: 'Not found' } };
}

// ---- PATCH /v3/admin/posts/{postId} (edit-post) --------------------------------------------------

export async function editPostHandler(postId: string | undefined, body: Body): Promise<Result> {
  if (!postId) return { status: 400, body: { error: 'Missing postId path parameter' } };
  const VP: Platform[] = ['twitter', 'discord', 'farcaster'], VR: AccountRole[] = ['kol', 'proactive_ct', 'default'];
  const VS: ContentSignal[] = ['standard', 'insight', 'creative', 'high_reach'], VL: AccountLanguage[] = ['en', 'zh', 'ja', 'ko'], VT: PostType[] = ['original', 'quote', 'reply'];
  if (body.platform !== undefined && !VP.includes(body.platform as Platform)) return { status: 400, body: { error: `Invalid platform. Must be one of: ${VP.join(', ')}` } };
  if (body.accountRole !== undefined && !VR.includes(body.accountRole as AccountRole)) return { status: 400, body: { error: `Invalid accountRole. Must be one of: ${VR.join(', ')}` } };
  if (body.contentSignals !== undefined) {
    if (!Array.isArray(body.contentSignals)) return { status: 400, body: { error: 'contentSignals must be an array' } };
    for (const s of body.contentSignals) if (!VS.includes(s as ContentSignal)) return { status: 400, body: { error: `Invalid signal: ${s}. Must be one of: ${VS.join(', ')}` } };
  }
  if (body.postScore !== undefined) {
    if (typeof body.postScore !== 'number' || body.postScore < 0 || body.postScore > 10) return { status: 400, body: { error: 'postScore must be a number between 0 and 10' } };
    body.postScore = Math.round(body.postScore * 1000) / 1000;
  }
  if (body.postType !== undefined && !VT.includes(body.postType as PostType)) return { status: 400, body: { error: `Invalid postType. Must be one of: ${VT.join(', ')}` } };
  if (body.language !== undefined && !VL.includes(body.language as AccountLanguage)) return { status: 400, body: { error: `Invalid language. Must be one of: ${VL.join(', ')}` } };
  if (body.followerCount !== undefined && (typeof body.followerCount !== 'number' || !Number.isInteger(body.followerCount) || body.followerCount < 0 || body.followerCount > 100_000_000)) return { status: 400, body: { error: 'followerCount must be a non-negative integer (max 100,000,000)' } };
  if (body.username !== undefined && (typeof body.username !== 'string' || body.username.trim() === '' || body.username.length > 100)) return { status: 400, body: { error: 'username must be a non-empty string (max 100 chars)' } };
  if (body.originalUsername !== undefined && (typeof body.originalUsername !== 'string' || body.originalUsername.trim() === '' || body.originalUsername.length > 100)) return { status: 400, body: { error: 'originalUsername must be a non-empty string (max 100 chars)' } };

  const language = body.language as AccountLanguage | undefined;
  const followerCount = body.followerCount as number | undefined;
  const postUpdates: Record<string, unknown> = {};
  for (const k of ['platform', 'username', 'originalUsername', 'postScore', 'contentSignals', 'accountRole', 'postType']) if (body[k] !== undefined) postUpdates[k] = body[k];
  const hasPostUpdates = Object.keys(postUpdates).length > 0;
  const hasAccountUpdates = language !== undefined || followerCount !== undefined;

  if ((postUpdates.postType || postUpdates.contentSignals) && postUpdates.postScore === undefined) {
    const existing = await wdb.getPostByIdW(postId);
    if (!existing) return { status: 404, body: { error: `Post ${postId} not found` } };
    const account = await db.getAccountById(existing.accountId);
    const { postScore } = calculatePostScoreWithFollowers(
      followerCount ?? account?.followerCount ?? 0, language ?? account?.language ?? 'en',
      (postUpdates.contentSignals as ContentSignal[]) ?? existing.contentSignals ?? ['standard'],
      (postUpdates.postType as PostType) ?? existing.postType ?? 'original');
    postUpdates.postScore = postScore;
  }

  let updatedPost;
  if (hasPostUpdates) {
    updatedPost = await wdb.updatePostAndAdjustScores({ postId, updates: postUpdates });
  } else {
    const existing = await wdb.getPostByIdW(postId);
    if (!existing) return { status: 404, body: { error: `Post ${postId} not found` } };
    updatedPost = existing;
  }
  let updatedAccount;
  if (hasAccountUpdates) {
    try {
      const account = await db.getAccountById(updatedPost.accountId);
      if (account) updatedAccount = await wdb.updateAccountLanguageData({ accountId: updatedPost.accountId, language: language ?? account.language ?? 'en', followerCount: followerCount ?? account.followerCount ?? 0 });
    } catch (e) {
      // Post update already committed; surface 207 so the admin retries only the account fields (parity).
      console.error('[leaderboard] edit-post account update failed (post committed):', e instanceof Error ? e.message : e);
      return { status: 207, body: { success: true, post: updatedPost, warning: 'Post updated but account update failed. Retry the account fields.' } };
    }
  }
  return { status: 200, body: { success: true, post: updatedPost, ...(updatedAccount && { account: updatedAccount }) } };
}

// ---- /v3/admin/featured-feed ---------------------------------------------------------------------

export async function featuredFeedHandler(method: string, body: Body, admin: AdminUser): Promise<Result> {
  const VALID_BADGES: BadgeType[] = ['rank-1', 'rank-2', 'rank-3', 'ranker', 'climber-1', 'climber-2', 'climber-3', 'featured'];
  if (method === 'GET') {
    const record = await db.getCuratedFeedRecord();
    if (!record || record.items.length === 0) return { status: 200, body: { success: true, items: [], enrichedItems: [], updatedAt: null, updatedBy: null } };
    const enrichedItems = await enrichCuratedItemsPublic(record.items);
    return { status: 200, body: { success: true, items: record.items, enrichedItems, updatedAt: record.updatedAt, updatedBy: record.updatedBy } };
  }
  if (method === 'PUT') {
    if (!Array.isArray(body.items)) return { status: 400, body: { success: false, error: 'items array is required' } };
    if (body.items.length > MAX_CURATED_ITEMS) return { status: 400, body: { success: false, error: `Maximum ${MAX_CURATED_ITEMS} items allowed` } };
    const items = body.items as Array<{ postId: string; badge: BadgeType; order: number }>;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].postId) return { status: 400, body: { success: false, error: `Item ${i}: postId is required` } };
      if (!VALID_BADGES.includes(items[i].badge)) return { status: 400, body: { success: false, error: `Item ${i}: invalid badge` } };
    }
    const checks = await Promise.all(items.map(async (e, i) => ({ index: i, exists: !!(await db.getPostById(e.postId)) })));
    const missing = checks.find((c) => !c.exists);
    if (missing) return { status: 400, body: { success: false, error: `Item ${missing.index}: post not found` } };
    const normalized = items.map((it, idx) => ({ postId: it.postId, badge: it.badge as string, order: idx + 1 }));
    const record = await wdb.saveCuratedFeedRecord(normalized, adminName(admin));
    return { status: 200, body: { success: true, items: record.items, updatedAt: record.updatedAt, updatedBy: record.updatedBy } };
  }
  return { status: 405, body: { success: false, error: 'Method not allowed' } };
}

// ---- GET /v3/admin/stats -------------------------------------------------------------------------

export async function statsHandler(): Promise<Result> {
  const [counts, activeSeason] = await Promise.all([wdb.adminCounts(), db.getActiveSeason()]);
  let topFive: Array<{ rank: number; username: string; originalUsername?: string; displayName?: string; userScore: number }> = [];
  let activeSeasonInfo: { seasonId: string; name: string; startDate: string; endDate: string; totalPosts: number; totalAccounts: number } | null = null;
  let recentActivity: object[] = [];

  if (activeSeason) {
    const scoreRows = await sql<{ user_score: string | null; raw_score: string | null; consistency_bonus: string | null; last_seen: string | null; attributes: Record<string, unknown> }[]>`
      SELECT user_score, raw_score, consistency_bonus, to_char(last_seen_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen, attributes
      FROM lb_season_accounts WHERE season_id = ${activeSeason.seasonId}`;
    const recomputed = scoreRows.map((r) => {
      const days = Math.floor((Date.now() - new Date(r.last_seen || nowIsoStr()).getTime()) / (1000 * 60 * 60 * 24));
      const fm = 1 / (1 + days / SCORE_CONSTANTS.FRESHNESS_HALF_LIFE_DAYS);
      const userScore = Number(r.raw_score || 0) * Number(r.consistency_bonus || 0) * fm;
      return { a: r.attributes, userScore };
    }).sort((x, y) => y.userScore - x.userScore).slice(0, 10);
    topFive = recomputed.map((s, i) => ({ rank: i + 1, username: s.a.username as string, originalUsername: s.a.originalUsername as string | undefined, displayName: s.a.displayName as string | undefined, userScore: Math.round(s.userScore * 100) / 100 }));
    activeSeasonInfo = { seasonId: activeSeason.seasonId, name: activeSeason.name, startDate: activeSeason.startDate, endDate: activeSeason.endDate, totalPosts: activeSeason.totalPosts || 0, totalAccounts: scoreRows.length };

    const postRows = await sql<{ post_id: string; post_url: string; season_id: string | null; created_at: string; attributes: Record<string, unknown> }[]>`
      SELECT post_id, post_url, season_id, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, attributes
      FROM lb_posts WHERE season_id = ${activeSeason.seasonId} ORDER BY created_at DESC LIMIT 10`;
    recentActivity = postRows.map((r) => {
      const a = r.attributes;
      return { type: 'post_created', description: `@${a.username} - ${String(a.accountRole || '').toUpperCase()} post registered`, timestamp: r.created_at,
        postId: r.post_id, seasonId: r.season_id ?? undefined, platform: a.platform, username: a.username, postUrl: r.post_url, postScore: a.postScore, postType: a.postType, accountRole: a.accountRole, contentSignals: a.contentSignals };
    });
  }
  return { status: 200, body: { totalPosts: counts.totalPosts, totalAccounts: counts.totalAccounts, activeSeason: activeSeasonInfo, todayStats: { postsCreated: counts.todayPosts, newAccounts: counts.todayAccounts }, topFive, recentActivity, calculatedAt: new Date().toISOString() } };
}
function nowIsoStr() { return new Date().toISOString(); }

// ---- POST /v3/admin/merge-accounts ---------------------------------------------------------------

export async function mergeHandler(body: Body, admin: AdminUser): Promise<Result> {
  if (typeof body.fromAccountId !== 'string' || !body.fromAccountId.trim()) return { status: 400, body: { error: 'fromAccountId is required' } };
  if (typeof body.toAccountId !== 'string' || !body.toAccountId.trim()) return { status: 400, body: { error: 'toAccountId is required' } };
  const fromAccountId = body.fromAccountId.trim(), toAccountId = body.toAccountId.trim();
  if (fromAccountId === toAccountId) return { status: 400, body: { error: 'fromAccountId and toAccountId must differ' } };
  const [fromAccount, toAccount] = await Promise.all([db.getAccountById(fromAccountId), db.getAccountById(toAccountId)]);
  if (!fromAccount) return { status: 404, body: { error: `from account not found: ${fromAccountId}` } };
  if (!toAccount) return { status: 404, body: { error: `to account not found: ${toAccountId}` } };
  if (fromAccount.platform !== toAccount.platform) return { status: 400, body: { error: `platform mismatch: ${fromAccount.platform} vs ${toAccount.platform}` } };
  if (fromAccount.mergedInto) return { status: 409, body: { error: 'from account is already merged', mergedInto: fromAccount.mergedInto } };
  if (toAccount.mergedInto) return { status: 409, body: { error: 'to account is already a merge tombstone', mergedInto: toAccount.mergedInto } };
  const activeSeason = await db.getActiveSeason();
  if (!activeSeason) return { status: 409, body: { error: 'No active season' } };
  const { rewritten, toScore } = await wdb.mergeAccounts(fromAccountId, toAccountId, toAccount, activeSeason.seasonId);
  const mergedAt = new Date().toISOString();
  const lostAdjustment = fromAccount.adjustmentTotalScore || 0;
  // Forensic trail for this irreversible, score-destroying op (parity with admin-merge-accounts.ts).
  console.log(JSON.stringify({ event: 'ADMIN_MERGE_ACCOUNTS', adminId: admin.identityId, adminEmail: admin.email,
    fromAccountId, toAccountId, activeSeasonId: activeSeason.seasonId, postsRewritten: rewritten, lostAdjustment,
    toUserScore: toScore?.userScore ?? 0, toRawScore: toScore?.rawScore ?? 0, ts: mergedAt }));
  return { status: 200, body: { success: true, fromAccountId, toAccountId, mergedAt, activeSeasonId: activeSeason.seasonId,
    postsRewritten: rewritten, lostAdjustment,
    toScore: toScore ? { totalPostScore: toScore.totalPostScore, postCount: toScore.postCount, userScore: toScore.userScore, rawScore: toScore.rawScore } : null } };
}

// ---- POST /v3/admin/snapshot (admin-triggered generate; dryRun preview) --------------------------

export async function snapshotHandler(body: Body): Promise<Result> {
  // Box admin trigger: dryRun preview only (live writes go through the systemd timer). Mirrors the lambda's
  // default dryRun=true safety; an explicit write trigger is intentionally not exposed here (the timer owns it).
  const season = await db.getActiveSeason();
  if (!season) return { status: 500, body: { error: 'No active season found' } };
  void body;
  return { status: 200, body: { success: true, dryRun: true, seasonId: season.seasonId, message: 'Box snapshot generation runs via the systemd timer (09:10 KST). Use the CLI --dry-run for a preview.' } };
}
