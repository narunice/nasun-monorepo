/**
 * Per-agent encrypted chat history (IndexedDB).
 *
 * v2 schema: each (wallet, agent) may own multiple sessions. Messages are
 * scoped to a sessionId; sessions are scoped to an agentId. v1 records
 * (single conversation per agent, no sessionId on the envelope) are
 * migrated lazily on first read into a synthetic "Imported chat" session.
 *
 * Namespace differs from the baram dashboard so the two never collide.
 */

import type {
  ChatSession,
  EncryptedMessage,
  EncryptedSession,
  InflightWakeJob,
  Message,
} from '../types/chat';
import { generateId } from '../types/chat';
import { deriveStorageKey, encryptData, decryptData, clearCachedKey } from './chatCrypto';

const DB_PREFIX = 'nasun-ai-chat-';
const DB_VERSION = 3;
const MESSAGES_STORE = 'messages';
const SESSIONS_STORE = 'sessions';
const INFLIGHT_STORE = 'inflight';
const AGENT_INDEX = 'agentId';
const SESSION_INDEX = 'sessionId';

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
      const tx = (event.target as IDBOpenDBRequest).transaction!;

      // v1: messages store keyed by id, index on agentId.
      let messagesStore: IDBObjectStore;
      if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
        messagesStore = database.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        messagesStore.createIndex(AGENT_INDEX, 'agentId', { unique: false });
      } else {
        messagesStore = tx.objectStore(MESSAGES_STORE);
      }
      // v2: add sessionId index on messages. We don't backfill sessionId on
      // existing rows here — the load() path detects them and assigns one to
      // a synthetic "Imported chat" session in a follow-up readwrite tx.
      if (!messagesStore.indexNames.contains(SESSION_INDEX)) {
        messagesStore.createIndex(SESSION_INDEX, 'sessionId', { unique: false });
      }

      // v2: sessions store keyed by id, index on agentId.
      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        const sessionsStore = database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
        sessionsStore.createIndex(AGENT_INDEX, 'agentId', { unique: false });
      }
      // v3: inflight wake jobs, keyed by sessionId. Single store covers both
      // generic and agent sessions because only agent (wake-mode) sessions
      // ever write to it. Plaintext is fine — the row contains no secret,
      // and chatToken/idempotencyKey alone are useless without the wallet
      // sig that minted them.
      if (!database.objectStoreNames.contains(INFLIGHT_STORE)) {
        database.createObjectStore(INFLIGHT_STORE, { keyPath: 'sessionId' });
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

// ---------- Messages ----------

async function encryptMessage(
  key: CryptoKey,
  agentId: string,
  sessionId: string,
  message: Message,
): Promise<EncryptedMessage> {
  const { encrypted, iv } = await encryptData(key, JSON.stringify(message));
  return { id: message.id, agentId, sessionId, encrypted, iv, timestamp: message.timestamp };
}

async function decryptMessage(key: CryptoKey, encrypted: EncryptedMessage): Promise<Message> {
  const plain = await decryptData(key, encrypted.encrypted, encrypted.iv);
  return JSON.parse(plain) as Message;
}

export async function loadSessionMessages(
  walletAddress: string,
  sessionId: string,
  password?: string,
): Promise<Message[]> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);

  const encrypted = await new Promise<EncryptedMessage[]>((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readonly');
    const index = tx.objectStore(MESSAGES_STORE).index(SESSION_INDEX);
    const req = index.getAll(IDBKeyRange.only(sessionId));
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
  sessionId: string,
  message: Message,
  password?: string,
): Promise<void> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);
  const enc = await encryptMessage(key, agentId, sessionId, message);

  return new Promise((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readwrite');
    const req = tx.objectStore(MESSAGES_STORE).put(enc);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSessionMessages(
  walletAddress: string,
  sessionId: string,
): Promise<void> {
  const database = await openDatabase(walletAddress);
  return new Promise((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    const index = store.index(SESSION_INDEX);
    const req = index.openCursor(IDBKeyRange.only(sessionId));
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

// ---------- Sessions ----------

async function encryptSession(key: CryptoKey, session: ChatSession): Promise<EncryptedSession> {
  const { encrypted, iv } = await encryptData(key, JSON.stringify(session));
  return {
    id: session.id,
    agentId: session.agentId,
    encrypted,
    iv,
    updatedAt: session.updatedAt,
  };
}

async function decryptSession(key: CryptoKey, encrypted: EncryptedSession): Promise<ChatSession> {
  const plain = await decryptData(key, encrypted.encrypted, encrypted.iv);
  const session = JSON.parse(plain) as ChatSession;
  // v2 rows predate the sessionKind discriminator. Default missing values to
  // 'generic' so the ChatView (top-level "AI Chat") filter doesn't have to
  // handle undefined separately. The default is persisted lazily on the next
  // saveSession (auto-title path) — no upgrade write needed here.
  if (!session.sessionKind) session.sessionKind = 'generic';
  return session;
}

export async function loadSessions(
  walletAddress: string,
  agentId: string,
  password?: string,
): Promise<ChatSession[]> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);

  const encrypted = await new Promise<EncryptedSession[]>((resolve, reject) => {
    const tx = database.transaction(SESSIONS_STORE, 'readonly');
    const index = tx.objectStore(SESSIONS_STORE).index(AGENT_INDEX);
    const req = index.getAll(IDBKeyRange.only(agentId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const sessions: ChatSession[] = [];
  for (const enc of encrypted) {
    try {
      sessions.push(await decryptSession(key, enc));
    } catch {
      // skip undecryptable session record
    }
  }

  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Wallet-scoped session list: every session this wallet owns across every
 * agent. Used by the top-level Chat view where the user thinks "my chats",
 * not "this agent's chats" — the per-session `agentId` still determines
 * which capability pays for the next turn.
 */
export async function loadAllSessionsForWallet(
  walletAddress: string,
  password?: string,
): Promise<ChatSession[]> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);

  const encrypted = await new Promise<EncryptedSession[]>((resolve, reject) => {
    const tx = database.transaction(SESSIONS_STORE, 'readonly');
    const req = tx.objectStore(SESSIONS_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const sessions: ChatSession[] = [];
  for (const enc of encrypted) {
    try {
      sessions.push(await decryptSession(key, enc));
    } catch {
      // skip undecryptable session record
    }
  }

  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveSession(
  walletAddress: string,
  session: ChatSession,
  password?: string,
): Promise<void> {
  const database = await openDatabase(walletAddress);
  const key = await getKey(walletAddress, password);
  const enc = await encryptSession(key, session);
  return new Promise((resolve, reject) => {
    const tx = database.transaction(SESSIONS_STORE, 'readwrite');
    const req = tx.objectStore(SESSIONS_STORE).put(enc);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(
  walletAddress: string,
  sessionId: string,
): Promise<void> {
  const database = await openDatabase(walletAddress);
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(SESSIONS_STORE, 'readwrite');
    const req = tx.objectStore(SESSIONS_STORE).delete(sessionId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  await deleteSessionMessages(walletAddress, sessionId);
  await deleteInflight(walletAddress, sessionId);
}

// ---------- Inflight wake jobs (plaintext, single-store) ----------

export async function saveInflight(walletAddress: string, job: InflightWakeJob): Promise<void> {
  const database = await openDatabase(walletAddress);
  return new Promise((resolve, reject) => {
    const tx = database.transaction(INFLIGHT_STORE, 'readwrite');
    const req = tx.objectStore(INFLIGHT_STORE).put(job);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadInflight(
  walletAddress: string,
  sessionId: string,
): Promise<InflightWakeJob | null> {
  const database = await openDatabase(walletAddress);
  return new Promise((resolve, reject) => {
    const tx = database.transaction(INFLIGHT_STORE, 'readonly');
    const req = tx.objectStore(INFLIGHT_STORE).get(sessionId);
    req.onsuccess = () => {
      const row = req.result as InflightWakeJob | undefined;
      if (!row) return resolve(null);
      // Drop expired or in-limbo (jobId never set) rows. The server's 10-min
      // TTL is authoritative, but we mirror it here so a long-stale row is
      // discarded before we even hit the network.
      if (row.expiresAt < Date.now() || !row.jobId) {
        // Best-effort cleanup. Fire-and-forget — read path shouldn't await
        // a writeback for correctness.
        void deleteInflight(walletAddress, sessionId).catch(() => undefined);
        return resolve(null);
      }
      resolve(row);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteInflight(walletAddress: string, sessionId: string): Promise<void> {
  const database = await openDatabase(walletAddress);
  return new Promise((resolve, reject) => {
    const tx = database.transaction(INFLIGHT_STORE, 'readwrite');
    const req = tx.objectStore(INFLIGHT_STORE).delete(sessionId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- v1 → v2 migration ----------

/**
 * Find legacy v1 messages (no sessionId on the envelope) for this agent.
 * If any exist, bundle them into a single "Imported chat" session so the
 * user does not lose history when the schema flips. Returns the synthesized
 * session, or null when there is nothing to migrate.
 */
export async function migrateLegacyMessages(
  walletAddress: string,
  agentId: string,
  password?: string,
): Promise<ChatSession | null> {
  const database = await openDatabase(walletAddress);
  await getKey(walletAddress, password);

  const legacyRows = await new Promise<EncryptedMessage[]>((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readonly');
    const index = tx.objectStore(MESSAGES_STORE).index(AGENT_INDEX);
    const req = index.getAll(IDBKeyRange.only(agentId));
    req.onsuccess = () => {
      const all = (req.result || []) as EncryptedMessage[];
      resolve(all.filter((r) => !r.sessionId));
    };
    req.onerror = () => reject(req.error);
  });

  if (legacyRows.length === 0) return null;

  const now = Date.now();
  const oldestTs = legacyRows.reduce((min, r) => Math.min(min, r.timestamp), now);
  const newestTs = legacyRows.reduce((max, r) => Math.max(max, r.timestamp), 0);
  const session: ChatSession = {
    id: generateId(),
    agentId,
    title: 'Imported chat',
    createdAt: oldestTs || now,
    updatedAt: newestTs || now,
    messageCount: legacyRows.length,
  };

  await saveSession(walletAddress, session, password);

  // Patch each legacy envelope with the new sessionId. The encrypted blob
  // itself is untouched — sessionId lives at the envelope level.
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    for (const row of legacyRows) {
      store.put({ ...row, sessionId: session.id });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return session;
}
