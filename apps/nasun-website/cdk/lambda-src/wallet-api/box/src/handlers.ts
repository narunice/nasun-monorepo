// Request handlers for the box address-book service. Ports the wallet-api lambda byte-for-byte:
//   - challenge / verify: index.ts handleChallenge / handleVerify + addressBook.ts createChallenge / consumeNonce
//   - address-book GET/POST: index.ts handleGetAddressBook / handleSaveAddressBook + addressBook.ts
//     getAddressBook / saveAddressBook (validation + sanitize + optimistic-concurrency CAS)
// Same validation constants, same error strings, same status codes, same response shapes. The nonce store is
// in-memory (nonce.ts) instead of DynamoDB; PG read/write replaces the DynamoDB GetItem/UpdateCommand.

import { randomBytes } from 'node:crypto';
import { verifyAddressBookToken, issueAddressBookToken } from './auth';
import { verifySuiPersonalSignature, verifyZkLoginEphemeralSignature } from './signature';
import { consumeNonce, putNonce, nonceTtlSeconds } from './nonce';
import { getAddressBook, type AddressBookData } from './db';
import { saveAddressBook as writeAddressBook } from './write-db';

const ADDRESS_KEY_REGEX = /^0x[a-f0-9]{1,64}$/;
const WALLET_ADDRESS_REGEX = /^0x[a-f0-9]{64}$/;
const MAX_ENTRIES = 200;
const MAX_LABEL_LENGTH = 100;
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB

export type Result = { status: number; body: Record<string, unknown> };

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

// Whitelist + control-char strip -- verbatim from the lambda addressBook.ts sanitizeEntry.
function sanitizeEntry(key: string, raw: Record<string, unknown>): AddressBookEntry | null {
  if (!ADDRESS_KEY_REGEX.test(key)) return null;

  const address = typeof raw.address === 'string' ? raw.address : key;
  let label = typeof raw.label === 'string' ? raw.label : undefined;

  if (label) {
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

function parseJson(rawBody: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawBody || '{}');
  } catch {
    return null;
  }
}

// ---- challenge --------------------------------------------------------------------------------------------

export async function handleChallenge(rawBody: string): Promise<Result> {
  const body = parseJson(rawBody);
  if (!body) return { status: 400, body: { error: 'Invalid JSON body' } };

  const walletAddress = body.walletAddress;
  if (typeof walletAddress !== 'string' || !walletAddress) {
    return { status: 400, body: { error: 'walletAddress is required' } };
  }

  const normalized = walletAddress.toLowerCase();
  if (!WALLET_ADDRESS_REGEX.test(normalized)) {
    return { status: 400, body: { error: 'Invalid wallet address format' } };
  }

  const nonce = randomBytes(32).toString('hex');
  const message = [
    'Nasun Address Book Auth',
    '',
    'This signature proves wallet ownership for address book sync.',
    'No funds will be transferred.',
    '',
    `Wallet: ${normalized}`,
    `Nonce: ${nonce}`,
  ].join('\n');

  const expiresAt = Math.floor(Date.now() / 1000) + nonceTtlSeconds();
  putNonce(nonce, { boundWalletAddress: normalized, message, expiresAt });

  return { status: 200, body: { nonce, message } };
}

// ---- verify -----------------------------------------------------------------------------------------------

