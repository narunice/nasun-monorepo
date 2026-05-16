import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { addrEq } from './solana';

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
 * Shape mirrors EVM `MetaMaskLinkedAccount` but lives under
 * `linkedAccounts.solana`. `manualEntry === true` flags legacy paste-linked
 * addresses (currently stored at root `linkedSolanaAddress`); the verified
 * flow only writes `manualEntry: false` (or omits the flag entirely).
 */
export interface SolanaLinkedAccount {
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
  linkedAccounts?: Record<string, SolanaLinkedAccount | Record<string, unknown> | undefined>;
  linkedSolanaAddress?: string | null;
  [key: string]: unknown;
}

export async function getProfile(identityId: string): Promise<UserProfile | null> {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName, Key: { identityId } })
  );
  return (result.Item as UserProfile | undefined) ?? null;
}

export function getSolanaLink(profile: UserProfile | null): SolanaLinkedAccount | null {
  const linked = profile?.linkedAccounts ?? {};
  const sol = linked.solana as SolanaLinkedAccount | undefined;
  return sol ?? null;
}

/**
 * Verified address set (primary + additionalAddresses) for membership
 * checks. Returns null when there is no verified primary Solana link
 * (manualEntry=true counts as unverified).
 */
export function collectVerifiedAddresses(sol: SolanaLinkedAccount | null): Set<string> | null {
  if (!sol) return null;
  if (sol.manualEntry === true) return null;
  if (!sol.walletAddress) return null;

  // Base58 is case-sensitive — store and compare as-is.
  const set = new Set<string>([sol.walletAddress]);
  for (const entry of sol.additionalAddresses ?? []) {
    if (entry?.walletAddress) set.add(entry.walletAddress);
  }
  return set;
}

export function isAppIdValid(appId: string): boolean {
  return typeof appId === 'string' && APP_ID_REGEX.test(appId);
}

/**
 * Cross-account uniqueness scan: ensure no OTHER identity already has
 * `address` as primary Solana link or in additionalAddresses[]. Returns
 * the conflicting identityId if found, otherwise null.
 *
 * Scope note: legacy paste-only addresses live at root `linkedSolanaAddress`
 * (not under `linkedAccounts.solana`). Those are intentionally NOT considered
 * for the uniqueness check here — paste-link does not prove ownership and is
 * planned for retirement (handoff v2). Including them would let an attacker
 * who pasted a target address block the real owner from later verifying.
 *
 * COST NOTE: full-table scan with server-side filter. Today
 * `linkedAccounts.solana` exists on ~0 profiles so the filter is cheap.
 * Migration path: SolAddressOwnership table keyed by walletAddress with a
 * conditional PutItem on verify — then this scan becomes a single GetItem.
 */
export async function findOtherOwnerOfAddress(
  address: string,
  selfIdentityId: string,
): Promise<string | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression:
        'linkedAccounts.solana.walletAddress = :addr OR attribute_exists(linkedAccounts.solana.additionalAddresses)',
      ExpressionAttributeValues: { ':addr': address },
      ProjectionExpression: 'identityId, linkedAccounts.solana.walletAddress, linkedAccounts.solana.additionalAddresses',
    })
  );

  for (const item of result.Items ?? []) {
    const candidateId = item.identityId as string | undefined;
    if (!candidateId || candidateId === selfIdentityId) continue;

    const sol = (item.linkedAccounts as Record<string, SolanaLinkedAccount> | undefined)?.solana;
    if (!sol) continue;

    if (addrEq(sol.walletAddress, address)) return candidateId;
    for (const entry of sol.additionalAddresses ?? []) {
      if (addrEq(entry?.walletAddress, address)) return candidateId;
    }
  }
  return null;
}

