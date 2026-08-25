// Write data-layer for the box leaderboard admin/write handlers. Ports the dynamodb-client.ts write
// functions + the handler-embedded writes (seasons CRUD, merge) to PG over the writer pool. Mutates the
// lb_* attributes jsonb + the promoted columns the read/cron path depends on. INERT until the Phase 3
// cutover (ADMIN_ENABLED gate); the snapshot cron regenerates all derived scores daily, so these writes
// only need the post + account aggregate INPUTS correct (validated write-then-read at cutover).
//
// Reconstructors mirror db.ts. Numeric jsonb fields stay numbers; the writer normalizes adjustment/score
// arithmetic with Number()/round to avoid string concatenation.

import postgres from 'postgres';
import type {
  Account, AccountLanguage, AccountRole, ContentSignal, Platform, Post, PostType,
  Season, SeasonAccountScore, SeasonStatus, CreatePostRequest, BannedAccountEntry,
} from '../shared/types';
import { getWriteSql } from './write-pool';
import { sql, getProfileRowByHandle } from './db';
import {
  calculatePostScoreWithFollowers, calculateScoreComponents, getRoleByFollowers, countBonusSignals, addActiveDate,
} from '../shared/services/score-calculator';
import { getTodayDateString } from '../shared/utils/date';

type Tx = ReturnType<typeof postgres>;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const nowIso = () => new Date().toISOString();

// uuid v4 (avoid pulling the uuid dep; crypto.randomUUID is in node18+).
import { randomUUID } from 'node:crypto';

// ---- reconstructors (read side of writes; mirror db.ts) ------------------------------------------

function rowToAccount(r: { account_id: string; platform: string; username: string; original_username: string | null; display_name: string | null; is_registered: boolean | null; attributes: Record<string, unknown> }): Account {
  const a = (r.attributes || {}) as Record<string, unknown>;
  return {
    ...a,
    accountId: r.account_id, platform: r.platform as Platform, username: r.username,
    originalUsername: r.original_username ?? (a.originalUsername as string | undefined),
    displayName: r.display_name ?? (a.displayName as string | undefined),
    isRegistered: r.is_registered ?? (a.isRegistered as boolean | undefined),
  } as Account;
}
const ACCT_COLS = sql`account_id, platform, username, original_username, display_name, is_registered, attributes`;

// ---- Blacklist -----------------------------------------------------------------------------------

export async function banAccount(params: { accountId: string; reason?: string; bannedBy: string }): Promise<Account> {
  const w = getWriteSql();
  const patch = { isBanned: true, banReason: params.reason || 'No reason provided', bannedAt: nowIso(), bannedBy: params.bannedBy };
  const rows = await w<{ account_id: string; platform: string; username: string; original_username: string | null; display_name: string | null; is_registered: boolean | null; attributes: Record<string, unknown> }[]>`
    UPDATE lb_accounts SET attributes = attributes || ${w.json(patch as never)}, updated_at = now()
    WHERE account_id = ${params.accountId}
    RETURNING account_id, platform, username, original_username, display_name, is_registered, attributes`;
  if (!rows.length) throw new Error('Account not found');
  return rowToAccount(rows[0]);
}

export async function unbanAccount(accountId: string): Promise<Account> {
  const w = getWriteSql();
  const rows = await w<{ account_id: string; platform: string; username: string; original_username: string | null; display_name: string | null; is_registered: boolean | null; attributes: Record<string, unknown> }[]>`
    UPDATE lb_accounts SET attributes = attributes - 'isBanned' - 'banReason' - 'bannedAt' - 'bannedBy', updated_at = now()
    WHERE account_id = ${accountId}
    RETURNING account_id, platform, username, original_username, display_name, is_registered, attributes`;
  if (!rows.length) throw new Error('Account not found');
  return rowToAccount(rows[0]);
}

export async function getBannedAccounts(): Promise<BannedAccountEntry[]> {
  const rows = await sql<{ account_id: string; platform: string; username: string; original_username: string | null; display_name: string | null; is_registered: boolean | null; attributes: Record<string, unknown> }[]>`
    SELECT ${ACCT_COLS} FROM lb_accounts WHERE attributes->>'isBanned' = 'true'`;
  return rows.map((r) => {
    const a = rowToAccount(r);
    return {
      accountId: a.accountId, username: a.username, originalUsername: a.originalUsername, platform: a.platform,
      displayName: a.displayName, profileImageUrl: a.profileImageUrl, postCount: a.postCount, totalPostScore: a.totalPostScore,
      banReason: a.banReason, bannedAt: a.bannedAt, bannedBy: a.bannedBy,
    };
  });
}

// ---- Adjust score --------------------------------------------------------------------------------

export async function adjustAccountAdjustmentScore(accountId: string, delta: number): Promise<void> {
  const w = getWriteSql();
  const d = round3(delta);
  await w`
    UPDATE lb_accounts
    SET attributes = jsonb_set(attributes, '{adjustmentTotalScore}',
      to_jsonb(round((COALESCE((attributes->>'adjustmentTotalScore')::numeric, 0) + ${d})::numeric, 3))), updated_at = now()
    WHERE account_id = ${accountId}`;
}

