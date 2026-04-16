#!/usr/bin/env tsx
/**
 * Genesis Pass Holder Verification Script
 *
 * 1. Fetches ALL on-chain GP holders via Alchemy getOwnersForContract
 * 2. Scans Nasun UserProfiles for users with linked MetaMask ETH addresses
 * 3. Splits into: registered Nasun users vs unregistered
 * 4. Outputs two CSV files:
 *    - gp-holders-registered.csv   (eth_address, identity_id, nasun_address)
 *    - gp-holders-unregistered.csv (eth_address)
 *
 * Usage:
 *   AWS_PROFILE=nasun-prod npx tsx scripts/verify-gp-holders.ts
 *   AWS_PROFILE=nasun-prod npx tsx scripts/verify-gp-holders.ts --dry-run
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';

// ========== Config ==========

const GP_CONTRACT_ADDRESS = '0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1';
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || 'HdUtMFoqa825aXsSunC0D';
const ALCHEMY_NFT_BASE_URL = 'https://eth-mainnet.g.alchemy.com/nft/v3';

const PROFILES_TABLE = process.env.PROFILES_TABLE || 'UserProfiles';
const USER_WALLETS_TABLE = process.env.USER_WALLETS_TABLE || 'UserWallets';

const DRY_RUN = process.argv.includes('--dry-run');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const OUTPUT_DIR = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'docs');

// ========== Alchemy: Get all on-chain GP holders ==========

interface AlchemyOwnersResponse {
  owners: string[];
  pageKey?: string;
}

async function getAllOnChainHolders(): Promise<Set<string>> {
  const holders = new Set<string>();
  let pageKey: string | undefined;
  let page = 0;

  console.log(`[verify] Fetching on-chain GP holders from Alchemy...`);

  do {
    const params = new URLSearchParams({
      contractAddress: GP_CONTRACT_ADDRESS,
      withTokenBalances: 'false',
    });
    if (pageKey) params.set('pageKey', pageKey);

    const url = `${ALCHEMY_NFT_BASE_URL}/${ALCHEMY_API_KEY}/getOwnersForContract?${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });

    if (!res.ok) {
      throw new Error(`Alchemy HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as AlchemyOwnersResponse;

    for (const owner of data.owners) {
      holders.add(owner.toLowerCase());
    }

    pageKey = data.pageKey;
    page++;
    console.log(`[verify]   Page ${page}: ${holders.size} holders so far`);
  } while (pageKey);

  console.log(`[verify] Total on-chain holders: ${holders.size}`);
  return holders;
}

// ========== DynamoDB: Get all Nasun users with ETH wallets ==========

interface NasunUser {
  identityId: string;
  ethAddress: string;
  nasunAddress?: string;
}

async function getNasunUsersWithEthWallets(): Promise<Map<string, NasunUser>> {
  // eth_address (lowercase) -> NasunUser
  const userMap = new Map<string, NasunUser>();
  let lastKey: Record<string, unknown> | undefined;

  console.log(`[verify] Scanning UserProfiles for MetaMask-linked users...`);

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: PROFILES_TABLE,
        FilterExpression: 'attribute_exists(#la.#mm.#wa)',
        ProjectionExpression: 'identityId, #la.#mm.#wa, walletAddress, provider',
        ExpressionAttributeNames: {
          '#la': 'linkedAccounts',
          '#mm': 'metamask',
          '#wa': 'walletAddress',
        },
        ExclusiveStartKey: lastKey,
      })
    );

    for (const item of result.Items || []) {
      const la = item.linkedAccounts as Record<string, any> | undefined;
      const ethAddr = (la?.metamask?.walletAddress as string | undefined)?.toLowerCase();
      if (!ethAddr || !ethAddr.startsWith('0x')) continue;

      // Resolve primary identity for linked accounts
      const identityId = item.identityId as string;
      const nasunAddress = item.walletAddress as string | undefined;

      userMap.set(ethAddr, { identityId, ethAddress: ethAddr, nasunAddress });
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`[verify] Found ${userMap.size} Nasun users with ETH wallets`);
  return userMap;
}

// ========== Cross-reference & output ==========

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((cell) => `"${cell}"`).join(',')).join('\n') + '\n';
}

async function main() {
  console.log(`[verify] Genesis Pass Holder Verification`);
  console.log(`[verify] Contract: ${GP_CONTRACT_ADDRESS}`);
  if (DRY_RUN) console.log(`[verify] DRY RUN - no files will be written`);
  console.log('');

  // 1. Get all on-chain holders
  const onChainHolders = await getAllOnChainHolders();

  // 2. Get Nasun users with ETH wallets
  const nasunUsers = await getNasunUsersWithEthWallets();

  // 3. Cross-reference
  const registered: Array<{ eth: string; identityId: string; nasunAddress: string }> = [];
  const unregistered: string[] = [];

  for (const ethAddr of onChainHolders) {
    const user = nasunUsers.get(ethAddr);
    if (user) {
      registered.push({
        eth: ethAddr,
        identityId: user.identityId,
        nasunAddress: user.nasunAddress || '',
      });
    } else {
      unregistered.push(ethAddr);
    }
  }

  // 4. Summary
  console.log('');
  console.log(`[verify] === Results ===`);
  console.log(`[verify] Total on-chain GP holders:  ${onChainHolders.size}`);
  console.log(`[verify] Registered Nasun users:     ${registered.length}`);
  console.log(`[verify] Unregistered (no Nasun):    ${unregistered.length}`);
  console.log('');

  if (DRY_RUN) {
    console.log('[verify] DRY RUN complete. Use without --dry-run to write CSV files.');
    return;
  }

  // 5. Write CSVs
  const date = new Date().toISOString().slice(0, 10);

  const registeredCsvPath = path.join(OUTPUT_DIR, `gp-holders-registered-${date}.csv`);
  const unregisteredCsvPath = path.join(OUTPUT_DIR, `gp-holders-unregistered-${date}.csv`);

  const registeredRows = [
    ['eth_address', 'identity_id', 'nasun_address'],
    ...registered.map((r) => [r.eth, r.identityId, r.nasunAddress]),
  ];

  const unregisteredRows = [
    ['eth_address'],
    ...unregistered.map((addr) => [addr]),
  ];

  fs.writeFileSync(registeredCsvPath, toCsv(registeredRows));
  fs.writeFileSync(unregisteredCsvPath, toCsv(unregisteredRows));

  console.log(`[verify] Saved: ${registeredCsvPath}`);
  console.log(`[verify] Saved: ${unregisteredCsvPath}`);
  console.log('[verify] Done.');
}

main().catch((err) => {
  console.error('[verify] Fatal error:', err);
  process.exit(1);
});
