/**
 * ResultStore - local SQLite store for AI execution result text.
 *
 * Results are kept for 7 days for cost-efficient temporary retention. The
 * on-chain AER always retains the result hash for permanent verification.
 *
 * Uses node:sqlite rather than better-sqlite3 so the esbuild bundle stays a
 * single self-contained server.mjs, which is the deploy contract every sibling
 * box service follows. A native module would have to be left external and
 * resolved from the monorepo's node_modules on the box, coupling this service
 * to the rsync tree. node:sqlite is still marked experimental in Node 22; the
 * exposure is bounded because this table is a 7-day cache of result text, not
 * a ledger -- the authoritative result hash lives on chain.
 *
 * Ported from DynamoDB when the 2026-07 AWS exit removed the table. Two
 * behaviours of the original are preserved deliberately:
 *
 *   - Expiry is enforced on read, not only by a sweeper. DynamoDB's TTL
 *     deletion lagged up to 48h, so the read path already filtered expired
 *     rows; keeping that check means an expired result stays invisible even
 *     if the sweeper has not run. The sweeper only reclaims disk.
 *   - saveResult is a no-op when the store is not initialized, so a deploy
 *     without RESULT_DB_PATH degrades exactly as the unconfigured Lambda did
 *     (the /infer and /execute-capability paths never touch this store).
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ResultRecord } from '../types';

// Loaded lazily, and typed structurally, so `node:sqlite` is required only
// when a result store is actually configured. A top-level import would make
// the whole service refuse to start on a Node without it, even though the
// /infer and /execute-capability paths never touch this store.
interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint };
  get(...params: unknown[]): unknown;
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

let db: SqliteDatabase | null = null;

const TTL_DAYS = 7;

export function initResultStore(config: { dbPath: string }): void {
  mkdirSync(dirname(config.dbPath), { recursive: true });
  // require() rather than a static import: see the note on SqliteDatabase.
  // node:sqlite landed in Node 22; the bundle's banner provides createRequire.
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  const handle = new DatabaseSync(config.dbPath);
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec(`
    CREATE TABLE IF NOT EXISTS results (
      requestId       INTEGER PRIMARY KEY,
      requesterAddress TEXT NOT NULL,
      result          TEXT NOT NULL,
      resultHash      TEXT NOT NULL,
      model           TEXT NOT NULL,
      purpose         TEXT NOT NULL,
      createdAt       INTEGER NOT NULL,
      ttl             INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_results_ttl ON results(ttl);
  `);
  db = handle;
  console.log(`[ResultStore] Initialized, db: ${config.dbPath}, TTL: ${TTL_DAYS}d`);
}

export function isResultStoreInitialized(): boolean {
  return db !== null;
}

export async function saveResult(params: {
  requestId: number;
  requesterAddress: string;
  result: string;
  resultHash: string;
  model: string;
  purpose: string;
}): Promise<void> {
  if (!db) return;

  const now = Date.now();
  const ttl = Math.floor(now / 1000) + TTL_DAYS * 86400;

  // The DynamoDB PutCommand overwrote by key; INSERT OR REPLACE keeps that.
  db.prepare(
    `INSERT OR REPLACE INTO results
       (requestId, requesterAddress, result, resultHash, model, purpose, createdAt, ttl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.requestId,
    params.requesterAddress,
    params.result,
    params.resultHash,
    params.model,
    params.purpose,
    now,
    ttl,
  );

  console.log(`[ResultStore] Saved requestId=${params.requestId}`);
}

export async function getResult(requestId: number): Promise<ResultRecord | null> {
  if (!db) {
    console.warn('[ResultStore] Not initialized -- RESULT_DB_PATH may not be set');
    return null;
  }

  const item = db
    .prepare(`SELECT * FROM results WHERE requestId = ?`)
    .get(requestId) as ResultRecord | undefined;
  if (!item) return null;

  if (item.ttl < Math.floor(Date.now() / 1000)) return null;

  return item;
}

/**
 * Reclaim disk for results past their TTL. Read-path filtering already hides
 * them, so this is housekeeping rather than a correctness guarantee; the
 * server calls it on boot and daily.
 */
export function pruneExpiredResults(): number {
  if (!db) return 0;
  const info = db
    .prepare(`DELETE FROM results WHERE ttl < ?`)
    .run(Math.floor(Date.now() / 1000));
  // node:sqlite types `changes` as number | bigint; row counts here are tiny.
  const changes = Number(info.changes);
  if (changes > 0) console.log(`[ResultStore] Pruned ${changes} expired result(s)`);
  return changes;
}
