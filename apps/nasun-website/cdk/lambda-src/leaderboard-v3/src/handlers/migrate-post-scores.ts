/**
 * migrate-post-scores
 *
 * One-time migration: applies postTypeMultiplier to existing reply posts.
 * Reply posts created before postTypeMultiplier was introduced have postScore
 * calculated without the 0.5 multiplier. This handler corrects them.
 *
 * Usage: invoke manually via Lambda console with payload:
 *   {} - dry run (logs changes without writing)
 *   { "execute": true } - apply changes to DynamoDB
 *   { "seasonId": "season-1", "execute": true } - target specific season
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DYNAMO_KEYS, POST_TYPE_MULTIPLIERS } from '../types';
import { getActiveSeason, getSeasonById, getPostsBySeasonId } from '../services/dynamodb-client';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const POSTS_TABLE = process.env.LEADERBOARD_V3_POSTS_TABLE || DYNAMO_KEYS.POSTS_TABLE;
const REPLY_MULTIPLIER = POST_TYPE_MULTIPLIERS.reply; // 0.5

export const handler = async (event: Record<string, unknown>): Promise<void> => {
  const execute = event.execute === true;
  const rawSeasonId = event.seasonId;
  const targetSeasonId = typeof rawSeasonId === 'string' && rawSeasonId.trim().length > 0
    ? rawSeasonId.trim()
    : undefined;

  console.log(`[migrate-post-scores] mode=${execute ? 'EXECUTE' : 'DRY_RUN'}`);

  // Resolve season
  const season = targetSeasonId
    ? await getSeasonById(targetSeasonId)
    : await getActiveSeason();

  if (!season) {
    console.error('No season found. Provide seasonId or ensure an active season exists.');
    return;
  }

  console.log(`[migrate-post-scores] season=${season.seasonId}`);

  // Fetch all posts for the season
  const allPosts = await getPostsBySeasonId(season.seasonId);
  console.log(`[migrate-post-scores] total posts fetched: ${allPosts.length}`);

  // Filter: reply posts that don't already have postTypeMultiplier set
  // Use loose null check to catch both undefined and null from DynamoDB
  const replyPosts = allPosts.filter(
    (p) => p.postType === 'reply' && p.postTypeMultiplier == null
  );

  console.log(`[migrate-post-scores] reply posts without multiplier: ${replyPosts.length}`);

  if (replyPosts.length === 0) {
    console.log('[migrate-post-scores] Nothing to migrate.');
    return;
  }

  // Preview first 10
  // Correct formula: base * postTypeMultiplier * roleMultiplier + signalBonus
  // NOT: postScore * 0.5, which would incorrectly reduce signalBonus and fail for capped scores
  replyPosts.slice(0, 10).forEach((p) => {
    const newScore = Math.min(
      Math.round((p.baseScore * REPLY_MULTIPLIER * p.roleMultiplier + p.signalBonus) * 1000) / 1000,
      5.0
    );
    console.log(`  postId=${p.postId} username=${p.username} postScore: ${p.postScore} -> ${newScore}`);
  });

  if (!execute) {
    console.log(`[migrate-post-scores] DRY RUN complete. ${replyPosts.length} posts would be updated.`);
    console.log('[migrate-post-scores] Re-invoke with { "execute": true } to apply.');
    return;
  }

  // Apply updates
  let updated = 0;
  let failed = 0;

  for (const post of replyPosts) {
    // Recalculate from stored components to get the exact intended score.
    // Using postScore * 0.5 would be wrong when signalBonus > 0 or postScore was capped.
    const correctedScore = Math.min(
      Math.round((post.baseScore * REPLY_MULTIPLIER * post.roleMultiplier + post.signalBonus) * 1000) / 1000,
      5.0
    );
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: POSTS_TABLE,
          Key: { postId: post.postId },
          UpdateExpression: 'SET postTypeMultiplier = :ptm, postScore = :ps',
          ExpressionAttributeValues: {
            ':ptm': REPLY_MULTIPLIER,
            ':ps': correctedScore,
          },
          // Only update if not already migrated (safety check)
          ConditionExpression: 'attribute_not_exists(postTypeMultiplier)',
        })
      );
      updated++;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        console.warn(`[migrate-post-scores] Skipped already-migrated post: ${post.postId}`);
      } else {
        console.error(`[migrate-post-scores] Failed to update postId=${post.postId}:`, err);
        failed++;
      }
    }
  }

  console.log(`[migrate-post-scores] Done. updated=${updated}, failed=${failed}`);
};
