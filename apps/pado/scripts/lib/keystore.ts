/**
 * Shared Sui Keystore Utility
 *
 * Reads the active keypair from Sui CLI config and verifies
 * it matches the active address. Used by all seed/admin scripts.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const SUI_CLI_PATH = '<NASUN_DEVNET>/sui/target/release/sui';

/**
 * Get the active Sui address from the CLI config.
 */
export function getActiveAddress(): string {
  const result = execSync(`${SUI_CLI_PATH} client active-address`, {
    encoding: 'utf-8',
  });
  return result.trim();
}

/**
 * Load the Ed25519 keypair that corresponds to the active Sui CLI address.
 * Iterates through all keystore entries to find the matching one.
 */
export function getKeypairFromSuiConfig(): Ed25519Keypair {
  const configPath = path.join(
    process.env.HOME || '~',
    '.sui',
    'sui_config',
    'sui.keystore',
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(`Sui keystore not found at ${configPath}`);
  }

  const keystore: string[] = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!Array.isArray(keystore) || keystore.length === 0) {
    throw new Error('No keys found in keystore');
  }

  const activeAddress = getActiveAddress();

  // Find the key that matches the active address
  for (const base64Key of keystore) {
    const keyBytes = Buffer.from(base64Key, 'base64');
    const flagByte = keyBytes[0];

    // Only support Ed25519 (flag 0x00)
    if (flagByte !== 0x00) continue;

    const secretKey = keyBytes.slice(1, 33);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    const address = keypair.getPublicKey().toSuiAddress();

    if (address === activeAddress) {
      return keypair;
    }
  }

  throw new Error(
    `No Ed25519 keypair found for active address ${activeAddress}. ` +
    `Check that your active Sui CLI address uses an Ed25519 key.`
  );
}
