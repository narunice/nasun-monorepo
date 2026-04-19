/**
 * Identity Resolver - Centralized wallet <-> identityId mapping for chat-server.
 *
 * Provides:
 *   1. walletAddress -> identityId  (DynamoDB UserWallets, single lookup)
 *   2. Bulk identity map cache      (loaded from WALLET_MAPPINGS_URL, refreshed hourly)
 *   3. Cache invalidation endpoint  (POST /api/internal/cache/invalidate)
 *
 * Design:
 *   - Single lookups (resolveIdentityId) hit DynamoDB directly, same as the original
 *     pado-idea-api.ts pattern.
 *   - Bulk reverse map (walletAddress -> identityId for all registered wallets) is
 *     loaded via WALLET_MAPPINGS_URL and kept in memory with 1-hour TTL. This cache
 *     is used by the aggregator for wash-trading detection.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

// ===== DynamoDB client (shared, lazy init) =====

let ddbClient: DynamoDBDocumentClient | null = null;

function getDdbClient(): DynamoDBDocumentClient {
  if (ddbClient) return ddbClient;
  const region = process.env.AWS_REGION || 'ap-northeast-2';
  ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  return ddbClient;
}

// ===== Config =====

const USER_WALLETS_TABLE = process.env.USER_WALLETS_TABLE || 'UserWallets';
const WALLET_OWNER_SENTINEL = 'WALLET_OWNER';

// URL of the network-explorer wallet-mappings endpoint.
// Returns { wallets: Record<walletAddress, identityId> } (or S3 presigned offload).
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL || '';
const WALLET_MAPPINGS_KEY = process.env.WALLET_MAPPINGS_API_KEY || '';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ===== Bulk identity cache =====

interface IdentityCache {
  map: Map<string, string>; // walletAddress (lowercase) -> identityId
  loadedAt: number;
}

let identityCache: IdentityCache | null = null;
let refreshPromise: Promise<void> | null = null;

/**
 * Load all wallet->identityId mappings from the network-explorer API.
 * Handles S3 presigned URL offload (same pattern as settle-pado.ts).
 */
async function loadIdentityMap(): Promise<Map<string, string>> {
  if (!WALLET_MAPPINGS_URL) {
    return new Map();
  }

  const headers: Record<string, string> = {};
  if (WALLET_MAPPINGS_KEY) headers['x-api-key'] = WALLET_MAPPINGS_KEY;

  const res = await fetch(WALLET_MAPPINGS_URL, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`wallet-mappings fetch failed: ${res.status}`);

  const data = await res.json() as
    | { wallets?: Record<string, string> }
    | { url: string };

  // Handle S3 presigned offload
  let wallets: Record<string, string> = {};
  if ('url' in data) {
    const s3Res = await fetch(data.url, { signal: AbortSignal.timeout(30_000) });
    if (!s3Res.ok) throw new Error(`S3 offload fetch failed: ${s3Res.status}`);
    const s3Data = await s3Res.json() as { wallets?: Record<string, string> };
    wallets = s3Data.wallets ?? {};
  } else {
    wallets = data.wallets ?? {};
  }

  const map = new Map<string, string>();
  for (const [addr, id] of Object.entries(wallets)) {
    map.set(addr.toLowerCase(), id);
  }
  return map;
}

/**
 * Refresh the in-memory identity cache.
 * De-duplicates concurrent calls via a shared promise.
 */
