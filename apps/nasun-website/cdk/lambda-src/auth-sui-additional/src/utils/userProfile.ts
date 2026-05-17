import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { addrEq } from './sui';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';

export const MAX_ADDITIONAL_ADDRESSES = 5;
const APP_ID_REGEX = /^[a-z][a-z0-9-]{0,31}$/;

export interface AdditionalAddressEntry {
  walletAddress: string;
  verifiedAt: number;
  label?: string;
}

/**
 * Mirrors `linkedAccounts.solana`. `manualEntry === true` flags the legacy
 * paste-linked Sui address that still lives at root `linkedSuiAddress`
 * (planned for removal in a follow-up cleanup PR). The verified flow only
 * writes `manualEntry: false`.
 */
export interface SuiLinkedAccount {
  identityId?: string;
  username?: string;
  linkedAt?: string;
  walletAddress?: string;
  manualEntry?: boolean;
  verifiedAt?: number;
  additionalAddresses?: AdditionalAddressEntry[];
  appBindings?: Record<string, string>;
}

export interface UserProfile {
  identityId: string;
  linkedAccounts?: Record<string, SuiLinkedAccount | Record<string, unknown> | undefined>;
  linkedSuiAddress?: string | null;
  [key: string]: unknown;
}

export async function getProfile(identityId: string): Promise<UserProfile | null> {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName, Key: { identityId } })
  );
  return (result.Item as UserProfile | undefined) ?? null;
}

export function getSuiLink(profile: UserProfile | null): SuiLinkedAccount | null {
  const linked = profile?.linkedAccounts ?? {};
  const sui = linked.sui as SuiLinkedAccount | undefined;
  return sui ?? null;
}

/**
 * Verified address set (primary + additionalAddresses) for membership
 * checks. Returns null when there is no verified primary Sui link
 * (manualEntry=true counts as unverified).
 */
export function collectVerifiedAddresses(sui: SuiLinkedAccount | null): Set<string> | null {
  if (!sui) return null;
  if (sui.manualEntry === true) return null;
  if (!sui.walletAddress) return null;

  const set = new Set<string>([sui.walletAddress.toLowerCase()]);
  for (const entry of sui.additionalAddresses ?? []) {
    if (entry?.walletAddress) set.add(entry.walletAddress.toLowerCase());
  }
  return set;
}

export function isAppIdValid(appId: string): boolean {
  return typeof appId === 'string' && APP_ID_REGEX.test(appId);
}

/**
 * Cross-account uniqueness scan: ensure no OTHER identity already has
 * `address` as primary Sui link or in additionalAddresses[].
 *
 * Scope note: legacy paste-only addresses at root `linkedSuiAddress` are
 * intentionally NOT considered (paste does not prove ownership; including
 * them would let an attacker block the real owner from verifying).
 *
 * COST NOTE: full-table scan with server-side filter. `linkedAccounts.sui`
 * is a brand new field so the filter is cheap. Long-term migration mirrors
 * the planned SolAddressOwnership table (single GetItem instead of scan).
 */