/**
 * Initialize a verified primary Solana link or append to additionalAddresses.
 *
 * Unlike the EVM flow (which requires a primary metamask link to exist before
 * adding extras), the Solana flow uses the FIRST verify as the primary —
 * legacy `linkedSolanaAddress` paste-links are NOT promoted automatically.
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

  const sol = getSolanaLink(profile);

  // Case A: no verified primary yet — set this entry as primary.
  if (!sol || !sol.walletAddress || sol.manualEntry === true) {
    const nextSolana: SolanaLinkedAccount = {
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
        UpdateExpression:
          'SET linkedAccounts.solana = :s, updatedAt = :u',
        // Optimistic guard: primary slot must still be empty/unverified.
        // attribute_not_exists handles the "no linkedAccounts.solana yet"
        // case; attribute_not_exists on the nested walletAddress handles
        // the "object exists but walletAddress unset" race.
        ConditionExpression:
          'attribute_not_exists(linkedAccounts.solana) OR ' +
          'attribute_not_exists(linkedAccounts.solana.walletAddress) OR ' +
          'linkedAccounts.solana.manualEntry = :true',
        ExpressionAttributeValues: {
          ':s': nextSolana,
          ':u': new Date().toISOString(),
          ':true': true,
        },
      }),
    );

    return {
      primary: true,
      walletAddress: entry.walletAddress,
      additionalAddresses: [],
      appBindings: nextSolana.appBindings ?? {},
    };
  }

  // Case B: primary exists — append to additionalAddresses.
  const existing = sol.additionalAddresses ?? [];

  if (addrEq(sol.walletAddress, entry.walletAddress)) {
    throw Object.assign(new Error('address already verified'), { statusCode: 400 });
  }
  if (existing.some((e) => addrEq(e.walletAddress, entry.walletAddress))) {
    throw Object.assign(new Error('address already verified'), { statusCode: 400 });
  }
  if (existing.length >= MAX_ADDITIONAL_ADDRESSES) {
    throw Object.assign(new Error('address cap reached'), { statusCode: 400 });
  }

  const nextAdditional = [...existing, entry];
  const nextBindings: Record<string, string> = { ...(sol.appBindings ?? {}) };
  if (appId) {
    nextBindings[appId] = entry.walletAddress;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression:
        'SET linkedAccounts.solana.additionalAddresses = :a, ' +
        'linkedAccounts.solana.appBindings = :b, ' +
        'updatedAt = :u',
      ConditionExpression:
        'attribute_exists(linkedAccounts.solana.walletAddress) AND ' +
        '(attribute_not_exists(linkedAccounts.solana.additionalAddresses) OR ' +
        ' size(linkedAccounts.solana.additionalAddresses) = :prev)',
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
  const sol = getSolanaLink(profile);
  if (!sol || !sol.walletAddress) {
    throw Object.assign(new Error('primary solana required'), { statusCode: 400 });
  }
  const prevBindings = sol.appBindings ?? {};
  const nextBindings: Record<string, string> = { ...prevBindings, [appId]: walletAddress };

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression: 'SET linkedAccounts.solana.appBindings = :b, updatedAt = :u',
      ConditionExpression:
        'attribute_exists(linkedAccounts.solana.walletAddress) AND ' +
        '(attribute_not_exists(linkedAccounts.solana.appBindings) OR ' +
        ' linkedAccounts.solana.appBindings = :prev)',
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
  const sol = getSolanaLink(profile);
  if (!sol) {
    throw Object.assign(new Error('no solana link'), { statusCode: 400 });
  }
  const prevBindings = sol.appBindings ?? {};
  if (!(appId in prevBindings)) return; // idempotent no-op
  const nextBindings: Record<string, string> = { ...prevBindings };
  delete nextBindings[appId];

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression: 'SET linkedAccounts.solana.appBindings = :b, updatedAt = :u',
      ConditionExpression: 'linkedAccounts.solana.appBindings = :prev',
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
  const cleaned = raw.replace(/[ -]/g, '').trim();
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
  const sol = getSolanaLink(profile);
  if (!sol) throw Object.assign(new Error('no solana link'), { statusCode: 400 });

  if (addrEq(sol.walletAddress, walletAddress)) {
    throw Object.assign(new Error('cannot label primary address'), { statusCode: 400 });
  }

  const existing = sol.additionalAddresses ?? [];
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
      UpdateExpression: 'SET linkedAccounts.solana.additionalAddresses = :a, updatedAt = :u',
      ConditionExpression: 'size(linkedAccounts.solana.additionalAddresses) = :prev',
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
  const sol = getSolanaLink(profile);
  if (!sol) {
    throw Object.assign(new Error('no solana link'), { statusCode: 400 });
  }
  if (addrEq(sol.walletAddress, walletAddress)) {
    throw Object.assign(new Error('cannot remove primary; use disconnect flow'), { statusCode: 400 });
  }

  const existing = sol.additionalAddresses ?? [];
  const nextAdditional = existing.filter((e) => !addrEq(e.walletAddress, walletAddress));
  if (nextAdditional.length === existing.length) {
    throw Object.assign(new Error('address not found in additional set'), { statusCode: 404 });
  }

  const bindings = sol.appBindings ?? {};
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
        'SET linkedAccounts.solana.additionalAddresses = :a, ' +
        'linkedAccounts.solana.appBindings = :b, ' +
        'updatedAt = :u',
      ConditionExpression: 'size(linkedAccounts.solana.additionalAddresses) = :prev',
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
