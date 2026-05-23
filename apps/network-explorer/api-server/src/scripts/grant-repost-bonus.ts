/**
 * Repost Bonus Grant Script
 *
 * Awards 3 ecosystem points to users who reposted the official Nasun X post.
 * Category: ecosystem-bonus-repost
 *
 * Usage:
 *   cd ~/my_apps/nasun-monorepo/apps/network-explorer/api-server
 *   set -a && source .env && set +a
 *
 *   # Paste handles into HANDLES array below, then dry-run first:
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/grant-repost-bonus.ts
 *
 *   # Execute after reviewing dry-run output:
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/grant-repost-bonus.ts --execute
 *
 * Idempotent: re-running with --execute is safe (ON CONFLICT DO NOTHING).
 * tx_digest key includes tweetId + handle, so the same user can receive
 * bonuses for different tweets without collision.
 */

import postgres from 'postgres';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

// ─── CONFIG ─────────────────────────────────────────────────────────────────

// The tweet ID of the post users were asked to repost.
const TWEET_ID = '2056939880249544812';

// Paste the raw text from the user here. The script extracts @handles
// automatically — any format works (mentions, lists, prose, etc.).
const RAW_INPUT = `
@Luongson94 @VJBillionz1 @masud2633 @I_BlockFive @Le290788 @Richarduwah2 @elonunmk @Emiola_gangan @hyonggoo93 @SegunAdeba52413 @ashrai78 @msaqlainfcma @readnrest0 @NguynL615156 @beluong96 @web3_eyes @BornG69 @0xringond @BossWhatsNew @NgocNguyen63053 @furyrdx712 @wind_catcher23 @Diamondcryptx @samy69062958 @Obidestiny247 @Skymoon201095 @skybluenalpha @ReopaahScrin @indah_ye99 @PemburuCuan069 @4seazons263 @Putri_dhone @Anton4599262075 @BernadetaD70810 @ngedream @eglebai @naro0ck @0hmybo @0xaiaiai @BLVCK707 @safdarsulehry55 @0xAzk27 @fanumtta @D_O__Y_E @0x_nonol @Semobender @sintsarinan @minhvu229983 @sven_336 @NurRohm22672781 @MTown134056 @RvdWixx49687 @budie4167 @hashafifi @acahandi @kija888 @larionewlife @mv9984 @dung55443 @sucodautroc @elmeweb3 @invest_sometime @OjoPhilemo17247 @Abe_qearo @sicosongus
`;

const BONUS_POINTS = 3;

// ─── ENV / CLIENT SETUP ─────────────────────────────────────────────────────

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const execute = process.argv.includes('--execute');
const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

// ─── HANDLE EXTRACTION ───────────────────────────────────────────────────────

function extractHandles(raw: string): string[] {
  // Match @handle or bare handle-like tokens after whitespace/commas/newlines.
  // X handles: 1-15 chars, alphanumeric + underscore only.
  const atMentions = raw.match(/@([a-zA-Z0-9_]{1,15})/g) ?? [];
  const handles = atMentions.map((m) => m.slice(1).toLowerCase());
  // Deduplicate while preserving first-seen order.
  return [...new Set(handles)];
}

function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{1,15}$/.test(handle);
}

function isValidSuiAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(addr);
}

// ─── DYNAMODB HELPERS ────────────────────────────────────────────────────────

interface UserProfileRecord {
  identityId: string;
  username?: string;
  walletAddress?: string;
}

interface LinkedAccountInfo {
  identityId?: string;
  walletAddress?: string;
}

interface FullProfile {
  identityId: string;
  walletAddress?: string;
  linkedAccounts?: Record<string, LinkedAccountInfo>;
}

async function lookupIdentityByHandle(handle: string): Promise<string | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: USER_PROFILES_TABLE,
      IndexName: 'twitterHandle-index',
      KeyConditionExpression: 'twitterHandle = :handle',
      ExpressionAttributeValues: { ':handle': handle },
    }),
  );
  if (!result.Items || result.Items.length === 0) return null;

  let best = result.Items[0] as UserProfileRecord;
  for (const it of result.Items) {
    const p = it as UserProfileRecord;
    if (p.username && !p.username.startsWith('0x')) {
      best = p;
      break;
    }
  }
  return best.identityId;
}

