/**
 * POST /v3/leaderboard/internal/sync-profile
 *
 * Internal endpoint called by get-user-profile Lambda after a successful
 * PATCH (display name or avatar change). Updates the Account and active
 * SeasonAccount records so the leaderboard reflects Uju profile changes
 * without waiting for the next get-my-rank lazy refresh.
 *
 * Auth: X-Internal-Auth header must match LEADERBOARD_INTERNAL_TOKEN env var.
 * Body: { twitterHandle: string }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { Account, Season, DYNAMO_KEYS } from '../types';
import { createResponse, getRequestOrigin } from '../utils/response';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;
const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;
const USER_PROFILES_TABLE =
  process.env.USER_PROFILES_TABLE || 'UserProfiles';
const PUBLIC_AVATARS_BASE_URL =
  (process.env.PUBLIC_AVATARS_BASE_URL || '').replace(/\/+$/, '');
const INTERNAL_TOKEN = process.env.LEADERBOARD_INTERNAL_TOKEN || '';

type ProfileRecord = {
  username?: string;
  profileImageUrl?: string;
  customDisplayName?: string;
  customAvatarKey?: string;
  customAvatarBanned?: boolean;
  isTelegramMember?: boolean;
  telegramUserId?: string;
  telegramUsername?: string;
};

async function getActiveSeason(): Promise<Season | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASONS_TABLE,
      FilterExpression: '#status = :active AND sk = :metadata',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':active': 'active', ':metadata': 'METADATA' },
    })
  );
  return result.Items?.[0] as Season ?? null;
}

async function getAccountByUsername(twitterHandle: string): Promise<Account | null> {
  const normalized = twitterHandle.toLowerCase().replace(/^@/, '');
  const result = await docClient.send(
    new QueryCommand({
      TableName: ACCOUNTS_TABLE,
      IndexName: 'platform-username-index',
      KeyConditionExpression: 'platform = :platform AND username = :username',
      ExpressionAttributeValues: { ':platform': 'twitter', ':username': normalized },
    })
  );
  return result.Items?.[0] as Account ?? null;
}

async function getUserProfileByHandle(twitterHandle: string): Promise<ProfileRecord | null> {
  const normalized = twitterHandle.toLowerCase().replace(/^@/, '');
  const result = await docClient.send(
    new QueryCommand({
      TableName: USER_PROFILES_TABLE,
      IndexName: 'twitterHandle-index',
      KeyConditionExpression: 'twitterHandle = :handle',
      ExpressionAttributeValues: { ':handle': normalized },
      Limit: 10,
    })
  );
  if (!result.Items || result.Items.length === 0) return null;

  // Prefer item with real (non-0x) username
  let profile = result.Items[0] as ProfileRecord;
  for (const item of result.Items) {
    const candidate = item as ProfileRecord;
    if (candidate.username && !candidate.username.startsWith('0x')) {
      profile = candidate;
      break;
    }
  }
  return profile;
}

function resolveDisplayName(profile: ProfileRecord, account: Account): string | undefined {
  if (profile.customDisplayName) return profile.customDisplayName;
  if (profile.username && !profile.username.startsWith('0x')) return profile.username;
  return account.displayName;
}

function resolveAvatarUrl(profile: ProfileRecord, account: Account): string | undefined {
  if (!profile.customAvatarBanned && profile.customAvatarKey && PUBLIC_AVATARS_BASE_URL) {
    return `${PUBLIC_AVATARS_BASE_URL}/${profile.customAvatarKey.replace(/^\/+/, '')}`;
  }
  return profile.profileImageUrl ?? account.profileImageUrl;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, origin);

  if (event.httpMethod === 'OPTIONS') {
    return respond(204, {});
  }

  // Internal-only: verify shared secret
  const authHeader = event.headers['x-internal-auth'] ?? event.headers['X-Internal-Auth'] ?? '';
  if (!INTERNAL_TOKEN || authHeader !== INTERNAL_TOKEN) {
    return respond(401, { error: 'unauthorized' });
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  let body: { twitterHandle?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { twitterHandle } = body;
  if (!twitterHandle || typeof twitterHandle !== 'string') {
    return respond(400, { error: 'twitterHandle is required' });
  }

  try {
    const [account, profile, activeSeason] = await Promise.all([
      getAccountByUsername(twitterHandle),
      getUserProfileByHandle(twitterHandle),
      getActiveSeason(),
    ]);

    if (!account) {
      // No leaderboard entry for this handle - nothing to sync
      return respond(200, { ok: true, updated: false, reason: 'no_account' });
    }

    if (!profile) {
      return respond(200, { ok: true, updated: false, reason: 'no_profile' });
    }

    const displayName = resolveDisplayName(profile, account);
    const profileImageUrl = resolveAvatarUrl(profile, account);

    const updates: Promise<unknown>[] = [];

    // Update Account table
    updates.push(
      docClient.send(
        new UpdateCommand({
          TableName: ACCOUNTS_TABLE,
          Key: { accountId: account.accountId },
          UpdateExpression: 'SET displayName = :dn, profileImageUrl = :img',
          ExpressionAttributeValues: { ':dn': displayName, ':img': profileImageUrl },
        })
      )
    );

    // Update active SeasonAccounts record if it exists
    if (activeSeason) {
      updates.push(
        docClient.send(
          new UpdateCommand({
            TableName: SEASON_ACCOUNTS_TABLE,
            Key: {
              pk: `SEASON#${activeSeason.seasonId}#ACCOUNT#${account.accountId}`,
              sk: 'SCORE',
            },
            UpdateExpression: 'SET displayName = :dn, profileImageUrl = :img',
            ExpressionAttributeValues: { ':dn': displayName, ':img': profileImageUrl },
            ConditionExpression: 'attribute_exists(pk)',
          })
        ).catch(() => { /* Record may not exist yet for this season */ })
      );
    }

    await Promise.all(updates);

    console.log(`[sync-profile] Synced ${twitterHandle}: name="${displayName}", hasCustomAvatar=${!!profile.customAvatarKey && !profile.customAvatarBanned}`);
    return respond(200, { ok: true, updated: true });
  } catch (error) {
    console.error('[sync-profile] Error:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