// Recalculate userScore with the new adjustment + persist (lb_season_accounts attributes + promoted score
// columns). Creates the SCORE record if absent (parity with dynamodb-client.adjustSeasonAdjustmentScore).
export async function adjustSeasonAdjustmentScore(
  seasonId: string, accountId: string, delta: number,
  info: { username: string; platform: Platform; originalUsername?: string; displayName?: string; profileImageUrl?: string; isRegistered?: boolean; isTelegramMember?: boolean }
): Promise<void> {
  const w = getWriteSql();
  await w.begin(async (txu) => {
    const tx = txu as unknown as Tx;
    const rows = await tx<{ last_seen: string | null; attributes: Record<string, unknown> }[]>`
      SELECT to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen, attributes
      FROM lb_season_accounts WHERE season_id = ${seasonId} AND account_id = ${accountId} LIMIT 1`;
    const existing = rows[0];
    const a = (existing?.attributes || {}) as Record<string, unknown>;
    const newAdj = round3(Number(a.adjustmentTotalScore || 0) + delta);
    const now = nowIso();
    const lastSeenAt = existing?.last_seen || now;
    const comp = calculateScoreComponents({
      totalPostScore: Number(a.totalPostScore || 0), postCount: Number(a.postCount || 0),
      uniqueActiveDays: Number(a.uniqueActiveDays || 0), lastSeenAt,
      originalPostCount: a.originalPostCount as number | undefined, originalTotalScore: a.originalTotalScore as number | undefined,
      quotePostCount: a.quotePostCount as number | undefined, quoteTotalScore: a.quoteTotalScore as number | undefined,
      replyPostCount: a.replyPostCount as number | undefined, replyTotalScore: a.replyTotalScore as number | undefined,
      adjustmentTotalScore: newAdj,
    });
    if (existing) {
      await tx`
        UPDATE lb_season_accounts
        SET attributes = jsonb_set(attributes, '{adjustmentTotalScore}', to_jsonb(${newAdj}::numeric)),
            adjustment_total_score = ${newAdj}, user_score = ${comp.userScore}, raw_score = ${comp.rawScore},
            consistency_bonus = ${comp.consistencyBonus}, freshness_multiplier = ${comp.freshnessMultiplier}
        WHERE season_id = ${seasonId} AND account_id = ${accountId}`;
    } else {
      const attrs = {
        pk: `SEASON#${seasonId}#ACCOUNT#${accountId}`, sk: 'SCORE', username: info.username, platform: info.platform,
        originalUsername: info.originalUsername, displayName: info.displayName, profileImageUrl: info.profileImageUrl,
        totalPostScore: 0, postCount: 0, uniqueActiveDays: 0, activeDates: [], signalCountTotal: 0,
        originalPostCount: 0, originalTotalScore: 0, quotePostCount: 0, quoteTotalScore: 0, replyPostCount: 0, replyTotalScore: 0,
        adjustmentTotalScore: newAdj,
      };
      // No ON CONFLICT guard: surface a concurrent create-post SCORE insert as an error (parity with the
      // lambda's attribute_not_exists ConditionExpression), so the caller retries onto the update branch
      // rather than silently dropping the adjustment.
      await tx`
        INSERT INTO lb_season_accounts
          (season_id, account_id, user_score, raw_score, adjustment_total_score, consistency_bonus, freshness_multiplier,
           is_registered, is_telegram_member, first_seen_at, last_seen_at, attributes)
        VALUES (${seasonId}, ${accountId}, ${comp.userScore}, ${comp.rawScore}, ${newAdj}, ${comp.consistencyBonus}, ${comp.freshnessMultiplier},
           ${info.isRegistered ?? false}, ${info.isTelegramMember ?? false}, ${now}, ${now}, ${tx.json(attrs as never)})`;
    }
  });
}

// ---- Posts / accounts (create-post) --------------------------------------------------------------

