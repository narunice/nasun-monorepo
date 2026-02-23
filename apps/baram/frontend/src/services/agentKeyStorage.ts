/**
 * Agent Key Storage - Ed25519 keypair generation, encryption, and IndexedDB storage
 *
 * Reuses chatCrypto.ts patterns (PBKDF2 + AES-256-GCM) with a mandatory passphrase.
 * zkLogin users' walletAddress is public info, so address-only derivation would be
 * effectively plaintext. Passphrase is always required regardless of wallet type.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { deriveStorageKey, encryptData, decryptData, clearCachedKey } from './chatCrypto';

const DB_NAME = 'baram-agent-keys';
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

async function dbGet(agentId: string): Promise<StoredAgentKey | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(agentId);
    req.onsuccess = () => { db.close(); resolve(req.result as StoredAgentKey | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function dbDelete(agentId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(agentId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Generate a new Ed25519 keypair for agent use
 */
export function generateAgentKeypair(): Ed25519Keypair {
  return new Ed25519Keypair();
}

/**
 * Encrypt and store an agent keypair in IndexedDB.
 * Passphrase is always required (mandatory security).
 */
export async function encryptAndStoreAgentKey(
  agentId: string,
  keypair: Ed25519Keypair,
  walletAddress: string,
  passphrase: string
): Promise<void> {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('Agent passphrase must be at least 6 characters');
  }

  const key = await deriveStorageKey(walletAddress, passphrase);
  // Clear shared cache immediately to prevent chatStorage from using agent-derived key.
  // chatCrypto's cachedKey is a module-level singleton shared by chat and agent key operations.
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

/**
 * Load and decrypt an agent keypair from IndexedDB.
 * Returns null if the agentId is not found.
 * Throws on wrong passphrase (decryption failure).
 */
export async function loadAgentKeypair(
  agentId: string,
  walletAddress: string,
  passphrase: string
): Promise<Ed25519Keypair | null> {
  const record = await dbGet(agentId);
  if (!record) return null;

  const key = await deriveStorageKey(walletAddress, passphrase);
  clearCachedKey();
  const secretKeyBase64 = await decryptData(key, record.encrypted, record.iv);
  return Ed25519Keypair.fromSecretKey(secretKeyBase64);
}

/**
 * Delete an agent key from IndexedDB
 */
export async function deleteAgentKey(agentId: string): Promise<void> {
  await dbDelete(agentId);
}

/**
 * Export an agent keypair as base64 string for use in agent-runner .env
 */
export async function exportAgentKeypairBase64(
  agentId: string,
  walletAddress: string,
  passphrase: string
): Promise<string> {
  const keypair = await loadAgentKeypair(agentId, walletAddress, passphrase);
  if (!keypair) throw new Error('Agent key not found');
  return keypair.getSecretKey();
}

/**
 * Check if an agent key exists in IndexedDB (without decryption)
 */
export async function hasAgentKey(agentId: string): Promise<boolean> {
  const record = await dbGet(agentId);
  return record !== undefined;
}
