/**
 * One-time backfill script: creates missing SeasonAccountScore records
 * for accounts that exist in the cumulative Accounts table but have no
 * season-specific record (posts were registered before the season was active).
 *
 * Usage:
 *   # Dry run (read-only, shows what would be done)
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/backfill-season.ts
 *
 *   # Actual run
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod EXECUTE=1 npx tsx scripts/backfill-season.ts
 */

import {
  getAllAccounts,
  getSeasonAccountScores,
  getPostsByAccountId,
  updateSeasonAccountAggregates,
  getActiveSeason,
} from '../src/services/dynamodb-client';
import type { Post } from '../src/types';

const EXECUTE = process.env.EXECUTE === '1';

async function main() {
  console.log(`=== Season Backfill Script (${EXECUTE ? 'EXECUTE' : 'DRY RUN'}) ===\n`);

  // Get active season
  const season = await getActiveSeason();
  if (!season) {
    console.error('No active season found. Aborting.');
    process.exit(1);
  }

  const seasonId = season.seasonId;
  console.log(`Target season: ${season.name} (${seasonId})`);
  console.log(`Season period: ${season.startDate} ~ ${season.endDate}\n`);

  // Get all cumulative accounts
  const allAccounts = await getAllAccounts();
  console.log(`Total accounts in Accounts table: ${allAccounts.length}`);

  // Get all existing SeasonAccountScores
  const existingScores = await getSeasonAccountScores(seasonId);
  const existingAccountIds = new Set(existingScores.map((s) => s.accountId));
  console.log(`Existing SeasonAccountScores: ${existingScores.length}`);

  // Find missing accounts
  const missingAccounts = allAccounts.filter(
    (account) => !existingAccountIds.has(account.accountId)
  );
  console.log(`Missing accounts to backfill: ${missingAccounts.length}\n`);

  if (missingAccounts.length === 0) {
    console.log('Nothing to backfill. Done.');
    return;
  }

  // List missing accounts
  console.log('--- Missing Accounts ---');
  for (const account of missingAccounts) {
    console.log(`  @${account.originalUsername || account.username} (${account.accountId}) — postCount: ${account.postCount}, score: ${account.totalPostScore?.toFixed(2)}`);
  }
  console.log('');

  if (!EXECUTE) {
    console.log('Dry run complete. Set EXECUTE=1 to apply changes.');
    return;
  }

  // Backfill each missing account
  let backfilledCount = 0;
  let skippedCount = 0;

  for (const account of missingAccounts) {
    // Get all posts for this account
    const posts = await getPostsByAccountId(account.accountId, 2000);

    if (posts.length === 0) {
      console.log(`  @${account.username}: no posts found, skipping`);
      skippedCount++;
      continue;
    }

    // Sort chronologically
    const sortedPosts = posts.sort(
      (a: Post, b: Post) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    console.log(`  @${account.username}: backfilling ${sortedPosts.length} posts...`);

    for (const post of sortedPosts) {
      const postDate = post.createdAt.split('T')[0];

      await updateSeasonAccountAggregates({
        seasonId,
        accountId: account.accountId,
        username: account.username,
        originalUsername: account.originalUsername,
        platform: account.platform,
        postScoreToAdd: post.postScore,
        signalCountToAdd: post.contentSignals?.length || 0,
        todayDate: postDate,
        lastSeenAt: post.createdAt,
        displayName: account.displayName,
        profileImageUrl: account.profileImageUrl,
        isRegistered: account.isRegistered,
        isTelegramMember: account.isTelegramMember,
        postType: post.postType,
      });
    }

    backfilledCount++;
    console.log(`  @${account.username}: done (${sortedPosts.length} posts)`);
  }

  console.log(`\nBackfill complete: ${backfilledCount} accounts backfilled, ${skippedCount} skipped (no posts)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
