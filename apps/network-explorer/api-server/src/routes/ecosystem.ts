/**
 * Ecosystem Score & Leaderboard Routes
 *
 * Routes:
 *   GET /score/:identityId       - User's ecosystem score with multiplier
 *   GET /leaderboard             - Ecosystem leaderboard (daily/weekly)
 *   GET /health                  - Matview + cache health
 */

import { Hono } from 'hono';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { pointsDb } from '../db.js';
import { cached } from '../cache.js';
import {
  getActivationsForUser,
  getActivationsCacheMap,
  getMatviewStatus,
  updateActivationsForUser,
} from '../scanner/ecosystem-cache.js';
import { getActivationBonus, calculateMultiplier, calculateMultiplierV2, isV2CutoverActive } from '../config/ecosystem.js';
import { REFERRAL_ECOSYSTEM_SCALING_FACTOR } from '../config/referral.js';

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

let _ddbClient: DynamoDBDocumentClient | null = null;
function getDdbClient(): DynamoDBDocumentClient {
  if (!_ddbClient) {
    _ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));
  }
  return _ddbClient;
}

// Same priority chain as get-user-profile Lambda: customDisplayName > Twitter > linkedAccounts > email prefix
function resolveDisplayName(item: Record<string, unknown>): string | null {
  if (item.customDisplayName) return item.customDisplayName as string;
  if (item.provider === 'Twitter' && item.username) return item.username as string;
  const linked = item.linkedAccounts as Record<string, Record<string, string>> | undefined;
  if (linked?.twitter?.username) return linked.twitter.username;
  const email = item.email as string | undefined;
  if (email) return email.split('@')[0];
  return null;
}

const PUBLIC_AVATARS_BASE_URL = (process.env.PUBLIC_AVATARS_BASE_URL || '').replace(/\/+$/, '');

// Avatar URL cascade: customAvatarKey > linked twitter image > linked google image > null.
// Mirrors @nasun/profile-core/resolveAvatarUrl. Inlined here to avoid pulling
// the package + dist build into the api-server build pipeline (this is a
// stable few lines; sync if @nasun/profile-core changes).
function resolveAvatarUrl(item: Record<string, unknown>): string | null {
  const banned = item.customAvatarBanned === true;
  const customAvatarKey = !banned ? (item.customAvatarKey as string | undefined) : undefined;
  if (customAvatarKey && PUBLIC_AVATARS_BASE_URL) {
    return `${PUBLIC_AVATARS_BASE_URL}/${customAvatarKey.replace(/^\/+/, '')}`;
  }
  const linked = item.linkedAccounts as Record<string, Record<string, string>> | undefined;
  if (linked?.twitter?.profileImageUrl) return linked.twitter.profileImageUrl;
  if (linked?.google?.profileImageUrl) return linked.google.profileImageUrl;
  return null;
}

interface ProfileCacheEntry {
  displayName: string | null;
  xHandle: string | null;
  profileImageUrl: string | null;
  isTelegramMember: boolean;
  hasGoogle: boolean;
}

const profileCache = {
  data: new Map<string, ProfileCacheEntry>(),
  expiresAt: 0,
};
const PROFILE_CACHE_TTL = 5 * 60 * 1000;

/**
 * Force-expire the entire profile cache. Called by the internal invalidate
 * webhook from nasun-website Lambda when any user's profile changes. The
 * next batch fetch repopulates from DynamoDB. We expire all (rather than a
 * single key) because the cache is keyed by identityId but the webhook
 * supplies a walletAddress; the cost of a full repopulate is a single batched
 * BatchGetItem on next read.
 */
export function invalidateAllProfileCache(): void {
  profileCache.expiresAt = 0;
  profileCache.data.clear();
}

// Twitter handle must be alphanumeric + underscore, 1-50 chars
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,50}$/;

function sanitizeXHandle(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  return X_HANDLE_RE.test(raw) ? raw : null;
}

async function fetchProfilesBatch(identityIds: string[]): Promise<Map<string, ProfileCacheEntry>> {
  if (identityIds.length === 0) return new Map();

  const now = Date.now();
  const cacheValid = profileCache.expiresAt > now;
  const missing = cacheValid
    ? identityIds.filter(id => !profileCache.data.has(id))
    : identityIds;

  if (!cacheValid) profileCache.data.clear();

  if (missing.length > 0) {
    try {
      const ddb = getDdbClient();
      const CHUNK = 100;
      const PROJECTION =
        'identityId, customDisplayName, customAvatarKey, customAvatarBanned, #pr, username, linkedAccounts, linkedToPrimaryId, twitterHandle, originalTwitterHandle, profileImageUrl, #em, #tgm';
      const EAN = { '#pr': 'provider', '#em': 'email', '#tgm': 'isTelegramMember' };

      // Pass 1: fetch missing identities directly.
      const fetched = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < missing.length; i += CHUNK) {
        let pendingKeys = missing.slice(i, i + CHUNK).map(id => ({ identityId: id }));
        while (pendingKeys.length > 0) {
          const res = await ddb.send(new BatchGetCommand({
            RequestItems: {
              [USER_PROFILES_TABLE]: { Keys: pendingKeys, ProjectionExpression: PROJECTION, ExpressionAttributeNames: EAN },
            },
          }));
          for (const item of res.Responses?.[USER_PROFILES_TABLE] ?? []) {
            fetched.set(item.identityId as string, item as Record<string, unknown>);
          }
          pendingKeys = (res.UnprocessedKeys?.[USER_PROFILES_TABLE]?.Keys as typeof pendingKeys) ?? [];
        }
      }

      // Pass 2: hop into linkedToPrimaryId. Secondary identities (e.g. an X
      // identity linked to a wallet-primary user) inherit the primary's
      // customDisplayName / customAvatarKey so the same user shows the same
      // name and avatar across every leaderboard surface.
      const primaryIdsToFetch = new Set<string>();
      for (const item of fetched.values()) {
        const linkedTo = item.linkedToPrimaryId as string | undefined;
        if (linkedTo && !fetched.has(linkedTo) && !profileCache.data.has(linkedTo)) {
          primaryIdsToFetch.add(linkedTo);
        }
      }
      const primaries = new Map<string, Record<string, unknown>>();
      const primaryIds = Array.from(primaryIdsToFetch);
      for (let i = 0; i < primaryIds.length; i += CHUNK) {
        let pendingKeys = primaryIds.slice(i, i + CHUNK).map(id => ({ identityId: id }));
        while (pendingKeys.length > 0) {
          const res = await ddb.send(new BatchGetCommand({
            RequestItems: {
              [USER_PROFILES_TABLE]: { Keys: pendingKeys, ProjectionExpression: PROJECTION, ExpressionAttributeNames: EAN },
            },
          }));
          for (const item of res.Responses?.[USER_PROFILES_TABLE] ?? []) {
            primaries.set(item.identityId as string, item as Record<string, unknown>);
          }
          pendingKeys = (res.UnprocessedKeys?.[USER_PROFILES_TABLE]?.Keys as typeof pendingKeys) ?? [];
        }
      }

      // Build cache entries with primary overrides applied.
      for (const [id, item] of fetched.entries()) {
        const linkedTo = item.linkedToPrimaryId as string | undefined;
        const primary = linkedTo
          ? (primaries.get(linkedTo) ?? profileCache.data.get(linkedTo) /* may carry no raw item */)
          : null;
        // Overlay: primary's customDisplayName / customAvatarKey / customAvatarBanned
        // win over the secondary's. Other fields (X handle, X image, etc.)
        // stay on the secondary because that's where the social linkage lives.
        const merged: Record<string, unknown> = { ...item };
        if (primary && typeof primary === 'object' && 'identityId' in (primary as object)) {
          const p = primary as Record<string, unknown>;
          if (p.customDisplayName) merged.customDisplayName = p.customDisplayName;
          if (p.customAvatarKey) merged.customAvatarKey = p.customAvatarKey;
          if (p.customAvatarBanned !== undefined) merged.customAvatarBanned = p.customAvatarBanned;
        }
        const provider = ((merged.provider as string | undefined) ?? '').toLowerCase();
        const linked = (merged.linkedAccounts as Record<string, unknown> | undefined) ?? {};
        const cascaded = resolveAvatarUrl(merged);
        profileCache.data.set(id, {
          displayName: resolveDisplayName(merged),
          xHandle: sanitizeXHandle(merged.originalTwitterHandle ?? merged.twitterHandle),
          profileImageUrl: cascaded ?? (merged.profileImageUrl as string | undefined) ?? null,
          isTelegramMember: (merged.isTelegramMember as boolean | undefined) ?? false,
          hasGoogle: !!(linked.google) || provider === 'google' || provider === 'accounts.google.com',
        });
      }
      profileCache.expiresAt = now + PROFILE_CACHE_TTL;
    } catch (err) {
      console.error('[leaderboard] profile batch fetch error:', err);
      // Reset expiry so the next request retries immediately instead of
      // serving a stale empty cache for the full TTL window.
      profileCache.expiresAt = 0;
    }
  }

  const result = new Map<string, ProfileCacheEntry>();
  for (const id of identityIds) {
    result.set(id, profileCache.data.get(id) ?? { displayName: null, xHandle: null, profileImageUrl: null, isTelegramMember: false, hasGoogle: false });
  }
  return result;
}