export async function findOtherOwnerOfAddress(
  address: string,
  selfIdentityId: string,
): Promise<string | null> {
  const normalized = address.toLowerCase();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression:
          'linkedAccounts.sui.walletAddress = :addr OR attribute_exists(linkedAccounts.sui.additionalAddresses)',
        ExpressionAttributeValues: { ':addr': normalized },
        ProjectionExpression:
          'identityId, linkedAccounts.sui.walletAddress, linkedAccounts.sui.additionalAddresses',
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    for (const item of result.Items ?? []) {
      const candidateId = item.identityId as string | undefined;
      if (!candidateId || candidateId === selfIdentityId) continue;

      const sui = (item.linkedAccounts as Record<string, SuiLinkedAccount> | undefined)?.sui;
      if (!sui) continue;

      if (addrEq(sui.walletAddress, normalized)) return candidateId;
      for (const entry of sui.additionalAddresses ?? []) {
        if (addrEq(entry?.walletAddress, normalized)) return candidateId;
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return null;
}

/**
 * Initialize a verified primary Sui link or append to additionalAddresses.
 *
 * Sui treats the FIRST verify as primary -- legacy paste linkedSuiAddress
 * values are NOT promoted automatically (different security guarantees).
 * Cap applies only to additionalAddresses (primary is its own slot).
 */
export async function appendVerifiedAddress(
  identityId: string,
  entry: AdditionalAddressEntry,
  appId?: string,
): Promise<{
  primary: boolean;
  walletAddress: string;
  additionalAddresses: AdditionalAddressEntry[];
  appBindings: Record<string, string>;
}> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

  const sui = getSuiLink(profile);

  // Case A: no verified primary yet -- set this entry as primary.
  if (!sui || !sui.walletAddress || sui.manualEntry === true) {
    const nextSui: SuiLinkedAccount = {
      walletAddress: entry.walletAddress,
      verifiedAt: entry.verifiedAt,
      manualEntry: false,
      additionalAddresses: [],
      appBindings: appId ? { [appId]: entry.walletAddress } : {},
    };

    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { identityId },
        UpdateExpression: 'SET linkedAccounts.sui = :s, updatedAt = :u',
        ConditionExpression:
          'attribute_not_exists(linkedAccounts.sui) OR ' +
          'attribute_not_exists(linkedAccounts.sui.walletAddress) OR ' +
          'linkedAccounts.sui.manualEntry = :true',
        ExpressionAttributeValues: {
          ':s': nextSui,
          ':u': new Date().toISOString(),
          ':true': true,
        },
      }),
    );

    return {
      primary: true,
      walletAddress: entry.walletAddress,
      additionalAddresses: [],
      appBindings: nextSui.appBindings ?? {},
    };
  }

  // Case B: primary exists -- append to additionalAddresses.
  const existing = sui.additionalAddresses ?? [];

  if (addrEq(sui.walletAddress, entry.walletAddress)) {
    throw Object.assign(new Error('address already verified'), { statusCode: 400 });
  }
  if (existing.some((e) => addrEq(e.walletAddress, entry.walletAddress))) {
    throw Object.assign(new Error('address already verified'), { statusCode: 400 });
  }
  if (existing.length >= MAX_ADDITIONAL_ADDRESSES) {
    throw Object.assign(new Error('address cap reached'), { statusCode: 400 });
  }

  const nextAdditional = [...existing, entry];
  const nextBindings: Record<string, string> = { ...(sui.appBindings ?? {}) };
  if (appId) {
    nextBindings[appId] = entry.walletAddress;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression:
        'SET linkedAccounts.sui.additionalAddresses = :a, ' +
        'linkedAccounts.sui.appBindings = :b, ' +
        'updatedAt = :u',
      ConditionExpression:
        'attribute_exists(linkedAccounts.sui.walletAddress) AND ' +
        '(attribute_not_exists(linkedAccounts.sui.additionalAddresses) OR ' +
        ' size(linkedAccounts.sui.additionalAddresses) = :prev)',
      ExpressionAttributeValues: {
        ':a': nextAdditional,
        ':b': nextBindings,
        ':u': new Date().toISOString(),
        ':prev': existing.length,
      },
    })
  );

  return {
    primary: false,
    walletAddress: entry.walletAddress,
    additionalAddresses: nextAdditional,
    appBindings: nextBindings,
  };
}

export async function setAppBinding(
  identityId: string,
  appId: string,
  walletAddress: string,
): Promise<void> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  const sui = getSuiLink(profile);
  if (!sui || !sui.walletAddress) {
    throw Object.assign(new Error('primary sui required'), { statusCode: 400 });
  }
  const prevBindings = sui.appBindings ?? {};
  const nextBindings: Record<string, string> = { ...prevBindings, [appId]: walletAddress };

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression: 'SET linkedAccounts.sui.appBindings = :b, updatedAt = :u',
      ConditionExpression:
        'attribute_exists(linkedAccounts.sui.walletAddress) AND ' +
        '(attribute_not_exists(linkedAccounts.sui.appBindings) OR ' +
        ' linkedAccounts.sui.appBindings = :prev)',
      ExpressionAttributeValues: {
        ':b': nextBindings,
        ':prev': prevBindings,
        ':u': new Date().toISOString(),
      },
    })
  );
}

