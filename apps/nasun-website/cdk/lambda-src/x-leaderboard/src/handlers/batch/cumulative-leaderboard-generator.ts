import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { getEnvConfigV2 } from "../../utils/env";
import { LeaderboardGenerator } from "../../services/leaderboard-generator";
// import { CumulativeScoreManager } from "../../services/cumulative-score-manager";

const ddbClient = new DynamoDBClient({});

export const handler: APIGatewayProxyHandler = async (event) => {
  const startTime = Date.now();

  try {
    const config = getEnvConfigV2();
    const leaderboardGenerator = new LeaderboardGenerator(ddbClient, config);

    // Parse pipeline data (Step Functions sends data directly in event)
    const eventData = event.body ? JSON.parse(event.body) : event;
    const { collectedEngagements } = eventData;

    console.log(`📅 [HANDLER] Generating leaderboards`, {
      hasCollectedEngagements: !!collectedEngagements,
      engagementsCount: collectedEngagements?.length || 0
    });

    const results = await leaderboardGenerator.generateAllLeaderboards(collectedEngagements);

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    const response = {
      success: true,
      executedAt: new Date().toISOString(),
      processingTimeMs: processingTime,
      results
    };

    console.log(`✅ [HANDLER] Leaderboard generation complete`, {
      cumulative: results.cumulative?.entriesGenerated,
      event1: results.event1?.entriesGenerated,
      event2: results.event2?.entriesGenerated,
      processingTimeMs: processingTime
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(response),
    };

  } catch (error) {
    console.error("❌ [HANDLER] 리더보드 생성 실패:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executedAt: new Date().toISOString(),
      }),
    };
  }
};