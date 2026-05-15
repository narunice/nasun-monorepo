/**
 * Trader Config Storage - IndexedDB wrapper for trader agent definitions.
 * Schema: Database `nasun-ai-trader-{walletAddress}`, store `configs` (keyPath = id).
 * Plaintext storage; agent private key still lives in agentKeyStorage (encrypted).
 *
 * Each write also mirrors to the chat-server (POST /api/nasun-ai/config) so
 * nasun-ai-runtime can read the latest config at the start of each cycle. The
 * server requires a Sui personal-message signature over a canonical message
 * bound to {walletAddress, agentAddress, configHash, ts}; saveConfig /
 * deleteConfig take a `signer` so the caller's wallet can produce that
 * signature. Server sync is best-effort: IndexedDB remains the local source
 * of truth.
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

export async function getConfigByAgent(walletAddress: string, agentAddress: string): Promise<TraderConfig | null> {
  const all = await listConfigs(walletAddress);
  return all.find((c) => c.agentAddress === agentAddress) ?? null;
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
