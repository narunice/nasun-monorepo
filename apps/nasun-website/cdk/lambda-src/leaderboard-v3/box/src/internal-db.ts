// Data layer for the box leaderboard INTERNAL handlers (AWS-exit Stage 4, leaderboard Step 5). Ports the
// 4 internal-* DynamoDB handlers to box PG nasun_dal:
//   - voting-rank      READ-only twitterHandle -> rank (governance voting-power compute calls it)
//   - clear-telegram   clear the Telegram badge on Account (+ active SeasonAccount)
//   - telegram-verified auto-transfer prior owner's badge + set the new owner's badge
//   - sync-profile     push displayName/profileImageUrl onto Account (+ active SeasonAccount)
//
// Byte-faithful to apps/.../leaderboard-v3/src/handlers/internal-*.ts. Reads reuse db.ts (compute_ro pool:
// getAccountByUsername/getActiveSeason/getProfileRowByHandle); the badge/profile writes use the writer pool
// (lb_writer, provisioned at Step 1). Telegram badge fields (isTelegramMember/telegramUserId/
// telegramUsername) live in lb_accounts.attributes jsonb (NOT a promoted column); on lb_season_accounts
// is_telegram_member IS a promoted column, so season writes set both the column and attributes.
// lb_season_accounts has no display_name/profileImageUrl/updated_at columns -> those season fields live in
// attributes only.
//
// The onboarding bonus (telegram-link referral grant) from the lambda's internal-telegram-verified is
// DROPPED here: its gate was a direct GetCommand on the nasun-referrals DDB table, which was DeleteTable'd
// in the referral Phase 3c teardown, so the AWS path has been a guaranteed no-op (always not-referred)
// since then. Campaign is paused (telegram verifies ~0/day); dropping it is a no-op vs current behaviour.

import type { Account } from '../../src/types';
import { sql, getActiveSeason, getAccountByUsername, getProfileRowByHandle } from './db';
import { getWriteSql } from './write-pool';

// Account fields the badge/profile writes need; the reconstructor (rowToAccount) overlays attributes, so
// isTelegramMember/profileImageUrl are present at runtime even though the Account type may not declare them.
type AccountView = { accountId: string; isTelegramMember?: boolean; displayName?: string; profileImageUrl?: string };
function toView(acc: Account): AccountView {
  const a = acc as Account & { isTelegramMember?: boolean; profileImageUrl?: string };
  return { accountId: a.accountId, isTelegramMember: a.isTelegramMember, displayName: a.displayName, profileImageUrl: a.profileImageUrl };
}

async function getActiveSeasonId(): Promise<string | null> {
  return (await getActiveSeason())?.seasonId ?? null;
}

// ---- voting-rank (READ ONLY) ---------------------------------------------------------------------
// Byte-parity with governance-api getUserRank: active season first, then the most-recently-ended season.
// SEASON1 is currently `paused` (not active, not ended), so BOTH the AWS lambda and this return null until
// a season is activated/ended -- the shadow parity test confirms (both null). Faithful port, not a fix.

async function getMostRecentEndedSeasonId(): Promise<string | null> {
  const rows = await sql<{ season_id: string }[]>`
    SELECT season_id FROM lb_seasons WHERE sk = 'METADATA' AND status = 'ended'
    ORDER BY attributes->>'endDate' DESC LIMIT 1`;
  return rows.length ? rows[0].season_id : null;
}

// Most recent snapshot's rank for an account within a season (parity with getUserRankFromSnapshot:
// ScanIndexForward=false on snapshotDate -> latest date, take its `rank`). Uses idx_lbsnap_account.
async function getRankFromSnapshot(accountId: string, seasonId: string): Promise<number | null> {
  const rows = await sql<{ rank: number | null }[]>`
    SELECT (attributes->>'rank')::int AS rank FROM lb_snapshots
    WHERE attributes->>'accountId' = ${accountId}
      AND split_part(snapshot_key, '#', 1) = ${seasonId}
    ORDER BY split_part(snapshot_key, '#', 2) DESC LIMIT 1`;
  return rows.length && rows[0].rank != null ? rows[0].rank : null;
}