// Grace period before alliance penalty takes effect (days after NFT first activation)
const ALLIANCE_PENALTY_GRACE_DAYS = 7;
import { STAKING_V2_CUTOFF_DATE } from '../config/points.js';
import { getIdentityByWallet } from '../scanner/points-scanner.js';

const app = new Hono();

const roundTo2 = (n: number) => parseFloat(n.toFixed(2));

const ALLOWED_LIMITS = [25, 50, 100, 200, 500, 1000, 2000] as const;
const MAX_OFFSET = 10000;

// Cognito identityId format: region:uuid
const IDENTITY_ID_PATTERN = /^[\w-]+:[\w-]{36}$/;

// Must match the allowlist in index.ts. Used for explicit CORS on redirect responses
// (nginx/CloudFront may strip middleware-set CORS headers on 302).
const CORS_ALLOWED_ORIGINS = new Set([
  'https://explorer.nasun.io',
  'https://nasun.io',
  'https://staging.nasun.io',
  'https://pado.finance',
  'https://staging.pado.finance',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:4173',
]);

// Maximum ranked entries returned by the leaderboard. Raising this increases
// DynamoDB BatchGet calls (ceil(N/100)) and memory proportionally.
const LEADERBOARD_TOP_N = 2000;

function parseLimit(raw: string | undefined): number {
  const n = Number(raw ?? 50);
  if (Number.isNaN(n) || n < 1) return 50;
  return ALLOWED_LIMITS.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev,
  );
}

function parseOffset(raw: string | undefined): number {
  const n = Number(raw ?? 0);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_OFFSET);
}

