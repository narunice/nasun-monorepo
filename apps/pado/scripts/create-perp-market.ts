/**
 * Create BTC-PERP Market via PTB
 *
 * Usage:
 *   cd apps/pado/scripts
 *   npx tsx create-perp-market.ts
 *
 * Prerequisites:
 *   - Sui CLI configured with active address having sufficient gas
 *   - contracts-perp deployed
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ===== Configuration =====

const RPC_URL = 'https://rpc.devnet.nasun.io';
const PERP_PACKAGE_ID =
  '0xe985134c5bec0013332e0a9ca5cbb301e982da7acf8deeaeac39856ceb603249';
const CLOCK_ID = '0x6';

// Market parameters
const MARKET_CONFIG = {
  name: 'BTC-PERP',
  baseSymbol: 1, // BTCUSD oracle symbol
  maxOpenInterest: 100_000_000_000_000n, // 100M NUSDC (6 decimals)
};

// ===== Sui CLI Integration =====

function getSuiCliPath(): string {
  // Use the nasun CLI alias path
  return '<NASUN_DEVNET>/sui/target/release/sui';
}

function getActiveAddress(): string {
  const suiCli = getSuiCliPath();
  const result = execSync(`${suiCli} client active-address`, {
    encoding: 'utf-8',
  });
  return result.trim();
}

function getKeypairFromSuiConfig(): Ed25519Keypair {
  const configPath = path.join(
    process.env.HOME || '~',
    '.sui',
    'sui_config',
    'sui.keystore',
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(`Sui keystore not found at ${configPath}`);
  }

  const keystore = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!Array.isArray(keystore) || keystore.length === 0) {
    throw new Error('No keys found in keystore');
  }

  // Use the first key (active key)
  const base64Key = keystore[0];
  const keyBytes = Buffer.from(base64Key, 'base64');

  // The keystore format is: [flag byte][32-byte secret key]
  // Skip the first byte (scheme flag)
  const secretKey = keyBytes.slice(1, 33);

  return Ed25519Keypair.fromSecretKey(secretKey);
}

// ===== Main =====

async function main() {
  console.log('=== Create BTC-PERP Market ===\n');

  // Initialize client
  const client = new SuiClient({ url: RPC_URL });
  console.log(`RPC: ${RPC_URL}`);

  // Get keypair
  const keypair = getKeypairFromSuiConfig();
  const senderAddress = keypair.getPublicKey().toSuiAddress();
  console.log(`Sender: ${senderAddress}`);

  // Build transaction
  const tx = new Transaction();

  // Convert market name to bytes
  const nameBytes = Array.from(Buffer.from(MARKET_CONFIG.name, 'utf-8'));

  // Call create_market
  tx.moveCall({
    target: `${PERP_PACKAGE_ID}::perpetual::create_market`,
    arguments: [
      tx.pure.u64(MARKET_CONFIG.baseSymbol),
      tx.pure.vector('u8', nameBytes),
      tx.pure.u64(MARKET_CONFIG.maxOpenInterest),
      tx.object(CLOCK_ID),
    ],
  });

  console.log(`\nMarket Config:`);
  console.log(`  Name: ${MARKET_CONFIG.name}`);
  console.log(`  Base Symbol: ${MARKET_CONFIG.baseSymbol} (BTCUSD)`);
  console.log(
    `  Max OI: ${Number(MARKET_CONFIG.maxOpenInterest) / 1_000_000} NUSDC`,
  );

  // Execute transaction
  console.log('\nExecuting transaction...');

  try {
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log(`\nTransaction successful!`);
    console.log(`Digest: ${result.digest}`);

    // Find created PerpMarket object
    const createdObjects = result.objectChanges?.filter(
      (change) => change.type === 'created',
    );

    if (createdObjects) {
      for (const obj of createdObjects) {
        if (obj.type === 'created') {
          console.log(`\nCreated Object:`);
          console.log(`  ID: ${obj.objectId}`);
          console.log(`  Type: ${obj.objectType}`);

          if (obj.objectType.includes('PerpMarket')) {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`BTC-PERP Market ID: ${obj.objectId}`);
            console.log(`${'='.repeat(50)}`);
            console.log(
              `\nUpdate PERP_MARKET_BTC in constants.ts with this ID`,
            );
          }
        }
      }
    }

    // Check effects
    if (result.effects?.status?.status !== 'success') {
      console.error(
        '\nTransaction failed:',
        result.effects?.status?.error || 'Unknown error',
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('\nTransaction failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