export async function removeAppBinding(identityId: string, appId: string): Promise<void> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  const sui = getSuiLink(profile);
  if (!sui) {
    throw Object.assign(new Error('no sui link'), { statusCode: 400 });
  }
  const prevBindings = sui.appBindings ?? {};
  if (!(appId in prevBindings)) return; // idempotent no-op
  const nextBindings: Record<string, string> = { ...prevBindings };
  delete nextBindings[appId];

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression: 'SET linkedAccounts.sui.appBindings = :b, updatedAt = :u',
      ConditionExpression: 'linkedAccounts.sui.appBindings = :prev',
      ExpressionAttributeValues: {
        ':b': nextBindings,
        ':prev': prevBindings,
        ':u': new Date().toISOString(),
      },
    })
  );
}

export const MAX_LABEL_LENGTH = 32;

export function sanitizeLabel(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > MAX_LABEL_LENGTH) return undefined;
  return cleaned;
}

export async function setAdditionalAddressLabel(
  identityId: string,
  walletAddress: string,
  label: string | null,
): Promise<{ additionalAddresses: AdditionalAddressEntry[] }> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  const sui = getSuiLink(profile);
  if (!sui) throw Object.assign(new Error('no sui link'), { statusCode: 400 });

  if (addrEq(sui.walletAddress, walletAddress)) {
    throw Object.assign(new Error('cannot label primary address'), { statusCode: 400 });
  }

  const existing = sui.additionalAddresses ?? [];
  const idx = existing.findIndex((e) => addrEq(e.walletAddress, walletAddress));
  if (idx === -1) {
    throw Object.assign(new Error('address not found in additional set'), { statusCode: 404 });
  }

  const nextEntry: AdditionalAddressEntry = { ...existing[idx] };
  if (label === null) {
    delete nextEntry.label;
  } else {
    nextEntry.label = label;
  }
  const nextAdditional = [...existing];
  nextAdditional[idx] = nextEntry;

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression: 'SET linkedAccounts.sui.additionalAddresses = :a, updatedAt = :u',
      ConditionExpression: 'size(linkedAccounts.sui.additionalAddresses) = :prev',
      ExpressionAttributeValues: {
        ':a': nextAdditional,
        ':u': new Date().toISOString(),
        ':prev': existing.length,
      },
    })
  );

  return { additionalAddresses: nextAdditional };
}

export async function removeAdditionalAddress(
  identityId: string,
  walletAddress: string,
): Promise<{ clearedBindings: string[] }> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  const sui = getSuiLink(profile);
  if (!sui) {
    throw Object.assign(new Error('no sui link'), { statusCode: 400 });
  }
  if (addrEq(sui.walletAddress, walletAddress)) {
    throw Object.assign(new Error('cannot remove primary; use disconnect flow'), { statusCode: 400 });
  }

  const existing = sui.additionalAddresses ?? [];
  const nextAdditional = existing.filter((e) => !addrEq(e.walletAddress, walletAddress));
  if (nextAdditional.length === existing.length) {
    throw Object.assign(new Error('address not found in additional set'), { statusCode: 404 });
  }

  const bindings = sui.appBindings ?? {};
  const clearedBindings: string[] = [];
  const nextBindings: Record<string, string> = {};
  for (const [k, v] of Object.entries(bindings)) {
    if (addrEq(v, walletAddress)) {
      clearedBindings.push(k);
    } else {
      nextBindings[k] = v;
    }
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression:
        'SET linkedAccounts.sui.additionalAddresses = :a, ' +
        'linkedAccounts.sui.appBindings = :b, ' +
        'updatedAt = :u',
      ConditionExpression: 'size(linkedAccounts.sui.additionalAddresses) = :prev',
      ExpressionAttributeValues: {
        ':a': nextAdditional,
        ':b': nextBindings,
        ':u': new Date().toISOString(),
        ':prev': existing.length,
      },
    })
  );

  return { clearedBindings };
}