// GET /api/v1/ecosystem/score/:identityId
app.get('/score/:identityId', async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }

  const getData = cached(
    `eco-score-${identityId}`,
    30 * 1000,
    async () => {
      const [
        todayRow, weeklyRow, allTimeRow, snapshotSumRow, unsnapshottedRow,
        bonusRow, bonusTodayRow, bonusWeeklyRow, bonusCategoryRows,
        govAllTimeRow, govTodayRow, govWeeklyRow,
        refAllTimeRow, refTodayRow, refWeeklyRow,
        todayCategoryRows,
        stakingTodayRow, stakingWeeklyRow, stakingAllTimeRow,
        weeklySnapshotSumRow,
      ] = await Promise.all([
        pointsDb!`
          SELECT base_score::int as base_score
          FROM ecosystem_daily_scores
          WHERE identity_id = ${identityId}
            AND day = CURRENT_DATE
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(base_score), 0)::int as base_score,
                 COUNT(*)::int as active_days
          FROM ecosystem_daily_scores
          WHERE identity_id = ${identityId}
            AND day >= CURRENT_DATE - INTERVAL '6 days'
            AND day <= CURRENT_DATE
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(base_score), 0)::int as base_score,
                 COUNT(*)::int as active_days
          FROM ecosystem_daily_scores
          WHERE identity_id = ${identityId}
        `.then(r => r[0]),
        // Sum of base contributions from past snapshots (base_score * multiplier per day)
        // Bonus/gov/referral are queried directly from activity_points (not from snapshots)
        pointsDb!`
          SELECT COALESCE(SUM(base_score * multiplier), 0)::numeric as base_cumulative
          FROM ecosystem_score_snapshots
          WHERE identity_id = ${identityId}
        `.then(r => r[0]),
        // Yesterday's base score if snapshot hasn't been created yet
        // (covers the ~5min gap between UTC midnight and snapshot creation)
        pointsDb!`
          SELECT COALESCE(d.base_score, 0)::int as base_score
          FROM ecosystem_daily_scores d
          WHERE d.identity_id = ${identityId}
            AND d.day = CURRENT_DATE - 1
            AND NOT EXISTS (
              SELECT 1 FROM ecosystem_score_snapshots s
              WHERE s.identity_id = ${identityId} AND s.snapshot_date = CURRENT_DATE - 1
            )
        `.then(r => r[0]),
        // bonus_total: synthetic INCLUDED intentionally — allTime must reflect
        // the user-visible score including restoration rows (never-reduce-score principle).
        // See fc4b0e72 recovery plan (v10) and scripts/restore-staking-recovery.sql.
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as bonus_total
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category LIKE 'ecosystem-bonus-%'
            AND NOT flagged
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as bonus_today
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category LIKE 'ecosystem-bonus-%'
            AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
            AND NOT flagged
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as bonus_weekly
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category LIKE 'ecosystem-bonus-%'
            AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
            AND NOT flagged
            AND tx_timestamp >= (CURRENT_DATE - 6) AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        // Category breakdown for composition bar (bonus + governance + referral)
        // synthetic rows (e.g., restoration) excluded to avoid exposing internal categories in UI
        pointsDb!`
          SELECT category, COALESCE(SUM(final_points), 0)::numeric as points
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND NOT flagged
            AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
            AND (
              category LIKE 'ecosystem-bonus-%'
              OR category IN ('governance', 'referral-bonus')
            )
          GROUP BY category
          ORDER BY points DESC
        `,
        // Governance points (allTime / today / weekly)
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as gov_total
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'governance'
            AND NOT flagged
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as gov_today
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'governance'
            AND NOT flagged
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as gov_weekly
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'governance'
            AND NOT flagged
            AND tx_timestamp >= (CURRENT_DATE - 6) AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        // Referral bonus (separate from ecosystem-bonus, scaled independently)
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as referral_total
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'referral-bonus'
            AND NOT flagged
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as referral_today
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'referral-bonus'
            AND NOT flagged
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as referral_weekly
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'referral-bonus'
            AND NOT flagged
            AND tx_timestamp >= (CURRENT_DATE - 6) AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        // Today's distinct base categories (for daily mission checklist)
        pointsDb!`
          SELECT DISTINCT category
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
            AND base_points > 0
            AND NOT flagged
            -- Ecosystem base_score scope (see db/ecosystem-schema.sql).
            -- NOT the DAU/nasun-metrics scope (config/categories.ts).
            AND category NOT IN ('referral-bonus', 'daily-mission', 'ecosystem-passive', 'staking-daily', 'staking')
            AND category NOT LIKE 'ecosystem-bonus-%'
        `.then(rows => rows.map((r: any) => r.category as string)),
        // Staking-v2: tier-based stake_score, post-cutoff only (forward-only).
        // staking-daily row stores tier pts in base_points (v2 scanner).
        pointsDb!`
          SELECT COALESCE(SUM(base_points), 0)::int as staking_score
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'staking-daily'
            AND NOT flagged
            AND tx_timestamp >= ${STAKING_V2_CUTOFF_DATE}::timestamptz
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(base_points), 0)::int as staking_score
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'staking-daily'
            AND NOT flagged
            AND tx_timestamp >= ${STAKING_V2_CUTOFF_DATE}::timestamptz
            AND tx_timestamp >= (CURRENT_DATE - 6) AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(base_points), 0)::int as staking_score
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'staking-daily'
            AND NOT flagged
            AND tx_timestamp >= ${STAKING_V2_CUTOFF_DATE}::timestamptz
        `.then(r => r[0]),
        // Sum of base contributions from the past 6 days of snapshots
        pointsDb!`
          SELECT COALESCE(SUM(base_score * COALESCE(multiplier_v2, multiplier)), 0)::numeric as weekly_snapshot_cumulative
          FROM ecosystem_score_snapshots
          WHERE identity_id = ${identityId}
            AND snapshot_date >= CURRENT_DATE - INTERVAL '6 days'
            AND snapshot_date < CURRENT_DATE
        `.then(r => r[0]),
      ]);

      // NFT activations: try cache first, auto-sync on miss
      let activations = getActivationsForUser(identityId);
      if (activations.length === 0) {
        const synced = await updateActivationsForUser(identityId);
        if (synced && synced.length > 0) {
          activations = synced;
        }
      }
      const hasAlliance = activations.some(a => a.nftType === 'alliance' && a.status === 'ACTIVE');
      const hasGenesis = activations.some(a => a.nftType === 'genesis-pass' && a.status === 'ACTIVE');
      const hasActiveNft = hasAlliance || hasGenesis;

      const todayStr = new Date().toISOString().slice(0, 10);

      let allianceHealth = 100, gpHealth = 100;
      let allianceRestDays = 0, gpRestDays = 0;
      let isPenalized = false;
      let multiplier: number;

      if (isV2CutoverActive(todayStr)) {
        // V2: load health state from DB (no lookahead — invalidate-on-activity updates this)
        const healthRows = await pointsDb!`
          SELECT nft_type, health_pct, consecutive_rest_days
          FROM nft_health_state
          WHERE identity_id = ${identityId}
        `;
        for (const r of healthRows) {
          if (r.nft_type === 'alliance') {
            allianceHealth = parseFloat(r.health_pct as string);
            allianceRestDays = r.consecutive_rest_days as number;
          }
          if (r.nft_type === 'genesis-pass') {
            gpHealth = parseFloat(r.health_pct as string);
            gpRestDays = r.consecutive_rest_days as number;
          }
        }
        multiplier = calculateMultiplierV2({
          alliance:    hasAlliance ? allianceHealth : 0,
          genesisPass: hasGenesis  ? gpHealth       : 0,
        });
      } else {
        // V1: alliance penalty check
        if (hasAlliance && !hasGenesis) {
          const [penalty] = await pointsDb!`
            SELECT 1 FROM alliance_penalties ap
            JOIN alliance_first_seen afs ON ap.identity_id = afs.identity_id
            WHERE ap.identity_id = ${identityId}
              AND afs.first_seen <= CURRENT_DATE - make_interval(days => ${ALLIANCE_PENALTY_GRACE_DAYS})
          `;
          if (penalty) isPenalized = true;
        }
        const effectiveActivations = isPenalized
          ? activations.filter(a => a.nftType !== 'alliance')
          : activations;
        multiplier = calculateMultiplier(effectiveActivations);
      }

      const bonusTotal = parseFloat(bonusRow?.bonus_total ?? '0');
      const bonusToday = parseFloat(bonusTodayRow?.bonus_today ?? '0');
      const bonusWeekly = parseFloat(bonusWeeklyRow?.bonus_weekly ?? '0');
      const baseCumulative = parseFloat(snapshotSumRow?.base_cumulative ?? '0');

      const govTotal = parseFloat(govAllTimeRow?.gov_total ?? '0');
      const govToday = parseFloat(govTodayRow?.gov_today ?? '0');
      const govWeekly = parseFloat(govWeeklyRow?.gov_weekly ?? '0');

      const refTotal = parseFloat(refAllTimeRow?.referral_total ?? '0');
      const refToday = parseFloat(refTodayRow?.referral_today ?? '0');
      const refWeekly = parseFloat(refWeeklyRow?.referral_weekly ?? '0');
      const scalingFactor = REFERRAL_ECOSYSTEM_SCALING_FACTOR;

      // Staking-v2 score (pre-cutoff always zero, monotonic-increase-safe).
      const stakingToday = stakingTodayRow?.staking_score ?? 0;
      const stakingWeekly = stakingWeeklyRow?.staking_score ?? 0;
      const stakingAllTime = stakingAllTimeRow?.staking_score ?? 0;

      // allTime = SUM(base*mult from past snapshots)
      //         + yesterday's base*mult if snapshot not yet created (midnight gap)
      //         + today's base*mult
      //         + allTime staking*mult (v2: tier pts, post-cutoff only)
      //         + allTime bonus + allTime governance + allTime referral*sf
      // Staking uses current multiplier across all days (same approximation as weekly).
      // No compounding: bonus/gov/referral are from activity_points (raw totals)
      const todayBase = todayRow?.base_score ?? 0;
      const unsnapshottedBase = unsnapshottedRow?.base_score ?? 0;
      const todayBaseContribution = (todayBase + unsnapshottedBase) * multiplier;
      const totalBasePoints = baseCumulative + todayBaseContribution;
      const stakingAllTimeContribution = stakingAllTime * multiplier;

      // allTimeCumulative: SUM(past snapshots) + today delta.
      // baseCumulative already uses COALESCE(multiplier_v2, multiplier) so past rows
      // retain their original values even after a V2 multiplier drop.
      // stakingAllTimeContribution uses current multiplier (known approximation).
      const allTimeCumulative = Math.max(
        0,
        totalBasePoints + stakingAllTimeContribution
          + bonusTotal + govTotal + refTotal * scalingFactor,
      );

      // Score breakdown for composition bar (base included, no reverse calculation)
      const nonBaseCategories = bonusCategoryRows.map((r: any) => ({
        category: r.category as string,
        points: parseFloat(r.points ?? '0'),
      }));
      // Apply scaling factor to referral-bonus in the breakdown
      const scoreBreakdown = [
        { category: 'base', points: totalBasePoints },
        ...nonBaseCategories.map(c =>
          c.category === 'referral-bonus'
            ? { ...c, points: c.points * scalingFactor }
            : c,
        ),
      ].filter(c => c.points > 0);

      return {
        todayBaseScore: todayBase,
        weeklyBaseScore: weeklyRow?.base_score ?? 0,
        weeklyActiveDays: weeklyRow?.active_days ?? 0,
        weeklySnapshotCumulative: parseFloat(weeklySnapshotSumRow?.weekly_snapshot_cumulative ?? '0'),
        allTimeBaseScore: allTimeRow?.base_score ?? 0,
        allTimeActiveDays: allTimeRow?.active_days ?? 0,
        allTimeCumulative,
        bonusTotal,
        bonusToday,
        bonusWeekly,
        bonusCategories: nonBaseCategories,
        scoreBreakdown,
        govTotal,
        govToday,
        govWeekly,
        refTotal,
        refToday,
        refWeekly,
        scalingFactor,
        multiplier,
        activations,
        isPenalized,
        hasActiveNft,
        hasAlliance,
        hasGenesis,
        allianceHealth,
        gpHealth,
        allianceRestDays,
        gpRestDays,
        todayCategories: todayCategoryRows,
        stakingToday,
        stakingWeekly,
        stakingAllTime,
      };
    },
  );

  // Fetch user's active missions outside the 30s cache — changes when the user
  // toggles missions on any device and must always reflect the latest selection.
  // Falls back to the historic 6 defaults for users without a persisted record
  // OR with an empty stored array (defensive: a stale empty record from a
  // pre-validation client would otherwise force base = 0). Mirrors the
  // snapshot job's `(stored && stored.size > 0) ? stored : DEFAULT_MISSION_IDS`
  // logic so the live `/score` and the next-day snapshot agree.
  const DEFAULT_MISSION_IDS: readonly string[] = [
    'faucet', 'wallet-transfer', 'pado-dex',
    'gostop-lottery', 'gostop-scratchcard', 'gostop-numbermatch',
  ];
  const [scores, userMissionsRow] = await Promise.all([
    getData(),
    pointsDb!`
      SELECT missions FROM user_active_missions WHERE identity_id = ${identityId}
    `.then(r => r[0] ?? null).catch(() => null),
  ]);
  const storedMissions = userMissionsRow?.missions as string[] | undefined;
  const activeMissions: string[] =
    storedMissions && storedMissions.length > 0
      ? storedMissions
      : [...DEFAULT_MISSION_IDS];

  // Filtered today base: only categories the user has activated count.
  // pado-dex weight = 2 (mirrors matview), all others = 1.
  let todayFilteredBase = 0;
  for (const cat of scores.todayCategories) {
    if (activeMissions.includes(cat)) {
      todayFilteredBase += cat === 'pado-dex' ? 2 : 1;
    }
  }

  const disabled = !scores.hasActiveNft;
  const isWeakened = scores.hasActiveNft && scores.multiplier === 0;

  const bt = scores.bonusTotal;

  const sf = scores.scalingFactor;
  const todayStr2 = new Date().toISOString().slice(0, 10);
  const showHealth = isV2CutoverActive(todayStr2);

  const data = {
    identityId,
    multiplier: roundTo2(scores.multiplier),
    disabled,
    isWeakened,
    isPenalized: showHealth ? false : scores.isPenalized,
    ...(showHealth ? {
      health: {
        alliance: {
          pct: scores.allianceHealth,
          restDays: scores.allianceRestDays,
          hasNft: scores.hasAlliance,
        },
        genesisPass: {
          pct: scores.gpHealth,
          restDays: scores.gpRestDays,
          hasNft: scores.hasGenesis,
        },
      },
    } : {}),
    bonusTotal: roundTo2(bt),
    referralBonus: roundTo2(scores.refTotal),
    referralScalingFactor: sf,
    activations: scores.activations.map((a) => ({
      nftType: a.nftType,
      nftCount: a.nftCount,
      bonus: roundTo2(getActivationBonus(a)),
    })),
    todayCategories: scores.todayCategories,
    daily: {
      baseScore: todayFilteredBase,
      _rawBaseScore: scores.todayBaseScore,
      hasFilteredActivity: todayFilteredBase !== scores.todayBaseScore,
      stakingScore: scores.stakingToday,
      bonusTotal: roundTo2(scores.bonusToday),
      referralBonus: roundTo2(scores.refToday),
      governancePoints: roundTo2(scores.govToday),
      ecosystemScore: roundTo2(
        (todayFilteredBase + scores.stakingToday) * scores.multiplier
          + scores.bonusToday + scores.govToday + scores.refToday * sf,
      ),
    },
    weekly: {
      baseScore: scores.weeklyBaseScore,
      stakingScore: scores.stakingWeekly,
      bonusTotal: roundTo2(scores.bonusWeekly),
      referralBonus: roundTo2(scores.refWeekly),
      governancePoints: roundTo2(scores.govWeekly),
      // Fix: (Historical snapshots for past 6 days) + (Today contribution with current multiplier)
      // prevents UI drift when a multiplier (e.g. Genesis Pass) is upgraded mid-week.
      ecosystemScore: roundTo2(
        scores.weeklySnapshotCumulative
          + (todayFilteredBase + scores.stakingToday) * scores.multiplier
          + scores.bonusWeekly + scores.govWeekly + scores.refWeekly * sf,
      ),
      activeDays: scores.weeklyActiveDays,
    },
    allTime: {
      baseScore: scores.allTimeBaseScore,
      stakingScore: scores.stakingAllTime,
      bonusTotal: roundTo2(bt),
      referralBonus: roundTo2(scores.refTotal),
      governancePoints: roundTo2(scores.govTotal),
      ecosystemScore: roundTo2(scores.allTimeCumulative),
      activeDays: scores.allTimeActiveDays,
      bonusCategories: scores.bonusCategories.filter((c: any) => c.points > 0),
      scoreBreakdown: scores.scoreBreakdown.map((c: any) => ({
        category: c.category,
        points: roundTo2(c.points),
      })),
    },
  };

  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ data });
});

