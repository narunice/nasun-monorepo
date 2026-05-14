/**
 * Per-agent encrypted chat history (IndexedDB).
 *
 * Each (wallet, agent) owns a single conversation. Messages live in one store
 * indexed by agentId; the message body is encrypted with AES-256-GCM using a
 * key derived from the wallet address (and optional passphrase) via
 * chatCrypto.deriveStorageKey.
 *
 * Namespace differs from the baram dashboard so the two never collide.
 */

import type { Message, EncryptedMessage } from '../types/chat';
import { deriveStorageKey, encryptData, decryptData, clearCachedKey } from './chatCrypto';

const DB_PREFIX = 'nasun-ai-chat-';
const DB_VERSION = 1;
const MESSAGES_STORE = 'messages';
const AGENT_INDEX = 'agentId';

let db: IDBDatabase | null = null;
let currentWallet: string | null = null;
let cachedKey: CryptoKey | null = null;

async function getKey(walletAddress: string, password?: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await deriveStorageKey(walletAddress, password);
  return cachedKey;
}

export async function openDatabase(walletAddress: string): Promise<IDBDatabase> {
  if (db && currentWallet === walletAddress) return db;
  if (db) {
    db.close();
    db = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${DB_PREFIX}${walletAddress}`, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      currentWallet = walletAddress;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
        const store = database.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        store.createIndex(AGENT_INDEX, 'agentId', { unique: false });
      }
    };
  });
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    currentWallet = null;
    cachedKey = null;
    clearCachedKey();
  }
}

async function encryptMessage(key: CryptoKey, agentId: string, message: Message): Promise<EncryptedMessage> {
  const { encrypted, iv } = await encryptData(key, JSON.stringify(message));
  return { id: message.id, agentId, encrypted, iv, timestamp: message.timestamp };
}

async function decryptMessage(key: CryptoKey, encrypted: EncryptedMessage): Promise<Message> {
  const plain = await decryptData(key, encrypted.encrypted, encrypted.iv);
  return JSON.parse(plain) as Message;
}

export async function loadMessages(
  walletAddress: string,
  agentId: string,
  password?: string,
): Promise<Message[]> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);

  const encrypted = await new Promise<EncryptedMessage[]>((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readonly');
    const index = tx.objectStore(MESSAGES_STORE).index(AGENT_INDEX);
    const req = index.getAll(IDBKeyRange.only(agentId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const failedIds: string[] = [];
  const messages: Message[] = [];
  for (const enc of encrypted) {
    try {
      messages.push(await decryptMessage(key, enc));
    } catch {
      failedIds.push(enc.id);
    }
  }

  if (failedIds.length > 0) {
    try {
      const tx = database.transaction(MESSAGES_STORE, 'readwrite');
      const store = tx.objectStore(MESSAGES_STORE);
      for (const id of failedIds) store.delete(id);
    } catch {
      // ignore cleanup failure
    }
  }

  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export async function saveMessage(
  walletAddress: string,
  agentId: string,
  message: Message,
  password?: string,
): Promise<void> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);
  const enc = await encryptMessage(key, agentId, message);

  return new Promise((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readwrite');
    const req = tx.objectStore(MESSAGES_STORE).put(enc);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAgentMessages(walletAddress: string, agentId: string): Promise<void> {
  const database = await openDatabase(walletAddress);
  return new Promise((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    const index = store.index(AGENT_INDEX);
    const req = index.openCursor(IDBKeyRange.only(agentId));
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