export async function handleVerify(rawBody: string): Promise<Result> {
  const body = parseJson(rawBody);
  if (!body) return { status: 400, body: { error: 'Invalid JSON body' } };

  const { signature, nonce, walletAddress, ephemeralPublicKey } = body as {
    signature?: string;
    nonce?: string;
    walletAddress?: string;
    ephemeralPublicKey?: string;
  };

  if (!signature || !nonce) {
    return { status: 400, body: { error: 'signature and nonce are required' } };
  }

  const nonceData = consumeNonce(nonce);
  if (!nonceData) {
    console.warn('[address-book] Nonce not found or expired');
    return { status: 401, body: { error: 'Authentication failed' } };
  }

  const messageBytes = new TextEncoder().encode(nonceData.message);

  try {
    let verifiedAddress: string;

    if (ephemeralPublicKey) {
      if (!walletAddress) {
        return { status: 400, body: { error: 'walletAddress is required for zkLogin auth' } };
      }
      const normalizedAddress = walletAddress.toLowerCase();
      if (normalizedAddress !== nonceData.boundWalletAddress) {
        console.warn('[address-book] walletAddress mismatch with challenge binding');
        return { status: 401, body: { error: 'Authentication failed' } };
      }
      const isValid = await verifyZkLoginEphemeralSignature(messageBytes, signature, ephemeralPublicKey);
      if (!isValid) {
        console.warn('[address-book] zkLogin ephemeral signature verification failed');
        return { status: 401, body: { error: 'Authentication failed' } };
      }
      verifiedAddress = normalizedAddress;
    } else {
      const recoveredAddress = await verifySuiPersonalSignature(messageBytes, signature);
      if (recoveredAddress !== nonceData.boundWalletAddress) {
        console.warn('[address-book] Recovered address does not match challenge binding');
        return { status: 401, body: { error: 'Authentication failed' } };
      }
      verifiedAddress = recoveredAddress;
    }

    const token = await issueAddressBookToken(verifiedAddress);
    return { status: 200, body: { token, walletAddress: verifiedAddress } };
  } catch (error) {
    console.error('[address-book] Signature verification error:', error instanceof Error ? error.message : error);
    return { status: 401, body: { error: 'Authentication failed' } };
  }
}

// ---- address-book GET -------------------------------------------------------------------------------------

export async function handleGetAddressBook(authHeader: string | undefined): Promise<Result> {
  const walletAddress = await verifyAddressBookToken(authHeader);
  if (!walletAddress) return { status: 401, body: { error: 'Unauthorized' } };

  const { addressBook, version } = await getAddressBook(walletAddress);
  return {
    status: 200,
    body: { addressBook: addressBook ?? { entries: {}, updatedAt: 0 }, version },
  };
}

// ---- address-book POST ------------------------------------------------------------------------------------

export async function handleSaveAddressBook(authHeader: string | undefined, rawBody: string): Promise<Result> {
  const walletAddress = await verifyAddressBookToken(authHeader);
  if (!walletAddress) return { status: 401, body: { error: 'Unauthorized' } };

  const body = parseJson(rawBody);
  if (!body) return { status: 400, body: { error: 'Invalid JSON body' } };

  if (!body.addressBook || typeof body.addressBook !== 'object') {
    return { status: 400, body: { error: 'addressBook is required' } };
  }

  const expectedVersion = typeof body.version === 'number' ? body.version : 0;
  const data = body.addressBook as { entries?: Record<string, unknown>; updatedAt?: number };

  // Validation + sanitize -- byte-parity with the lambda saveAddressBook (size -> entries shape -> count ->
  // per-entry sanitize). Size check is on the RAW input object, matching the lambda.
  if (JSON.stringify(data).length > MAX_PAYLOAD_BYTES) {
    return { status: 413, body: { error: 'Address book payload exceeds 50KB limit' } };
  }
  const rawEntries = data.entries;
  if (!rawEntries || typeof rawEntries !== 'object') {
    return { status: 400, body: { error: 'entries must be an object' } };
  }
  const keys = Object.keys(rawEntries);
  if (keys.length > MAX_ENTRIES) {
    return { status: 400, body: { error: `Too many entries: ${keys.length} (max ${MAX_ENTRIES})` } };
  }
  const sanitizedEntries: Record<string, AddressBookEntry> = {};
  for (const key of keys) {
    const entry = sanitizeEntry(key, rawEntries[key] as Record<string, unknown>);
    if (!entry) return { status: 400, body: { error: `Invalid address key: ${key}` } };
    sanitizedEntries[key] = entry;
  }

  const sanitizedData: AddressBookData = {
    entries: sanitizedEntries,
    updatedAt: data.updatedAt ?? Date.now(),
  };

  const result = await writeAddressBook(walletAddress, sanitizedData, expectedVersion);
  if (result.conflict) {
    return {
      status: 409,
      body: { error: 'Version conflict', message: 'Address book was modified by another device' },
    };
  }
  return { status: 200, body: { success: true } };
}
