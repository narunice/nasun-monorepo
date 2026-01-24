
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "ap-northeast-2";
const TABLE_NAME = process.env.TABLE_NAME || "nasun-leaderboard-data";
const GSI_KEY_NAME = "leaderboardIdentifier";
const GSI_KEY_VALUE = "SCORE_RECORD";

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function getAllCumulativeScores() {
  console.log(`Scanning ${TABLE_NAME} for items with sk = CUMULATIVE_SCORE...`);
  let lastEvaluatedKey: any = undefined;
  const allItems = [];

  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "sk = :sk",
      ExpressionAttributeValues: {
        ":sk": "CUMULATIVE_SCORE",
      },
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const response = await docClient.send(command);
    if (response.Items) {
      allItems.push(...response.Items);
    }
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`Found ${allItems.length} items to migrate.`);
  return allItems;
}

async function migrateData() {
  const itemsToMigrate = await getAllCumulativeScores();
  const itemsToUpdate = itemsToMigrate.filter(item => item[GSI_KEY_NAME] !== GSI_KEY_VALUE);

  if (itemsToUpdate.length === 0) {
    console.log("All items are already up-to-date. No migration needed.");
    return;
  }

  console.log(`Found ${itemsToUpdate.length} items that need migration.`);

  const batchSize = 25;
  for (let i = 0; i < itemsToUpdate.length; i += batchSize) {
    const batch = itemsToUpdate.slice(i, i + batchSize);
    const writeRequests = batch.map(item => {
      item[GSI_KEY_NAME] = GSI_KEY_VALUE;
      return {
        PutRequest: {
          Item: item,
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
      console.log(`Successfully migrated batch ${i / batchSize + 1} of ${Math.ceil(itemsToUpdate.length / batchSize)}`);
    } catch (error) {
      console.error(`Error migrating batch ${i / batchSize + 1}:`, error);
    }
  }

  console.log("Data migration completed successfully.");
}

migrateData().catch(err => {
  console.error("Migration script failed:", err);
  process.exit(1);
});