async function resolveDisbursementTarget(
  primaryIdentityId: string,
): Promise<{ identityId: string; walletAddress: string; source: 'top-level' | 'linked-nasun-wallet' } | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId: primaryIdentityId } }),
  );
  const profile = result.Item as FullProfile | undefined;
  if (!profile) return null;

  if (profile.walletAddress) {
    return { identityId: primaryIdentityId, walletAddress: profile.walletAddress.toLowerCase(), source: 'top-level' };
  }

  const nasunLink = profile.linkedAccounts?.['nasun wallet'];
  if (nasunLink?.identityId && nasunLink.walletAddress) {
    return { identityId: nasunLink.identityId, walletAddress: nasunLink.walletAddress.toLowerCase(), source: 'linked-nasun-wallet' };
  }

  return null;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  if (!TWEET_ID || (TWEET_ID as string) === 'REPLACE_ME') {
    console.error('Set TWEET_ID before running.');
    process.exit(1);
  }
  if ((RAW_INPUT.trim() as string) === 'PASTE_LIST_HERE') {
    console.error('Paste the handle list into RAW_INPUT before running.');
    process.exit(1);
  }

  const handles = extractHandles(RAW_INPUT);
  if (handles.length === 0) {
    console.error('No @handles found in RAW_INPUT. Make sure handles start with @.');
    process.exit(1);
  }

  console.log(`\n=== Repost Bonus (${execute ? 'LIVE EXECUTE' : 'DRY RUN'}) ===`);
  console.log(`  Tweet ID:   ${TWEET_ID}`);
  console.log(`  Handles:    ${handles.length} extracted from RAW_INPUT`);
  console.log(`  Points:     ${BONUS_POINTS} each`);
  console.log(`  Handles:    ${handles.join(', ')}\n`);

  type Status = 'mapped' | 'missing' | 'no-wallet' | 'invalid-handle' | 'lookup-error';
  interface Row {
    handle: string;
    primaryIdentityId?: string;
    targetIdentityId?: string;
    targetWalletAddress?: string;
    walletSource?: 'top-level' | 'linked-nasun-wallet';
    status: Status;
    note?: string;
  }

  const results: Row[] = [];

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    const base: Row = { handle, status: 'missing' };

    if (!isValidHandle(handle)) {
      results.push({ ...base, status: 'invalid-handle', note: 'invalid X handle format' });
      continue;
    }

    try {
      const primaryId = await lookupIdentityByHandle(handle);
      if (!primaryId) {
        results.push(base);
        continue;
      }

      const target = await resolveDisbursementTarget(primaryId);
      if (!target) {
        results.push({ ...base, primaryIdentityId: primaryId, status: 'no-wallet', note: 'no nasun wallet' });
        continue;
      }

      if (!isValidSuiAddress(target.walletAddress)) {
        results.push({
          ...base,
          primaryIdentityId: primaryId,
          targetIdentityId: target.identityId,
          status: 'no-wallet',
          note: `invalid address format: ${target.walletAddress}`,
        });
        continue;
      }

      results.push({
        handle,
        primaryIdentityId: primaryId,
        targetIdentityId: target.identityId,
        targetWalletAddress: target.walletAddress,
        walletSource: target.source,
        status: 'mapped',
      });
    } catch (err) {
      results.push({ ...base, status: 'lookup-error', note: err instanceof Error ? err.message : String(err) });
    }

    if ((i + 1) % 20 === 0) process.stdout.write(`  ${i + 1}/${handles.length}\r`);
  }

  const mapped = results.filter((r) => r.status === 'mapped');
  const missing = results.filter((r) => r.status === 'missing');
  const noWallet = results.filter((r) => r.status === 'no-wallet');
  const invalid = results.filter((r) => r.status === 'invalid-handle');
  const errors = results.filter((r) => r.status === 'lookup-error');

  console.log('--- Mapping Summary ---');
  console.log(`  Mapped (eligible):     ${mapped.length}`);
  console.log(`    via top-level:         ${mapped.filter((r) => r.walletSource === 'top-level').length}`);
  console.log(`    via linked wallet:     ${mapped.filter((r) => r.walletSource === 'linked-nasun-wallet').length}`);
  console.log(`  Missing (no profile):  ${missing.length}${missing.length ? '  ' + missing.map((r) => r.handle).join(', ') : ''}`);
  console.log(`  No wallet:             ${noWallet.length}${noWallet.length ? '  ' + noWallet.map((r) => r.handle).join(', ') : ''}`);
  console.log(`  Invalid handle:        ${invalid.length}${invalid.length ? '  ' + invalid.map((r) => r.handle + ' (' + r.note + ')').join(', ') : ''}`);
  console.log(`  Lookup errors:         ${errors.length}`);
  console.log(`  Total pts to award:    ${mapped.length * BONUS_POINTS}\n`);

  if (!execute) {
    console.log('DRY RUN — no DB writes. Re-run with --execute to apply.');
    await db.end();
    ddb.destroy();
    return;
  }

  console.log('--- Inserting into activity_points ---');
  let inserted = 0;
  let skipped = 0;

  for (const r of mapped) {
    const digest = `repost:${TWEET_ID}:${r.handle}`;
    const result = await db`
      INSERT INTO activity_points
        (wallet_address, identity_id, tx_digest, category, activity_type,
         base_points, volume_tier, genesis_multiplier, final_points,
         tx_timestamp, event_seq, tx_sequence_number)
      VALUES
        (${r.targetWalletAddress!}, ${r.targetIdentityId!}, ${digest},
         'ecosystem-bonus-repost', 'x-repost',
         ${BONUS_POINTS}, 1.0, 1.0, ${BONUS_POINTS},
         NOW()::timestamptz, 0, 0)
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    if (result.count > 0) {
      inserted++;
    } else {
      skipped++;
      console.log(`  [skip] ${r.handle} — already awarded`);
    }
  }

  console.log('\n--- Execute Summary ---');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (already applied): ${skipped}`);
  console.log(`  Total points awarded: ${inserted * BONUS_POINTS}`);

  await db.end();
  ddb.destroy();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