export async function getPostByUrl(normalizedUrl: string): Promise<Post | null> {
  const rows = await sql<{ post_id: string; post_url: string; season_id: string | null; created_at: string; attributes: Record<string, unknown> }[]>`
    SELECT post_id, post_url, season_id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, attributes
    FROM lb_posts WHERE post_url = ${normalizedUrl} LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return { ...(r.attributes as object), postId: r.post_id, postUrl: r.post_url, seasonId: r.season_id ?? undefined, createdAt: r.created_at } as Post;
}

// Stale = wallet address, missing, or equal to the handle (set from originalTwitterHandle, not the real
// X display name). Parity with dynamodb-client.isStaleDisplayName.
function isStaleDisplayName(displayName: string | undefined, username: string): boolean {
  if (!displayName) return true;
  if (displayName.startsWith('0x')) return true;
  return displayName.toLowerCase() === username.toLowerCase();
}

async function lookupUserProfile(twitterHandle: string): Promise<{ displayName: string; profileImageUrl?: string; isRegistered: boolean } | null> {
  const best = await getProfileRowByHandle(twitterHandle);
  if (!best) return null;
  let displayName = (best.username as string) || '';
  if (displayName.startsWith('0x')) displayName = '';
  return { displayName, profileImageUrl: best.profileImageUrl as string | undefined, isRegistered: true };
}

// createPost: insert lb_posts + upsert lb_accounts + lb_season_accounts aggregates, in one transaction.
// Mirrors dynamodb-client.createPost (the batch-decay cron recomputes derived scores, so this maintains the
// cumulative aggregate INPUTS: totalPostScore/postCount/per-type/uniqueActiveDays/activeDates/lastSeenAt).
export async function createPost(params: {
  normalizedUrl: string; rawUrl: string; platform: Platform; username: string; originalUsername?: string;
  accountRole: AccountRole; contentSignals: ContentSignal[]; postType?: PostType; createdBy: string;
  seasonId?: string; language?: AccountLanguage; followerCount?: number;
}): Promise<{ post: Post; account: Account }> {
  const w = getWriteSql();
  const postType = params.postType || 'original';
  const usernameLc = params.username.toLowerCase();

  return (await w.begin(async (txu) => {
    const tx = txu as unknown as Tx;

    let seasonId = params.seasonId;
    if (!seasonId) {
      const sRows = await tx<{ season_id: string }[]>`SELECT season_id FROM lb_seasons WHERE sk = 'METADATA' AND status = 'active' LIMIT 1`;
      seasonId = sRows[0]?.season_id;
    }

    const acctRows = await tx<{ account_id: string; platform: string; username: string; original_username: string | null; display_name: string | null; is_registered: boolean | null; attributes: Record<string, unknown> }[]>`
      SELECT account_id, platform, username, original_username, display_name, is_registered, attributes
      FROM lb_accounts WHERE platform = ${params.platform} AND username = ${usernameLc} LIMIT 1`;
    let account: Account;
    const isNewAccount = acctRows.length === 0;
    const now = nowIso();
    const today = getTodayDateString();

    if (isNewAccount) {
      let profile: { displayName?: string; profileImageUrl?: string; isRegistered?: boolean } | null = null;
      if (params.platform === 'twitter') profile = await lookupUserProfile(usernameLc);
      const attrs: Record<string, unknown> = {
        lastKnownRole: params.accountRole, language: params.language, followerCount: params.followerCount,
        profileImageUrl: profile?.profileImageUrl, isTelegramMember: false,
        totalPostScore: 0, postCount: 0, signalCountTotal: 0, uniqueActiveDays: 0, activeDates: [],
        originalPostCount: 0, originalTotalScore: 0, quotePostCount: 0, quoteTotalScore: 0, replyPostCount: 0, replyTotalScore: 0,
        firstSeenAt: now, lastSeenAt: now,
      };
      const accountId = randomUUID();
      await tx`
        INSERT INTO lb_accounts (account_id, platform, username, original_username, display_name, is_registered, attributes, updated_at)
        VALUES (${accountId}, ${params.platform}, ${usernameLc}, ${params.originalUsername || params.username},
          ${profile?.displayName ?? null}, ${profile?.isRegistered ?? false}, ${tx.json(attrs as never)}, now())`;
      account = rowToAccount({ account_id: accountId, platform: params.platform, username: usernameLc,
        original_username: params.originalUsername || params.username, display_name: profile?.displayName ?? null,
        is_registered: profile?.isRegistered ?? false, attributes: attrs });
    } else {
      account = rowToAccount(acctRows[0]);
      // Refresh a stale displayName (wallet addr / handle-as-name) from user_profiles (parity with
      // dynamodb-client.createPost's existing-account branch).
      if (params.platform === 'twitter' && isStaleDisplayName(account.displayName, account.username)) {
        const fresh = await lookupUserProfile(usernameLc);
        if (fresh?.displayName && !isStaleDisplayName(fresh.displayName, usernameLc)) {
          account.displayName = fresh.displayName;
          account.profileImageUrl = fresh.profileImageUrl || account.profileImageUrl;
          account.isRegistered = true;
          await tx`
            UPDATE lb_accounts SET display_name = ${account.displayName}, is_registered = true,
              attributes = attributes || jsonb_build_object('displayName', ${account.displayName}::text, 'profileImageUrl', ${account.profileImageUrl ?? null}, 'isRegistered', true), updated_at = now()
            WHERE account_id = ${account.accountId}`;
        }
      }
    }

    const effFollowers = isNewAccount ? (params.followerCount ?? 0) : (account.followerCount ?? params.followerCount ?? 0);
    const effLang: AccountLanguage = isNewAccount ? (params.language || 'en') : (account.language || params.language || 'en');
    const { baseScore, postTypeMultiplier, roleMultiplier, signalBonus, postScore } =
      calculatePostScoreWithFollowers(effFollowers, effLang, params.contentSignals, postType);

    const postId = randomUUID();
    const postAttrs = {
      platform: params.platform, postUrlRaw: params.rawUrl, accountId: account.accountId, username: params.username,
      accountRole: params.accountRole, contentSignals: params.contentSignals, postType,
      baseScore, postTypeMultiplier, roleMultiplier, signalBonus, postScore, createdBy: params.createdBy,
    };
    await tx`
      INSERT INTO lb_posts (post_id, post_url, season_id, created_at, attributes)
      VALUES (${postId}, ${params.normalizedUrl}, ${seasonId ?? null}, ${now}, ${tx.json(postAttrs as never)})`;

    // Cumulative account aggregates
    const { dates: newActiveDates } = addActiveDate((account.activeDates as string[]) || [], today);
    const bonusSignals = countBonusSignals(params.contentSignals);
    const typeCountField = `${postType}PostCount`;
    const typeScoreField = `${postType}TotalScore`;
    await tx`
      UPDATE lb_accounts SET attributes = attributes
        || jsonb_build_object(
          'totalPostScore', round((COALESCE((attributes->>'totalPostScore')::numeric,0) + ${postScore})::numeric, 6),
          'postCount', COALESCE((attributes->>'postCount')::int,0) + 1,
          'signalCountTotal', COALESCE((attributes->>'signalCountTotal')::int,0) + ${bonusSignals},
          'activeDates', ${tx.json(newActiveDates as never)},
          'uniqueActiveDays', ${newActiveDates.length},
          'lastKnownRole', ${params.accountRole}::text,
          'lastSeenAt', ${now}::text,
          ${typeCountField}, COALESCE((attributes->>${typeCountField})::int,0) + 1,
          ${typeScoreField}, round((COALESCE((attributes->>${typeScoreField})::numeric,0) + ${postScore})::numeric, 6)
        ), updated_at = now()
      WHERE account_id = ${account.accountId}`;

    // Season-specific aggregates (recompute score components)
    if (seasonId) {
      const saRows = await tx<{ last_seen: string | null; attributes: Record<string, unknown> }[]>`
        SELECT to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_seen, attributes
        FROM lb_season_accounts WHERE season_id = ${seasonId} AND account_id = ${account.accountId} LIMIT 1`;
      const ex = saRows[0];
      const a = (ex?.attributes || {}) as Record<string, unknown>;
      const { dates: saDates } = addActiveDate((a.activeDates as string[]) || [], today);
      // Round score sums to 6 dp to match the lb_accounts aggregate UPDATE (PG round(...,6)), so the two
      // stores hold identical values rather than diverging by JS float drift.
      const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
      const newTotals = {
        totalPostScore: r6(Number(a.totalPostScore || 0) + postScore),
        postCount: Number(a.postCount || 0) + 1,
        signalCountTotal: Number(a.signalCountTotal || 0) + bonusSignals,
        uniqueActiveDays: saDates.length,
        originalPostCount: Number(a.originalPostCount || 0) + (postType === 'original' ? 1 : 0),
        originalTotalScore: r6(Number(a.originalTotalScore || 0) + (postType === 'original' ? postScore : 0)),
        quotePostCount: Number(a.quotePostCount || 0) + (postType === 'quote' ? 1 : 0),
        quoteTotalScore: r6(Number(a.quoteTotalScore || 0) + (postType === 'quote' ? postScore : 0)),
        replyPostCount: Number(a.replyPostCount || 0) + (postType === 'reply' ? 1 : 0),
        replyTotalScore: r6(Number(a.replyTotalScore || 0) + (postType === 'reply' ? postScore : 0)),
      };
      const comp = calculateScoreComponents({ ...newTotals, lastSeenAt: now,
        adjustmentTotalScore: a.adjustmentTotalScore as number | undefined });
      const merged = {
        ...a, username: account.username, originalUsername: account.originalUsername, platform: account.platform,
        displayName: account.displayName, profileImageUrl: account.profileImageUrl, activeDates: saDates, ...newTotals,
      };
      if (ex) {
        await tx`
          UPDATE lb_season_accounts SET attributes = ${tx.json(merged as never)},
            user_score = ${comp.userScore}, raw_score = ${comp.rawScore}, consistency_bonus = ${comp.consistencyBonus},
            freshness_multiplier = ${comp.freshnessMultiplier}, is_registered = ${account.isRegistered ?? false},
            is_telegram_member = ${account.isTelegramMember ?? false}, last_seen_at = ${now}
          WHERE season_id = ${seasonId} AND account_id = ${account.accountId}`;
      } else {
        await tx`
          INSERT INTO lb_season_accounts
            (season_id, account_id, user_score, raw_score, adjustment_total_score, consistency_bonus, freshness_multiplier,
             is_registered, is_telegram_member, first_seen_at, last_seen_at, attributes)
          VALUES (${seasonId}, ${account.accountId}, ${comp.userScore}, ${comp.rawScore}, ${0}, ${comp.consistencyBonus}, ${comp.freshnessMultiplier},
             ${account.isRegistered ?? false}, ${account.isTelegramMember ?? false}, ${now}, ${now},
             ${tx.json({ ...merged, pk: `SEASON#${seasonId}#ACCOUNT#${account.accountId}`, sk: 'SCORE', firstSeenAt: now, lastSeenAt: now } as never)})`;
      }
    }

    const post: Post = { postId, platform: params.platform, postUrl: params.normalizedUrl, postUrlRaw: params.rawUrl,
      accountId: account.accountId, username: params.username, accountRole: params.accountRole, contentSignals: params.contentSignals,
      postType, baseScore, postTypeMultiplier, roleMultiplier, signalBonus, postScore, createdAt: now, createdBy: params.createdBy, seasonId };
    return { post, account };
  })) as { post: Post; account: Account };
}

// ---- Edit post -----------------------------------------------------------------------------------

export async function getPostByIdW(postId: string): Promise<Post | null> {
  const rows = await sql<{ post_id: string; post_url: string; season_id: string | null; created_at: string; attributes: Record<string, unknown> }[]>`
    SELECT post_id, post_url, season_id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, attributes
    FROM lb_posts WHERE post_id = ${postId} LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return { ...(r.attributes as object), postId: r.post_id, postUrl: r.post_url, seasonId: r.season_id ?? undefined, createdAt: r.created_at } as Post;
}

