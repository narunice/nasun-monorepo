/**
 * POST /v3/leaderboard/internal/clear-telegram
 *
 * Internal endpoint called by the box compute service (nasun-identity-compute) after it
 * authoritatively clears a user's Telegram link in the box (de-Lambda C5b). Clears the
 * Telegram badge from the leaderboard Account + active SeasonAccount records so the curated
 * leaderboard stops showing a stale checkmark after a disconnect.
 *
 * This is the thin AWS-side residual for the leaderboard secondary clear: the leaderboard-v3
 * Accounts/SeasonAccounts tables are DynamoDB with no box mirror, so the box cannot write them
 * directly. It is removed when leaderboard-v3 itself migrates off DynamoDB. The logic mirrors
 * disconnect-telegram.ts clearLeaderboardTelegram (the path it replaces).
 *
 * Auth: X-Internal-Auth header must match LEADERBOARD_INTERNAL_TOKEN env var (the same shared
 * token internal/sync-profile uses). Best-effort from the caller's view; this handler still
 * reports per-step outcomes.
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
import { DYNAMO_KEYS } from '../types';
import { createResponse, getRequestOrigin } from '../utils/response';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;
const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;
const INTERNAL_TOKEN = process.env.LEADERBOARD_INTERNAL_TOKEN || '';

async function findAccountByUsername(username: string): Promise<{ accountId: string } | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: ACCOUNTS_TABLE,
      IndexName: 'platform-username-index',
      KeyConditionExpression: 'platform = :platform AND username = :username',
      ExpressionAttributeValues: {
        ':platform': 'twitter',
        ':username': username.toLowerCase().replace(/^@/, ''),
      },
      Limit: 1,
    })
  );
  if (!result.Items?.length) return null;
  return { accountId: result.Items[0].accountId as string };
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
    const account = await findAccountByUsername(twitterHandle);
    if (!account) {
      return respond(200, { ok: true, updated: false, reason: 'no_account' });
    }

    // Clear Telegram from the Account record (parity with disconnect-telegram clearLeaderboardTelegram)
    await docClient.send(
      new UpdateCommand({
        TableName: ACCOUNTS_TABLE,
        Key: { accountId: account.accountId },
        UpdateExpression: 'SET isTelegramMember = :false REMOVE telegramUserId, telegramUsername',
        ExpressionAttributeValues: { ':false': false },
      })
    );

    // Clear Telegram from the active SeasonAccounts record if it exists
    const activeSeason = await getActiveSeason();
    if (activeSeason) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: SEASON_ACCOUNTS_TABLE,
            Key: {
              pk: `SEASON#${activeSeason.seasonId}#ACCOUNT#${account.accountId}`,
              sk: 'SCORE',
            },
            UpdateExpression: 'SET isTelegramMember = :false',
            ConditionExpression: 'attribute_exists(pk)',
            ExpressionAttributeValues: { ':false': false },
          })
        );
      } catch {
        // Season account may not exist for this account yet
      }
    }

    console.log(`[clear-telegram] Cleared leaderboard Telegram for ${twitterHandle}`);
    return respond(200, { ok: true, updated: true });
  } catch (error) {
    console.error('[clear-telegram] Error:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
