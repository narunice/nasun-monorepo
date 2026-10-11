// Custody is now a directory of key files on the box, which makes the
// filesystem the security boundary. These tests pin the three properties that
// boundary rests on: the agent identifier cannot escape the vault directory,
// two concurrent uploads cannot both win, and permissions stay closed even
// when the directory already exists.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  SecretExistsError,
  deleteSecret,
  hasSecret,
  putSecret,
  secretPathFor,
  vaultDir,
} from '../agent-vault-store.js';

const AGENT = '0x' + 'a'.repeat(64);
const OTHER = '0x' + 'b'.repeat(64);
const KEY = 'suiprivkey1qtestkeymaterialplaceholder';

let tmp: string;
let prevDir: string | undefined;

beforeEach(() => {
  prevDir = process.env.AGENT_VAULT_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'vault-store-test-'));
  process.env.AGENT_VAULT_DIR = join(tmp, 'vault');
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.AGENT_VAULT_DIR;
  else process.env.AGENT_VAULT_DIR = prevDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('agent address validation', () => {
  // The address is interpolated into a path, so these are the inputs that
  // would otherwise write outside the vault or collide across agents.
  const bad = [
    '../../etc/passwd',
    '0x' + 'a'.repeat(63),
    '0x' + 'a'.repeat(65),
    '0x' + 'g'.repeat(64),
    'a'.repeat(64),
    '',
    '0x' + 'a'.repeat(32) + '/../' + 'b'.repeat(29),
  ];

  for (const input of bad) {
    it(`refuses ${JSON.stringify(input.slice(0, 24))}`, async () => {
      expect(() => secretPathFor(input)).toThrow(/vault_bad_agent_address/);
      await expect(putSecret(input, KEY, { overwrite: true }))
        .rejects.toThrow(/vault_bad_agent_address/);
    });
  }

  it('accepts a well-formed address and keeps it inside the vault', () => {
    const p = secretPathFor(AGENT);
    expect(p).toBe(resolve(vaultDir(), `${AGENT}.key`));
    expect(p.startsWith(vaultDir())).toBe(true);
  });

  it('normalizes case so one agent cannot hold two secrets', () => {
    expect(secretPathFor(AGENT.toUpperCase().replace('0X', '0x')))
      .toBe(secretPathFor(AGENT));
  });
});

describe('putSecret', () => {
  it('stores the value verbatim', async () => {
    await putSecret(AGENT, KEY, { overwrite: false });
    expect(readFileSync(secretPathFor(AGENT), 'utf8')).toBe(KEY);
  });

  it('refuses to clobber when overwrite is false', async () => {
    await putSecret(AGENT, KEY, { overwrite: false });
    await expect(putSecret(AGENT, 'different', { overwrite: false }))
      .rejects.toBeInstanceOf(SecretExistsError);
    // The original must survive the rejected write.
    expect(readFileSync(secretPathFor(AGENT), 'utf8')).toBe(KEY);
  });

  it('replaces when overwrite is true', async () => {
    await putSecret(AGENT, KEY, { overwrite: false });
    await putSecret(AGENT, 'rotated', { overwrite: true });
    expect(readFileSync(secretPathFor(AGENT), 'utf8')).toBe('rotated');
  });

  it('leaves no staging file behind after an overwrite', async () => {
    await putSecret(AGENT, KEY, { overwrite: true });
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(vaultDir()).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('writes the key file 0600 and the directory 0700', async () => {
    await putSecret(AGENT, KEY, { overwrite: false });
    expect(statSync(secretPathFor(AGENT)).mode & 0o777).toBe(0o600);
    expect(statSync(vaultDir()).mode & 0o777).toBe(0o700);
  });

  it('tightens a pre-existing world-readable vault directory', async () => {
    mkdirSync(vaultDir(), { recursive: true, mode: 0o755 });
    await putSecret(AGENT, KEY, { overwrite: false });
    expect(statSync(vaultDir()).mode & 0o777).toBe(0o700);
  });

  it('keeps agents separate', async () => {
    await putSecret(AGENT, 'first', { overwrite: false });
    await putSecret(OTHER, 'second', { overwrite: false });
    expect(readFileSync(secretPathFor(AGENT), 'utf8')).toBe('first');
    expect(readFileSync(secretPathFor(OTHER), 'utf8')).toBe('second');
  });

  it('lets only one of two concurrent exclusive writes win', async () => {
    const results = await Promise.allSettled([
      putSecret(AGENT, 'a', { overwrite: false }),
      putSecret(AGENT, 'b', { overwrite: false }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason)
      .toBeInstanceOf(SecretExistsError);
  });
});

describe('hasSecret / deleteSecret', () => {
  it('reports absence before and presence after a write', async () => {
    expect(await hasSecret(AGENT)).toBe(false);
    await putSecret(AGENT, KEY, { overwrite: false });
    expect(await hasSecret(AGENT)).toBe(true);
  });

  it('returns false rather than throwing for a bad address', async () => {
    // hasSecret feeds a 410 branch in the routes, so a malformed address must
    // read as "no secret" rather than crashing the request. A malformed
    // address cannot name a stored secret, so absence is the honest answer.
    await expect(hasSecret('../../etc/passwd')).resolves.toBe(false);
  });

  it('surfaces an unreadable vault instead of reporting it purged', async () => {
    // The routes turn false into a terminal 410 already_purged. If an
    // unreadable directory also returned false, a permissions mistake would
    // tell users their agent's key was deleted.
    await putSecret(AGENT, KEY, { overwrite: false });
    chmodSync(vaultDir(), 0o000);
    try {
      await expect(hasSecret(AGENT)).rejects.toThrow();
    } finally {
      chmodSync(vaultDir(), 0o700);
    }
  });

  it('deletes once and is idempotent afterwards', async () => {
    await putSecret(AGENT, KEY, { overwrite: false });
    expect(await deleteSecret(AGENT)).toBe(true);
    expect(await hasSecret(AGENT)).toBe(false);
    // The purge cron relies on this second call reporting false, not throwing:
    // that is how a row whose secret is already gone still gets reaped.
    expect(await deleteSecret(AGENT)).toBe(false);
  });
});
