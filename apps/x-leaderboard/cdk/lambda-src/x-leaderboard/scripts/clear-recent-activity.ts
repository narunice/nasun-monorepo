
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "ap-northeast-2";
const TABLE_NAME = process.env.TABLE_NAME || "nasun-leaderboard-data";

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function getAllUserIds() {
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: "sk = :sk",
    ExpressionAttributeValues: { ":sk": "CUMULATIVE_SCORE" },
    ProjectionExpression: "userId",
  });
  const response = await docClient.send(command);
  return (response.Items || []).map(item => item.userId);
}

async function getRestoredUserIds() {
  const snapshotPK = `LEADERBOARD#CUMULATIVE#2025-10-14`;
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": snapshotPK },
    ProjectionExpression: "userId",
  });
  const response = await docClient.send(command);
  return (response.Items || []).map(item => item.userId);
}

async function clearRecentActivities() {
  console.log("Fetching all user IDs...");
  const allUserIds = await getAllUserIds();
  const usersToClear = allUserIds;

  if (usersToClear.length === 0) {
    console.log("No users found to clear recent activity for. Exiting.");
    return;
  }

  console.log(`Found ${usersToClear.length} new users to clear recent activity for:`, usersToClear);

  let deletedCount = 0;
  for (const userId of usersToClear) {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":sk_prefix": "RECENT#",
      },
    });
    const response = await docClient.send(command);
    const itemsToDelete = response.Items || [];

    if (itemsToDelete.length > 0) {
      const deleteRequests = itemsToDelete.map(item => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } }));
      const batchDeleteCommand = new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: deleteRequests },
      });
      await docClient.send(batchDeleteCommand);
      deletedCount += itemsToDelete.length;
      console.log(`Cleared ${itemsToDelete.length} recent activities for user ${userId}.`);
    }
  }

  console.log(`Finished. Total recent activities cleared: ${deletedCount}.`);
}

clearRecentActivities().catch(err => {
  console.error("Failed to clear recent activities:", err);
  process.exit(1);
});
