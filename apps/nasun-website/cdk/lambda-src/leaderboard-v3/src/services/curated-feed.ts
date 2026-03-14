/**
 * Curated Feed Service
 *
 * Reads/writes the admin-curated featured feed stored as a single DynamoDB item
 * in the seasons table (PK: __FEATURED_FEED__, SK: CURATED).
 * Enriches curated entries with post and account data for the public API.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CuratedFeedRecord,
  CuratedFeedEntry,
  FeaturedFeedItem,
  CURATED_FEED_PK,
  CURATED_FEED_SK,
  DYNAMO_KEYS,
} from '../types';
import { getPostById, getAccountById } from './dynamodb-client';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;

/**
 * Get the curated feed record from DynamoDB.
 * Returns null if no curated feed has been configured.
 */
export async function getCuratedFeedRecord(): Promise<CuratedFeedRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: SEASONS_TABLE,
      Key: {
        seasonId: CURATED_FEED_PK,
        sk: CURATED_FEED_SK,
      },
    })
  );
  return (result.Item as CuratedFeedRecord) || null;
}

/**
 * Save the curated feed record (full replace via PutItem).
 */
export async function saveCuratedFeedRecord(
  items: CuratedFeedEntry[],
  adminUsername: string
): Promise<CuratedFeedRecord> {
  const record: CuratedFeedRecord = {
    seasonId: CURATED_FEED_PK,
    sk: CURATED_FEED_SK,
    items,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUsername,
  };

  await docClient.send(
    new PutCommand({
      TableName: SEASONS_TABLE,
      Item: record,
    })
  );

  return record;
}

/**
 * Enrich curated entries with post and account data.
 * Skips entries where the post or account no longer exists.
 */
export async function enrichCuratedItems(
  entries: CuratedFeedEntry[]
): Promise<FeaturedFeedItem[]> {
  const results: FeaturedFeedItem[] = [];

  // Fetch all posts and accounts in parallel
  const enrichPromises = entries
    .sort((a, b) => a.order - b.order)
    .map(async (entry) => {
      const post = await getPostById(entry.postId);
      if (!post) return null;

      const account = await getAccountById(post.accountId);
      if (!account) return null;

      const item: FeaturedFeedItem = {
        type: 'post',
        postId: post.postId,
        author: {
          accountId: account.accountId,
          username: account.username,
          originalUsername: account.originalUsername,
          displayName: account.displayName,
          profileImageUrl: account.profileImageUrl,
          badges: [entry.badge],
        },
        content: {
          platform: post.platform,
          postUrl: post.postUrl,
          postType: post.postType || 'original',
          signals: post.contentSignals,
          createdAt: post.createdAt,
        },
      };

      return { order: entry.order, item };
    });

  const resolved = await Promise.all(enrichPromises);

  // Collect non-null results, maintaining order
  for (const r of resolved) {
    if (r) results.push(r.item);
  }

  return results;
}
