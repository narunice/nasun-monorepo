import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { addrEq } from './ethereum';

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

export interface MetaMaskLinkedAccount {
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
  linkedAccounts?: Record<string, MetaMaskLinkedAccount | Record<string, unknown> | undefined>;
  walletAddress?: string;
  [key: string]: unknown;
}

export async function getProfile(identityId: string): Promise<UserProfile | null> {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName, Key: { identityId } })
  );
  return (result.Item as UserProfile | undefined) ?? null;
}

export function getMetaMaskLink(profile: UserProfile | null): MetaMaskLinkedAccount | null {
  const linked = profile?.linkedAccounts ?? {};
  const meta = linked.metamask as MetaMaskLinkedAccount | undefined;
  return meta ?? null;
}

/**
 * Build the verified address set (primary + additionalAddresses) in
 * lowercase form for membership checks. Returns null if there is no
 * verified primary metamask link (manualEntry=true counts as unverified).
 */
export function collectVerifiedAddresses(meta: MetaMaskLinkedAccount | null): Set<string> | null {
  if (!meta) return null;
  if (meta.manualEntry === true) return null;
  if (!meta.walletAddress) return null;

  const set = new Set<string>([meta.walletAddress.toLowerCase()]);
  for (const entry of meta.additionalAddresses ?? []) {
    if (entry?.walletAddress) set.add(entry.walletAddress.toLowerCase());
  }
  return set;
}

export function isAppIdValid(appId: string): boolean {
  return typeof appId === 'string' && APP_ID_REGEX.test(appId);
}

/**
 * Cross-account uniqueness scan: ensure no OTHER identity already has
 * `address` as primary metamask or in additionalAddresses[]. Returns the
 * conflicting identityId if found, otherwise null.
 *
 * COST NOTE: this performs a full table scan filtered server-side. Today
 * `additionalAddresses` exists on 0 profiles so the filter is cheap.
 * Migration path when adoption grows: introduce a flat
 * `EvmAddressOwnership` table keyed by walletAddress with a conditional
 * PutItem on verify; then this scan can be replaced by a single GetItem.
 */
export async function findOtherOwnerOfAddress(
  address: string,
  selfIdentityId: string
): Promise<string | null> {
  const lower = address.toLowerCase();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        // Filter at the server: primary match OR `additionalAddresses` present.
        // We cannot deeply filter on list-of-map elements server-side, so we
        // pull candidates and check in JS.
        FilterExpression:
          'linkedAccounts.metamask.walletAddress = :addr OR attribute_exists(linkedAccounts.metamask.additionalAddresses)',
        ExpressionAttributeValues: { ':addr': lower },
        ProjectionExpression: 'identityId, linkedAccounts.metamask.walletAddress, linkedAccounts.metamask.additionalAddresses',
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    for (const item of result.Items ?? []) {
      const candidateId = item.identityId as string | undefined;
      if (!candidateId || candidateId === selfIdentityId) continue;

      const meta = (item.linkedAccounts as Record<string, MetaMaskLinkedAccount> | undefined)?.metamask;
      if (!meta) continue;

      if (addrEq(meta.walletAddress, lower)) return candidateId;
      for (const entry of meta.additionalAddresses ?? []) {
        if (addrEq(entry?.walletAddress, lower)) return candidateId;
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return null;
}

/**
 * Append a verified additional address to the user's metamask map.
 *
 * Conditional update enforces (at write time) that:
 *   - The metamask link still exists.
 *   - additionalAddresses (when present) has fewer than MAX entries.
 *
 * If `appId` is non-empty, the binding is set in the same write so the
 * caller sees a consistent state.
 */
export async function appendAdditionalAddress(
  identityId: string,
  entry: AdditionalAddressEntry,
  appId?: string
): Promise<{ additionalAddresses: AdditionalAddressEntry[]; appBindings: Record<string, string> }> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  const meta = getMetaMaskLink(profile);
  if (!meta || !meta.walletAddress) {
    throw Object.assign(new Error('primary metamask required'), { statusCode: 400 });
  }
  const existing = meta.additionalAddresses ?? [];

  // Duplicate guard (primary or another additional). Mirrors challenge-time
  // check; repeated here because the table state may have changed.
  if (addrEq(meta.walletAddress, entry.walletAddress)) {
    throw Object.assign(new Error('address already verified'), { statusCode: 400 });
  }
  if (existing.some((e) => addrEq(e.walletAddress, entry.walletAddress))) {
    throw Object.assign(new Error('address already verified'), { statusCode: 400 });
  }
  if (existing.length >= MAX_ADDITIONAL_ADDRESSES) {
    throw Object.assign(new Error('address cap reached'), { statusCode: 400 });
  }

  const nextAdditional = [...existing, entry];
  const nextBindings: Record<string, string> = { ...(meta.appBindings ?? {}) };
  if (appId) {
    nextBindings[appId] = entry.walletAddress;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression:
        'SET linkedAccounts.metamask.additionalAddresses = :a, ' +
        'linkedAccounts.metamask.appBindings = :b, ' +
        'updatedAt = :u',
      // Optimistic-lock on the existing additionalAddresses length so we
      // do not exceed the cap under concurrent verify requests.
      ConditionExpression:
        'attribute_exists(linkedAccounts.metamask.walletAddress) AND ' +
        '(attribute_not_exists(linkedAccounts.metamask.additionalAddresses) OR ' +
        ' size(linkedAccounts.metamask.additionalAddresses) = :prev)',
      ExpressionAttributeValues: {
        ':a': nextAdditional,
        ':b': nextBindings,
        ':u': new Date().toISOString(),
        ':prev': existing.length,
      },
    })
  );

  return { additionalAddresses: nextAdditional, appBindings: nextBindings };
}

