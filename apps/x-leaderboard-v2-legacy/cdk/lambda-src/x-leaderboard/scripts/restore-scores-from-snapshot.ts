
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "ap-northeast-2";
const TABLE_NAME = process.env.TABLE_NAME || "nasun-leaderboard-data";
const SNAPSHOT_DATE = process.env.SNAPSHOT_DATE || "2025-10-14";

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function getSnapshotData() {
  const snapshotPK = `LEADERBOARD#CUMULATIVE#${SNAPSHOT_DATE}`;
  console.log(`Reading snapshot data from ${snapshotPK}...`);

  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": snapshotPK,
    },
  });

  const response = await docClient.send(command);
  const items = response.Items || [];
  console.log(`Found ${items.length} items in the snapshot.`);
  return items.filter(item => item.sk !== 'METADATA'); // 메타데이터 제외
}

async function restoreScores() {
  const snapshotEntries = await getSnapshotData();

  if (snapshotEntries.length === 0) {
    console.log("No snapshot data found to restore. Exiting.");
    return;
  }

  console.log(`Restoring scores for ${snapshotEntries.length} users...`);

  const batchSize = 25;
  for (let i = 0; i < snapshotEntries.length; i += batchSize) {
    const batch = snapshotEntries.slice(i, i + batchSize);
    const writeRequests = batch.map(entry => {
      const userRecord = {
        pk: `USER#${entry.userId}`,
        sk: "CUMULATIVE_SCORE",
        userId: entry.userId,
        username: entry.username,
        displayName: entry.displayName,
        profileImageUrl: entry.profileImageUrl,
        followersCount: entry.followersCount,
        totalScore: entry.totalScore,
        totalLikes: entry.totalLikes,
        totalReplies: entry.totalReplies,
        totalReposts: entry.totalReposts,
        totalQuotes: entry.totalQuotes,
        totalMentions: entry.totalMentions,
        dominantLanguage: entry.dominantLanguage || 'unknown', // 언어 필드 추가
        communityWeight: entry.communityWeight || 1.0, // 커뮤니티 가중치 추가
        lastUpdated: new Date().toISOString(),
        leaderboardIdentifier: "SCORE_RECORD", // GSI 키 포함
        version: "v2.2-restored" // 버전 업데이트
      };
      return {
        PutRequest: {
          Item: userRecord,
        },
      };
    });

    const command = new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: writeRequests,
      },
    });

    try {
      await docClient.send(command);
      console.log(`Successfully restored batch ${i / batchSize + 1}. Users: ${batch.map(e => e.username).join(', ')}`);
    } catch (error) {
      console.error(`Error restoring batch ${i / batchSize + 1}:`, error);
    }
  }

  console.log("Score restoration completed successfully.");
}

restoreScores().catch(err => {
  console.error("Score restoration script failed:", err);
  process.exit(1);
});