// Update editable post fields + adjust season/cumulative aggregates by score/type delta (parity with
// dynamodb-client.updatePostAndAdjustScores). Returns the updated post.
export async function updatePostAndAdjustScores(params: {
  postId: string; updates: { platform?: Platform; username?: string; originalUsername?: string; postScore?: number; contentSignals?: ContentSignal[]; accountRole?: AccountRole; postType?: PostType };
}): Promise<Post> {
  const w = getWriteSql();
  const { postId, updates } = params;
  return (await w.begin(async (txu) => {
    const tx = txu as unknown as Tx;
    const exRows = await tx<{ post_id: string; post_url: string; season_id: string | null; created_at: string; attributes: Record<string, unknown> }[]>`
      SELECT post_id, post_url, season_id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, attributes
      FROM lb_posts WHERE post_id = ${postId} LIMIT 1`;
    if (!exRows.length) throw new Error(`Post ${postId} not found`);
    const er = exRows[0];
    const existing = { ...(er.attributes as object), postId: er.post_id, postUrl: er.post_url, seasonId: er.season_id ?? undefined, createdAt: er.created_at } as Post;

    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const k of ['contentSignals', 'accountRole', 'postScore', 'platform', 'username', 'originalUsername', 'postType'] as const) {
      if (updates[k] !== undefined) patch[k] = updates[k];
    }
    await tx`UPDATE lb_posts SET attributes = attributes || ${tx.json(patch as never)} WHERE post_id = ${postId}`;

    const validTypes: PostType[] = ['original', 'quote', 'reply'];
    const oldType = validTypes.includes(existing.postType as PostType) ? existing.postType : 'original';
    const newType = updates.postType ?? oldType;
    const typeChanged = updates.postType !== undefined && newType !== oldType;
    const scoreChanged = updates.postScore !== undefined && updates.postScore !== existing.postScore;
    if (!typeChanged && !scoreChanged) {
      return { ...existing, ...patch } as Post;
    }

    const oldScore = existing.postScore;
    const newScore = updates.postScore ?? oldScore;
    const applyDelta = async (table: 'lb_accounts' | 'lb_season_accounts', whereKey: { season_id?: string; account_id: string }) => {
      // Build per-type + total deltas as a jsonb merge.
      if (typeChanged) {
        const oc = `${oldType}PostCount`, os = `${oldType}TotalScore`, nc = `${newType}PostCount`, ns = `${newType}TotalScore`;
        const set = (await tx.unsafe(
          `UPDATE ${table} SET attributes = attributes || jsonb_build_object(
             '${oc}', COALESCE((attributes->>'${oc}')::numeric,0) - 1,
             '${os}', round((COALESCE((attributes->>'${os}')::numeric,0) - $1)::numeric,6),
             '${nc}', COALESCE((attributes->>'${nc}')::numeric,0) + 1,
             '${ns}', round((COALESCE((attributes->>'${ns}')::numeric,0) + $2)::numeric,6),
             'totalPostScore', round((COALESCE((attributes->>'totalPostScore')::numeric,0) + $3)::numeric,6))
           WHERE account_id = $4 ${whereKey.season_id ? 'AND season_id = $5' : ''}`,
          whereKey.season_id ? [oldScore, newScore, newScore - oldScore, whereKey.account_id, whereKey.season_id] : [oldScore, newScore, newScore - oldScore, whereKey.account_id]
        ));
        void set;
      } else if (scoreChanged) {
        const f = oldType === 'original' ? 'originalTotalScore' : oldType === 'quote' ? 'quoteTotalScore' : 'replyTotalScore';
        const delta = newScore - oldScore;
        await tx.unsafe(
          `UPDATE ${table} SET attributes = attributes || jsonb_build_object(
             'totalPostScore', round((COALESCE((attributes->>'totalPostScore')::numeric,0) + $1)::numeric,6),
             '${f}', round((COALESCE((attributes->>'${f}')::numeric,0) + $1)::numeric,6))
           WHERE account_id = $2 ${whereKey.season_id ? 'AND season_id = $3' : ''}`,
          whereKey.season_id ? [delta, whereKey.account_id, whereKey.season_id] : [delta, whereKey.account_id]
        );
      }
    };
    if (existing.seasonId) await applyDelta('lb_season_accounts', { season_id: existing.seasonId, account_id: existing.accountId });
    await applyDelta('lb_accounts', { account_id: existing.accountId });

    return { ...existing, ...patch } as Post;
  })) as Post;
}