// GET /api/v1/ecosystem/active-missions/:identityId
// Returns the user's persisted active mission list and the server-side
// updated_at timestamp. The frontend uses this for multi-device sync: on
// mount it compares the server timestamp against the localStorage sync
// timestamp and adopts whichever side is newer.
app.get('/active-missions/:identityId', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);
  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }
  const row = await pointsDb`
    SELECT missions, updated_at FROM user_active_missions
    WHERE identity_id = ${identityId}
  `.then(r => r[0] ?? null);
  return c.json({
    data: {
      missions: (row?.missions as string[] | null) ?? null,
      updatedAt: row ? (row.updated_at as Date).toISOString() : null,
    },
  });
});

// PUT /api/v1/ecosystem/active-missions/:identityId
// Upserts the user's active mission selection. Accepts a flat string array of
// category ids (max 10). No auth token required — same public-identityId
// pattern as the rest of the ecosystem endpoints. The worst-case abuse is a
// display preference change, not a points manipulation.
app.put('/active-missions/:identityId', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);
  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.missions)) {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const missions = body.missions as unknown[];
  if (missions.length === 0) return c.json({ error: 'missions_empty' }, 400);
  if (missions.length > 10) return c.json({ error: 'too_many_missions' }, 400);
  if (!missions.every((m) => typeof m === 'string' && m.length > 0 && m.length <= 100)) {
    return c.json({ error: 'invalid_mission_id' }, 400);
  }
  await pointsDb`
    INSERT INTO user_active_missions (identity_id, missions, updated_at)
    VALUES (${identityId}, ${JSON.stringify(missions)}, NOW())
    ON CONFLICT (identity_id) DO UPDATE
      SET missions = EXCLUDED.missions,
          updated_at = EXCLUDED.updated_at
  `;
  return c.json({ data: { ok: true } });
});