/**
 * Set `appBindings[appId] = walletAddress` on the metamask map.
 *
 * Implementation note: DynamoDB UpdateExpression cannot atomically create
 * a parent map and set a child key in one shot. We do read-modify-write
 * with an optimistic lock on the current bindings snapshot to keep
 * concurrent PATCHes consistent.
 *
 * The caller MUST validate `appId` against APP_ID_REGEX (or via
 * isAppIdValid) before invoking — the value flows into an
 * ExpressionAttributeNames slot but the key itself ends up in DynamoDB.
 */
export async function setAppBinding(
  identityId: string,
  appId: string,
  walletAddress: string
): Promise<void> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  const meta = getMetaMaskLink(profile);
  if (!meta || !meta.walletAddress) {
    throw Object.assign(new Error('primary metamask required'), { statusCode: 400 });
  }
  const prevBindings = meta.appBindings ?? {};
  const nextBindings: Record<string, string> = { ...prevBindings, [appId]: walletAddress };

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression: 'SET linkedAccounts.metamask.appBindings = :b, updatedAt = :u',
      ConditionExpression:
        'attribute_exists(linkedAccounts.metamask.walletAddress) AND ' +
        '(attribute_not_exists(linkedAccounts.metamask.appBindings) OR ' +
        ' linkedAccounts.metamask.appBindings = :prev)',
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
  const meta = getMetaMaskLink(profile);
  if (!meta) {
    throw Object.assign(new Error('no metamask link'), { statusCode: 400 });
  }
  const prevBindings = meta.appBindings ?? {};
  if (!(appId in prevBindings)) return; // idempotent no-op
  const nextBindings: Record<string, string> = { ...prevBindings };
  delete nextBindings[appId];

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression: 'SET linkedAccounts.metamask.appBindings = :b, updatedAt = :u',
      ConditionExpression: 'linkedAccounts.metamask.appBindings = :prev',
      ExpressionAttributeValues: {
        ':b': nextBindings,
        ':prev': prevBindings,
        ':u': new Date().toISOString(),
      },
    })
  );
}

export const MAX_LABEL_LENGTH = 32;

/**
 * Sanitize a user-supplied label string. Returns `null` if the label is
 * empty/null (caller should remove the field). Trims whitespace, strips
 * control characters, and enforces MAX_LABEL_LENGTH. Returns `undefined`
 * if the input is structurally invalid (caller should 400).
 */
export function sanitizeLabel(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return undefined;
  // Strip ASCII control chars (0x00-0x1F, 0x7F). Allow regular unicode
  // text so users can label in their native script. Trim outer space.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > MAX_LABEL_LENGTH) return undefined;
  return cleaned;
}

/**
 * Set or clear the label on an `additionalAddresses[]` entry. Returns
 * the updated array so the caller can echo state to the client.
 *
 * Read-modify-write with an optimistic lock on the previous array
 * snapshot — protects against concurrent verify/remove operations.
 */
export async function setAdditionalAddressLabel(
  identityId: string,
  walletAddress: string,
  label: string | null,
): Promise<{ additionalAddresses: AdditionalAddressEntry[] }> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  const meta = getMetaMaskLink(profile);
  if (!meta) throw Object.assign(new Error('no metamask link'), { statusCode: 400 });

  // Primary address has no label slot in the schema — the UI never
  // surfaces an edit affordance for it. Reject server-side too.
  if (addrEq(meta.walletAddress, walletAddress)) {
    throw Object.assign(new Error('cannot label primary address'), { statusCode: 400 });
  }

  const existing = meta.additionalAddresses ?? [];
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
      UpdateExpression: 'SET linkedAccounts.metamask.additionalAddresses = :a, updatedAt = :u',
      ConditionExpression: 'size(linkedAccounts.metamask.additionalAddresses) = :prev',
      ExpressionAttributeValues: {
        ':a': nextAdditional,
        ':u': new Date().toISOString(),
        ':prev': existing.length,
      },
    })
  );

  return { additionalAddresses: nextAdditional };
}

/**
 * Remove an additional address from the profile. Also clears any
 * appBindings entries that pointed to the removed address (orphan
 * prevention). Returns the cleared binding keys for the response.
 */
export async function removeAdditionalAddress(
  identityId: string,
  walletAddress: string
): Promise<{ clearedBindings: string[] }> {
  const profile = await getProfile(identityId);
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  const meta = getMetaMaskLink(profile);
  if (!meta) {
    throw Object.assign(new Error('no metamask link'), { statusCode: 400 });
  }
  if (addrEq(meta.walletAddress, walletAddress)) {
    throw Object.assign(new Error('cannot remove primary; use disconnect flow'), { statusCode: 400 });
  }

  const existing = meta.additionalAddresses ?? [];
  const nextAdditional = existing.filter((e) => !addrEq(e.walletAddress, walletAddress));
  if (nextAdditional.length === existing.length) {
    throw Object.assign(new Error('address not found in additional set'), { statusCode: 404 });
  }

  const bindings = meta.appBindings ?? {};
  const clearedBindings: string[] = [];
  const nextBindings: Record<string, string> = {};
  for (const [k, v] of Object.entries(bindings)) {
    if (addrEq(v, walletAddress)) {
      clearedBindings.push(k);
    } else {
      nextBindings[k] = v;
    }
  }

  // Optimistic lock on the additionalAddresses length to avoid clobbering
  // concurrent verify-driven appends.
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { identityId },
      UpdateExpression:
        'SET linkedAccounts.metamask.additionalAddresses = :a, ' +
        'linkedAccounts.metamask.appBindings = :b, ' +
        'updatedAt = :u',
      ConditionExpression: 'size(linkedAccounts.metamask.additionalAddresses) = :prev',
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