export async function updateAccountLanguageData(params: { accountId: string; language: AccountLanguage; followerCount: number }): Promise<Account> {
  const w = getWriteSql();
  const role = getRoleByFollowers(params.followerCount, params.language);
  const rows = await w<{ account_id: string; platform: string; username: string; original_username: string | null; display_name: string | null; is_registered: boolean | null; attributes: Record<string, unknown> }[]>`
    UPDATE lb_accounts SET attributes = attributes || jsonb_build_object('language', ${params.language}::text, 'followerCount', ${params.followerCount}, 'lastKnownRole', ${role}::text), updated_at = now()
    WHERE account_id = ${params.accountId}
    RETURNING account_id, platform, username, original_username, display_name, is_registered, attributes`;
  if (!rows.length) throw new Error('Account not found');
  return rowToAccount(rows[0]);
}

// ---- Seasons CRUD --------------------------------------------------------------------------------

function rowToSeason(r: { season_id: string; sk: string; status: string | null; attributes: Record<string, unknown> }): Season {
  const a = (r.attributes || {}) as Record<string, unknown>;
  return { ...a, seasonId: r.season_id, sk: r.sk, status: (r.status ?? (a.status as string)) as SeasonStatus } as Season;
}
const SEASON_COLS = sql`season_id, sk, status, attributes`;