// --- Weekly leaderboard helpers ---
// ISO 8601 Thursday-anchor week ID (e.g. "2026-W17").
// Mirrors the algorithm used in chat-server/leaderboard-store.ts.
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function getCurrentWeekId(): string {
  const { year, week } = getISOWeek(new Date());
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getPrevWeekId(weekId: string): string | null {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const bounds = getWeekBounds(weekId);
  if (!bounds) return null;
  const prevMonday = new Date(bounds.start.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { year: py, week: pw } = getISOWeek(prevMonday);
  return `${py}-W${String(pw).padStart(2, '0')}`;
}

// Monday 00:00 UTC is the canonical week reset boundary. Settlement crons run at 00:15/00:20 UTC.
// Returns { start, end } as Date objects for use as SQL parameters.
function getWeekBounds(weekId: string): { start: Date; end: Date } | null {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  if (week < 1 || week > 53) return null;

  // Find the Monday of ISO week: Jan 4 is always in week 1.
  // Approach: compute Jan 4 of the ISO year, go to its Monday, then add (week-1)*7 days.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86_400_000);
  const weekMonday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86_400_000);

  // Week starts at Monday 00:00 UTC. Settlement crons run at 00:15/00:20 UTC.
  const start = new Date(weekMonday.getTime());
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// Earliest allowed week (floor for /leaderboard/weeks list).
// Prevents stale test/staging data from inflating the week list.
const ECOSYSTEM_LEADERBOARD_FLOOR_DATE = new Date('2025-01-01T00:00:00Z');

// GET /api/v1/ecosystem/leaderboard/weeks
// Returns available week IDs in descending order (current week first).
app.get('/leaderboard/weeks', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const getWeeks = cached('eco-leaderboard-weeks', 60 * 60 * 1000, async () => {
    const [minRow] = await pointsDb!`
      SELECT MIN(tx_timestamp) as min_ts FROM activity_points
      WHERE identity_id IS NOT NULL AND NOT flagged
    `;
    const rawMin = minRow?.min_ts as Date | null;
    const flooredMin = rawMin && rawMin > ECOSYSTEM_LEADERBOARD_FLOOR_DATE
      ? rawMin
      : ECOSYSTEM_LEADERBOARD_FLOOR_DATE;

    const currentWeekId = getCurrentWeekId();
    const weeks: Array<{ weekId: string; label: string }> = [];
    let cursor = new Date();
    const seen = new Set<string>();

    while (true) {
      const { year, week } = getISOWeek(cursor);
      const wId = `${year}-W${String(week).padStart(2, '0')}`;
      if (seen.has(wId)) break;
      seen.add(wId);

      const bounds = getWeekBounds(wId);
      if (!bounds || bounds.start < flooredMin) break;

      const mon = new Date(bounds.start.getTime());
      const sun = new Date(mon.getTime() + 6 * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) =>
        d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      const label = wId === currentWeekId
        ? `${wId} (current)`
        : `${wId} (${fmt(mon)} - ${fmt(sun)})`;

      weeks.push({ weekId: wId, label });

      // Move to previous week
      cursor = new Date(cursor.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return weeks;
  });

  const weeks = await getWeeks();
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json({ weeks });
});

// TODO(security): Leaderboard exposes raw Cognito identityIds (region:uuid) in unauthenticated
// responses. Any caller can enumerate all active users' identityIds by paging through the
// leaderboard and then mass-scrape per-user detail data via /score/:identityId.
// Fix: replace identityId in leaderboard response with SHA256(identityId).slice(0,16).
// Clients finding "my rank" should hash their own identityId client-side for comparison.
// Blocked by: EcosystemPointsCard and other components that currently use identityId directly.
// Tracked: https://github.com/narunice/nasun-monorepo/issues/1

// GET /api/v1/ecosystem/leaderboard?weekId=2026-W17&limit=50&offset=0
//
// Weekly ecosystem leaderboard — no NFT multiplier applied to ranking.
// Score = activity_score (distinct non-pado categories per epoch-day slot)
//       + FLOOR(creator_post_score / 5)
//       + FLOOR(bugreport+feedback / 2) + FLOOR(game / 3)
//       + active_days * 2
// All users with any qualifying activity appear; NFT ownership is not required.
app.get('/leaderboard', async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const rawWeekId = c.req.query('weekId');
  const weekId = rawWeekId && /^\d{4}-W\d{2}$/.test(rawWeekId)
    ? rawWeekId
    : getCurrentWeekId();

  const limit = parseLimit(c.req.query('limit'));
  const offset = parseOffset(c.req.query('offset'));

  const bounds = getWeekBounds(weekId);
  if (!bounds) {
    return c.json({ error: 'invalid_week_id' }, 400);
  }

  const getScoredLeaderboard = cached(
    `eco-leaderboard-${weekId}`,
    5 * 60 * 1000,
    async () => {
      // Excluded from activity diversity score:
      //   - system-generated: referral-bonus, daily-mission, ecosystem-passive, staking-daily, staking, staking-reward
      //   - ecosystem-bonus-* (creator-posts counted separately; bugreport/feedback/game in bonus CTE)
      //   - pado-* (covered by the dedicated Pado Score Leaderboard)
      const rows = await pointsDb!`
        WITH week_activities AS (
          SELECT DISTINCT identity_id,
            -- Epoch-based day slot: avoids 10-min offset artifact (date_trunc can yield 8 days/week)
            FLOOR(
              (EXTRACT(EPOCH FROM tx_timestamp) - EXTRACT(EPOCH FROM ${bounds.start}::timestamptz))
              / 86400
            )::int AS day_slot,
            category
          FROM activity_points
          WHERE NOT flagged
            AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start}
            AND tx_timestamp < ${bounds.end}
            -- Ecosystem activity_score scope — tighter than base_score: also
            -- excludes pado-* (covered by separate Pado score). See
            -- db/ecosystem-schema.sql for the canonical DAU vs score distinction.
            AND category NOT IN (
              'referral-bonus', 'daily-mission', 'ecosystem-passive',
              'staking-daily', 'staking', 'staking-reward'
            )
            AND category NOT LIKE 'ecosystem-bonus-%'
            AND category NOT LIKE 'pado-%'
        ),
        activity_score AS (
          SELECT identity_id,
                 COUNT(*)::int AS activity_score,
                 COUNT(DISTINCT day_slot)::int AS active_days
          FROM week_activities
          GROUP BY identity_id
        ),
        creator_post_score AS (
          SELECT identity_id,
                 COALESCE(SUM(final_points), 0) / 5.0 AS post_score
          FROM activity_points
          WHERE category = 'ecosystem-bonus-creator-posts'
            AND NOT flagged
            AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start}
            AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        ),
        bonus_score AS (
          SELECT identity_id,
            COALESCE(SUM(final_points) FILTER (
              WHERE category IN ('ecosystem-bonus-bugreport', 'ecosystem-bonus-feedback')
            ), 0) / 2.0
            + COALESCE(SUM(final_points) FILTER (
              WHERE category = 'ecosystem-bonus-game'
            ), 0) / 3.0 AS bonus_score
          FROM activity_points
          WHERE category IN (
            'ecosystem-bonus-bugreport',
            'ecosystem-bonus-feedback',
            'ecosystem-bonus-game'
          )
            AND NOT flagged
            AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start}
            AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        ),
        volume_score AS (
          -- Game plays (gostop-{lottery,numbermatch,mines,crash,scratchcard}) + wallet transfers.
          -- wallet-transfer intentionally double-counted with activity_score to reward volume.
          -- pado-dex excluded (covered by Pado Score Leaderboard).
          SELECT identity_id, COUNT(*)::int AS volume_count
          FROM activity_points
          WHERE category IN ('gostop-lottery', 'gostop-numbermatch', 'gostop-mines', 'gostop-crash', 'gostop-scratchcard', 'wallet-transfer')
            AND NOT flagged
            AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start}
            AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        ),
        staking_emission AS (
          SELECT identity_id,
                 COALESCE(SUM(final_points), 0)::float8 AS emission_score
          FROM activity_points
          WHERE category = 'staking-reward'
            AND NOT flagged
            AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start}
            AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        )
        SELECT
          COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id, se.identity_id) AS identity_id,
          COALESCE(a.activity_score, 0)::int AS activity_score,
          COALESCE(c.post_score, 0) AS creator_post_score,
          COALESCE(b.bonus_score, 0) AS bonus_score,
          COALESCE(a.active_days, 0)::int AS active_days,
          COALESCE(v.volume_count, 0)::int AS volume_count,
          COALESCE(se.emission_score, 0)::float8 AS emission_score,
          (
            COALESCE(a.activity_score, 0)
            + COALESCE(c.post_score, 0)
            + COALESCE(b.bonus_score, 0)
            + 1.6 * LOG(2, COALESCE(v.volume_count, 0) + 1)
            + COALESCE(se.emission_score, 0)
          )::float8 AS weekly_score
        FROM activity_score a
        FULL OUTER JOIN creator_post_score c ON a.identity_id = c.identity_id
        FULL OUTER JOIN bonus_score b
          ON COALESCE(a.identity_id, c.identity_id) = b.identity_id
        FULL OUTER JOIN volume_score v
          ON COALESCE(a.identity_id, c.identity_id, b.identity_id) = v.identity_id
        FULL OUTER JOIN staking_emission se
          ON COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id) = se.identity_id
        -- Pre-sort by SQL-computable columns. JS applies isTelegramMember/hasGenesisPass tiebreakers after.
        ORDER BY weekly_score DESC, activity_score DESC, identity_id ASC
        LIMIT ${LEADERBOARD_TOP_N}
      `;

      const validRows = (rows as any[]).filter((r) => r.identity_id != null);
      const identityIds = validRows.map((r) => r.identity_id as string);

      // hasGenesisPass: synchronous in-memory activations cache lookup
      const genesisPassSet = new Set(
        identityIds.filter((id: string) =>
          getActivationsForUser(id).some((a: any) => a.nftType === 'genesis-pass')
        )
      );

      // displayName / xHandle / profileImageUrl: DynamoDB BatchGet
      const profiles = await fetchProfilesBatch(identityIds);

      const entries = validRows.map((r: any) => ({
        identityId: r.identity_id as string,
        activityScore: r.activity_score as number,
        creatorPostScore: r.creator_post_score as number,
        bonusScore: r.bonus_score as number,
        activeDays: r.active_days as number,
        volumeCount: r.volume_count as number,
        weeklyScore: Number(r.weekly_score),
        stakingEmissionScore: Number(r.emission_score ?? 0),
        hasGenesisPass: genesisPassSet.has(r.identity_id as string),
        isTelegramMember: profiles.get(r.identity_id as string)?.isTelegramMember ?? false,
        hasGoogle: profiles.get(r.identity_id as string)?.hasGoogle ?? false,
        displayName: profiles.get(r.identity_id as string)?.displayName ?? null,
        xHandle: profiles.get(r.identity_id as string)?.xHandle ?? null,
        profileImageUrl: profiles.get(r.identity_id as string)?.profileImageUrl ?? null,
      }));

      // Tiebreaker order: score → activity diversity → Telegram membership → Genesis Pass → stable id.
      // isTelegramMember and hasGenesisPass are sourced outside SQL so must be applied here.
      entries.sort((a, b) => {
        if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore;
        if (b.activityScore !== a.activityScore) return b.activityScore - a.activityScore;
        if (a.isTelegramMember !== b.isTelegramMember) return a.isTelegramMember ? -1 : 1;
        if (a.hasGenesisPass !== b.hasGenesisPass) return a.hasGenesisPass ? -1 : 1;
        return a.identityId.localeCompare(b.identityId); // stable random tiebreaker
      });

      return entries;
    },
  );

  const getTotalCount = cached(
    `eco-leaderboard-count-${weekId}`,
    5 * 60 * 1000,
    async () => {
      const result = await pointsDb!`
        WITH week_activities AS (
          SELECT DISTINCT identity_id, category
          FROM activity_points
          WHERE NOT flagged
            AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start}
            AND tx_timestamp < ${bounds.end}
            -- Ecosystem activity_score scope — tighter than base_score: also
            -- excludes pado-* (covered by separate Pado score). See
            -- db/ecosystem-schema.sql for the canonical DAU vs score distinction.
            AND category NOT IN (
              'referral-bonus', 'daily-mission', 'ecosystem-passive',
              'staking-daily', 'staking', 'staking-reward'
            )
            AND category NOT LIKE 'ecosystem-bonus-%'
            AND category NOT LIKE 'pado-%'
        ),
        activity_score AS (
          SELECT identity_id FROM week_activities GROUP BY identity_id
        ),
        creator_post_score AS (
          SELECT identity_id FROM activity_points
          WHERE category = 'ecosystem-bonus-creator-posts'
            AND NOT flagged AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start} AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        ),
        bonus_score AS (
          SELECT identity_id FROM activity_points
          WHERE category IN ('ecosystem-bonus-bugreport', 'ecosystem-bonus-feedback', 'ecosystem-bonus-game')
            AND NOT flagged AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start} AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        ),
        volume_score AS (
          SELECT identity_id FROM activity_points
          WHERE category IN ('gostop-lottery', 'gostop-numbermatch', 'gostop-mines', 'gostop-crash', 'gostop-scratchcard', 'wallet-transfer')
            AND NOT flagged AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start} AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        ),
        staking_emission AS (
          SELECT identity_id FROM activity_points
          WHERE category = 'staking-reward'
            AND NOT flagged AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start} AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        )
        SELECT COUNT(*) AS total FROM (
          SELECT COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id, se.identity_id) AS identity_id
          FROM activity_score a
          FULL OUTER JOIN creator_post_score c ON a.identity_id = c.identity_id
          FULL OUTER JOIN bonus_score b
            ON COALESCE(a.identity_id, c.identity_id) = b.identity_id
          FULL OUTER JOIN volume_score v
            ON COALESCE(a.identity_id, c.identity_id, b.identity_id) = v.identity_id
          FULL OUTER JOIN staking_emission se
            ON COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id) = se.identity_id
          WHERE COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id, se.identity_id) IS NOT NULL
        ) sub
      `;
      return Number((result[0] as any).total ?? 0);
    },
  );

  // Build prev-week rank map for rankChange. Previous week is over so its cache is stable.
  const prevWeekId = getPrevWeekId(weekId);
  const prevWeekBounds = prevWeekId ? getWeekBounds(prevWeekId) : null;
  let prevRankMap = new Map<string, number>();
  if (prevWeekId && prevWeekBounds) {
    const getPrevLeaderboard = cached(
      `eco-leaderboard-prev-ids-${prevWeekId}`,
      5 * 60 * 1000,
      async () => {
        // Minimal re-use: same query as getScoredLeaderboard but for previous week.
        // We only need identityId order, so we skip profile enrichment.
        const rows = await pointsDb!`
          WITH week_activities AS (
            SELECT DISTINCT identity_id,
              FLOOR((EXTRACT(EPOCH FROM tx_timestamp) - EXTRACT(EPOCH FROM ${prevWeekBounds.start}::timestamptz)) / 86400)::int AS day_slot,
              category
            FROM activity_points
            WHERE NOT flagged AND identity_id IS NOT NULL
              AND tx_timestamp >= ${prevWeekBounds.start} AND tx_timestamp < ${prevWeekBounds.end}
              -- Ecosystem activity_score scope (see db/ecosystem-schema.sql).
              AND category NOT IN ('referral-bonus','daily-mission','ecosystem-passive','staking-daily','staking','staking-reward')
              AND category NOT LIKE 'ecosystem-bonus-%' AND category NOT LIKE 'pado-%'
          ),
          activity_score AS (
            SELECT identity_id, COUNT(*)::int AS activity_score, COUNT(DISTINCT day_slot)::int AS active_days
            FROM week_activities GROUP BY identity_id
          ),
          creator_post_score AS (
            SELECT identity_id, COALESCE(SUM(final_points), 0) / 5.0 AS post_score
            FROM activity_points
            WHERE category = 'ecosystem-bonus-creator-posts' AND NOT flagged AND identity_id IS NOT NULL
              AND tx_timestamp >= ${prevWeekBounds.start} AND tx_timestamp < ${prevWeekBounds.end}
            GROUP BY identity_id
          ),
          bonus_score AS (
            SELECT identity_id,
              COALESCE(SUM(final_points) FILTER (WHERE category IN ('ecosystem-bonus-bugreport','ecosystem-bonus-feedback')), 0) / 2.0
              + COALESCE(SUM(final_points) FILTER (WHERE category = 'ecosystem-bonus-game'), 0) / 3.0 AS bonus_score
            FROM activity_points
            WHERE category IN ('ecosystem-bonus-bugreport','ecosystem-bonus-feedback','ecosystem-bonus-game')
              AND NOT flagged AND identity_id IS NOT NULL
              AND tx_timestamp >= ${prevWeekBounds.start} AND tx_timestamp < ${prevWeekBounds.end}
            GROUP BY identity_id
          ),
          volume_score AS (
            SELECT identity_id, COUNT(*)::int AS volume_count
            FROM activity_points
            WHERE category IN ('gostop-lottery', 'gostop-numbermatch', 'gostop-mines', 'gostop-crash', 'gostop-scratchcard', 'wallet-transfer')
              AND NOT flagged AND identity_id IS NOT NULL
              AND tx_timestamp >= ${prevWeekBounds.start} AND tx_timestamp < ${prevWeekBounds.end}
            GROUP BY identity_id
          ),
          staking_emission AS (
            SELECT identity_id,
                   COALESCE(SUM(final_points), 0)::float8 AS emission_score
            FROM activity_points
            WHERE category = 'staking-reward'
              AND NOT flagged AND identity_id IS NOT NULL
              AND tx_timestamp >= ${prevWeekBounds.start} AND tx_timestamp < ${prevWeekBounds.end}
            GROUP BY identity_id
          )
          SELECT COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id, se.identity_id) AS identity_id,
            COALESCE(a.activity_score, 0)::int AS activity_score,
            (COALESCE(a.activity_score, 0) + COALESCE(c.post_score, 0) + COALESCE(b.bonus_score, 0) + 1.6 * LOG(2, COALESCE(v.volume_count, 0) + 1) + COALESCE(se.emission_score, 0))::float8 AS weekly_score
          FROM activity_score a
          FULL OUTER JOIN creator_post_score c ON a.identity_id = c.identity_id
          FULL OUTER JOIN bonus_score b ON COALESCE(a.identity_id, c.identity_id) = b.identity_id
          FULL OUTER JOIN volume_score v ON COALESCE(a.identity_id, c.identity_id, b.identity_id) = v.identity_id
          FULL OUTER JOIN staking_emission se ON COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id) = se.identity_id
          ORDER BY weekly_score DESC, activity_score DESC, identity_id ASC
          LIMIT ${LEADERBOARD_TOP_N}
        `;
        return (rows as any[]).filter((r) => r.identity_id != null).map((r) => r.identity_id as string);
      },
    );
    try {
      const prevIds = await getPrevLeaderboard();
      prevIds.forEach((id, i) => prevRankMap.set(id, i + 1));
    } catch {
      // Non-fatal: fall back to showing no rank change
    }
  }

  const getPrevTotal = prevWeekBounds
    ? cached(
        `eco-leaderboard-count-${prevWeekId}`,
        60 * 60 * 1000,
        async () => {
          const pb = prevWeekBounds!;
          const result = await pointsDb!`
            WITH week_activities AS (
              SELECT DISTINCT identity_id, category
              FROM activity_points
              WHERE NOT flagged
                AND identity_id IS NOT NULL
                AND tx_timestamp >= ${pb.start}
                AND tx_timestamp < ${pb.end}
                AND category NOT IN (
                  'referral-bonus', 'daily-mission', 'ecosystem-passive',
                  'staking-daily', 'staking', 'staking-reward'
                )
                AND category NOT LIKE 'ecosystem-bonus-%'
                AND category NOT LIKE 'pado-%'
            ),
            activity_score AS (
              SELECT identity_id FROM week_activities GROUP BY identity_id
            ),
            creator_post_score AS (
              SELECT identity_id FROM activity_points
              WHERE category = 'ecosystem-bonus-creator-posts'
                AND NOT flagged AND identity_id IS NOT NULL
                AND tx_timestamp >= ${pb.start} AND tx_timestamp < ${pb.end}
              GROUP BY identity_id
            ),
            bonus_score AS (
              SELECT identity_id FROM activity_points
              WHERE category IN ('ecosystem-bonus-bugreport', 'ecosystem-bonus-feedback', 'ecosystem-bonus-game')
                AND NOT flagged AND identity_id IS NOT NULL
                AND tx_timestamp >= ${pb.start} AND tx_timestamp < ${pb.end}
              GROUP BY identity_id
            ),
            volume_score AS (
              SELECT identity_id FROM activity_points
              WHERE category IN ('gostop-lottery', 'gostop-numbermatch', 'gostop-mines', 'gostop-crash', 'gostop-scratchcard', 'wallet-transfer')
                AND NOT flagged AND identity_id IS NOT NULL
                AND tx_timestamp >= ${pb.start} AND tx_timestamp < ${pb.end}
              GROUP BY identity_id
            ),
            staking_emission AS (
              SELECT identity_id FROM activity_points
              WHERE category = 'staking-reward'
                AND NOT flagged AND identity_id IS NOT NULL
                AND tx_timestamp >= ${pb.start} AND tx_timestamp < ${pb.end}
              GROUP BY identity_id
            )
            SELECT COUNT(*) AS total FROM (
              SELECT COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id, se.identity_id) AS identity_id
              FROM activity_score a
              FULL OUTER JOIN creator_post_score c ON a.identity_id = c.identity_id
              FULL OUTER JOIN bonus_score b
                ON COALESCE(a.identity_id, c.identity_id) = b.identity_id
              FULL OUTER JOIN volume_score v
                ON COALESCE(a.identity_id, c.identity_id, b.identity_id) = v.identity_id
              FULL OUTER JOIN staking_emission se
                ON COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id) = se.identity_id
              WHERE COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id, se.identity_id) IS NOT NULL
            ) sub
          `;
          return Number((result[0] as any).total ?? 0);
        },
      )
    : null;

  const [all, total, prevTotal] = await Promise.all([
    getScoredLeaderboard(),
    getTotalCount(),
    getPrevTotal ? getPrevTotal() : Promise.resolve(0),
  ]);

  const page = all.slice(offset, offset + limit);
  const ranked = page.map((entry, i) => {
    const currentRank = offset + i + 1;
    const prevRank = prevRankMap.get(entry.identityId) ?? 0;
    const rankChange = prevRank === 0 ? 0 : prevRank - currentRank;
    return { ...entry, rank: currentRank, rankChange };
  });

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    data: ranked,
    meta: {
      weekId,
      weekStart: bounds.start.getTime(),
      limit,
      offset,
      total,
      prevTotal,
      cappedAt: LEADERBOARD_TOP_N,
      updatedAt: Date.now(),
    },
  });
});

