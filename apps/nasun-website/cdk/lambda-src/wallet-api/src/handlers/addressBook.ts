import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const ADDRESS_KEY_REGEX = /^0x[a-f0-9]{1,64}$/;
const MAX_ENTRIES = 200;
const MAX_LABEL_LENGTH = 100;
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB

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

export async function getAddressBook(identityId: string): Promise<{ addressBook: AddressBookData | null; version: number }> {
  const tableName = process.env.USER_PROFILES_TABLE;
  if (!tableName) throw new Error('USER_PROFILES_TABLE environment variable not set');

  const result = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { identityId },
    ProjectionExpression: 'addressBook, addressBookVersion',
  }));

  return {
    addressBook: result.Item?.addressBook ?? null,
    version: result.Item?.addressBookVersion ?? 0,
  };
}

export async function saveAddressBook(
  identityId: string,
  data: { entries: Record<string, any>; updatedAt?: number },
  expectedVersion: number,
): Promise<{ success: boolean; conflict: boolean }> {
  const tableName = process.env.USER_PROFILES_TABLE;
  if (!tableName) throw new Error('USER_PROFILES_TABLE environment variable not set');

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
      TableName: tableName,
      Key: { identityId },
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
