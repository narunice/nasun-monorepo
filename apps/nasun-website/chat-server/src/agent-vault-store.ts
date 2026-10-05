// Box-native agent keypair custody — the replacement for SSM Parameter Store.
//
// Why this module exists: agent keypairs used to live in SSM Parameter Store in
// the prod AWS account. The 2026-07 AWS exit decommissioned that account, which
// is what `AGENT_VAULT_RETIRED=1` in the box .env was holding the door shut for
// ("a box-native store rebuild is tracked separately" — agent-vault-routes.ts).
// This is that rebuild.
//
// Trust boundary, stated plainly rather than implied: chat-server and every
// agent runtime it spawns run as the same unix user (`nasun`) on one host, so
// filesystem permissions ARE the boundary — a 0700 directory of 0600 files.
// Encrypting at rest under a key readable by that same user would be theater,
// so this module does not pretend to. Two properties are what actually keep the
// custody honest, and both must survive future changes:
//
//   1. The vault lives outside the monorepo tree, so no deploy rsync, static
//      file route, or build step can reach it. Do not move it under apps/.
//   2. No backup job covers it. The box's backup timers (nasun-dal-backup,
//      nasun-points-backup) are pg_dumps of named databases, so keys never
//      leave the host. Anything added to the backup set later must keep
//      excluding this directory, or private keys start travelling off-box.
//
// The stored value is the same string SSM held: a bech32 `suiprivkey1...` (or
// hex/base64) secret key, parsed by the runtime's existing loadKeypair().

import { mkdir, writeFile, rename, unlink, access, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

// Addresses reach this module from request bodies and SQLite rows, and they are
// interpolated straight into a filesystem path. Anything but an exact 32-byte
// hex Sui address is refused, so `..`, separators and absolute paths cannot be
// smuggled through the agent identifier.
const AGENT_ADDRESS_RE = /^0x[0-9a-f]{64}$/;

export class SecretExistsError extends Error {
  constructor(agentAddress: string) {
    super(`vault_secret_exists: ${agentAddress}`);
    this.name = 'SecretExistsError';
  }
}

export function vaultDir(): string {
  return process.env.AGENT_VAULT_DIR ?? resolve(homedir(), '.nasun-ai-vault');
}

function assertAgentAddress(agentAddress: string): string {
  const agent = agentAddress.toLowerCase();
  if (!AGENT_ADDRESS_RE.test(agent)) {
    throw new Error(`vault_bad_agent_address: ${agentAddress.slice(0, 32)}`);
  }
  return agent;
}

/**
 * Absolute path of an agent's secret. Recorded in `agent_keys.param_name` at
 * insert time, so that column keeps meaning "where this agent's secret lives"
 * across both eras: an SSM parameter name for pre-exit rows, this path for
 * rows created since. Nothing reads the column to find a secret — the store is
 * keyed by agent address — but keeping it truthful makes the table auditable.
 */
export function secretPathFor(agentAddress: string): string {
  return resolve(vaultDir(), `${assertAgentAddress(agentAddress)}.key`);
}

async function ensureVaultDir(): Promise<void> {
  const dir = vaultDir();
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  // mkdir's mode is ignored when the directory already exists, and umask can
  // loosen it on creation. Re-assert so a pre-existing or group-readable vault
  // directory cannot silently widen custody.
  await chmod(dir, DIR_MODE);
}

/**
 * Write an agent's secret. Mirrors the SSM PutParameter semantics the upload
 * route relied on: `overwrite: false` fails when a secret is already present,
 * which is what caught concurrent uploads for the same agent.
 */
export async function putSecret(
  agentAddress: string,
  value: string,
  opts: { overwrite: boolean },
): Promise<void> {
  const agent = assertAgentAddress(agentAddress);
  const target = secretPathFor(agent);
  await ensureVaultDir();

  if (!opts.overwrite) {
    // Exclusive create: the O_EXCL flag makes the existence check and the write
    // one atomic step, so two concurrent uploads cannot both believe they won.
    try {
      await writeFile(target, value, { mode: FILE_MODE, flag: 'wx' });
      return;
    } catch (err) {
      if ((err as { code?: string }).code === 'EEXIST') throw new SecretExistsError(agent);
      throw err;
    }
  }

  // Overwrite (restore-after-purge): stage then rename, so a crash mid-write
  // leaves the previous secret intact rather than a truncated key file.
  const staging = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(staging, value, { mode: FILE_MODE, flag: 'wx' });
    await rename(staging, target);
  } catch (err) {
    await unlink(staging).catch(() => { /* staging already gone */ });
    throw err;
  }
}

/** Presence check standing in for the routes' GetParameter existence probes. */
export async function hasSecret(agentAddress: string): Promise<boolean> {
  try {
    await access(secretPathFor(agentAddress));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove an agent's secret. Idempotent: returns false when it was already
 * gone, which is how the purge cron treated SSM's ParameterNotFound.
 */
export async function deleteSecret(agentAddress: string): Promise<boolean> {
  try {
    await unlink(secretPathFor(agentAddress));
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return false;
    throw err;
  }
}