// Accept an optional query instance so the season write-transactions read their own uncommitted state
// (pass tx); the public export reads via the compute_ro pool.
async function getAllSeasonsWith(q: Tx): Promise<Season[]> {
  const rows = await q<{ season_id: string; sk: string; status: string | null; attributes: Record<string, unknown> }[]>`
    SELECT season_id, sk, status, attributes FROM lb_seasons WHERE sk = 'METADATA'`;
  return rows.map(rowToSeason);
}
async function getSeasonWith(q: Tx, seasonId: string): Promise<Season | null> {
  const rows = await q<{ season_id: string; sk: string; status: string | null; attributes: Record<string, unknown> }[]>`
    SELECT season_id, sk, status, attributes FROM lb_seasons WHERE season_id = ${seasonId} AND sk = 'METADATA' LIMIT 1`;
  return rows.length ? rowToSeason(rows[0]) : null;
}

export async function getAllSeasons(): Promise<Season[]> {
  return getAllSeasonsWith(sql as unknown as Tx);
}

export async function getSeason(seasonId: string): Promise<Season | null> {
  return getSeasonWith(sql as unknown as Tx, seasonId);
}

async function writeSeasonRow(tx: Tx, s: Season): Promise<void> {
  const { seasonId, sk, status, ...rest } = s;
  await tx`
    INSERT INTO lb_seasons (season_id, sk, status, attributes)
    VALUES (${seasonId}, ${sk}, ${status}, ${tx.json(rest as never)})
    ON CONFLICT (season_id, sk) DO UPDATE SET status = EXCLUDED.status, attributes = EXCLUDED.attributes`;
}

export async function createSeason(req: { seasonId: string; name: string; description?: string; startDate: string; endDate: string }, createdBy: string): Promise<Season> {
  const w = getWriteSql();
  return (await w.begin(async (txu) => {
    const tx = txu as unknown as Tx;
    const ex = await tx`SELECT 1 FROM lb_seasons WHERE season_id = ${req.seasonId} AND sk = 'METADATA' LIMIT 1`;
    if (ex.length) throw new Error(`Season ${req.seasonId} already exists`);
    const all = await getAllSeasonsWith(tx);
    const overlap = all.find((s) =>
      (req.startDate >= s.startDate && req.startDate <= s.endDate) ||
      (req.endDate >= s.startDate && req.endDate <= s.endDate) ||
      (req.startDate <= s.startDate && req.endDate >= s.endDate));
    if (overlap) throw new Error(`Date range overlaps with season ${overlap.seasonId}`);
    const today = new Date().toISOString().split('T')[0];
    const hasActive = all.some((s) => s.status === 'active');
    let status: SeasonStatus;
    if (req.endDate < today) status = 'ended';
    else if (req.startDate <= today && today <= req.endDate) status = hasActive ? 'upcoming' : 'active';
    else status = 'upcoming';
    const isDefault = status === 'active';
    if (isDefault) {
      const curDefault = all.find((s) => s.isDefault);
      if (curDefault) await tx`UPDATE lb_seasons SET attributes = jsonb_set(attributes, '{isDefault}', 'false'::jsonb) WHERE season_id = ${curDefault.seasonId} AND sk = 'METADATA'`;
    }
    const season: Season = { seasonId: req.seasonId, sk: 'METADATA', name: req.name, description: req.description,
      startDate: req.startDate, endDate: req.endDate, status, isDefault, totalPosts: 0, totalAccounts: 0, createdAt: nowIso(), createdBy };
    await writeSeasonRow(tx, season);
    return season;
  })) as Season;
}

