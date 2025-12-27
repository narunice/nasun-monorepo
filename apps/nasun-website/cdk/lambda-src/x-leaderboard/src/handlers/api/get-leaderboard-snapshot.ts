import { APIGatewayProxyHandler, APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { getEnvConfigV2 } from "../../utils/env";
import { LeaderboardService } from "../../services/leaderboard-service";
import { LeaderboardPeriod } from "../../types/leaderboard";

const ddbClient = new DynamoDBClient({});

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const startTime = Date.now();
  
  // CORS 헤더 설정
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,x-api-key",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json"
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ""
    };
  }

  try {
    const config = getEnvConfigV2();
    const leaderboardService = new LeaderboardService(ddbClient, config);

    // URL 경로에서 period 추출
    // /api/leaderboard/cumulative/snapshots/{date} → cumulative
    // /api/leaderboard/event1/snapshots/{date} → event1
    // /api/leaderboard/event2/snapshots/{date} → event2
    const path = event.path || event.resource || "";
    const periodMatch = path.match(/\/leaderboard\/([^/]+)\/snapshots/);
    const period = periodMatch ? periodMatch[1] : "cumulative";
    const date = event.pathParameters?.date;

    console.log("🔍 스냅샷 API 요청:", {
      period,
      date,
      path,
      userAgent: event.headers?.["User-Agent"] || "unknown",
      sourceIp: event.requestContext?.identity?.sourceIp || "unknown"
    });

    // date 파라미터 검증
    if (!date) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Date parameter is required",
          code: "MISSING_DATE"
        })
      };
    }

    // date 형식 검증 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Date must be in YYYY-MM-DD format",
          code: "INVALID_DATE_FORMAT"
        })
      };
    }

    // 미래 날짜 검증
    const requestedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 시간 부분 제거

    if (requestedDate > today) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Cannot request future dates",
          code: "FUTURE_DATE_NOT_ALLOWED"
        })
      };
    }

    // 쿼리 파라미터 파싱
    const queryParams = event.queryStringParameters || {};
    const page = parseInt(queryParams.page || "1");
    const limit = Math.min(parseInt(queryParams.limit || "50"), 100); // 최대 100개 제한

    if (page < 1) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Page must be greater than 0",
          code: "INVALID_PAGE"
        })
      };
    }

    if (limit < 1 || limit > 100) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Limit must be between 1 and 100",
          code: "INVALID_LIMIT"
        })
      };
    }

    // period 문자열을 LeaderboardPeriod enum으로 변환
    // URL에서 추출한 period 값을 대문자로 변환하여 enum과 매칭
    const leaderboardPeriod = period.toUpperCase() as LeaderboardPeriod;

    // 스냅샷 리더보드 데이터 조회
    const leaderboardResponse = await leaderboardService.getLeaderboardSnapshot(
      leaderboardPeriod,
      date,
      page,
      limit
    );

    // 스냅샷이 존재하지 않는 경우 (메타데이터가 없거나 총 사용자 수가 0)
    // metadata가 없거나 totalUsers가 0이고 entries도 없으면 스냅샷이 생성되지 않은 것
    const hasMetadata = leaderboardResponse.data?.metadata;
    const hasUsers = (leaderboardResponse.data?.metadata?.totalUsers ?? 0) > 0;
    const hasEntries = (leaderboardResponse.data?.entries.length ?? 0) > 0;

    if (!hasMetadata || (!hasUsers && !hasEntries)) {
      console.log("📅 스냅샷이 존재하지 않음:", {
        period,
        date,
        hasMetadata,
        hasUsers,
        hasEntries
      });

      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: `No leaderboard snapshot found for date: ${date}`,
          code: "SNAPSHOT_NOT_FOUND",
          date: date
        })
      };
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    console.log("✅ 스냅샷 API 응답 성공:", {
      period,
      date,
      entriesReturned: leaderboardResponse.data?.entries.length ?? 0,
      totalUsers: leaderboardResponse.data?.metadata?.totalUsers ?? 0,
      processingTimeMs: processingTime
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(leaderboardResponse)
    };

  } catch (error) {
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    console.error("❌ 스냅샷 API 오류:", error);

    // 스냅샷이 존재하지 않는 경우 404 반환
    if (error instanceof Error && error.message.includes("No items found")) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Snapshot not found for the specified date",
          code: "SNAPSHOT_NOT_FOUND",
          processingTimeMs: processingTime,
          timestamp: new Date().toISOString()
        })
      };
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        code: "INTERNAL_ERROR",
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      })
    };
  }
};