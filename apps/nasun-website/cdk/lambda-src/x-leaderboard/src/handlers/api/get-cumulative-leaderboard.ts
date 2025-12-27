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
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
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

    // 쿼리 파라미터 파싱
    const queryParams = event.queryStringParameters || {};
    const page = parseInt(queryParams.page || "1");
    const limit = Math.min(parseInt(queryParams.limit || "50"), 100); // 최대 100개 제한
    const period = queryParams.period || "cumulative"; // cumulative, event1, event2
    const date = queryParams.date; // YYYY-MM-DD 형식 (선택사항)

    console.log("🔍 API 요청 파라미터:", {
      page,
      limit,
      period,
      date,
      userAgent: event.headers?.["User-Agent"] || "unknown",
      sourceIp: event.requestContext?.identity?.sourceIp || "unknown"
    });

    // 파라미터 검증
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

    const validPeriods = ["cumulative", "event1", "event2", "event3"];
    if (!validPeriods.includes(period)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: `Period must be one of: ${validPeriods.join(", ")}`,
          code: "INVALID_PERIOD"
        })
      };
    }

    // period 문자열을 LeaderboardPeriod enum으로 변환
    let leaderboardPeriod: LeaderboardPeriod;
    switch (period) {
      case "cumulative":
        leaderboardPeriod = LeaderboardPeriod.CUMULATIVE;
        break;
      case "event1":
        leaderboardPeriod = LeaderboardPeriod.EVENT1;
        break;
      case "event2":
        leaderboardPeriod = LeaderboardPeriod.EVENT2;
        break;
      case "event3":
        leaderboardPeriod = LeaderboardPeriod.EVENT3;
        break;
      default:
        leaderboardPeriod = LeaderboardPeriod.CUMULATIVE;
    }

    // 🆕 이벤트 종료 및 누적 리더보드 폴백 로직 강화
    let effectiveDate = date;
    let isFinalRanking = false;
    let leaderboardResponse;

    if (date) {
      // 날짜가 지정된 경우, 해당 날짜의 스냅샷을 직접 조회
      console.log(`🔍 날짜 지정됨: ${date} 스냅샷 조회`);
      leaderboardResponse = await leaderboardService.getLeaderboardSnapshot(leaderboardPeriod, date, page, limit);
    } else if (leaderboardPeriod !== LeaderboardPeriod.CUMULATIVE) {
      // 이벤트 리더보드인 경우, 종료 여부 확인
      const isEnded = leaderboardService.isEventEnded(leaderboardPeriod);
      if (isEnded) {
        // 🆕 getLatestSnapshotDate()를 사용하여 실제로 존재하는 스냅샷 찾기
        const snapshotDate = await leaderboardService.getLatestSnapshotDate(leaderboardPeriod);
        if (snapshotDate) {
          effectiveDate = snapshotDate;
          isFinalRanking = true;
          console.log(`📅 이벤트 종료됨 - Final Rankings 조회: ${effectiveDate}`);
          leaderboardResponse = await leaderboardService.getLeaderboardSnapshot(leaderboardPeriod, effectiveDate, page, limit);
        } else {
          console.log(`⚠️ 스냅샷을 찾을 수 없음, 현재 리더보드 조회`);
          leaderboardResponse = await leaderboardService.getEventPeriodLeaderboard(leaderboardPeriod, page, limit);
        }
      } else {
        leaderboardResponse = await leaderboardService.getEventPeriodLeaderboard(leaderboardPeriod, page, limit);
      }
    } else {
      // 누적 리더보드인 경우 (폴백 로직 적용)
      leaderboardResponse = await leaderboardService.getEventPeriodLeaderboard(leaderboardPeriod, page, limit);

      if (leaderboardResponse.success && (!leaderboardResponse.data || leaderboardResponse.data.entries.length === 0)) {
        console.log("🔄 Cumulative leaderboard for today is empty. Falling back to the latest snapshot (yesterday).");
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const snapshotResponse = await leaderboardService.getLeaderboardSnapshot(LeaderboardPeriod.CUMULATIVE, yesterdayStr, page, limit);

        if (snapshotResponse.success && snapshotResponse.data && snapshotResponse.data.entries.length > 0) {
          console.log(`✅ Fallback successful. Serving snapshot from ${yesterdayStr}.`);
          leaderboardResponse = snapshotResponse;
          leaderboardResponse.data.metadata.isSnapshot = true;
          leaderboardResponse.data.metadata.snapshotDate = yesterdayStr;
        } else {
          console.log(`⚠️ Fallback to yesterday's snapshot also yielded no data.`);
        }
      }
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // 🆕 Final Ranking 또는 Snapshot 정보를 metadata에 추가
    if (leaderboardResponse.success && leaderboardResponse.data) {
      if (isFinalRanking) {
        leaderboardResponse.data.metadata = {
          ...leaderboardResponse.data.metadata,
          isEventEnded: true,
          isFinalRanking: true,
          finalRankingDate: effectiveDate,
          snapshotDate: effectiveDate  // 🆕 스냅샷 날짜 명시적 설정
        };
      }
    }

    console.log("✅ API 응답 성공:", {
      period,
      entriesReturned: leaderboardResponse.data?.entries.length ?? 0,
      totalUsers: leaderboardResponse.data?.metadata?.totalUsers ?? 0,
      isFinalRanking,
      finalRankingDate: effectiveDate,
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

    console.error("❌ API 오류:", error);

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