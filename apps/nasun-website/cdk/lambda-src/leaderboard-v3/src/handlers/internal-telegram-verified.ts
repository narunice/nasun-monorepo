/**
 * POST /v3/leaderboard/internal/telegram-verified
 *
 * Internal endpoint called by the box compute service (nasun-identity-compute) AFTER it
 * authoritatively sets a user's Telegram link in the box (de-Lambda C5c). It performs ALL the
 * DynamoDB-side secondary work the box cannot do, consolidated into one call:
 *
 *   1. Auto-transfer: if another DynamoDB profile still owns this telegramUserId (the box already
 *      cleared the prior owner's box row atomically, but DynamoDB UserProfiles is the frozen follower),
 *      clear that prior owner's leaderboard Account/SeasonAccount badge.
 *   2. Set the new owner's leaderboard Account/SeasonAccount badge (only when twitterHandle present).
 *   3. Onboarding bonus: referral-gated telegram-link grant (idempotent).
 *
 * It does NOT write UserProfiles (box is SoT for UserProfiles; this lambda only touches the
 * leaderboard-v3 Accounts/SeasonAccounts DynamoDB tables, which have no box mirror, plus the
 * referral/onboarding side effect). Removed when leaderboard-v3 itself migrates off DynamoDB. The
 * leaderboard logic mirrors verify-telegram.ts (the path it replaces).
 *
 * Auth: X-Internal-Auth header must match LEADERBOARD_INTERNAL_TOKEN (the same shared token
 * internal/sync-profile + internal/clear-telegram use).
 * Body: { identityId, telegramUserId, telegramUsername?, twitterHandle? }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DYNAMO_KEYS } from '../types';
import { createResponse, getRequestOrigin } from '../utils/response';
import { grantIfReferralActivated } from '../utils/onboardingBonus';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const ACCOUNTS_TABLE = process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;
const SEASONS_TABLE = process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const INTERNAL_TOKEN = process.env.LEADERBOARD_INTERNAL_TOKEN || '';

// --- leaderboard helpers (mirror verify-telegram.ts) ----------------------------------------------

async function findAccountByUsername(
  username: string
): Promise<{ accountId: string; isTelegramMember?: boolean } | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: ACCOUNTS_TABLE,
      IndexName: 'platform-username-index',
      KeyConditionExpression: 'platform = :platform AND username = :username',
      ExpressionAttributeValues: { ':platform': 'twitter', ':username': username.toLowerCase().replace(/^@/, '') },
      Limit: 1,
    })
  );
  if (!result.Items?.length) return null;
  const item = result.Items[0];
  return { accountId: item.accountId as string, isTelegramMember: item.isTelegramMember as boolean | undefined };
}

async function getActiveSeason(): Promise<{ seasonId: string } | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASONS_TABLE,
      FilterExpression: 'sk = :sk AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':sk': 'METADATA', ':status': 'active' },
    })
  );
  if (result.Items?.length) return { seasonId: result.Items[0].seasonId as string };
  return null;
}

async function findExistingTelegramOwner(
  telegramUserId: string,
  excludeIdentityId: string
): Promise<{ identityId: string; twitterHandle?: string } | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: USER_PROFILES_TABLE,
      IndexName: 'telegramUserId-index',
      KeyConditionExpression: 'telegramUserId = :tgId',
      ExpressionAttributeValues: { ':tgId': telegramUserId },
      ProjectionExpression: 'identityId',
      Limit: 10,
    })
  );
  const existing = (result.Items ?? []).find((item) => item.identityId !== excludeIdentityId);
  if (!existing) return null;
  const profile = await docClient.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId: existing.identityId },
      ProjectionExpression: 'identityId, twitterHandle',
    })
  );
  return profile.Item
    ? { identityId: profile.Item.identityId as string, twitterHandle: profile.Item.twitterHandle as string | undefined }
    : null;
}

async function clearLeaderboardTelegram(twitterHandle: string): Promise<void> {
  const account = await findAccountByUsername(twitterHandle);
  if (!account) return;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: ACCOUNTS_TABLE,
        Key: { accountId: account.accountId },
        UpdateExpression: 'SET isTelegramMember = :false REMOVE telegramUserId, telegramUsername',
        ExpressionAttributeValues: { ':false': false },
      })
    );
  } catch (err) {
    console.warn('[telegram-verified] Failed to clear old owner leaderboard:', err);
  }
  const activeSeason = await getActiveSeason();
  if (activeSeason) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: SEASON_ACCOUNTS_TABLE,
          Key: { pk: `SEASON#${activeSeason.seasonId}#ACCOUNT#${account.accountId}`, sk: 'SCORE' },
          UpdateExpression: 'SET isTelegramMember = :false',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':false': false },
        })
      );
    } catch {
      // Season account may not exist
    }
  }
}

async function syncToLeaderboardAccount(
  twitterHandle: string,
  telegramUserIdStr: string,
  telegramUsername: string | null
): Promise<void> {
  const account = await findAccountByUsername(twitterHandle);
  if (!account) return; // No leaderboard account yet -- will be synced via get-my-rank later
  if (!account.isTelegramMember) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: ACCOUNTS_TABLE,
          Key: { accountId: account.accountId },
          UpdateExpression: 'SET isTelegramMember = :true, telegramUserId = :tgId, telegramUsername = :tgUsername',
          ConditionExpression: 'attribute_not_exists(isTelegramMember) OR isTelegramMember = :false',
          ExpressionAttributeValues: { ':true': true, ':false': false, ':tgId': telegramUserIdStr, ':tgUsername': telegramUsername },
        })
      );
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    }
  }
  const activeSeason = await getActiveSeason();
  if (activeSeason) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: SEASON_ACCOUNTS_TABLE,
          Key: { pk: `SEASON#${activeSeason.seasonId}#ACCOUNT#${account.accountId}`, sk: 'SCORE' },
          UpdateExpression: 'SET isTelegramMember = :true',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':true': true },
        })
      );
    } catch {
      // Season account may not exist yet
    }
  }
}

// --- handler --------------------------------------------------------------------------------------

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const origin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, origin);

  if (event.httpMethod === 'OPTIONS') return respond(204, {});

  const authHeader = event.headers['x-internal-auth'] ?? event.headers['X-Internal-Auth'] ?? '';
  if (!INTERNAL_TOKEN || authHeader !== INTERNAL_TOKEN) {
    return respond(401, { error: 'unauthorized' });
  }
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  let body: { identityId?: string; telegramUserId?: string; telegramUsername?: string | null; twitterHandle?: string | null };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { identityId, telegramUserId } = body;
  const twitterHandle = typeof body.twitterHandle === 'string' && body.twitterHandle ? body.twitterHandle : null;
  const telegramUsername = typeof body.telegramUsername === 'string' ? body.telegramUsername : null;
  if (!identityId || typeof identityId !== 'string') return respond(400, { error: 'identityId is required' });
  if (!telegramUserId || !/^\d{1,20}$/.test(telegramUserId)) return respond(400, { error: 'valid telegramUserId is required' });

  // 1. Auto-transfer: clear any prior DynamoDB owner's leaderboard badge (their box row was already
  //    cleared atomically by the box /telegram/verify tx; UserProfiles DDB is the frozen follower).
  try {
    const existingOwner = await findExistingTelegramOwner(telegramUserId, identityId);
    if (existingOwner?.twitterHandle) {
      await clearLeaderboardTelegram(existingOwner.twitterHandle);
    }
  } catch (err) {
    console.warn('[telegram-verified] auto-transfer leaderboard clear failed (non-fatal):', err);
  }

  // 2. Set the new owner's leaderboard badge (only when on the curated leaderboard).
  if (twitterHandle) {
    try {
      await syncToLeaderboardAccount(twitterHandle, telegramUserId, telegramUsername);
    } catch (err) {
      console.warn('[telegram-verified] leaderboard sync failed (non-fatal):', err);
    }
  }

  // 3. Onboarding bonus (referral-gated, idempotent). Best-effort.
  if (process.env.EXPLORER_API_URL) {
    await grantIfReferralActivated({
      ddbClient: docClient,
      referralsTable: process.env.REFERRALS_TABLE || 'nasun-referrals',
      explorerApiUrl: process.env.EXPLORER_API_URL,
      apiKey: process.env.ONBOARDING_BONUS_API_KEY || '',
      identityId,
      kind: 'telegram-link',
      externalId: telegramUserId,
    }).catch((e) => console.warn('[telegram-verified] onboarding-bonus non-fatal', e));
  }

  return respond(200, { ok: true });
};
