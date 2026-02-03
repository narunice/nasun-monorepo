/**
 * Chat Storage - IndexedDB wrapper for encrypted chat persistence
 *
 * Structure:
 * - Database: baram-chat-{walletAddress}
 * - Object Stores:
 *   - sessions: Encrypted session metadata
 *   - messages: Encrypted messages (indexed by sessionId)
 *
 * V2: Key derivation uses wallet address + optional password (dual-mode)
 *     - Password wallet: PBKDF2(address + password) — strong
 *     - zkLogin: PBKDF2(address) — basic obfuscation (no password available)
 */

import type { Message, ChatSession, EncryptedMessage, EncryptedSession } from '../types/chat';
import { deriveStorageKey, getCachedKey, encryptObject, decryptObject, clearCachedKey } from './chatCrypto';

/**
 * Get encryption key: use cached key if available, otherwise derive from password.
 * After loadFromStorage derives the key once, the cache is populated and
 * subsequent calls don't need the password.
 */
async function getKey(walletAddress: string, password?: string): Promise<CryptoKey> {
  const cached = getCachedKey();
  if (cached) return cached;
  return deriveStorageKey(walletAddress, password);
}

const DB_PREFIX = 'baram-chat-';
const DB_VERSION = 2;

// Store names
const SESSIONS_STORE = 'sessions';
const MESSAGES_STORE = 'messages';

// Current database instance
let db: IDBDatabase | null = null;
let currentWalletAddress: string | null = null;

/**
 * Open or create the database for a wallet address
 */
export async function openDatabase(walletAddress: string): Promise<IDBDatabase> {
  // Return existing connection if same wallet
  if (db && currentWalletAddress === walletAddress) {
    return db;
  }

  // Close existing connection if different wallet
  if (db) {
    db.close();
    db = null;
  }

  return new Promise((resolve, reject) => {
    const dbName = `${DB_PREFIX}${walletAddress}`;
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      currentWalletAddress = walletAddress;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // V2: Clear data encrypted with old key (address-only derivation)
      if (event.oldVersion < 2) {
        if (database.objectStoreNames.contains(SESSIONS_STORE)) {
          database.deleteObjectStore(SESSIONS_STORE);
        }
        if (database.objectStoreNames.contains(MESSAGES_STORE)) {
          database.deleteObjectStore(MESSAGES_STORE);
        }
      }

      // Create sessions store
      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }

      // Create messages store with sessionId index
      if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
        const messagesStore = database.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        messagesStore.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
  });
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    currentWalletAddress = null;
    clearCachedKey();
  }
}

// ============================================
// Session Operations
// ============================================

/**
 * Save a session (encrypted)
 */
export async function saveSession(
  walletAddress: string,
  password: string | undefined,
  session: ChatSession
): Promise<void> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);

  // Encrypt session data
  const { encrypted, iv } = await encryptObject(key, session);

  const encryptedSession: EncryptedSession = {
    id: session.id,
    encrypted,
    iv,
    updatedAt: session.updatedAt,
  };

  return new Promise((resolve, reject) => {
    const tx = database.transaction(SESSIONS_STORE, 'readwrite');
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.put(encryptedSession);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load all sessions (decrypted)
 */
export async function loadSessions(walletAddress: string, password?: string): Promise<ChatSession[]> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);

  const encryptedSessions = await new Promise<EncryptedSession[]>((resolve, reject) => {
    const tx = database.transaction(SESSIONS_STORE, 'readonly');
    const store = tx.objectStore(SESSIONS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  // Decrypt all sessions
  const sessions: ChatSession[] = [];
  for (const encrypted of encryptedSessions) {
    try {
      const session = await decryptObject<ChatSession>(key, encrypted.encrypted, encrypted.iv);
      sessions.push(session);
    } catch (error) {
      console.warn('[ChatStorage] Failed to decrypt session:', encrypted.id, error);
    }
  }

  // Sort by updatedAt (most recent first)
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Delete a session and its messages
 */
export async function deleteSession(walletAddress: string, sessionId: string): Promise<void> {
  const database = await openDatabase(walletAddress);

  return new Promise((resolve, reject) => {
    const tx = database.transaction([SESSIONS_STORE, MESSAGES_STORE], 'readwrite');

    // Delete session
    tx.objectStore(SESSIONS_STORE).delete(sessionId);

    // Delete all messages for this session
    const messagesStore = tx.objectStore(MESSAGES_STORE);
    const index = messagesStore.index('sessionId');
    const request = index.openCursor(IDBKeyRange.only(sessionId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all sessions and messages
 */
export async function clearAllData(walletAddress: string): Promise<void> {
  const database = await openDatabase(walletAddress);

  return new Promise((resolve, reject) => {
    const tx = database.transaction([SESSIONS_STORE, MESSAGES_STORE], 'readwrite');

    tx.objectStore(SESSIONS_STORE).clear();
    tx.objectStore(MESSAGES_STORE).clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================
// Message Operations
// ============================================

/**
 * Save a message (encrypted)
 */
export async function saveMessage(
  walletAddress: string,
  password: string | undefined,
  sessionId: string,
  message: Message
): Promise<void> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);

  // Encrypt message data
  const { encrypted, iv } = await encryptObject(key, message);

  const encryptedMessage: EncryptedMessage = {
    id: message.id,
    sessionId,
    encrypted,
    iv,
    timestamp: message.timestamp,
  };

  return new Promise((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    const request = store.put(encryptedMessage);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load messages for a session (decrypted)
 */
export async function loadMessages(
  walletAddress: string,
  password: string | undefined,
  sessionId: string
): Promise<Message[]> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);

  const encryptedMessages = await new Promise<EncryptedMessage[]>((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);
    const index = store.index('sessionId');
    const request = index.getAll(IDBKeyRange.only(sessionId));

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  // Decrypt all messages
  const messages: Message[] = [];
  for (const encrypted of encryptedMessages) {
    try {
      const message = await decryptObject<Message>(key, encrypted.encrypted, encrypted.iv);
      messages.push(message);
    } catch (error) {
      console.warn('[ChatStorage] Failed to decrypt message:', encrypted.id, error);
    }
  }

  // Sort by timestamp
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Save multiple messages (batch operation)
 */
export async function saveMessages(
  walletAddress: string,
  password: string | undefined,
  sessionId: string,
  messages: Message[]
): Promise<void> {
  for (const message of messages) {
    await saveMessage(walletAddress, password, sessionId, message);
  }
}
