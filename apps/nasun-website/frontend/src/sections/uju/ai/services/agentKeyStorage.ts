/**
 * Ed25519 agent keypair generation, encryption, and IndexedDB storage.
 * Ported from baram/frontend/src/services/agentKeyStorage.ts.
 *
 * DB namespace is `nasun-ai-agent-keys` (separate from baram's legacy
 * `baram-agent-keys`). Migration from baram DB is out of scope; users who had
 * baram-side agents can re-register or import the existing on-chain agent
 * address via the modal's "Import Existing Key" mode.
 *
 * Schema: optional `encryptedMnemonic` + `mnemonicIv` fields for agents created
 * after the mnemonic-export work. Older records (no mnemonic) keep working;
 * the export modal just hides the mnemonic tab when absent.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateMnemonicPhrase } from '@nasun/wallet';
import { deriveStorageKey, encryptData, decryptData, clearCachedKey } from './chatCrypto';

const DB_NAME = 'nasun-ai-agent-keys';
const DB_VERSION = 1;
const STORE_NAME = 'agent-keys';

export interface StoredAgentKey {
  agentId: string;
  encrypted: string;
  iv: string;
  address: string;
  createdAt: number;
  /** Encrypted BIP39 mnemonic phrase (UTF-8). Present only for agents created
   *  via `generateAgentMnemonicAndKeypair()`. */
  encryptedMnemonic?: string;
  mnemonicIv?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'agentId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(record: StoredAgentKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function dbGet(agentId: string): Promise<StoredAgentKey | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(agentId);
    req.onsuccess = () => { db.close(); resolve(req.result as StoredAgentKey | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Legacy: generate raw keypair without a mnemonic. New code should prefer
 *  `generateAgentMnemonicAndKeypair()` so the user can recover the agent from
 *  a 12-word phrase. */
export function generateAgentKeypair(): Ed25519Keypair {
  return new Ed25519Keypair();
}

/** Generate a BIP39 mnemonic and the Ed25519 keypair it derives. The mnemonic
 *  is the human-recoverable form; the keypair is what signs on-chain ops. */
export function generateAgentMnemonicAndKeypair(): { mnemonic: string; keypair: Ed25519Keypair } {
  const mnemonic = generateMnemonicPhrase();
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic);
  return { mnemonic, keypair };
}

export async function encryptAndStoreAgentKey(
  agentId: string,
  keypair: Ed25519Keypair,
  walletAddress: string,
  passphrase: string,
  mnemonic?: string,
): Promise<void> {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('Agent passphrase must be at least 6 characters');
  }
  const key = await deriveStorageKey(walletAddress, passphrase);
  clearCachedKey();
  const secretKeyBech32 = keypair.getSecretKey();
  const { encrypted, iv } = await encryptData(key, secretKeyBech32);
  const record: StoredAgentKey = {
    agentId,
    encrypted,
    iv,
    address: keypair.toSuiAddress(),
    createdAt: Date.now(),
  };
  if (mnemonic) {
    const { encrypted: encMnemonic, iv: mnemonicIv } = await encryptData(key, mnemonic);
    record.encryptedMnemonic = encMnemonic;
    record.mnemonicIv = mnemonicIv;
  }
  await dbPut(record);
}

export async function loadAgentKeypair(
  agentId: string,
  walletAddress: string,
  passphrase: string,
): Promise<Ed25519Keypair | null> {
  const record = await dbGet(agentId);
  if (!record) return null;
  const key = await deriveStorageKey(walletAddress, passphrase);
  clearCachedKey();
  const secretKeyBech32 = await decryptData(key, record.encrypted, record.iv);
  return Ed25519Keypair.fromSecretKey(secretKeyBech32);
}

export interface ExportedAgentSecrets {
  /** Bech32 form: `suiprivkey1q...` */
  secretKey: string;
  /** Only present if the agent was created via mnemonic generation. */
  mnemonic?: string;
  /** Address derived from the secret key — UI re-checks this against the
   *  expected agent address as a defense-in-depth sanity check. */
  derivedAddress: string;
}

/**
 * Decrypt the stored agent record and return the bech32 private key (always)
 * and the mnemonic (only if it was stored). Throws on bad passphrase or
 * missing record. The caller should clear the returned strings from memory
 * as soon as it has copied/handed them off.
 */
export async function exportAgentSecrets(
  agentId: string,
  walletAddress: string,
  passphrase: string,
): Promise<ExportedAgentSecrets | null> {
  const record = await dbGet(agentId);
  if (!record) return null;
  const key = await deriveStorageKey(walletAddress, passphrase);
  clearCachedKey();
  const secretKey = await decryptData(key, record.encrypted, record.iv);
  let mnemonic: string | undefined;
  if (record.encryptedMnemonic && record.mnemonicIv) {
    mnemonic = await decryptData(key, record.encryptedMnemonic, record.mnemonicIv);
  }
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  return {
    secretKey,
    mnemonic,
    derivedAddress: kp.toSuiAddress(),
  };
}

/** Read-only check used by the export modal to decide whether to show the
 *  mnemonic tab or only the private-key tab. No decryption happens. */
export async function hasMnemonicStored(agentId: string): Promise<boolean> {
  const record = await dbGet(agentId);
  return !!(record?.encryptedMnemonic && record.mnemonicIv);
}