// POST /api/v1/ecosystem/sync/:identityId
// Triggers per-user NFT activation cache refresh.
// Called by frontend after activate/deactivate or manual Refresh button.
app.post('/sync/:identityId', async (c) => {
  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }

  const updated = await updateActivationsForUser(identityId);
  if (updated === null) {
    return c.json({ error: 'rate_limited', message: 'Try again in 20 seconds' }, 429);
  }

  const multiplier = calculateMultiplier(updated);
  return c.json({
    data: {
      identityId,
      activations: updated,
      multiplier: roundTo2(multiplier),
      synced: true,
    },
  });
});

// GET /api/v1/ecosystem/score/wallet/:address
// Wallet-based score lookup (for Pado frontend, no Cognito identity).
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{1,64}$/;

app.get('/score/wallet/:address', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const address = c.req.param('address');
  if (!address || !SUI_ADDRESS_RE.test(address)) {
    return c.json({ error: 'invalid_address' }, 400);
  }

  const identityId = getIdentityByWallet(address);
  if (!identityId) {
    return c.json({ data: null, message: 'wallet_not_registered' });
  }

  // Redirect to the identityId-based score endpoint.
  // Explicit CORS header on 302 response (nginx/CloudFront may strip middleware headers on redirects)
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(`/wallet/${address}`, `/${encodeURIComponent(identityId)}`);
  const origin = c.req.header('origin');
  if (origin && CORS_ALLOWED_ORIGINS.has(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
  }
  return c.redirect(url.pathname, 302);
});

