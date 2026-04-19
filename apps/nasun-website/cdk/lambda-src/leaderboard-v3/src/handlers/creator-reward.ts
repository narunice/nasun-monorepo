/**
 * GET /v3/leaderboard/creator-reward
 * POST /v3/leaderboard/creator-reward
 *
 * One-time reward preference submission for top-100 creators of SEASON1
 * (April 9, 2026 snapshot). Eligible users select a chain/address to
 * receive $3 USDC. Submission is immutable.
 *
 * Eligibility is determined entirely from a hardcoded set (no DB query
 * needed at runtime). A single UserProfiles GetItem covers all cases.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createResponse, getRequestOrigin } from '../utils/response';
import { ELIGIBLE_ACCOUNTS } from './creator-reward-eligible-set';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID || '';

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const VALID_CHAINS = ['polygon', 'bnb'] as const;
type Chain = typeof VALID_CHAINS[number];
const VALID_REWARD_TYPES = ['polygon', 'bnb', 'binance', 'custom'] as const;
type RewardType = typeof VALID_REWARD_TYPES[number];

// ============================================
// JWT
// ============================================

let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!jwksInstance) {
    jwksInstance = createRemoteJWKSet(
      new URL('https://cognito-identity.amazonaws.com/.well-known/jwks_uri')
    );
  }
  return jwksInstance;
}

async function verifyJwt(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);
  if (!token || token === 'undefined' || token === 'null') return undefined;
  if (!COGNITO_IDENTITY_POOL_ID) return undefined;
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: 'https://cognito-identity.amazonaws.com',
      audience: COGNITO_IDENTITY_POOL_ID,
    });
    return payload.sub;
  } catch {
    return undefined;
  }
}

// ============================================
// Helpers
// ============================================

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase();
}

function isEvmAddress(addr: string): boolean {
  return EVM_ADDRESS_RE.test(addr);
}

function maskAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function resolveEvmAddress(profile: Record<string, unknown>): string | null {
  const top = typeof profile.walletAddress === 'string' ? profile.walletAddress : null;
  if (top && isEvmAddress(top)) return top.toLowerCase();

  const linked = profile.linkedAccounts as Record<string, Record<string, string>> | undefined;
  const metamask = linked?.metamask?.walletAddress;
  if (metamask && isEvmAddress(metamask)) return metamask.toLowerCase();

  return null;
}

// Fallback: extract twitterHandle from linkedAccounts.twitter in UserProfiles.
// When a user links Twitter as a secondary account, link-account Lambda writes
// twitterHandle both at top-level AND inside linkedAccounts.twitter.twitterHandle.
// If top-level twitterHandle is missing (e.g. legacy accounts), check linkedAccounts.
function resolveTwitterHandleFromLinkedAccounts(profile: Record<string, unknown>): string | null {
  const linked = profile.linkedAccounts as Record<string, Record<string, string>> | undefined;
  const handle = linked?.twitter?.twitterHandle;
  return typeof handle === 'string' ? handle : null;
}

// ============================================
// GET handler
// ============================================

async function handleGet(
  event: APIGatewayProxyEvent,
  requestOrigin: string | undefined
): Promise<APIGatewayProxyResult> {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  const identityId = await verifyJwt(authHeader);
  if (!identityId) {
    return createResponse(401, { error: 'Unauthorized' }, requestOrigin);
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      ProjectionExpression:
        'twitterHandle, walletAddress, linkedAccounts, rewardPreference',
    })
  );

  const profile = result.Item as Record<string, unknown> | undefined;
  if (!profile) {
    return createResponse(200, { eligible: false }, requestOrigin);
  }

  // Already submitted
  if (profile.rewardPreference) {
    const pref = profile.rewardPreference as Record<string, unknown>;
    const prefRewardType = pref.rewardType as string | undefined;
    const prefDestAddr = typeof pref.destinationAddress === 'string' ? pref.destinationAddress : null;
    const prefBinanceUid = typeof pref.binanceUid === 'string' ? pref.binanceUid : null;
    return createResponse(200, {
      eligible: true,
      alreadySubmitted: true,
      rewardType: prefRewardType,
      rank: pref.rank,
      ...(prefDestAddr && { destinationAddressMasked: maskAddress(prefDestAddr) }),
      ...(pref.destinationChain ? { destinationChain: pref.destinationChain } : {}),
      ...(prefBinanceUid && { binanceUid: prefBinanceUid }),
    }, requestOrigin);
  }

  const rawHandleFromProfile = typeof profile.twitterHandle === 'string' ? profile.twitterHandle : null;
  const rawHandle = rawHandleFromProfile ?? resolveTwitterHandleFromLinkedAccounts(profile);
  if (!rawHandle) {
    return createResponse(200, { eligible: false }, requestOrigin);
  }

  const handle = normalizeHandle(rawHandle);
  const rank = ELIGIBLE_ACCOUNTS.get(handle);
  if (rank === undefined) {
    return createResponse(200, { eligible: false }, requestOrigin);
  }

  const evmAddress = resolveEvmAddress(profile);

  return createResponse(200, {
    eligible: true,
    alreadySubmitted: false,
    rank,
    evmAddressMasked: evmAddress ? maskAddress(evmAddress) : null,
  }, requestOrigin);
}

// ============================================
// POST handler
// ============================================

interface PostBody {
  rewardType?: unknown;
  binanceUid?: unknown;
  destinationAddress?: unknown;
  destinationChain?: unknown;
}

async function handlePost(
  event: APIGatewayProxyEvent,
  requestOrigin: string | undefined
): Promise<APIGatewayProxyResult> {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  const identityId = await verifyJwt(authHeader);
  if (!identityId) {
    return createResponse(401, { error: 'Unauthorized' }, requestOrigin);
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      ProjectionExpression:
        'twitterHandle, walletAddress, linkedAccounts, rewardPreference',
    })
  );

  const profile = result.Item as Record<string, unknown> | undefined;

  if (profile?.rewardPreference) {
    return createResponse(409, { error: 'Already submitted' }, requestOrigin);
  }

  const rawHandleFromProfile = typeof profile?.twitterHandle === 'string' ? profile.twitterHandle : null;
  const rawHandle = rawHandleFromProfile ?? (profile ? resolveTwitterHandleFromLinkedAccounts(profile) : null);
  if (!rawHandle) {
    return createResponse(403, { error: 'No Twitter account linked' }, requestOrigin);
  }

  const handle = normalizeHandle(rawHandle);
  const rank = ELIGIBLE_ACCOUNTS.get(handle);
  if (rank === undefined) {
    return createResponse(403, { error: 'Not eligible' }, requestOrigin);
  }

  let body: PostBody = {};
  try {
    body = JSON.parse(event.body || '{}') as PostBody;
  } catch {
    return createResponse(400, { error: 'Invalid JSON body' }, requestOrigin);
  }

  const rewardType = body.rewardType as string | undefined;
  if (!rewardType || !VALID_REWARD_TYPES.includes(rewardType as RewardType)) {
    return createResponse(400, {
      error: 'rewardType must be one of: polygon, bnb, binance, custom',
    }, requestOrigin);
  }

  let destinationAddress: string | undefined;
  let destinationChain: Chain | undefined;
  let binanceUid: string | undefined;

  if (rewardType === 'polygon' || rewardType === 'bnb') {
    const evmAddress = profile ? resolveEvmAddress(profile) : null;
    if (!evmAddress) {
      return createResponse(422, {
        error: 'No EVM wallet connected',
        message: 'Connect a MetaMask wallet to your account before selecting Polygon or BNB.',
      }, requestOrigin);
    }
    destinationAddress = evmAddress; // already lowercase from resolveEvmAddress
    destinationChain = rewardType as Chain;
  } else if (rewardType === 'binance') {
    const uid = body.binanceUid;
    if (typeof uid !== 'string' || !/^[1-9]\d{0,9}$/.test(uid)) {
      return createResponse(400, {
        error: 'binanceUid must be a numeric string of 1-10 digits with no leading zero',
      }, requestOrigin);
    }
    binanceUid = uid;
  } else if (rewardType === 'custom') {
    const addr = body.destinationAddress;
    const chain = body.destinationChain;

    if (typeof addr !== 'string' || !isEvmAddress(addr)) {
      return createResponse(400, {
        error: 'destinationAddress must be a valid EVM address (0x + 40 hex chars)',
      }, requestOrigin);
    }
    if (typeof chain !== 'string' || !VALID_CHAINS.includes(chain as Chain)) {
      return createResponse(400, {
        error: 'destinationChain must be "polygon" or "bnb"',
      }, requestOrigin);
    }
    destinationAddress = addr.toLowerCase();
    destinationChain = chain as Chain;
  }

  const rewardPreference = {
    rewardType,
    ...(destinationAddress !== undefined && { destinationAddress }),
    ...(destinationChain !== undefined && { destinationChain }),
    ...(binanceUid !== undefined && { binanceUid }),
    rank,
    submittedAt: new Date().toISOString(),
  };

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId },
        ConditionExpression: 'attribute_not_exists(rewardPreference)',
        UpdateExpression: 'SET rewardPreference = :pref',
        ExpressionAttributeValues: { ':pref': rewardPreference },
      })
    );
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return createResponse(409, { error: 'Already submitted' }, requestOrigin);
    }
    throw err;
  }

  console.log(JSON.stringify({
    event: 'CREATOR_REWARD_SUBMITTED',
    identityId,
    twitterHandle: handle,
    rewardType,
    rank,
  }));

  return createResponse(200, { success: true }, requestOrigin);
}

// ============================================
// Main handler
// ============================================

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {}, requestOrigin);
  }

  try {
    if (event.httpMethod === 'GET') {
      return await handleGet(event, requestOrigin);
    }
    if (event.httpMethod === 'POST') {
      return await handlePost(event, requestOrigin);
    }
    return createResponse(405, { error: 'Method Not Allowed' }, requestOrigin);
  } catch (err) {
    console.error('[creator-reward] Unexpected error:', err);
    return createResponse(500, { error: 'Internal error' }, requestOrigin);
  }
};
