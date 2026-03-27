#!/usr/bin/env tsx
/**
 * NFT Restore Script
 *
 * Reads devnet NFT snapshot from DynamoDB and re-mints NFTs
 * to their original owners after a devnet reset.
 *
 * Usage:
 *   npx tsx scripts/restore-nfts.ts --dry-run
 *   npx tsx scripts/restore-nfts.ts --type VoteProofNFT
 *   npx tsx scripts/restore-nfts.ts --snapshot 2026-03-27
 *   npx tsx scripts/restore-nfts.ts
 *
 * Prerequisites:
 *   - Contracts redeployed after devnet reset
 *   - devnet-ids.json updated with new addresses
 *   - AWS credentials configured
 *   - Admin keypair available
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import * as fs from 'fs';
import * as path from 'path';
import type { DevnetNftRecord } from '../src/types';

// ========== Config ==========

const OWNERSHIP_TABLE = process.env.OWNERSHIP_TABLE || 'nasun-nft-ownership';
const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const BATCH_SIZE = 50;

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const typeFilter = args.find((_, i) => args[i - 1] === '--type');
const snapshotDate = args.find((_, i) => args[i - 1] === '--snapshot');

// ========== Main ==========

async function main() {
  console.log('=== NFT Restore Script ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Type filter: ${typeFilter || 'all'}`);
  console.log(`Snapshot: ${snapshotDate || 'LATEST'}`);
  console.log();

  // 1. Read snapshot from DynamoDB
  const records = await readSnapshot();
  console.log(`Total NFTs in snapshot: ${records.length}`);

  // 2. Filter to restorable types
  const restorableTypes = new Set([
    'BetaAccessNFT',
    'RequestReceipt',
    'VoteProofNFT',
    'MultiChoiceVoteProofNFT',
    'AllianceNFT',
  ]);

  const toRestore = records.filter((r) => {
    if (!restorableTypes.has(r.nftType)) return false;
    if (typeFilter && r.nftType !== typeFilter) return false;
    return true;
  });

  console.log(`NFTs to restore: ${toRestore.length}`);

  // 3. Group by type
  const byType = new Map<string, DevnetNftRecord[]>();
  for (const r of toRestore) {
    if (!byType.has(r.nftType)) byType.set(r.nftType, []);
    byType.get(r.nftType)!.push(r);
  }

  for (const [type, nfts] of byType) {
    console.log(`  ${type}: ${nfts.length}`);
  }
  console.log();

  if (dryRun) {
    console.log('[DRY RUN] Would restore the above NFTs. Exiting.');
    printRestoreDetails(byType);
    return;
  }

  // 4. Load contract config and admin keypair
  const config = loadContractConfig();
  const keypair = loadAdminKeypair();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`Admin address: ${keypair.getPublicKey().toSuiAddress()}`);
  console.log();

  // 5. Restore each type
  const results: Record<string, { success: number; failed: number }> = {};

  for (const [type, nfts] of byType) {
    console.log(`Restoring ${type} (${nfts.length} NFTs)...`);
    results[type] = { success: 0, failed: 0 };

    for (let i = 0; i < nfts.length; i += BATCH_SIZE) {
      const batch = nfts.slice(i, i + BATCH_SIZE);
      try {
        await restoreBatch(client, keypair, config, type, batch);
        results[type].success += batch.length;
        console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} restored`);
      } catch (err) {
        results[type].failed += batch.length;
        console.error(
          `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: FAILED -`,
          err instanceof Error ? err.message : 'Unknown',
        );
      }
    }
  }

  // 6. Print report
  console.log('\n=== Restore Report ===');
  for (const [type, result] of Object.entries(results)) {
    console.log(`${type}: ${result.success} success, ${result.failed} failed`);
  }
}

// ========== DynamoDB ==========

async function readSnapshot(): Promise<DevnetNftRecord[]> {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-northeast-2' }));
  const pk = snapshotDate ? `DEVNET#${snapshotDate}` : 'DEVNET#LATEST';
  const records: DevnetNftRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: OWNERSHIP_TABLE,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': 'NFT#' },
        ExclusiveStartKey: lastKey,
      }),
    );

    records.push(...((result.Items || []) as DevnetNftRecord[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return records;
}

// ========== Contract Config ==========

interface ContractConfig {
  governance: {
    packageId: string;
    adminCap: string;
  };
  baram: {
    packageId: string;
    upgradeCap: string;
    betaAccessAdmin: string;
    betaAccessRegistry: string;
  };
  alliance: {
    packageId: string;
    adminCap: string;
    registry: string;
  };
}

function loadContractConfig(): ContractConfig {
  // Try to load from devnet-ids.json
  const idsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'devnet-config', 'devnet-ids.json');
  const ids = JSON.parse(fs.readFileSync(idsPath, 'utf-8'));

  return {
    governance: {
      packageId: ids.governance.packageId,
      adminCap: ids.governance.adminCap,
    },
    baram: {
      packageId: ids.baram.packageId,
      upgradeCap: ids.baram.upgradeCap,
      betaAccessAdmin: ids.baram.betaAccessAdmin,
      betaAccessRegistry: ids.baram.betaAccessRegistry,
    },
    alliance: {
      packageId: ids.alliance.packageId,
      adminCap: ids.alliance.adminCap,
      registry: ids.alliance.registry,
    },
  };
}

function loadAdminKeypair(): Ed25519Keypair {
  // Try common key file locations
  const keyPaths = [
    path.resolve(process.env.HOME || '', '.sui', 'sui_config', 'sui.keystore'),
    path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', 'admin.key'),
  ];

  // Check for ADMIN_PRIVATE_KEY env var first
  const privKey = process.env.ADMIN_PRIVATE_KEY;
  if (privKey) {
    const { secretKey } = decodeSuiPrivateKey(privKey);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  throw new Error(
    'Admin keypair not found. Set ADMIN_PRIVATE_KEY env var or provide a keystore path.',
  );
}

// ========== Restore Logic ==========

async function restoreBatch(
  client: SuiClient,
  keypair: Ed25519Keypair,
  config: ContractConfig,
  nftType: string,
  batch: DevnetNftRecord[],
) {
  const tx = new Transaction();

  for (const nft of batch) {
    switch (nftType) {
      case 'VoteProofNFT':
        restoreVoteProof(tx, config, nft, 'proposal');
        break;
      case 'MultiChoiceVoteProofNFT':
        restoreVoteProof(tx, config, nft, 'multi_choice_proposal');
        break;
      case 'RequestReceipt':
        restoreRequestReceipt(tx, config, nft);
        break;
      case 'BetaAccessNFT':
        restoreBetaAccess(tx, config, nft);
        break;
      case 'AllianceNFT':
        restoreAllianceNft(tx, config, nft);
        break;
      default:
        console.warn(`  Unknown type: ${nftType}, skipping`);
    }
  }

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`Transaction failed: ${result.effects?.status?.error || 'unknown'}`);
  }
}

function restoreVoteProof(
  tx: Transaction,
  config: ContractConfig,
  nft: DevnetNftRecord,
  module: string,
) {
  const fields = nft.fields as Record<string, unknown>;
  const proposalId = (fields.proposal_id as Record<string, string>)?.bytes || '0x0';
  const name = (fields.name as string) || '';
  const description = (fields.description as string) || '';
  const urlStr = (fields.url as string) || '';

  tx.moveCall({
    target: `${config.governance.packageId}::${module}::admin_restore_vote_proof`,
    arguments: [
      tx.object(config.governance.adminCap),
      tx.pure.address(proposalId),
      tx.pure.string(name),
      tx.pure.string(description),
      tx.pure(Array.from(new TextEncoder().encode(urlStr)), 'vector<u8>'),
      tx.pure.address(nft.owner),
    ],
  });
}

function restoreRequestReceipt(
  tx: Transaction,
  config: ContractConfig,
  nft: DevnetNftRecord,
) {
  const f = nft.fields as Record<string, unknown>;

  tx.moveCall({
    target: `${config.baram.packageId}::baram::admin_restore_receipt`,
    arguments: [
      tx.object(config.baram.upgradeCap),
      tx.pure.u64(Number(f.request_id || 0)),
      tx.pure.address(String(f.requester || '0x0')),
      tx.pure.address(String(f.executor || '0x0')),
      tx.pure.u64(Number(f.price || 0)),
      tx.pure(f.prompt_hash as number[] || [], 'vector<u8>'),
      tx.pure.string(String(f.model || '')),
      tx.pure.u64(Number(f.created_at || 0)),
      tx.pure.u64(Number(f.timeout_at || 0)),
      tx.pure.address(nft.owner),
    ],
  });
}

function restoreBetaAccess(
  tx: Transaction,
  config: ContractConfig,
  nft: DevnetNftRecord,
) {
  const f = nft.fields as Record<string, unknown>;

  tx.moveCall({
    target: `${config.baram.packageId}::beta_access::admin_restore_beta_access`,
    arguments: [
      tx.object(config.baram.betaAccessAdmin),
      tx.object(config.baram.betaAccessRegistry),
      tx.pure.address(nft.owner),
      tx.pure.u64(Number(f.issued_at || 0)),
      tx.pure.u64(Number(f.expires_at || 0)),
      tx.pure.u64(Number(f.remaining_uses || 0)),
      tx.pure.u64(Number(f.original_uses || 0)),
    ],
  });
}

function restoreAllianceNft(
  tx: Transaction,
  config: ContractConfig,
  nft: DevnetNftRecord,
) {
  const f = nft.fields as Record<string, unknown>;

  tx.moveCall({
    target: `${config.alliance.packageId}::alliance_nft::admin_restore`,
    arguments: [
      tx.object(config.alliance.adminCap),
      tx.object(config.alliance.registry),
      tx.pure.address(nft.owner),
      tx.pure.string(String(f.description || '')),
      tx.pure.string(String(f.image_url || '')),
      tx.pure.u64(Number(f.image_index || 0)),
      tx.pure.u64(Number(f.serial_number || 0)),
      tx.pure.u64(Number(f.minted_at || 0)),
    ],
  });
}

// ========== Helpers ==========

function printRestoreDetails(byType: Map<string, DevnetNftRecord[]>) {
  for (const [type, nfts] of byType) {
    console.log(`\n--- ${type} ---`);
    const byOwner = new Map<string, number>();
    for (const nft of nfts) {
      byOwner.set(nft.owner, (byOwner.get(nft.owner) || 0) + 1);
    }
    for (const [owner, count] of byOwner) {
      console.log(`  ${owner.slice(0, 16)}...: ${count} NFTs`);
    }
  }
}

// ========== Run ==========

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
