/**
 * Create NETH/NUSDC and NSOL/NUSDC DeepBook V3 Pools
 *
 * Usage:
 *   cd apps/pado/scripts
 *   npx tsx create-pools-v2.ts
 *
 * Prerequisites:
 *   - devnet-tokens-v2 deployed (NETH, NSOL types available)
 *   - DeepBook V3 deployed with admin cap
 *   - Sui CLI configured with active address owning DeepbookAdminCap
 *
 * After running, update devnet-ids.json with the new pool IDs.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as fs from 'fs';
import * as path from 'path';

// ===== Configuration =====

const RPC_URL = 'https://rpc.devnet.nasun.io';

// From devnet-ids.json
const DEEPBOOK_PACKAGE_ID = '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134';
const DEEPBOOK_REGISTRY = '0x0a6ba6378a30598f1487e193865bfa387f177f82660400a5eace887cfe5a6b7b';
const DEEPBOOK_ADMIN_CAP = '0xe0b017bb62d572415c447e37008cea68bc8bb5bd4e47f12e672924b05ba651eb';

// Token types - UPDATE THESE after deploying devnet-tokens-v2
const TOKENS_V2_PACKAGE = process.env.TOKENS_V2_PACKAGE || '';
const NUSDC_TYPE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC';

// Pool parameters
const POOLS = [
  {
    name: 'NETH/NUSDC',
    baseType: () => `${TOKENS_V2_PACKAGE}::neth::NETH`,
    quoteType: NUSDC_TYPE,
    tickSize: 10_000,        // $0.01 in NUSDC (6 decimals) → 10^4
    lotSize: 1_000_000_000_000_000, // 0.001 ETH (18 decimals) → 10^15
    minSize: 1_000_000_000_000_000, // 0.001 ETH minimum
  },
  {
    name: 'NSOL/NUSDC',
    baseType: () => `${TOKENS_V2_PACKAGE}::nsol::NSOL`,
    quoteType: NUSDC_TYPE,
    tickSize: 10_000,        // $0.01 in NUSDC (6 decimals) → 10^4
    lotSize: 1_000_000_000,  // 1.0 SOL (9 decimals) → 10^9
    minSize: 1_000_000_000,  // 1.0 SOL minimum
  },
];

// ===== Sui CLI Integration =====

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
  const flagByte = keyBytes[0];
  if (flagByte !== 0x00) {
    throw new Error(
      `First key in keystore is not Ed25519 (flag: 0x${flagByte.toString(16)}). ` +
      `Expected flag 0x00 for Ed25519. Check your active-address in sui client.`
    );
  }
  const secretKey = keyBytes.slice(1, 33);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

// ===== Main =====

async function main() {
  console.log('=== Create DeepBook V3 Pools for NETH/NSOL ===\n');

  if (!TOKENS_V2_PACKAGE) {
    console.error('ERROR: TOKENS_V2_PACKAGE env var not set.');
    console.error('Usage: TOKENS_V2_PACKAGE=0x... npx tsx create-pools-v2.ts');
    process.exit(1);
  }

  const client = new SuiClient({ url: RPC_URL });
  const keypair = getKeypairFromSuiConfig();
  const senderAddress = keypair.getPublicKey().toSuiAddress();

  console.log(`RPC: ${RPC_URL}`);
  console.log(`Sender: ${senderAddress}`);
  console.log(`DeepBook Package: ${DEEPBOOK_PACKAGE_ID.slice(0, 16)}...`);
  console.log(`Tokens V2 Package: ${TOKENS_V2_PACKAGE.slice(0, 16)}...`);
  console.log('');

  for (const pool of POOLS) {
    const baseType = pool.baseType();
    console.log(`--- Creating ${pool.name} Pool ---`);
    console.log(`  Base: ${baseType}`);
    console.log(`  Quote: ${pool.quoteType}`);
    console.log(`  Tick Size: ${pool.tickSize}`);
    console.log(`  Lot Size: ${pool.lotSize}`);
    console.log(`  Min Size: ${pool.minSize}`);

    const tx = new Transaction();

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::create_pool_admin`,
      typeArguments: [baseType, pool.quoteType],
      arguments: [
        tx.object(DEEPBOOK_REGISTRY),
        tx.pure.u64(pool.tickSize),
        tx.pure.u64(pool.lotSize),
        tx.pure.u64(pool.minSize),
        tx.pure.bool(false), // whitelisted_pool
        tx.pure.bool(false), // stable_pool
        tx.object(DEEPBOOK_ADMIN_CAP),
      ],
    });

    try {
      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      console.log(`  TX Digest: ${result.digest}`);

      // Find created Pool object
      const createdObjects = result.objectChanges?.filter(
        (change) => change.type === 'created',
      );

      if (createdObjects) {
        for (const obj of createdObjects) {
          if (obj.type === 'created' && obj.objectType.includes('::pool::Pool')) {
            console.log(`  Pool ID: ${obj.objectId}`);
            console.log(`  Type: ${obj.objectType}`);
          }
        }
      }
      console.log('');
    } catch (error) {
      console.error(`  Failed to create ${pool.name}:`, error instanceof Error ? error.message : error);
      console.log('');
    }
  }

  console.log('Done! Update devnet-ids.json with the Pool IDs above.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