export async function updateSeason(seasonId: string, updates: Partial<Season>): Promise<Season> {
  const w = getWriteSql();
  return (await w.begin(async (txu) => {
    const tx = txu as unknown as Tx;
    const existing = await getSeasonWith(tx, seasonId);
    if (!existing) throw new Error(`Season ${seasonId} not found`);
    if (updates.startDate || updates.endDate) {
      const ns = updates.startDate || existing.startDate, ne = updates.endDate || existing.endDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ns) || !/^\d{4}-\d{2}-\d{2}$/.test(ne) || ns >= ne) throw new Error('Invalid date range');
      const all = await getAllSeasonsWith(tx);
      const overlap = all.find((s) => s.seasonId !== seasonId &&
        ((ns >= s.startDate && ns <= s.endDate) || (ne >= s.startDate && ne <= s.endDate) || (ns <= s.startDate && ne >= s.endDate)));
      if (overlap) throw new Error(`Date range overlaps with season ${overlap.seasonId}`);
    }
    const merged: Season = { ...existing,
      name: updates.name ?? existing.name, description: updates.description ?? existing.description,
      startDate: updates.startDate ?? existing.startDate, endDate: updates.endDate ?? existing.endDate,
      status: updates.status ?? existing.status, isDefault: updates.isDefault ?? existing.isDefault,
      updatedAt: nowIso() };
    await writeSeasonRow(tx, merged);
    return merged;
  })) as Season;
}

export async function deleteSeason(seasonId: string): Promise<void> {
  const w = getWriteSql();
  const posts = await sql`SELECT 1 FROM lb_posts WHERE season_id = ${seasonId} LIMIT 1`;
  if (posts.length) throw new Error(`Cannot delete season ${seasonId}: has existing posts`);
  await w`DELETE FROM lb_seasons WHERE season_id = ${seasonId} AND sk = 'METADATA'`;
}

export async function activateSeason(seasonId: string): Promise<Season> {
  const w = getWriteSql();
  return (await w.begin(async (txu) => {
    const tx = txu as unknown as Tx;
    const season = await getSeasonWith(tx, seasonId);
    if (!season) throw new Error(`Season ${seasonId} not found`);
    if (season.status === 'ended' || season.status === 'archived') throw new Error(`Cannot activate season with status ${season.status}`);
    const all = await getAllSeasonsWith(tx);
    const curActive = all.find((s) => s.status === 'active' && s.seasonId !== seasonId);
    if (curActive) await writeSeasonRow(tx, { ...curActive, status: 'ended', isDefault: false, updatedAt: nowIso() });
    const updated: Season = { ...season, status: 'active', isDefault: true, updatedAt: nowIso() };
    await writeSeasonRow(tx, updated);
    return updated;
  })) as Season;
}

export async function endSeason(seasonId: string): Promise<Season> {
  const w = getWriteSql();
  const season = await getSeason(seasonId);
  if (!season) throw new Error(`Season ${seasonId} not found`);
  if (season.status !== 'active') throw new Error(`Cannot end season with status ${season.status}`);
  const updated: Season = { ...season, status: 'ended', isDefault: false, updatedAt: nowIso() };
  await w.begin(async (txu) => writeSeasonRow(txu as unknown as Tx, updated));
  return updated;
}

// ---- Curated featured feed -----------------------------------------------------------------------

export async function saveCuratedFeedRecord(items: Array<{ postId: string; badge: string; order: number }>, adminUsername: string): Promise<{ items: typeof items; updatedAt: string; updatedBy: string }> {
  const w = getWriteSql();
  const record = { items, updatedAt: nowIso(), updatedBy: adminUsername };
  await w`
    INSERT INTO lb_seasons (season_id, sk, status, attributes)
    VALUES ('__FEATURED_FEED__', 'CURATED', NULL, ${w.json(record as never)})
    ON CONFLICT (season_id, sk) DO UPDATE SET attributes = EXCLUDED.attributes`;
  return record;
}

// ---- Merge accounts ------------------------------------------------------------------------------