export async function refreshIdentityCache(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const map = await loadIdentityMap();
      identityCache = { map, loadedAt: Date.now() };
      console.log(`[identity-resolver] Cache refreshed: ${map.size} wallets`);
    } catch (err) {
      console.error('[identity-resolver] Cache refresh failed:', (err as Error).message);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Invalidate the in-memory cache immediately.
 * Called when a user registers a new wallet (via POST /api/internal/cache/invalidate).
 */
export function invalidateIdentityCache(): void {
  identityCache = null;
  console.log('[identity-resolver] Cache invalidated');
}

/**
 * Get the current bulk identity map, refreshing if stale or missing.
 * Returns a snapshot - callers should not mutate it.
 */
export async function getIdentityMap(): Promise<Map<string, string>> {
  if (!identityCache || Date.now() - identityCache.loadedAt > CACHE_TTL_MS) {
    await refreshIdentityCache();
  }
  return identityCache?.map ?? new Map();
}

// ===== Single-address lookup (DynamoDB) =====

/**
 * Resolve a single wallet address to its Nasun identityId.
 * Returns null if the wallet is not registered.
 *
 * Uses DynamoDB directly (EC2 instance profile IAM), same as the original
 * resolveIdentityId in pado-idea-api.ts.
 */
export async function resolveIdentityId(walletAddress: string): Promise<string | null> {
  try {
    const result = await getDdbClient().send(new GetCommand({
      TableName: USER_WALLETS_TABLE,
      Key: { identityId: WALLET_OWNER_SENTINEL, walletAddress },
    }));
    const ownerId = result.Item?.ownerIdentityId;
    return typeof ownerId === 'string' ? ownerId : null;
  } catch (err) {
    console.error('[identity-resolver] DynamoDB lookup failed:', (err as Error).message);
    return null;
  }
}

/**
 * Resolve multiple wallet addresses to their identityIds in bulk.
 * Uses DynamoDB BatchGetItem on UserWallets table directly.
 * Returns a Map of address (lowercase) -> identityId for matched wallets only.
 */
export async function resolveIdentityIds(
  addresses: string[],
): Promise<Map<string, string>> {
  if (addresses.length === 0) return new Map();

  const ddb = getDdbClient();
  const result = new Map<string, string>();

  for (let i = 0; i < addresses.length; i += BATCH_GET_LIMIT) {
    const chunk = addresses.slice(i, i + BATCH_GET_LIMIT);
    let pendingKeys: Array<Record<string, unknown>> = chunk.map((addr) => ({
      identityId: WALLET_OWNER_SENTINEL,
      walletAddress: addr.toLowerCase(),
    }));

    for (let attempt = 0; pendingKeys.length > 0; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
      }
      if (attempt > BATCH_GET_MAX_RETRIES) break;

      const response = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [USER_WALLETS_TABLE]: {
            Keys: pendingKeys,
            ProjectionExpression: 'walletAddress, ownerIdentityId',
          },
        },
      }));

      const items = response.Responses?.[USER_WALLETS_TABLE] ?? [];
      for (const item of items) {
        if (typeof item.walletAddress === 'string' && typeof item.ownerIdentityId === 'string') {
          result.set(item.walletAddress.toLowerCase(), item.ownerIdentityId);
        }
      }

      pendingKeys = (response.UnprocessedKeys?.[USER_WALLETS_TABLE]?.Keys ?? []) as Array<Record<string, unknown>>;
    }
  }

  return result;
}

/**
 * Build a Set of address pairs that share the same identityId.
 * Used by the aggregator to detect wash-trading between linked wallets.
 *
 * Returns a Set of canonical pair keys: `${addrA}:${addrB}` where addrA < addrB.
 */
export async function buildSameIdentityPairs(): Promise<Set<string>> {
  const map = await getIdentityMap();

  // Group addresses by identityId
  const byIdentity = new Map<string, string[]>();
  for (const [addr, id] of map) {
    const list = byIdentity.get(id) ?? [];
    list.push(addr);
    byIdentity.set(id, list);
  }

  // Build all pairs within same identity
  const pairs = new Set<string>();
  for (const addrs of byIdentity.values()) {
    if (addrs.length < 2) continue;
    for (let i = 0; i < addrs.length; i++) {
      for (let j = i + 1; j < addrs.length; j++) {
        const a = addrs[i] < addrs[j] ? addrs[i] : addrs[j];
        const b = addrs[i] < addrs[j] ? addrs[j] : addrs[i];
        pairs.add(`${a}:${b}`);
      }
    }
  }
  return pairs;
}

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

// DynamoDB BatchGetItem hard limit per request.
const BATCH_GET_LIMIT = 100;
// Max retry attempts for UnprocessedKeys (exponential backoff: 100ms, 200ms, 400ms).
const BATCH_GET_MAX_RETRIES = 3;

/**
 * Returns the set of identityIds that have at least one social account connected.
 * Social accounts: Twitter (primary or linked), Google (primary or linked), Telegram channel member.
 *
 * Handles DynamoDB UnprocessedKeys with exponential backoff retries.
 * On error, throws so the caller can abort rather than silently skipping identities.
 */