export async function getVotingRank(twitterHandle?: string): Promise<number | null> {
  if (!twitterHandle) return null;
  // Account lookup for voting-rank: lowercase, NO @-strip (governance getUserRank parity -- the box passes
  // the RAW handle; getAccountByUsername lowercases without stripping @).
  const acc = await getAccountByUsername('twitter', twitterHandle);
  if (!acc) return null;
  const activeSeasonId = await getActiveSeasonId();
  if (activeSeasonId) {
    const r = await getRankFromSnapshot(acc.accountId, activeSeasonId);
    if (r !== null) return r;
  }
  const endedSeasonId = await getMostRecentEndedSeasonId();
  if (endedSeasonId) {
    const r = await getRankFromSnapshot(acc.accountId, endedSeasonId);
    if (r !== null) return r;
  }
  return null;
}

// ---- account lookup for badge/profile writes (@-strip + lowercase) -------------------------------
// clear/verified/sync strip the leading @ (unlike voting-rank); getAccountByUsername lowercases internally.
async function findAccountStripped(twitterHandle: string): Promise<AccountView | null> {
  const acc = await getAccountByUsername('twitter', twitterHandle.replace(/^@/, ''));
  return acc ? toView(acc) : null;
}

// ---- clear-telegram ------------------------------------------------------------------------------

export async function clearTelegramBadge(twitterHandle: string): Promise<{ updated: boolean; reason?: string }> {
  const account = await findAccountStripped(twitterHandle);
  if (!account) return { updated: false, reason: 'no_account' };
  await clearAccountTelegram(account.accountId);
  return { updated: true };
}

// SET isTelegramMember=false REMOVE telegramUserId, telegramUsername on the Account + active SeasonAccount
// (DDB parity). On a paused campaign getActiveSeasonId() is null -> Account-level only.
async function clearAccountTelegram(accountId: string): Promise<void> {
  const w = getWriteSql();
  await w`
    UPDATE lb_accounts
    SET attributes = (attributes || '{"isTelegramMember":false}'::jsonb) - 'telegramUserId' - 'telegramUsername',
        updated_at = now()
    WHERE account_id = ${accountId}`;
  const seasonId = await getActiveSeasonId();
  if (seasonId) {
    // attribute_exists(pk) condition in the lambda => the UPDATE simply affects 0 rows when the season
    // account is absent (no error, parity).
    await w`
      UPDATE lb_season_accounts
      SET is_telegram_member = false, attributes = attributes || '{"isTelegramMember":false}'::jsonb
      WHERE season_id = ${seasonId} AND account_id = ${accountId}`;
  }
}

// ---- telegram-verified ---------------------------------------------------------------------------

// Prior DDB owner of a telegramUserId (excluding the new identity), to clear their stale leaderboard badge.
// Reads box user_profiles (the live identity SoT in nasun_dal -- the box already cleared the prior owner's
// row atomically; this finds the leaderboard handle to clear the secondary badge). telegram_user_id +
// twitter_handle are promoted, indexed columns. Returns the prior owner's twitterHandle or null.
export async function findPriorTelegramOwnerHandle(
  telegramUserId: string,
  excludeIdentityId: string
): Promise<string | null> {
  const rows = await sql<{ twitter_handle: string | null }[]>`
    SELECT twitter_handle FROM user_profiles
    WHERE telegram_user_id = ${telegramUserId} AND identity_id <> ${excludeIdentityId}
    LIMIT 1`;
  if (!rows.length) return null;
  return rows[0].twitter_handle ?? null;
}

export async function telegramVerified(params: {
  identityId: string;
  telegramUserId: string;
  telegramUsername: string | null;
  twitterHandle: string | null;
}): Promise<void> {
  // 1. Auto-transfer: clear any prior owner's leaderboard badge (their box row was already cleared
  //    atomically by the box /telegram/verify tx; this clears the secondary leaderboard badge).
  try {
    const priorHandle = await findPriorTelegramOwnerHandle(params.telegramUserId, params.identityId);
    if (priorHandle) {
      const prior = await findAccountStripped(priorHandle);
      if (prior) await clearAccountTelegram(prior.accountId);
    }
  } catch (err) {
    console.warn('[internal] telegram-verified auto-transfer clear failed (non-fatal):', err);
  }

  // 2. Set the new owner's leaderboard badge (only when on the curated leaderboard).
  if (params.twitterHandle) {
    try {
      await setTelegramBadge(params.twitterHandle, params.telegramUserId, params.telegramUsername);
    } catch (err) {
      console.warn('[internal] telegram-verified leaderboard sync failed (non-fatal):', err);
    }
  }
  // 3. Onboarding bonus: DROPPED (referral DDB removed in Phase 3c; AWS path already no-op). See file header.
}

