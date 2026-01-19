// DynamoDB storage for followers data

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { Follower } from './twitter-api';

export interface StoredFollower {
  PK: string; // TARGET#{username}
  SK: string; // FOLLOWER#{userId}
  userId: string;
  username: string;
  name: string;
  profileImageUrl?: string;
  followersCount?: number;
  followingCount?: number;
  verified?: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  status: 'active' | 'unfollowed';
}

export interface FollowerHistory {
  PK: string; // TARGET#{username}
  SK: string; // HISTORY#{date}
  date: string;
  totalFollowers: number;
  newFollowers: number;
  unfollowed: number;
  netChange: number;
  newFollowerIds: string[];
  unfollowedIds: string[];
}

export interface DiffResult {
  newFollowers: Follower[];
  unfollowed: StoredFollower[];
  unchanged: number;
}

export class FollowerStore {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string, region: string) {
    const client = new DynamoDBClient({ region });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  /**
   * Get all existing followers for a target account
   */
  async getExistingFollowers(targetUsername: string): Promise<StoredFollower[]> {
    const followers: StoredFollower[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `TARGET#${targetUsername}`,
            ':sk': 'FOLLOWER#',
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      if (response.Items) {
        followers.push(...(response.Items as StoredFollower[]));
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`[FOLLOWER_STORE] Loaded ${followers.length} existing followers for ${targetUsername}`);
    return followers;
  }

  /**
   * Compare current followers with existing data to find new/unfollowed
   */
  diffFollowers(
    existingFollowers: StoredFollower[],
    currentFollowers: Follower[]
  ): DiffResult {
    const existingMap = new Map(
      existingFollowers
        .filter((f) => f.status === 'active')
        .map((f) => [f.userId, f])
    );
    const currentMap = new Map(currentFollowers.map((f) => [f.id, f]));

    // Find new followers (in current but not in existing)
    const newFollowers = currentFollowers.filter((f) => !existingMap.has(f.id));

    // Find unfollowed (in existing but not in current)
    const unfollowed = existingFollowers.filter(
      (f) => f.status === 'active' && !currentMap.has(f.userId)
    );

    // Unchanged count
    const unchanged = currentFollowers.length - newFollowers.length;

    console.log(
      `[FOLLOWER_STORE] Diff: new=${newFollowers.length}, unfollowed=${unfollowed.length}, unchanged=${unchanged}`
    );

    return { newFollowers, unfollowed, unchanged };
  }

  /**
   * Update followers in DynamoDB (batch write)
   */
  async updateFollowers(
    targetUsername: string,
    currentFollowers: Follower[],
    newFollowers: Follower[],
    unfollowed: StoredFollower[]
  ): Promise<void> {
    const now = new Date().toISOString();
    const pk = `TARGET#${targetUsername}`;

    // Batch write operations (max 25 per batch)
    const writeRequests: any[] = [];

    // 1. Update existing followers with lastSeenAt
    for (const follower of currentFollowers) {
      const existing = newFollowers.find((f) => f.id === follower.id);
      if (!existing) {
        // Existing follower - just update lastSeenAt
        writeRequests.push({
          PutRequest: {
            Item: {
              PK: pk,
              SK: `FOLLOWER#${follower.id}`,
              userId: follower.id,
              username: follower.username,
              name: follower.name,
              profileImageUrl: follower.profileImageUrl,
              followersCount: follower.followersCount,
              followingCount: follower.followingCount,
              verified: follower.verified,
              lastSeenAt: now,
              status: 'active',
            },
          },
        });
      }
    }

    // 2. Add new followers
    for (const follower of newFollowers) {
      writeRequests.push({
        PutRequest: {
          Item: {
            PK: pk,
            SK: `FOLLOWER#${follower.id}`,
            userId: follower.id,
            username: follower.username,
            name: follower.name,
            profileImageUrl: follower.profileImageUrl,
            followersCount: follower.followersCount,
            followingCount: follower.followingCount,
            verified: follower.verified,
            firstSeenAt: now,
            lastSeenAt: now,
            status: 'active',
          },
        },
      });
    }

    // 3. Mark unfollowed as 'unfollowed'
    for (const follower of unfollowed) {
      writeRequests.push({
        PutRequest: {
          Item: {
            ...follower,
            status: 'unfollowed',
            lastSeenAt: now,
          },
        },
      });
    }

    // Execute batch writes (25 items per batch)
    const batches = this.chunkArray(writeRequests, 25);
    console.log(
      `[FOLLOWER_STORE] Writing ${writeRequests.length} items in ${batches.length} batches`
    );

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      await this.docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: batch,
          },
        })
      );
      console.log(`[FOLLOWER_STORE] Batch ${i + 1}/${batches.length} completed`);

      // Small delay between batches
      if (i < batches.length - 1) {
        await this.delay(100);
      }
    }
  }

  /**
   * Record daily history
   */
  async recordHistory(
    targetUsername: string,
    stats: {
      totalFollowers: number;
      newFollowers: number;
      unfollowed: number;
      newFollowerIds: string[];
      unfollowedIds: string[];
    }
  ): Promise<void> {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const historyItem: FollowerHistory = {
      PK: `TARGET#${targetUsername}`,
      SK: `HISTORY#${dateStr}`,
      date: dateStr,
      totalFollowers: stats.totalFollowers,
      newFollowers: stats.newFollowers,
      unfollowed: stats.unfollowed,
      netChange: stats.newFollowers - stats.unfollowed,
      newFollowerIds: stats.newFollowerIds.slice(0, 100), // Limit to 100 IDs
      unfollowedIds: stats.unfollowedIds.slice(0, 100),
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: historyItem,
      })
    );

    console.log(
      `[FOLLOWER_STORE] History recorded for ${targetUsername}: ${dateStr}, ` +
        `total=${stats.totalFollowers}, new=${stats.newFollowers}, unfollowed=${stats.unfollowed}`
    );
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