export async function checkSocialConnectionsBatch(identityIds: string[]): Promise<Set<string>> {
  if (identityIds.length === 0) return new Set();

  const ddb = getDdbClient();
  const result = new Set<string>();

  for (let i = 0; i < identityIds.length; i += BATCH_GET_LIMIT) {
    const chunk = identityIds.slice(i, i + BATCH_GET_LIMIT);

    // Initial request keys; retried if DynamoDB returns UnprocessedKeys.
    let pendingKeys: Array<Record<string, unknown>> = chunk.map((id) => ({ identityId: id }));

    for (let attempt = 0; pendingKeys.length > 0; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
      }
      if (attempt > BATCH_GET_MAX_RETRIES) {
        throw new Error(
          `[identity-resolver] BatchGetItem exceeded ${BATCH_GET_MAX_RETRIES} retries for ${pendingKeys.length} unprocessed keys`,
        );
      }

      const response = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [USER_PROFILES_TABLE]: {
            Keys: pendingKeys,
            ProjectionExpression: 'identityId, #p, linkedAccounts, isTelegramMember, telegramUserId, twitterHandle',
            ExpressionAttributeNames: { '#p': 'provider' },
          },
        },
      }));

      const items = response.Responses?.[USER_PROFILES_TABLE] ?? [];
      for (const item of items) {
        if (hasSocialConnection(item)) {
          result.add(item.identityId as string);
        }
      }

      // Retry any keys DynamoDB could not process (throughput exceeded).
      pendingKeys = (response.UnprocessedKeys?.[USER_PROFILES_TABLE]?.Keys ?? []) as Array<Record<string, unknown>>;
    }
  }

  return result;
}

function hasSocialConnection(profile: Record<string, unknown>): boolean {
  // Twitter: primary auth or linked account or standalone twitterHandle field
  const provider = (profile.provider as string | undefined)?.toLowerCase();
  if (provider === 'twitter') return true;
  if (typeof profile.twitterHandle === 'string' && profile.twitterHandle.length > 0) return true;

  // Google: primary auth (both 'Google' and Cognito Federated 'accounts.google.com') or linked
  if (provider === 'google' || provider === 'accounts.google.com') return true;

  const linked = profile.linkedAccounts as Record<string, unknown> | undefined;
  if (linked?.twitter || linked?.google) return true;

  // Telegram: channel membership flag or userId presence
  if (profile.isTelegramMember === true) return true;
  if (typeof profile.telegramUserId === 'string' && profile.telegramUserId.length > 0) return true;

  return false;
}

/**
 * Returns a Map of identityId -> twitterHandle for the given identityIds.
 * Only includes entries where twitterHandle is a non-empty string.
 */
export async function getTwitterHandlesBatch(identityIds: string[]): Promise<Map<string, string>> {
  if (identityIds.length === 0) return new Map();

  const ddb = getDdbClient();
  const result = new Map<string, string>();

  for (let i = 0; i < identityIds.length; i += BATCH_GET_LIMIT) {
    const chunk = identityIds.slice(i, i + BATCH_GET_LIMIT);
    let pendingKeys: Array<Record<string, unknown>> = chunk.map((id) => ({ identityId: id }));

    for (let attempt = 0; pendingKeys.length > 0; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
      }
      if (attempt > BATCH_GET_MAX_RETRIES) break;

      const response = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [USER_PROFILES_TABLE]: {
            Keys: pendingKeys,
            ProjectionExpression: 'identityId, twitterHandle',
          },
        },
      }));

      const items = response.Responses?.[USER_PROFILES_TABLE] ?? [];
      for (const item of items) {
        if (typeof item.identityId === 'string' && typeof item.twitterHandle === 'string' && item.twitterHandle.length > 0) {
          result.set(item.identityId, item.twitterHandle);
        }
      }

      pendingKeys = (response.UnprocessedKeys?.[USER_PROFILES_TABLE]?.Keys ?? []) as Array<Record<string, unknown>>;
    }
  }

  return result;
}

/**
 * Check if two addresses belong to the same identity (wash-trading check).
 * O(1) via the pair set.
 */
export function isSameIdentityPair(
  addrA: string,
  addrB: string,
  pairs: Set<string>,
): boolean {
  const a = addrA.toLowerCase();
  const b = addrB.toLowerCase();
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  return pairs.has(key);
}