// Set isTelegramMember=true + telegramUserId/Username, ONLY when not already a member (parity with the
// lambda's `if (!account.isTelegramMember)` + `attribute_not_exists OR =false` ConditionExpression: a
// concurrent flip simply updates 0 rows).
async function setTelegramBadge(
  twitterHandle: string,
  telegramUserId: string,
  telegramUsername: string | null
): Promise<void> {
  const account = await findAccountStripped(twitterHandle);
  if (!account) return; // No leaderboard account yet -- synced via get-my-rank later.
  const w = getWriteSql();
  if (!account.isTelegramMember) {
    await w`
      UPDATE lb_accounts
      SET attributes = attributes || ${w.json({ isTelegramMember: true, telegramUserId, telegramUsername } as never)},
          updated_at = now()
      WHERE account_id = ${account.accountId}
        AND (attributes->>'isTelegramMember' IS NULL OR attributes->>'isTelegramMember' = 'false')`;
  }
  const seasonId = await getActiveSeasonId();
  if (seasonId) {
    await w`
      UPDATE lb_season_accounts
      SET is_telegram_member = true, attributes = attributes || '{"isTelegramMember":true}'::jsonb
      WHERE season_id = ${seasonId} AND account_id = ${account.accountId}`;
  }
}

// ---- sync-profile --------------------------------------------------------------------------------

type ProfileRecord = {
  username?: string;
  profileImageUrl?: string;
  customDisplayName?: string;
  customAvatarKey?: string;
  customAvatarBanned?: boolean;
};

function resolveDisplayName(profile: ProfileRecord, accountDisplayName?: string): string | undefined {
  if (profile.customDisplayName) return profile.customDisplayName;
  if (profile.username && !profile.username.startsWith('0x')) return profile.username;
  return accountDisplayName;
}

function resolveAvatarUrl(profile: ProfileRecord, accountAvatar: string | undefined, avatarsBaseUrl: string): string | undefined {
  if (!profile.customAvatarBanned && profile.customAvatarKey && avatarsBaseUrl) {
    return `${avatarsBaseUrl}/${profile.customAvatarKey.replace(/^\/+/, '')}`;
  }
  return profile.profileImageUrl ?? accountAvatar;
}

export async function syncProfile(twitterHandle: string, avatarsBaseUrl: string): Promise<{ updated: boolean; reason?: string }> {
  const account = await findAccountStripped(twitterHandle);
  if (!account) return { updated: false, reason: 'no_account' };
  const profileRow = await getProfileRowByHandle(twitterHandle);
  if (!profileRow) return { updated: false, reason: 'no_profile' };
  const profile = profileRow as ProfileRecord;

  const displayName = resolveDisplayName(profile, account.displayName);
  const profileImageUrl = resolveAvatarUrl(profile, account.profileImageUrl, avatarsBaseUrl);

  // Match the lambda's removeUndefinedValues:true behaviour: an unresolved (undefined) field is NOT written
  // (the original SET would reject an undefined value, leaving the row unchanged). Only persist defined
  // fields so a previously-good displayName/avatar is never clobbered to null.
  const patch: Record<string, unknown> = {};
  if (displayName !== undefined) patch.displayName = displayName;
  if (profileImageUrl !== undefined) patch.profileImageUrl = profileImageUrl;
  if (Object.keys(patch).length === 0) return { updated: false, reason: 'nothing_to_sync' };

  const w = getWriteSql();
  // lb_accounts: displayName is promoted (display_name) AND lives in attributes (reconstructor overlays
  // promoted ?? attributes); profileImageUrl is attributes-only. Update the promoted column only when set.
  if (displayName !== undefined) {
    await w`
      UPDATE lb_accounts SET display_name = ${displayName},
        attributes = attributes || ${w.json(patch as never)}, updated_at = now()
      WHERE account_id = ${account.accountId}`;
  } else {
    await w`
      UPDATE lb_accounts SET attributes = attributes || ${w.json(patch as never)}, updated_at = now()
      WHERE account_id = ${account.accountId}`;
  }
  const seasonId = await getActiveSeasonId();
  if (seasonId) {
    // lb_season_accounts has no display_name/profileImageUrl columns -> attributes only.
    await w`
      UPDATE lb_season_accounts SET attributes = attributes || ${w.json(patch as never)}
      WHERE season_id = ${seasonId} AND account_id = ${account.accountId}`;
  }
  return { updated: true };
}
