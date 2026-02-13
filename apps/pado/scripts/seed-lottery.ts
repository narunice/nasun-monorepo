/**
 * Seed Lottery Round
 *
 * Creates 1 lottery round for prototype launch.
 * Uses the admin keypair from Sui keystore.
 *
 * Usage:
 *   cd apps/pado/scripts
 *   npx tsx seed-lottery.ts
 *
 * Options (env vars):
 *   CLOSE_DAYS=7     Days until ticket sales close (default: 7)
 *   DRAW_HOURS=1     Hours after close until draw time (default: 1)
 *
 * Prerequisites:
 *   - Lottery contract deployed on V7
 *   - Sui CLI configured with active address owning Lottery AdminCap
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
  LOTTERY_PACKAGE_ID,
  LOTTERY_REGISTRY,
  LOTTERY_ADMIN_CAP,
} from '@nasun/devnet-config';
import { getKeypairFromSuiConfig } from './lib/keystore';

// ===== Configuration =====

const RPC_URL = 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';

// Timing defaults
const CLOSE_DAYS = parseInt(process.env.CLOSE_DAYS || '7', 10);
const DRAW_HOURS_AFTER = parseInt(process.env.DRAW_HOURS || '1', 10);

// ===== Main =====

async function main() {
  console.log('=== Seed Lottery Round ===\n');

  const client = new SuiClient({ url: RPC_URL });
  const keypair = getKeypairFromSuiConfig();
  const senderAddress = keypair.getPublicKey().toSuiAddress();

  console.log(`RPC: ${RPC_URL}`);
  console.log(`Admin: ${senderAddress}`);
  console.log(`Package: ${LOTTERY_PACKAGE_ID.slice(0, 20)}...`);
  console.log('');

  // Verify AdminCap ownership
  const adminCapObj = await client.getObject({
    id: LOTTERY_ADMIN_CAP,
    options: { showOwner: true },
  });
  if (!adminCapObj.data) {
    throw new Error('Lottery AdminCap not found on-chain.');
  }

  const owner = adminCapObj.data.owner;
  if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
    if (owner.AddressOwner !== senderAddress) {
      throw new Error(
        `AdminCap owned by ${owner.AddressOwner}, but active address is ${senderAddress}.`
      );
    }
  }

  // All time calculations in BigInt to avoid precision loss
  const now = BigInt(Date.now());
  const closeDaysMs = BigInt(CLOSE_DAYS) * 24n * 60n * 60n * 1000n;
  const drawHoursMs = BigInt(DRAW_HOURS_AFTER) * 60n * 60n * 1000n;
  const closeTime = now + closeDaysMs;
  const drawTime = closeTime + drawHoursMs;

  console.log(`Close time: ${new Date(Number(closeTime)).toLocaleString('en-US')} (${CLOSE_DAYS} days from now)`);
  console.log(`Draw time:  ${new Date(Number(drawTime)).toLocaleString('en-US')} (+${DRAW_HOURS_AFTER}h after close)`);
  console.log(`Rollover:   0 NUSDC (first round)`);
  console.log('');

  // Build create_round transaction
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::create_round`,
    arguments: [
      tx.object(LOTTERY_ADMIN_CAP),
      tx.object(LOTTERY_REGISTRY),
      tx.pure.u64(closeTime),
      tx.pure.u64(drawTime),
      tx.pure.u64(0), // No rollover for first round
      tx.object(CLOCK_ID),
    ],
  });

  try {
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true, showObjectChanges: true },
    });

    console.log(`TX Digest: ${result.digest}`);

    const roundObj = result.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType.includes('::lottery::LotteryRound'),
    );

    if (roundObj && roundObj.type === 'created') {
      console.log(`Round ID: ${roundObj.objectId}`);
      console.log(`Type: ${roundObj.objectType}`);
    }

    console.log('\nLottery round created successfully!');
    console.log('The round will be auto-discovered via on-chain events.');
  } catch (error) {
    console.error('Failed to create lottery round:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
