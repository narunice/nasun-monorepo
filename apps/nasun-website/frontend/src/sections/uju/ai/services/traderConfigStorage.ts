/**
 * Trader Config Storage.
 *
 * Read path (Phase 3, 2026-05-23): chat-server SQLite is the single
 * source of truth for what the runtime is actually using. `getConfigByAgent`
 * fetches from the server first and treats IndexedDB as an offline cache
 * only. Prior to this refactor, IndexedDB was the primary read source,
 * which meant Settings could lie about an agent's real state after a
 * browser switch or cache clear (the runtime saw server truth; the UI
 * saw stale local data).
 *
 * Write path: saveConfig/deleteConfig mirror to the chat-server with a
 * Sui personal-message signature bound to {walletAddress, agentAddress,
 * configHash, ts}. The server enforces first-writer-wins ownership.
 *
 * IndexedDB schema: `nasun-ai-trader-{walletAddress}` / store `configs`
 * (keyPath = id). Plaintext metadata only; agent private keys live in
 * agentKeyStorage (encrypted) and never touch this store.
 */

import type { TraderConfig } from '../types/trader';

const DB_PREFIX = 'nasun-ai-trader-';
const DB_VERSION = 1;
const STORE = 'configs';

const CHAT_SERVER_URL =
  (import.meta.env.VITE_CHAT_SERVER_URL as string | undefined) ?? 'https://nasun.io';

export interface ConfigSigner {
  signPersonal(message: Uint8Array): Promise<{ signature: string }>;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function syncConfigToServer(
  config: TraderConfig,
  signer: ConfigSigner | null,
): Promise<void> {
  if (!signer) return;
  try {
    const configPayload = config;
    const configJson = JSON.stringify(configPayload);
    const configHash = await sha256Hex(configJson);
    const ts = Date.now();
    const walletLower = config.walletAddress.toLowerCase();
    const agentLower = config.agentAddress.toLowerCase();
    const message = `nasun-ai-config:save:v1:${walletLower}:${agentLower}:${configHash}:${ts}`;
    const { signature } = await signer.signPersonal(new TextEncoder().encode(message));
    await fetch(`${CHAT_SERVER_URL}/api/nasun-ai/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentAddress: config.agentAddress,
        walletAddress: config.walletAddress,
        config: configPayload,
        ts,
        signature,
      }),
    });
  } catch {
    // Fire-and-forget: IndexedDB is the local source of truth.
  }
}

async function deleteConfigFromServer(
  agentAddress: string,
  walletAddress: string,
  signer: ConfigSigner | null,
): Promise<void> {
  if (!signer) return;
  try {
    const ts = Date.now();
    const walletLower = walletAddress.toLowerCase();
    const agentLower = agentAddress.toLowerCase();
    const message = `nasun-ai-config:delete:v1:${walletLower}:${agentLower}:${ts}`;
    const { signature } = await signer.signPersonal(new TextEncoder().encode(message));
    await fetch(`${CHAT_SERVER_URL}/api/nasun-ai/config`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentAddress, walletAddress, ts, signature }),
    });
  } catch {
    // Fire-and-forget.
  }
}

let db: IDBDatabase | null = null;
let currentWalletAddress: string | null = null;

function openDatabase(walletAddress: string): Promise<IDBDatabase> {
  if (db && currentWalletAddress === walletAddress) return Promise.resolve(db);
  if (db) {
    db.close();
    db = null;
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_PREFIX + walletAddress, DB_VERSION);
    req.onupgradeneeded = () => {
      const upgradedDb = req.result;
      if (!upgradedDb.objectStoreNames.contains(STORE)) {
        const store = upgradedDb.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('agentAddress', 'agentAddress', { unique: false });
      }
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to open trader config DB'));
    req.onsuccess = () => {
      db = req.result;
      currentWalletAddress = walletAddress;
      resolve(db);
    };
  });
}

function tx<T>(
  walletAddress: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase(walletAddress).then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const t = database.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Trader config tx failed'));
      }),
  );
}

export async function listConfigs(walletAddress: string): Promise<TraderConfig[]> {
  const results = await tx<TraderConfig[]>(walletAddress, 'readonly', (s) => s.getAll() as IDBRequest<TraderConfig[]>);
  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConfig(walletAddress: string, id: string): Promise<TraderConfig | null> {
  const r = await tx<TraderConfig | undefined>(walletAddress, 'readonly', (s) => s.get(id) as IDBRequest<TraderConfig | undefined>);
  return r ?? null;
}

/**
 * Result of a config read with provenance.
 * - 'server': fetched live from chat-server (authoritative)
 * - 'cache':  server unreachable; using last-known IndexedDB copy (stale possible)
 * - 'none':   neither source has a row for this agent
 */
export interface TraderConfigReadResult {
  config: TraderConfig | null;
  source: 'server' | 'cache' | 'none';
}

/**
 * Server-first read with offline fallback. Caller can ignore source if
 * they only need the config object; UI surfaces that want to show a
 * "loaded from offline cache" banner should branch on source.
 */
export async function getConfigByAgentDetailed(
  walletAddress: string,
  agentAddress: string,
): Promise<TraderConfigReadResult> {
  const agentLower = agentAddress.toLowerCase();

  // 1. Try chat-server (source of truth).
  try {
    const url = `${CHAT_SERVER_URL}/api/nasun-ai/config/${agentLower}`;
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) {
      const body = (await res.json()) as { config?: TraderConfig };
      const cfg = body.config ?? null;
      if (cfg) {
        // Refresh IndexedDB cache so offline reloads stay in sync.
        try {
          await tx(walletAddress, 'readwrite', (s) => s.put(cfg));
        } catch {
          /* cache update failure is non-fatal */
        }
        return { config: cfg, source: 'server' };
      }
      // 200 with no config body shouldn't happen, but treat as missing.
      return { config: null, source: 'none' };
    }
    if (res.status === 404) {
      // Server explicitly says no row. Don't surface stale cache as
      // truth here; UI will show empty state and the user can re-save.
      return { config: null, source: 'none' };
    }
    // Other status (5xx, 429, etc.): fall through to cache.
  } catch {
    // Network error / timeout: fall through to cache.
  }

  // 2. Offline / server-error fallback: IndexedDB.
  try {
    const all = await listConfigs(walletAddress);
    const cached = all.find((c) => c.agentAddress === agentAddress) ?? null;
    return { config: cached, source: cached ? 'cache' : 'none' };
  } catch {
    // Environments without IndexedDB (some test sandboxes, private mode
    // on certain browsers) shouldn't crash the entire read path.
    return { config: null, source: 'none' };
  }
}

/**
 * Backwards-compatible thin wrapper. Returns just the config (or null).
 */
export async function getConfigByAgent(
  walletAddress: string,
  agentAddress: string,
): Promise<TraderConfig | null> {
  const r = await getConfigByAgentDetailed(walletAddress, agentAddress);
  return r.config;
}

export async function saveConfig(config: TraderConfig, signer: ConfigSigner | null): Promise<void> {
  await tx(config.walletAddress, 'readwrite', (s) => s.put(config));
  // Don't block the local save on the server round-trip / signature.
  void syncConfigToServer(config, signer);
}

export async function deleteConfig(
  walletAddress: string,
  id: string,
  agentAddress: string | undefined,
  signer: ConfigSigner | null,
): Promise<void> {
  await tx(walletAddress, 'readwrite', (s) => s.delete(id));
  if (agentAddress) void deleteConfigFromServer(agentAddress, walletAddress, signer);
}
