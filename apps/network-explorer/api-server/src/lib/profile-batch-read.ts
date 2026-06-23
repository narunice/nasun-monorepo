/**
 * Box-first bulk UserProfiles reader (AWS-exit DAL).
 *
 * Resolves UserProfiles rows for a set of identityIds. When IDENTITY_READ_MODE=flip
 * (the box nasun-identity mirror) reads go through the box `POST /profile/batch` HTTP
 * endpoint and DynamoDB is never touched, so the host needs no AWS credentials. On any
 * box error/timeout/misconfig the call falls back to a direct DynamoDB BatchGet (which
 * does require AWS credentials).
 *
 * The box returns the SAME per-identity raw item shape as a UserProfiles BatchGet (the
 * 15-field PROFILE_PROJECTION), so every caller consumes one shape: the live leaderboard
 * (routes/ecosystem.ts) and the weekly settlement scripts (scripts/settle-ecosystem.ts).
 *
 * Extracted from routes/ecosystem.ts so settle-ecosystem.ts no longer hard-depends on
 * direct DynamoDB access. After the node-3 -> box migration the box runs without AWS
 * credentials; the old direct-DDB path made the weekly settlement cron crash there.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const PROFILE_BATCH_CHUNK = 100;

// DynamoDB BatchGet projection (and reserved-word aliases) shared by the DynamoDB fallback path.
export const PROFILE_PROJECTION =
  'identityId, walletAddress, customDisplayName, customAvatarKey, customAvatarBanned, #pr, username, linkedAccounts, linkedToPrimaryId, twitterHandle, originalTwitterHandle, profileImageUrl, #em, #tgm, #rl';
export const PROFILE_EAN = { '#pr': 'provider', '#em': 'email', '#tgm': 'isTelegramMember', '#rl': 'role' };

let _ddbClient: DynamoDBDocumentClient | null = null;
function getDdbClient(): DynamoDBDocumentClient {
  if (!_ddbClient) {
    _ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));
  }
  return _ddbClient;
}

// Read every box-read knob at call time (not import time) so a runtime .env edit + restart,
// or a hot rollback/repoint, takes effect uniformly -- avoids the footgun where MODE is hot
// but URL/SECRET are frozen. enabled requires flip + both URL and SECRET (fail-closed -> DynamoDB).
export function identityReadConfig() {
  const url = (process.env.IDENTITY_READ_URL || '').replace(/\/+$/, '');
  const secret = process.env.IDENTITY_READ_SECRET || '';
  const flip = (process.env.IDENTITY_READ_MODE || '').trim() === 'flip';
  const tmo = Number(process.env.IDENTITY_READ_TIMEOUT_MS);
  return { url, secret, enabled: flip && !!url && !!secret, timeoutMs: tmo > 0 ? tmo : 4000 };
}

// Box-served bulk profile read. Returns the per-identity raw item map, or null when not
// flipped or on any failure so the caller falls back to DynamoDB. A failed chunk fails the
// whole call (not per-chunk) -> a single batchGetProfiles result never mixes box and DynamoDB rows.
async function boxProfileBatch(ids: string[]): Promise<Map<string, Record<string, unknown>> | null> {
  const { url, secret, enabled, timeoutMs } = identityReadConfig();
  if (!enabled || ids.length === 0) return null;
  try {
    const out = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < ids.length; i += PROFILE_BATCH_CHUNK) {
      const chunk = ids.slice(i, i + PROFILE_BATCH_CHUNK);
      const res = await fetch(`${url}/profile/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ identityIds: chunk }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { profiles?: Record<string, Record<string, unknown>> };
      for (const [id, item] of Object.entries(data.profiles ?? {})) out.set(id, item);
    }
    return out;
  } catch (err) {
    console.warn('[profile-batch-read] box /profile/batch failed, falling back to DynamoDB:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Bulk-resolve UserProfiles rows for `ids`: box mirror first (when flipped), DynamoDB otherwise
// / on box failure. Returns a Map keyed by identityId of the raw DynamoDB-item shape.
export async function batchGetProfiles(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  if (ids.length === 0) return new Map();
  const boxed = await boxProfileBatch(ids);
  if (boxed) return boxed;
  const ddb = getDdbClient();
  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += PROFILE_BATCH_CHUNK) {
    let pendingKeys = ids.slice(i, i + PROFILE_BATCH_CHUNK).map(id => ({ identityId: id }));
    while (pendingKeys.length > 0) {
      const res = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [USER_PROFILES_TABLE]: { Keys: pendingKeys, ProjectionExpression: PROFILE_PROJECTION, ExpressionAttributeNames: PROFILE_EAN },
        },
      }));
      for (const item of res.Responses?.[USER_PROFILES_TABLE] ?? []) {
        out.set(item.identityId as string, item as Record<string, unknown>);
      }
      pendingKeys = (res.UnprocessedKeys?.[USER_PROFILES_TABLE]?.Keys as typeof pendingKeys) ?? [];
    }
  }
  return out;
}
