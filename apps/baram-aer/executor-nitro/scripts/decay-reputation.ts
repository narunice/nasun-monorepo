/**
 * Decay Reputation Cron Script (Phase F-2)
 *
 * Scans all executors in ExecutorRegistry and calls
 * decay_reputation_permissionless for those inactive > 30 days.
 *
 * Usage:
 *   npx tsx scripts/decay-reputation.ts
 *
 * Environment variables:
 *   SUI_RPC_URL          - Sui RPC endpoint
 *   EXECUTOR_PACKAGE_ID  - baram_executor package ID
 *   EXECUTOR_REGISTRY_ID - ExecutorRegistry shared object ID
 *   DECAY_CALLER_KEY     - Private key for the caller (anyone can call)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const RPC_URL = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';
const EXECUTOR_PACKAGE_ID = process.env.EXECUTOR_PACKAGE_ID;
const EXECUTOR_REGISTRY_ID = process.env.EXECUTOR_REGISTRY_ID;
const CALLER_KEY = process.env.DECAY_CALLER_KEY;

const DECAY_THRESHOLD_MS = 2_592_000_000; // 30 days
const DECAY_MIN_REPUTATION = 100;

async function main() {
  if (!EXECUTOR_PACKAGE_ID || !EXECUTOR_REGISTRY_ID || !CALLER_KEY) {
    console.error('Missing required env: EXECUTOR_PACKAGE_ID, EXECUTOR_REGISTRY_ID, DECAY_CALLER_KEY');
    process.exit(1);
  }

  const client = new SuiClient({ url: RPC_URL });
  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(CALLER_KEY, 'hex'));
  const callerAddress = keypair.getPublicKey().toSuiAddress();

  console.log(`[decay] Caller: ${callerAddress}`);
  console.log(`[decay] Registry: ${EXECUTOR_REGISTRY_ID}`);

  // Read ExecutorRegistry to get executors table ID
  const registry = await client.getObject({
    id: EXECUTOR_REGISTRY_ID,
    options: { showContent: true },
  });

  if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
    console.error('[decay] Could not read ExecutorRegistry');
    process.exit(1);
  }

  const fields = registry.data.content.fields as Record<string, unknown>;
  const executorsTable = fields['executors'] as { fields?: { id?: { id: string } } };
  const tableId = executorsTable?.fields?.id?.id;
  if (!tableId) {
    console.error('[decay] Could not find executors table');
    process.exit(1);
  }

  // Enumerate all dynamic fields in the executors table
  let cursor: string | null | undefined = undefined;
  let decayTargets: string[] = [];
  const now = Date.now();

  do {
    const page = await client.getDynamicFields({
      parentId: tableId,
      cursor: cursor ?? undefined,
      limit: 50,
    });

    for (const field of page.data) {
      const executorAddress = field.name.value as string;

      try {
        const fieldData = await client.getDynamicFieldObject({
          parentId: tableId,
          name: { type: 'address', value: executorAddress },
        });

        if (!fieldData.data?.content || fieldData.data.content.dataType !== 'moveObject') {
          continue;
        }

        const content = fieldData.data.content.fields as Record<string, unknown>;
        const valueWrapper = content['value'] as { fields?: Record<string, unknown> } | Record<string, unknown>;
        const v = ('fields' in valueWrapper && valueWrapper.fields)
          ? valueWrapper.fields as Record<string, unknown>
          : valueWrapper as Record<string, unknown>;

        const reputation = Number(v['reputation'] || 0);
        const lastActiveAt = Number(v['last_active_at'] || 0);
        const inactiveDays = Math.floor((now - lastActiveAt) / 86_400_000);

        if (reputation > DECAY_MIN_REPUTATION && (now - lastActiveAt) >= DECAY_THRESHOLD_MS) {
          console.log(`[decay] Target: ${executorAddress} (rep=${reputation}, inactive=${inactiveDays}d)`);
          decayTargets.push(executorAddress);
        }
      } catch (err) {
        console.warn(`[decay] Failed to read executor ${executorAddress}:`, err);
      }
    }

    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  console.log(`[decay] Found ${decayTargets.length} executor(s) eligible for decay`);

  if (decayTargets.length === 0) {
    console.log('[decay] No action needed');
    return;
  }

  // Call decay_reputation_permissionless for each target
  for (const target of decayTargets) {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${EXECUTOR_PACKAGE_ID}::executor::decay_reputation_permissionless`,
        arguments: [
          tx.object(EXECUTOR_REGISTRY_ID),
          tx.pure.address(target),
          tx.object('0x6'), // Clock
        ],
      });

      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status === 'success') {
        console.log(`[decay] Success: ${target} (tx: ${result.digest})`);
      } else {
        console.warn(`[decay] Failed: ${target} — ${result.effects?.status?.error}`);
      }
    } catch (err) {
      console.error(`[decay] Error for ${target}:`, err);
    }
  }

  console.log('[decay] Done');
}

main().catch(console.error);
