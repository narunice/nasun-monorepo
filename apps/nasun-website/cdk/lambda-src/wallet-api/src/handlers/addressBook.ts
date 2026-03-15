import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const ADDRESS_KEY_REGEX = /^0x[a-f0-9]{1,64}$/;
const WALLET_ADDRESS_REGEX = /^0x[a-f0-9]{64}$/;
const MAX_ENTRIES = 200;
const MAX_LABEL_LENGTH = 100;
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB
const NONCE_TTL_SECONDS = 300; // 5 minutes
const NONCE_PK_PREFIX = 'abNonce:';

function getTableName(): string {
  const tableName = process.env.ADDRESS_BOOKS_TABLE;
  if (!tableName) throw new Error('ADDRESS_BOOKS_TABLE environment variable not set');
  return tableName;
}

interface AddressBookEntry {
  address: string;
  label?: string;
  labelUpdatedAt: number;
  firstTransactionAt: number;
  lastTransactionAt: number;
  transactionCount: number;
  isTrusted: boolean;
  trustedUpdatedAt: number;
  deletedAt?: number;
}

interface AddressBookData {
  entries: Record<string, AddressBookEntry>;
  updatedAt: number;
}

/**
 * Sanitize an entry to only include whitelisted fields, stripping control characters from label.
 */
function sanitizeEntry(key: string, raw: Record<string, unknown>): AddressBookEntry | null {
  if (!ADDRESS_KEY_REGEX.test(key)) return null;

  const address = typeof raw.address === 'string' ? raw.address : key;
  let label = typeof raw.label === 'string' ? raw.label : undefined;

  if (label) {
    // Strip control characters (U+0000-U+001F) and trim
    label = label.replace(/[\x00-\x1f]/g, '').trim().slice(0, MAX_LABEL_LENGTH);
    if (label.length === 0) label = undefined;
  }

  return {
    address,
    label,
    labelUpdatedAt: typeof raw.labelUpdatedAt === 'number' ? raw.labelUpdatedAt : 0,
    firstTransactionAt: typeof raw.firstTransactionAt === 'number' ? raw.firstTransactionAt : 0,
    lastTransactionAt: typeof raw.lastTransactionAt === 'number' ? raw.lastTransactionAt : 0,
    transactionCount: typeof raw.transactionCount === 'number' ? Math.max(0, Math.floor(raw.transactionCount)) : 0,
    isTrusted: typeof raw.isTrusted === 'boolean' ? raw.isTrusted : false,
    trustedUpdatedAt: typeof raw.trustedUpdatedAt === 'number' ? raw.trustedUpdatedAt : 0,
    deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : undefined,
  };
}

// ---- Address Book CRUD (AddressBooks table, PK: walletAddress, SK: "DATA") ----

export async function getAddressBook(walletAddress: string): Promise<{ addressBook: AddressBookData | null; version: number }> {
  const result = await docClient.send(new GetCommand({
    TableName: getTableName(),
    Key: { walletAddress, recordType: 'DATA' },
    ProjectionExpression: 'addressBook, addressBookVersion',
  }));

  return {
    addressBook: result.Item?.addressBook ?? null,
    version: result.Item?.addressBookVersion ?? 0,
  };
}

export async function saveAddressBook(
  walletAddress: string,
  data: { entries: Record<string, any>; updatedAt?: number },
  expectedVersion: number,
): Promise<{ success: boolean; conflict: boolean }> {
  // Validate payload size
  const payloadStr = JSON.stringify(data);
  if (payloadStr.length > MAX_PAYLOAD_BYTES) {
    throw new PayloadTooLargeError('Address book payload exceeds 50KB limit');
  }

  // Validate and sanitize entries
  const rawEntries = data.entries;
  if (!rawEntries || typeof rawEntries !== 'object') {
    throw new ValidationError('entries must be an object');
  }

  const keys = Object.keys(rawEntries);
  if (keys.length > MAX_ENTRIES) {
    throw new ValidationError(`Too many entries: ${keys.length} (max ${MAX_ENTRIES})`);
  }

  const sanitizedEntries: Record<string, AddressBookEntry> = {};
  for (const key of keys) {
    const entry = sanitizeEntry(key, rawEntries[key]);
    if (!entry) {
      throw new ValidationError(`Invalid address key: ${key}`);
    }
    sanitizedEntries[key] = entry;
  }

  const sanitizedData: AddressBookData = {
    entries: sanitizedEntries,
    updatedAt: data.updatedAt ?? Date.now(),
  };

  try {
    await docClient.send(new UpdateCommand({
      TableName: getTableName(),
      Key: { walletAddress, recordType: 'DATA' },
      UpdateExpression: 'SET addressBook = :ab, addressBookVersion = if_not_exists(addressBookVersion, :zero) + :one',
      ConditionExpression: 'attribute_not_exists(addressBookVersion) OR addressBookVersion = :expected',
      ExpressionAttributeValues: {
        ':ab': sanitizedData,
        ':expected': expectedVersion,
        ':zero': 0,
        ':one': 1,
      },
    }));

    return { success: true, conflict: false };
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return { success: false, conflict: true };
    }
    throw error;
  }
}

// ---- Challenge/Verify (nonce stored in AddressBooks table, PK: "abNonce:{nonce}", SK: "NONCE") ----

export interface ChallengeResult {
  nonce: string;
  message: string;
}

/**
 * Create a challenge nonce for address book auth.
 * Stores nonce + walletAddress binding in DynamoDB with TTL.
 */
export async function createChallenge(walletAddress: string): Promise<ChallengeResult> {
  if (!WALLET_ADDRESS_REGEX.test(walletAddress)) {
    throw new ValidationError('Invalid wallet address format');
  }

  const nonce = randomBytes(32).toString('hex');

  const message = [
    'Nasun Address Book Auth',
    '',
    'This signature proves wallet ownership for address book sync.',
    'No funds will be transferred.',
    '',
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
  ].join('\n');

  const expiresAt = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;

  await docClient.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      walletAddress: `${NONCE_PK_PREFIX}${nonce}`,
      recordType: 'NONCE',
      nonce,
      boundWalletAddress: walletAddress,
      message,
      expiresAt,
    },
  }));

  return { nonce, message };
}

export interface NonceData {
  nonce: string;
  boundWalletAddress: string;
  message: string;
  expiresAt: number;
}

/**
 * Atomically retrieve and delete a nonce (prevents replay).
 * Returns null if nonce not found or already consumed.
 */
export async function consumeNonce(nonce: string): Promise<NonceData | null> {
  const result = await docClient.send(new DeleteCommand({
    TableName: getTableName(),
    Key: {
      walletAddress: `${NONCE_PK_PREFIX}${nonce}`,
      recordType: 'NONCE',
    },
    ReturnValues: 'ALL_OLD',
  }));

  if (!result.Attributes) {
    return null;
  }

  const data: NonceData = {
    nonce: result.Attributes.nonce,
    boundWalletAddress: result.Attributes.boundWalletAddress,
    message: result.Attributes.message,
    expiresAt: result.Attributes.expiresAt,
  };

  // Check expiration
  if (data.expiresAt < Math.floor(Date.now() / 1000)) {
    console.warn('[address-book] Nonce expired');
    return null;
  }

  return data;
}

// ---- Error classes ----

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}
