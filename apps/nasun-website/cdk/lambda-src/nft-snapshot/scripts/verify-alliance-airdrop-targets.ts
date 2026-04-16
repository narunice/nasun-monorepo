#!/usr/bin/env tsx
/**
 * Alliance NFT Airdrop Target Verification Script
 *
 * Filters Alliance NFT holders for airdrop eligibility:
 *   1. Has activated Alliance NFT (nasun-ecosystem-activations, SK starts with "alliance#")
 *   2. Does NOT hold Genesis Pass (exclude gp-holders-registered CSV)
 *   3. Has at least 1 social account connected (Twitter or Google/email)
 *
 * Outputs:
 *   - alliance-airdrop-targets-YYYY-MM-DD.csv  (eligible)
 *   - alliance-airdrop-excluded-YYYY-MM-DD.csv (activated but no social account)
 *
 * Usage:
 *   AWS_PROFILE=nasun-prod npx tsx scripts/verify-alliance-airdrop-targets.ts
 *   AWS_PROFILE=nasun-prod npx tsx scripts/verify-alliance-airdrop-targets.ts --dry-run
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';

// ========== Config ==========

const ACTIVATIONS_TABLE = 'nasun-ecosystem-activations';
const PROFILES_TABLE = 'UserProfiles';

const DRY_RUN = process.argv.includes('--dry-run');
const OUTPUT_DIR = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'docs');

// Load GP-registered holders from the most recent CSV to exclude them
const GP_CSV_PATH = (() => {
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith('gp-holders-registered-') && f.endsWith('.csv'))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error('No gp-holders-registered-*.csv found in docs/');
  return path.join(OUTPUT_DIR, files[0]);
})();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// ========== Load GP holders ==========

function loadGpIdentityIds(): Set<string> {
  const content = fs.readFileSync(GP_CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // skip header
  const ids = new Set<string>();
  for (const line of lines) {
    const cols = line.split(',').map((c) => c.replace(/^"|"$/g, ''));
    const identityId = cols[1];
    if (identityId) ids.add(identityId);
  }
  return ids;
}

// ========== DynamoDB: Get all Alliance-activated users ==========

async function getAllianceActivatedUsers(): Promise<Set<string>> {
  const identityIds = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;

  console.log('[verify-alliance] Scanning nasun-ecosystem-activations for alliance activations...');

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: ACTIVATIONS_TABLE,
        FilterExpression: 'begins_with(sk, :prefix) AND #st = :active',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':prefix': 'alliance#', ':active': 'ACTIVE' },
        ProjectionExpression: 'identityId',
        ExclusiveStartKey: lastKey,
      })
    );

    for (const item of result.Items || []) {
      const id = item.identityId as string;
      if (id) identityIds.add(id);
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`[verify-alliance] Found ${identityIds.size} alliance-activated users`);
  return identityIds;
}

// ========== DynamoDB: Get UserProfiles in batches ==========

interface ProfileInfo {
  identityId: string;
  hasSocial: boolean;
  socialDetails: string; // e.g. "twitter,google"
  nasunAddress?: string;
}

function hasSocialAccount(item: Record<string, unknown>): { has: boolean; details: string } {
  const socials: string[] = [];

  // Twitter: twitterHandle field
  const twitterHandle = item.twitterHandle as string | undefined;
  if (twitterHandle) socials.push('twitter');

  // Google/email: provider field
  const provider = (item.provider as string | undefined)?.toLowerCase();
  if (provider === 'google' || provider === 'accounts.google.com') socials.push('google');

  // Cognito email (Google sign-in via Cognito sets provider differently)
  const linkedAccounts = item.linkedAccounts as Record<string, unknown> | undefined;
  if (linkedAccounts?.google) socials.push('google-linked');

  // Telegram
  if (item.isTelegramMember === true) socials.push('telegram');

  // Deduplicate
  const unique = [...new Set(socials)];
  return { has: unique.length > 0, details: unique.join(',') };
}

async function fetchProfiles(identityIds: string[]): Promise<Map<string, ProfileInfo>> {
  const profileMap = new Map<string, ProfileInfo>();
  const BATCH_SIZE = 100;

  for (let i = 0; i < identityIds.length; i += BATCH_SIZE) {
    const batch = identityIds.slice(i, i + BATCH_SIZE);

    const result = await client.send(
      new BatchGetCommand({
        RequestItems: {
          [PROFILES_TABLE]: {
            Keys: batch.map((id) => ({ identityId: id })),
            ProjectionExpression: 'identityId, twitterHandle, #prov, linkedAccounts, isTelegramMember, walletAddress',
            ExpressionAttributeNames: { '#prov': 'provider' },
          },
        },
      })
    );

    for (const item of result.Responses?.[PROFILES_TABLE] || []) {
      const id = item.identityId as string;
      const { has, details } = hasSocialAccount(item as Record<string, unknown>);
      profileMap.set(id, {
        identityId: id,
        hasSocial: has,
        socialDetails: details,
        nasunAddress: item.walletAddress as string | undefined,
      });
    }

    process.stdout.write(`\r[verify-alliance] Fetched profiles: ${Math.min(i + BATCH_SIZE, identityIds.length)}/${identityIds.length}`);
  }
  console.log('');
  return profileMap;
}

// ========== CSV ==========

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n') + '\n';
}

// ========== Main ==========

async function main() {
  console.log('[verify-alliance] Alliance NFT Airdrop Target Verification');
  console.log(`[verify-alliance] GP CSV: ${path.basename(GP_CSV_PATH)}`);
  if (DRY_RUN) console.log('[verify-alliance] DRY RUN');
  console.log('');

  // 1. Load GP identity IDs to exclude
  const gpIdentityIds = loadGpIdentityIds();
  console.log(`[verify-alliance] GP holders to exclude: ${gpIdentityIds.size}`);

  // 2. Get alliance-activated users
  const allianceActivated = await getAllianceActivatedUsers();

  // 3. Exclude GP holders
  const nonGpAlliance = [...allianceActivated].filter((id) => !gpIdentityIds.has(id));
  console.log(`[verify-alliance] After excluding GP holders: ${nonGpAlliance.length}`);

  // 4. Fetch profiles
  console.log('[verify-alliance] Fetching UserProfiles...');
  const profiles = await fetchProfiles(nonGpAlliance);

  // 5. Split eligible vs excluded
  const eligible: ProfileInfo[] = [];
  const excluded: ProfileInfo[] = [];

  for (const id of nonGpAlliance) {
    const profile = profiles.get(id);
    if (!profile) {
      excluded.push({ identityId: id, hasSocial: false, socialDetails: 'profile_not_found' });
      continue;
    }
    if (profile.hasSocial) {
      eligible.push(profile);
    } else {
      excluded.push(profile);
    }
  }

  // 6. Summary
  console.log('');
  console.log('[verify-alliance] === Results ===');
  console.log(`[verify-alliance] Alliance activated (total):    ${allianceActivated.size}`);
  console.log(`[verify-alliance] GP holders excluded:           ${allianceActivated.size - nonGpAlliance.length}`);
  console.log(`[verify-alliance] Remaining after GP exclusion:  ${nonGpAlliance.length}`);
  console.log(`[verify-alliance] Eligible (has social):         ${eligible.length}`);
  console.log(`[verify-alliance] Excluded (no social account):  ${excluded.length}`);
  console.log('');

  if (DRY_RUN) {
    console.log('[verify-alliance] DRY RUN complete.');
    return;
  }

  // 7. Write CSVs
  const date = new Date().toISOString().slice(0, 10);

  const eligiblePath = path.join(OUTPUT_DIR, `alliance-airdrop-targets-${date}.csv`);
  const excludedPath = path.join(OUTPUT_DIR, `alliance-airdrop-excluded-${date}.csv`);

  fs.writeFileSync(eligiblePath, toCsv([
    ['identity_id', 'nasun_address', 'social_accounts'],
    ...eligible.map((r) => [r.identityId, r.nasunAddress || '', r.socialDetails]),
  ]));

  fs.writeFileSync(excludedPath, toCsv([
    ['identity_id', 'nasun_address', 'reason'],
    ...excluded.map((r) => [r.identityId, r.nasunAddress || '', r.socialDetails || 'no_social']),
  ]));

  console.log(`[verify-alliance] Saved: ${eligiblePath}`);
  console.log(`[verify-alliance] Saved: ${excludedPath}`);
  console.log('[verify-alliance] Done.');
}

main().catch((err) => {
  console.error('[verify-alliance] Fatal error:', err);
  process.exit(1);
});
