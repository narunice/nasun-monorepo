// initSui parses the executor key as a bare hex seed and nothing else, so the
// normalization here is the only thing standing between an operator pasting a
// keystore export and a service that answers 500 on every route forever --
// `Buffer.from('suiprivkey1...', 'hex')` yields zero bytes rather than
// throwing. These cover the three accepted forms, the rejections, and the file
// permission rule.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { loadExecutorPrivateKey, loadProviderApiKeys, AI_PROVIDER_ENV } from './secrets';

let tmp: string;
let saved: Record<string, string | undefined>;

const TRACKED = ['EXECUTOR_KEY_PATH', 'EXECUTOR_PRIVATE_KEY', 'CREDENTIALS_DIRECTORY',
  ...Object.values(AI_PROVIDER_ENV)];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ai-host-secrets-'));
  saved = {};
  for (const k of TRACKED) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(tmp, { recursive: true, force: true });
});

function writeKey(contents: string, mode = 0o600): string {
  const p = join(tmp, 'executor.key');
  writeFileSync(p, contents, { mode });
  chmodSync(p, mode);
  return p;
}

describe('loadExecutorPrivateKey', () => {
  it('rejects when neither source is set', async () => {
    await expect(loadExecutorPrivateKey()).rejects.toThrow(/executor key missing/);
  });

  it('accepts a 64-char hex seed and returns it lowercased', async () => {
    const seed = randomBytes(32).toString('hex').toUpperCase();
    process.env.EXECUTOR_KEY_PATH = writeKey(seed);
    expect(await loadExecutorPrivateKey()).toBe(seed.toLowerCase());
  });

  it('accepts a 0x-prefixed hex seed', async () => {
    const seed = randomBytes(32).toString('hex');
    process.env.EXECUTOR_KEY_PATH = writeKey(`0x${seed}`);
    expect(await loadExecutorPrivateKey()).toBe(seed);
  });

  it('accepts base64 of 32 bytes', async () => {
    const raw = randomBytes(32);
    process.env.EXECUTOR_KEY_PATH = writeKey(raw.toString('base64'));
    expect(await loadExecutorPrivateKey()).toBe(raw.toString('hex'));
  });

  it('accepts a bech32 keystore export and yields the same address', async () => {
    // This is the form `sui keytool` exports, and the form the service unit
    // tells the operator to install. It must resolve to the same keypair.
    const kp = Ed25519Keypair.generate();
    const bech32 = kp.getSecretKey();
    process.env.EXECUTOR_KEY_PATH = writeKey(bech32);

    const hex = await loadExecutorPrivateKey();
    const rebuilt = Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'));
    expect(rebuilt.toSuiAddress()).toBe(kp.toSuiAddress());
  });

  it('tolerates trailing whitespace from an editor', async () => {
    const seed = randomBytes(32).toString('hex');
    process.env.EXECUTOR_KEY_PATH = writeKey(`${seed}\n`);
    expect(await loadExecutorPrivateKey()).toBe(seed);
  });

  it('refuses an unrecognized key format rather than passing it through', async () => {
    process.env.EXECUTOR_KEY_PATH = writeKey('not-a-key');
    await expect(loadExecutorPrivateKey()).rejects.toThrow(/not a recognized secret key/);
  });

  it('refuses an empty key file', async () => {
    process.env.EXECUTOR_KEY_PATH = writeKey('');
    await expect(loadExecutorPrivateKey()).rejects.toThrow(/empty/);
  });

  it('refuses a key file that group or other can read', async () => {
    const seed = randomBytes(32).toString('hex');
    process.env.EXECUTOR_KEY_PATH = writeKey(seed, 0o644);
    await expect(loadExecutorPrivateKey()).rejects.toThrow(/must not be readable by group or other/);
  });

  // systemd's LoadCredential stages the key at 0440 on a per-service ramfs.
  // The first box install crash-looped because the strict rule rejected that,
  // so both halves of the relaxation are pinned here.
  it('accepts systemd 0440 inside CREDENTIALS_DIRECTORY', async () => {
    const seed = randomBytes(32).toString('hex');
    process.env.CREDENTIALS_DIRECTORY = tmp;
    process.env.EXECUTOR_KEY_PATH = writeKey(seed, 0o440);
    expect(await loadExecutorPrivateKey()).toBe(seed);
  });

  it('still refuses world-readable inside CREDENTIALS_DIRECTORY', async () => {
    const seed = randomBytes(32).toString('hex');
    process.env.CREDENTIALS_DIRECTORY = tmp;
    process.env.EXECUTOR_KEY_PATH = writeKey(seed, 0o444);
    await expect(loadExecutorPrivateKey()).rejects.toThrow(/must not be world-readable/);
  });

  it('does not relax a path merely prefixed by CREDENTIALS_DIRECTORY', async () => {
    // `/run/credentials/x` must not loosen `/run/credentials/x-evil`; the
    // check joins on a separator rather than comparing string prefixes.
    const seed = randomBytes(32).toString('hex');
    process.env.CREDENTIALS_DIRECTORY = `${tmp}-other`;
    process.env.EXECUTOR_KEY_PATH = writeKey(seed, 0o440);
    await expect(loadExecutorPrivateKey()).rejects.toThrow(/must not be readable by group or other/);
  });

  it('keeps the strict rule when no credentials directory is set', async () => {
    const seed = randomBytes(32).toString('hex');
    process.env.EXECUTOR_KEY_PATH = writeKey(seed, 0o440);
    await expect(loadExecutorPrivateKey()).rejects.toThrow(/must not be readable by group or other/);
  });

  it('names the path when the file is missing', async () => {
    process.env.EXECUTOR_KEY_PATH = join(tmp, 'absent.key');
    await expect(loadExecutorPrivateKey()).rejects.toThrow(/EXECUTOR_KEY_PATH=/);
  });

  it('falls back to EXECUTOR_PRIVATE_KEY and normalizes it too', async () => {
    const raw = randomBytes(32);
    process.env.EXECUTOR_PRIVATE_KEY = raw.toString('base64');
    expect(await loadExecutorPrivateKey()).toBe(raw.toString('hex'));
  });

  it('prefers the key file over the inline env var', async () => {
    const fileSeed = randomBytes(32).toString('hex');
    const envSeed = randomBytes(32).toString('hex');
    process.env.EXECUTOR_KEY_PATH = writeKey(fileSeed);
    process.env.EXECUTOR_PRIVATE_KEY = envSeed;
    expect(await loadExecutorPrivateKey()).toBe(fileSeed);
  });
});

describe('loadProviderApiKeys', () => {
  it('reports every provider as absent when nothing is set', () => {
    const keys = loadProviderApiKeys();
    expect(Object.keys(keys).sort()).toEqual(Object.keys(AI_PROVIDER_ENV).sort());
    expect(Object.values(keys).every((v) => v === null)).toBe(true);
  });

  it('picks up only the providers that have a key', () => {
    process.env.GROQ_API_KEY = 'gk';
    process.env.GEMINI_API_KEY = '   ';   // whitespace is not a key
    const keys = loadProviderApiKeys();
    expect(keys.groq).toBe('gk');
    expect(keys.gemini).toBeNull();
    expect(keys.mistral).toBeNull();
  });

  it('passes a comma-separated list through for ai.ts to split', () => {
    process.env.GROQ_API_KEY = 'one,two';
    expect(loadProviderApiKeys().groq).toBe('one,two');
  });
});
