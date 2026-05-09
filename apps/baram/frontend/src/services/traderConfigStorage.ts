/**
 * Trader Config Storage - IndexedDB wrapper for trader bot definitions.
 *
 * Schema:
 * - Database:     baram-trader-{walletAddress}
 * - Object Store: configs (keyPath = "id")
 *
 * Plaintext storage. Holds no secrets — agent private key still lives in
 * agentKeyStorage (encrypted). The config only points at the agent.
 */

import type { TraderConfig } from '../types/trader';

const DB_PREFIX = 'baram-trader-';
const DB_VERSION = 1;
const STORE = 'configs';

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

function tx<T>(walletAddress: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
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

export async function saveConfig(config: TraderConfig): Promise<void> {
  await tx(config.walletAddress, 'readwrite', (s) => s.put(config));
}

export async function deleteConfig(walletAddress: string, id: string): Promise<void> {
  await tx(walletAddress, 'readwrite', (s) => s.delete(id));
}
