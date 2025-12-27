// src/index.ts
// src/index.ts

import { DynamoDB } from "aws-sdk";
import { APIGatewayProxyHandler } from "aws-lambda";

const docClient = new DynamoDB.DocumentClient();
const TABLE = process.env.TABLE_NAME || "";

// CORS 헤더를 포함한 응답 헬퍼
const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export const handler: APIGatewayProxyHandler = async (event) => {
  // 1) 들어온 이벤트 전체 로깅
  console.log("🚀 Received event:", JSON.stringify(event, null, 2));
  // 2) 환경변수 TABLE_NAME 확인
  console.log("🔑 Using DynamoDB table:", TABLE);

  // 3) tier 파라미터 추출 (proxy integration 지원)
  // URL 패턴: /getSupplyCount/TIER1 → proxy = "getSupplyCount/TIER1"
  let tier = event.pathParameters?.tier;

  // LambdaRestApi proxy 모드에서는 pathParameters.proxy로 전달됨
  if (!tier && event.pathParameters?.proxy) {
    const proxyPath = event.pathParameters.proxy;
    // "getSupplyCount/TIER1" 또는 "tier/TIER1" 형식에서 마지막 부분 추출
    const parts = proxyPath.split('/');
    tier = parts[parts.length - 1];
  }

  // event.path에서도 추출 시도 (fallback)
  if (!tier && event.path) {
    const pathParts = event.path.split('/').filter(Boolean);
    tier = pathParts[pathParts.length - 1];
  }

  console.log("🏷  Extracted tier:", tier);

  if (!tier) {
    console.error("❌ Missing required path parameter: tier");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing tier" }),
      headers: corsHeaders,
    };
  }

  try {
    // 4) DynamoDB 쿼리 수행 전 로깅
    console.log(`🔍 Querying DynamoDB for tier = ${tier}...`);
    const result = await docClient
      .query({
        TableName: TABLE,
        KeyConditionExpression: "tier = :t",
        ExpressionAttributeValues: { ":t": tier },
        ProjectionExpression: "mintedCount",
        ConsistentRead: true,
      })
      .promise();

    // 5) 쿼리 결과 로깅
    console.log("📦 DynamoDB query.Items:", JSON.stringify(result.Items, null, 2));

    // Items가 undefined일 수도 있으니 기본 빈 배열 처리
    const items = (result.Items as Array<{ mintedCount?: number }>) || [];

    // 6) 합산 전 로깅
    console.log(
      "➗ Reducing items to total mintedCount:",
      items.map((i) => i.mintedCount)
    );

    const currentCount = items.reduce(
      (sum: number, item: { mintedCount?: number }) => sum + (item.mintedCount ?? 0),
      0
    );

    // 7) 최종합 로깅
    console.log("✅ Computed currentCount:", currentCount);

    return {
      statusCode: 200,
      body: JSON.stringify({ tier, currentCount }),
      headers: corsHeaders,
    };
  } catch (error) {
    console.error("💥 getSupplyCount error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
      headers: corsHeaders,
    };
  }
};
