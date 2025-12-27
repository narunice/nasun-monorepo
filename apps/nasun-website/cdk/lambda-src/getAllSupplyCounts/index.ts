import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;

// A simple response helper
const createResponse = (statusCode: number, body: object) => {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(body),
  };
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!TABLE_NAME) {
    console.error("TABLE_NAME environment variable is not set.");
    return createResponse(500, { error: "Internal server error: Missing configuration." });
  }

  try {
    console.log("Scanning DynamoDB table:", TABLE_NAME);

    const scanCommand = new ScanCommand({
      TableName: TABLE_NAME,
      // We only need the 'tier' attribute for counting
      ProjectionExpression: "tier",
    });

    const allItems = [];
    let lastEvaluatedKey;

    // Handle pagination in Scan
    do {
      const command = new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: "tier",
        ExclusiveStartKey: lastEvaluatedKey,
      });
      const response = await docClient.send(command);
      if (response.Items) {
        allItems.push(...response.Items);
      }
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Successfully scanned ${allItems.length} items.`);

    // Aggregate counts by tier
    const supplyCounts: { [key: string]: number } = {};

    for (const item of allItems) {
      if (item.tier) {
        supplyCounts[item.tier] = (supplyCounts[item.tier] || 0) + 1;
      }
    }

    console.log("Aggregated counts:", supplyCounts);

    return createResponse(200, {
      success: true,
      counts: supplyCounts,
    });

  } catch (error) {
    console.error("Error scanning DynamoDB:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return createResponse(500, { error: "Could not retrieve supply counts.", details: errorMessage });
  }
};
