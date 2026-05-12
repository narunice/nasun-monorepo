/**
 * Shared helpers for the capability CLI scripts (cap-create / cap-link /
 * cap-set-pause / cap-revoke). These exist purely so we can drive Plan B's
 * Capability mutations from a signed PTB during the §7.3 devnet smoke; they
 * are NOT a long-term editing surface (Plan E will own the UI).
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { Transaction } from '@mysten/sui/transactions';

import {
  AER_PACKAGE_ID,
  AGENT_PACKAGE_ID,
  CAPABILITY_REGISTRY,
} from '@nasun/devnet-config';

export const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';

export interface CapIds {
  aerPackageId: string;
  agentPackageId: string;
  capabilityRegistryId: string;
}

export function loadCapIds(): CapIds {
  const aerPackageId = process.env.AER_PACKAGE_ID ?? AER_PACKAGE_ID;
  const agentPackageId = process.env.AGENT_PACKAGE_ID ?? AGENT_PACKAGE_ID;
  const capabilityRegistryId =
    process.env.CAPABILITY_REGISTRY_ID ?? CAPABILITY_REGISTRY;
  if (!aerPackageId || !agentPackageId || !capabilityRegistryId) {
    throw new Error(
      'Missing one of AER_PACKAGE_ID / AGENT_PACKAGE_ID / CAPABILITY_REGISTRY_ID. ' +
        'Set them in env or update devnet-config.',
    );
  }
  return { aerPackageId, agentPackageId, capabilityRegistryId };
}

/**
 * Load the wallet (user) keypair from WALLET_PRIVATE_KEY. Accepts the same
 * three encodings register-executor.ts accepts (suiprivkey1 bech32, raw hex,
 * raw base64) so any of the local nasun key formats round-trip.
 */
export function loadWalletKeypair(): Ed25519Keypair {
  const raw = process.env.WALLET_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      'WALLET_PRIVATE_KEY is required (wallet that owns the Capability). ' +
        'Pass via env or shell export.',
    );
  }
  if (raw.startsWith('suiprivkey1')) return Ed25519Keypair.fromSecretKey(raw);
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    return Ed25519Keypair.fromSecretKey(Buffer.from(raw.replace(/^0x/, ''), 'hex'));
  }
  return Ed25519Keypair.fromSecretKey(Buffer.from(raw, 'base64'));
}

export function makeClient(): SuiClient {
  return new SuiClient({ url: RPC_URL });
}

/**
 * Submit + wait + assert success. Returns the full response so callers can
 * pull objectChanges (e.g., the freshly-created Capability id).
 */
export async function runTx(
  client: SuiClient,
  signer: Ed25519Keypair,
  tx: Transaction,
  label: string,
) {
  const r = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });
  await client.waitForTransaction({ digest: r.digest });
  if (r.effects?.status.status !== 'success') {
    throw new Error(`[${label}] failed: ${JSON.stringify(r.effects?.status)}`);
  }
  console.log(`[${label}] OK: ${r.digest}`);
  return r;
}

/**
 * Parse a positional CLI flag list (`--key value` pairs). Minimal — we don't
 * need full yargs for four 30-line scripts and avoiding a dep makes the CLI
 * tree shake out of the SDK consumer surface.
 */
export function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith('--')) {
      throw new Error(`Flag --${key} requires a value`);
    }
    out[key] = val;
    i++;
  }
  return out;
}
