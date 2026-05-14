/**
 * Ed25519 agent keypair generation, encryption, and IndexedDB storage.
 * Ported from baram/frontend/src/services/agentKeyStorage.ts.
 *
 * DB namespace is `nasun-ai-agent-keys` (separate from baram's legacy
 * `baram-agent-keys`). Migration from baram DB is out of scope; users who had
 * baram-side agents can re-register or import the existing on-chain agent
 * address via the modal's "Import Existing Key" mode.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { deriveStorageKey, encryptData, decryptData, clearCachedKey } from './chatCrypto';

const DB_NAME = 'nasun-ai-agent-keys';
const DB_VERSION = 1;
const STORE_NAME = 'agent-keys';

interface StoredAgentKey {
  agentId: string;
  encrypted: string;
  iv: string;
  address: string;
  createdAt: number;
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

export function generateAgentKeypair(): Ed25519Keypair {
  return new Ed25519Keypair();
}

export async function encryptAndStoreAgentKey(
  agentId: string,
  keypair: Ed25519Keypair,
  walletAddress: string,
  passphrase: string,
): Promise<void> {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('Agent passphrase must be at least 6 characters');
  }
  const key = await deriveStorageKey(walletAddress, passphrase);
  clearCachedKey();
  const secretKeyBase64 = keypair.getSecretKey();
  const { encrypted, iv } = await encryptData(key, secretKeyBase64);
  await dbPut({
    agentId,
    encrypted,
    iv,
    address: keypair.toSuiAddress(),
    createdAt: Date.now(),
  });
}

export async function loadAgentKeypair(
  agentId: string,
  walletAddress: string,
  passphrase: string,
): Promise<Ed25519Keypair | null> {
  const db = await openDB();
  const record: StoredAgentKey | undefined = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(agentId);
    req.onsuccess = () => { db.close(); resolve(req.result as StoredAgentKey | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
  if (!record) return null;
  const key = await deriveStorageKey(walletAddress, passphrase);
  clearCachedKey();
  const secretKeyBase64 = await decryptData(key, record.encrypted, record.iv);
  return Ed25519Keypair.fromSecretKey(secretKeyBase64);
}