// GET /api/v1/ecosystem/snapshot/history/:identityId?days=30
app.get('/snapshot/history/:identityId', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }

  const days = Math.min(Math.max(1, parseInt(c.req.query('days') ?? '30', 10)), 90);

  // staking_delta_scaled (= stakingDelta * multiplier) is derived from the
  // cumulative all_time_staking_scaled column via LAG. No schema change needed.
  // The CTE runs LAG over the user's full history before LIMIT so the oldest
  // row in the returned window still gets the correct previous-day baseline.
  // Pre-v2 rows (NULL all_time_staking_scaled) yield 0, which is correct.
  const rows = await pointsDb`
    WITH with_lag AS (
      SELECT snapshot_date, base_score, multiplier, bonus_total,
             COALESCE(referral_bonus, 0) AS referral_bonus,
             ecosystem_score, is_penalized, rank,
             GREATEST(
               COALESCE(all_time_staking_scaled, 0)
               - LAG(COALESCE(all_time_staking_scaled, 0))
                 OVER (ORDER BY snapshot_date),
               0
             ) AS staking_delta_scaled
      FROM ecosystem_score_snapshots
      WHERE identity_id = ${identityId}
    )
    SELECT snapshot_date, base_score, multiplier::numeric, bonus_total::numeric,
           referral_bonus::numeric, ecosystem_score::numeric,
           is_penalized, rank, staking_delta_scaled::numeric
    FROM with_lag
    ORDER BY snapshot_date DESC
    LIMIT ${days}
  `;

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    data: rows.map(r => ({
      date: r.snapshot_date,
      baseScore: Number(r.base_score),
      multiplier: parseFloat(r.multiplier as string),
      bonusTotal: parseFloat(r.bonus_total as string),
      referralBonus: parseFloat(r.referral_bonus as string),
      stakingDeltaScaled: parseFloat((r.staking_delta_scaled as string) ?? '0'),
      ecosystemScore: parseFloat(r.ecosystem_score as string),
      isPenalized: r.is_penalized,
      rank: r.rank,
    })),
  });
});