export async function mergeAccounts(fromAccountId: string, toAccountId: string, toAccount: Account, activeSeasonId: string): Promise<{ rewritten: number; toScore: SeasonAccountScore | null }> {
  const w = getWriteSql();
  return (await w.begin(async (txu) => {
    const tx = txu as unknown as Tx;
    // 1. Rewrite from's posts -> to (idempotent: only rows still pointing at from).
    const rw = await tx`UPDATE lb_posts SET attributes = jsonb_set(attributes, '{accountId}', ${JSON.stringify(toAccountId)}::jsonb)
      WHERE attributes->>'accountId' = ${fromAccountId} RETURNING post_id`;
    const rewritten = rw.length;
    // 2. Delete from's active-season SCORE.
    await tx`DELETE FROM lb_season_accounts WHERE season_id = ${activeSeasonId} AND account_id = ${fromAccountId}`;
    // 3. Recompute to's active-season SCORE from union of posts (now including from's).
    const postRows = await tx<{ d: string; ps: number; pt: string; signals: unknown }[]>`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS d,
        (attributes->>'postScore')::float AS ps, attributes->>'postType' AS pt, attributes->'contentSignals' AS signals
      FROM lb_posts WHERE attributes->>'accountId' = ${toAccountId} AND season_id = ${activeSeasonId}`;
    const { pk, sk } = { pk: `SEASON#${activeSeasonId}#ACCOUNT#${toAccountId}`, sk: 'SCORE' };
    let toScore: SeasonAccountScore | null = null;
    if (postRows.length === 0) {
      await tx`DELETE FROM lb_season_accounts WHERE season_id = ${activeSeasonId} AND account_id = ${toAccountId}`;
    } else {
      let totalPostScore = 0, oc = 0, os = 0, qc = 0, qs = 0, rc = 0, rs = 0, sig = 0;
      const dateSet = new Set<string>();
      let lastSeenAt = postRows[0].d, firstSeenAt = toAccount.firstSeenAt || postRows[0].d;
      for (const p of postRows) {
        totalPostScore += p.ps;
        sig += (Array.isArray(p.signals) ? (p.signals as string[]) : []).filter((s) => s === 'insight' || s === 'creative' || s === 'high_reach').length;
        const t = p.pt || 'original';
        if (t === 'original') { oc++; os += p.ps; } else if (t === 'quote') { qc++; qs += p.ps; } else { rc++; rs += p.ps; }
        dateSet.add(p.d.slice(0, 10));
        if (p.d > lastSeenAt) lastSeenAt = p.d;
        if (p.d < firstSeenAt) firstSeenAt = p.d;
      }
      const activeDates = Array.from(dateSet).sort();
      const preservedAdj = Number(toAccount.adjustmentTotalScore || 0);
      const comp = calculateScoreComponents({ totalPostScore, postCount: postRows.length, uniqueActiveDays: activeDates.length, lastSeenAt,
        originalPostCount: oc, originalTotalScore: os, quotePostCount: qc, quoteTotalScore: qs, replyPostCount: rc, replyTotalScore: rs, adjustmentTotalScore: preservedAdj });
      const attrs = { pk, sk, username: toAccount.username, originalUsername: toAccount.originalUsername, platform: toAccount.platform,
        language: toAccount.language, followerCount: toAccount.followerCount, totalPostScore, postCount: postRows.length, signalCountTotal: sig,
        uniqueActiveDays: activeDates.length, activeDates, originalPostCount: oc, originalTotalScore: os, quotePostCount: qc, quoteTotalScore: qs,
        replyPostCount: rc, replyTotalScore: rs, adjustmentTotalScore: preservedAdj || undefined, displayName: toAccount.displayName,
        profileImageUrl: toAccount.profileImageUrl, firstSeenAt, lastSeenAt };
      await tx`
        INSERT INTO lb_season_accounts
          (season_id, account_id, user_score, raw_score, adjustment_total_score, consistency_bonus, freshness_multiplier,
           is_registered, is_telegram_member, first_seen_at, last_seen_at, attributes)
        VALUES (${activeSeasonId}, ${toAccountId}, ${comp.userScore}, ${comp.rawScore}, ${preservedAdj}, ${comp.consistencyBonus}, ${comp.freshnessMultiplier},
           ${toAccount.isRegistered ?? false}, ${toAccount.isTelegramMember ?? false}, ${firstSeenAt}, ${lastSeenAt}, ${tx.json(attrs as never)})
        ON CONFLICT (season_id, account_id) DO UPDATE SET user_score = EXCLUDED.user_score, raw_score = EXCLUDED.raw_score,
           consistency_bonus = EXCLUDED.consistency_bonus, freshness_multiplier = EXCLUDED.freshness_multiplier, last_seen_at = EXCLUDED.last_seen_at, attributes = EXCLUDED.attributes`;
      toScore = { ...attrs, accountId: toAccountId, seasonId: activeSeasonId, userScore: comp.userScore, rawScore: comp.rawScore, consistencyBonus: comp.consistencyBonus, freshnessMultiplier: comp.freshnessMultiplier } as unknown as SeasonAccountScore;
    }
    // 4. Flag from as merged tombstone (only if not already).
    await tx`UPDATE lb_accounts SET attributes = attributes || jsonb_build_object('mergedInto', ${toAccountId}::text, 'mergedAt', ${nowIso()}::text), updated_at = now()
      WHERE account_id = ${fromAccountId} AND NOT (attributes ? 'mergedInto')`;
    return { rewritten, toScore };
  })) as { rewritten: number; toScore: SeasonAccountScore | null };
}

// ---- Admin stats reads -------------------------------------------------------------------------

export async function adminCounts(): Promise<{ totalPosts: number; totalAccounts: number; todayPosts: number; todayAccounts: number }> {
  const todayMidnight = `${getTodayDateString()}T00:00:00.000Z`;
  const [tp, ta, todayP, todayA] = await Promise.all([
    sql<{ n: number }[]>`SELECT count(*)::int n FROM lb_posts`,
    sql<{ n: number }[]>`SELECT count(*)::int n FROM lb_accounts`,
    sql<{ n: number }[]>`SELECT count(*)::int n FROM lb_posts WHERE created_at >= ${todayMidnight}`,
    sql<{ n: number }[]>`SELECT count(*)::int n FROM lb_accounts WHERE (attributes->>'firstSeenAt') >= ${todayMidnight}`,
  ]);
  return { totalPosts: tp[0].n, totalAccounts: ta[0].n, todayPosts: todayP[0].n, todayAccounts: todayA[0].n };
}
