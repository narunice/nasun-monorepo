/**
 * POST /v3/leaderboard/internal/voting-rank
 *
 * AWS-exit de-Lambda C6b residual: the thin DynamoDB rank lookup that the box governance compute
 * (/governance/voting-power + /governance/certificate) cannot do itself (the leaderboard-v3 rank data
 * is DynamoDB-resident; the box has no DDB access). The box resolves the voting identity + twitterHandle
 * from its own PG, then calls this to convert twitterHandle -> leaderboard rank.
 *
 * This is a BYTE-PARITY port of the governance-api Lambda's getUserRank + helpers (governance-api/src/
 * index.ts getUserRank/getV3AccountByHandle/getV3ActiveSeason/getV3MostRecentEndedSeason/
 * getUserRankFromSnapshot) so the box computes the SAME voting power the Lambda did. Critically it
 * lowercases the handle WITHOUT stripping '@' (matching governance getUserRank, NOT the sync-profile
 * helper which strips '@'); the box passes the RAW handle and this normalizes identically to the Lambda.
 *
 * Auth: X-Internal-Auth header must match LEADERBOARD_INTERNAL_TOKEN (same as the other internal routes).
 * Body: { twitterHandle: string }  ->  { rank: number | null }
 *
 * Removed when leaderboard-v3 itself migrates off DynamoDB to PG (master plan SS6.4 ROW_NUMBER window).
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { createResponse, getRequestOrigin } from '../utils/response';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const ACCOUNTS_TABLE = process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || 'leaderboard-v3-accounts';
const SEASONS_TABLE = process.env.LEADERBOARD_V3_SEASONS_TABLE || 'leaderboard-v3-seasons';
const SNAPSHOTS_TABLE = process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || 'leaderboard-v3-snapshots';
const INTERNAL_TOKEN = process.env.LEADERBOARD_INTERNAL_TOKEN || '';

interface V3Account { accountId: string; platform: string; username: string }
interface V3Season { seasonId: string; sk: string; status: string; endDate: string }

// --- byte-parity ports of governance-api/src/index.ts ---------------------------------------------

async function getV3AccountByHandle(twitterHandle: string): Promise<V3Account | null> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: ACCOUNTS_TABLE,
        IndexName: 'platform-username-index',
        KeyConditionExpression: 'platform = :platform AND username = :username',
        ExpressionAttributeValues: {
          ':platform': 'twitter',
          ':username': twitterHandle.toLowerCase(),
        },
        Limit: 1,
      })
    );
    return (result.Items?.[0] as V3Account) || null;
  } catch (error) {
    console.error('Error looking up V3 account:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getV3ActiveSeason(): Promise<V3Season | null> {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: SEASONS_TABLE,
        FilterExpression: 'sk = :sk AND #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':sk': 'METADATA', ':status': 'active' },
      })
    );
    return (result.Items?.[0] as V3Season) || null;
  } catch (error) {
    console.error('Error finding active season:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getV3MostRecentEndedSeason(): Promise<V3Season | null> {
  try {
    const result = await docClient.send(
      new ScanCommand({
        TableName: SEASONS_TABLE,
        FilterExpression: 'sk = :sk AND #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':sk': 'METADATA', ':status': 'ended' },
      })
    );
    if (!result.Items?.length) return null;
    const sorted = result.Items.sort((a, b) =>
      ((b as V3Season).endDate).localeCompare((a as V3Season).endDate)
    );
    return sorted[0] as V3Season;
  } catch (error) {
    console.error('Error finding last ended season:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getUserRankFromSnapshot(accountId: string, seasonId: string): Promise<number | null> {
  try {
    const seasonPrefix = `${seasonId}#`;
    let lastKey: Record<string, unknown> | undefined;
    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: SNAPSHOTS_TABLE,
          IndexName: 'accountId-snapshotDate-index',
          KeyConditionExpression: 'accountId = :accountId',
          FilterExpression: 'begins_with(pk, :seasonPrefix)',
          ExpressionAttributeValues: { ':accountId': accountId, ':seasonPrefix': seasonPrefix },
          ScanIndexForward: false,
          ExclusiveStartKey: lastKey,
        })
      );
      if (result.Items && result.Items.length > 0) {
        return result.Items[0].rank as number;
      }
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
    return null;
  } catch (error) {
    console.error('Error getting user rank from snapshot:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function getUserRank(twitterHandle?: string): Promise<number | null> {
  if (!twitterHandle) return null;
  const account = await getV3AccountByHandle(twitterHandle);
  if (!account) return null;
  const activeSeason = await getV3ActiveSeason();
  if (activeSeason) {
    const rank = await getUserRankFromSnapshot(account.accountId, activeSeason.seasonId);
    if (rank !== null) return rank;
  }
  const lastEnded = await getV3MostRecentEndedSeason();
  if (lastEnded) {
    const rank = await getUserRankFromSnapshot(account.accountId, lastEnded.seasonId);
    if (rank !== null) return rank;
  }
  return null;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const origin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, origin);

  if (event.httpMethod === 'OPTIONS') return respond(204, {});

  const authHeader = event.headers['x-internal-auth'] ?? event.headers['X-Internal-Auth'] ?? '';
  if (!INTERNAL_TOKEN || authHeader !== INTERNAL_TOKEN) {
    return respond(401, { error: 'unauthorized' });
  }
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  let body: { twitterHandle?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  // twitterHandle is OPTIONAL: a wallet with no linked X has no rank. Mirror getUserRank(undefined)=null.
  const twitterHandle = typeof body.twitterHandle === 'string' && body.twitterHandle ? body.twitterHandle : undefined;

  try {
    const rank = await getUserRank(twitterHandle);
    return respond(200, { rank });
  } catch (error) {
    console.error('[voting-rank] Error:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