// GET /api/v1/ecosystem/bonus-history/:identityId?days=30
// Returns per-day breakdown of bonus categories (earlybird, pado, game, airdrop, referral)
app.get('/bonus-history/:identityId', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }

  const days = Math.min(Math.max(1, parseInt(c.req.query('days') ?? '30', 10)), 90);

  const rows = await pointsDb`
    SELECT
      date_trunc('day', tx_timestamp)::date AS day,
      category,
      activity_type,
      SUM(final_points)::numeric AS points,
      COUNT(*)::int AS count
    FROM activity_points
    WHERE identity_id = ${identityId}
      AND NOT flagged
      AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
      AND (category LIKE 'ecosystem-bonus-%' OR category = 'referral-bonus')
      AND tx_timestamp >= CURRENT_DATE - make_interval(days => ${days})
    GROUP BY day, category, activity_type
    ORDER BY day DESC, points DESC
  `;

  // Group by day
  const byDay = new Map<string, Array<{ category: string; activityType: string; points: number; count: number }>>();
  for (const r of rows) {
    const day = (r.day as Date).toISOString().split('T')[0];
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push({
      category: r.category as string,
      activityType: r.activity_type as string,
      points: parseFloat(r.points as string),
      count: r.count as number,
    });
  }

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    data: [...byDay.entries()].map(([day, items]) => ({
      date: day,
      total: items.reduce((s, i) => s + i.points, 0),
      items,
    })),
  });
});

// GET /api/v1/ecosystem/health
app.get('/health', async (c) => {
  const status = getMatviewStatus();
  c.header('Cache-Control', 'no-cache');
  return c.json({ data: status });
});

export default app;
