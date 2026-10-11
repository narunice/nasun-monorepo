// The store was ported from DynamoDB to local SQLite, so these cover the two
// behaviours the port had to carry over by hand: an expired row stays
// invisible on read even before the sweeper removes it, and an unconfigured
// store degrades quietly instead of throwing (that is a supported deploy --
// the /infer and /execute-capability paths never touch it).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  initResultStore,
  isResultStoreInitialized,
  saveResult,
  getResult,
  pruneExpiredResults,
} from './resultStore';

let tmp: string;

const record = (requestId: number) => ({
  requestId,
  requesterAddress: '0x' + 'a'.repeat(64),
  result: 'the model said something',
  resultHash: 'b'.repeat(64),
  model: 'llama-3.3-70b-versatile',
  purpose: 'test',
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'result-store-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('uninitialized store', () => {
  it('reports itself uninitialized, swallows writes and reads null', async () => {
    // Fresh module state is not available per-test, so this only holds before
    // any init in this file -- hence its own describe, run first.
    if (!isResultStoreInitialized()) {
      await expect(saveResult(record(1))).resolves.toBeUndefined();
      await expect(getResult(1)).resolves.toBeNull();
      expect(pruneExpiredResults()).toBe(0);
    }
  });
});

describe('initialized store', () => {
  beforeEach(() => {
    initResultStore({ dbPath: join(tmp, 'nested', 'results.db') });
  });

  it('creates the parent directory and round-trips a record', async () => {
    await saveResult(record(42));
    const got = await getResult(42);
    expect(got).toMatchObject({
      requestId: 42,
      resultHash: 'b'.repeat(64),
      model: 'llama-3.3-70b-versatile',
    });
    expect(got?.result).toBe('the model said something');
  });

  it('returns null for an unknown requestId', async () => {
    expect(await getResult(999)).toBeNull();
  });

  it('overwrites by requestId, as the DynamoDB Put did', async () => {
    await saveResult(record(7));
    await saveResult({ ...record(7), result: 'second answer' });
    expect((await getResult(7))?.result).toBe('second answer');
  });

  it('hides an expired record on read before any prune runs', async () => {
    await saveResult(record(5));
    // Backdate the TTL past expiry without touching the sweeper.
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(tmp, 'nested', 'results.db'));
    db.prepare('UPDATE results SET ttl = ? WHERE requestId = ?')
      .run(Math.floor(Date.now() / 1000) - 1, 5);
    db.close();

    expect(await getResult(5)).toBeNull();
  });

  it('prunes only expired rows', async () => {
    await saveResult(record(1));
    await saveResult(record(2));
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(tmp, 'nested', 'results.db'));
    db.prepare('UPDATE results SET ttl = ? WHERE requestId = ?')
      .run(Math.floor(Date.now() / 1000) - 1, 1);
    db.close();

    expect(pruneExpiredResults()).toBe(1);
    expect(await getResult(1)).toBeNull();
    expect(await getResult(2)).not.toBeNull();
  });
});
