/**
 * 🆕 Phase 3: Rank Changes API Handler
 *
 * @description
 * 어제 대비 오늘의 랭킹 변동을 계산하여 반환합니다.
 * - 오늘 리더보드와 어제 스냅샷을 비교
 * - 각 사용자의 순위 변동 및 점수 변화 계산
 * - NEW(신규 진입), UP(상승), DOWN(하락), SAME(동일) 표시
 *
 * @author Claude Code
 * @date 2025-10-23
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { getEnvConfigV2 } from '../../utils/env';
import { LeaderboardService } from '../../services/leaderboard-service';
import { CumulativePeriod } from '../../types/cumulative';

const ddbClient = new DynamoDBClient({});

// CORS 헤더
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * 랭킹 변동 데이터 타입
 */
interface RankChange {
  username: string;
  userId: string;
  currentRank: number;
  previousRank: number | null;
  rankChange: number; // 양수 = 상승, 음수 = 하락, 0 = 동일
  direction: 'up' | 'down' | 'same' | 'new';
  currentScore: number;
  previousScore: number | null;
  scoreChange: number;
}

/**
 * 어제 날짜 계산 (YYYY-MM-DD 형식)
 */
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Lambda Handler
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    // 1. Period 추출
    const period = (event.pathParameters?.period?.toUpperCase() || 'CUMULATIVE') as CumulativePeriod;

    // 검증
    if (!['CUMULATIVE', 'EVENT1', 'EVENT2', 'EVENT3'].includes(period)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: `Invalid period: ${period}. Must be one of: cumulative, event1, event2, event3`,
          code: 'INVALID_PERIOD',
        }),
      };
    }

    console.log(`📊 [getRankChanges] 랭킹 변동 조회 시작: ${period}`);

    const config = getEnvConfigV2();
    const leaderboardService = new LeaderboardService(ddbClient, config);

    // 2. 오늘 리더보드 조회 (전체)
    const todayResult = await leaderboardService.getLeaderboard(
      period,
      1, // page
      500 // 전체 조회 (현재 사용자 수가 ~130명이므로 충분)
    );

    if (!todayResult.success || !todayResult.data) {
      console.error(`❌ [getRankChanges] 오늘 리더보드 조회 실패:`, todayResult.error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch today\'s leaderboard',
          code: 'TODAY_FETCH_FAILED',
        }),
      };
    }

    // 3. 어제 스냅샷 조회
    const yesterdayDate = getYesterdayDate();
    console.log(`📅 [getRankChanges] 어제 날짜: ${yesterdayDate}`);

    const yesterdayResult = await leaderboardService.getLeaderboardSnapshot(
      period,
      yesterdayDate,
      1,
      500
    );

    // 어제 스냅샷이 없을 수 있음 (첫날, 또는 스냅샷 미생성)
    const yesterdayEntries = yesterdayResult.success && yesterdayResult.data
      ? yesterdayResult.data.entries
      : [];

    console.log(`📊 [getRankChanges] 데이터 조회 완료:`, {
      today: todayResult.data.entries.length,
      yesterday: yesterdayEntries.length,
    });

    // 4. 어제 데이터를 Map으로 변환 (빠른 조회용)
    const yesterdayMap = new Map<string, { rank: number; score: number }>();
    for (const entry of yesterdayEntries) {
      yesterdayMap.set(entry.username, {
        rank: entry.rank,
        score: entry.totalScore,
      });
    }

    // 5. 랭킹 변동 계산
    const rankChanges: RankChange[] = [];

    for (const todayEntry of todayResult.data.entries) {
      const yesterday = yesterdayMap.get(todayEntry.username);

      let direction: 'up' | 'down' | 'same' | 'new';
      let rankChange: number;

      if (!yesterday) {
        // 신규 진입
        direction = 'new';
        rankChange = 0;
      } else {
        // 순위 비교 (낮은 숫자 = 높은 순위)
        const diff = yesterday.rank - todayEntry.rank;
        if (diff > 0) {
          direction = 'up'; // 순위 상승
          rankChange = diff;
        } else if (diff < 0) {
          direction = 'down'; // 순위 하락
          rankChange = diff; // 음수
        } else {
          direction = 'same'; // 순위 동일
          rankChange = 0;
        }
      }

      const scoreChange = yesterday
        ? todayEntry.totalScore - yesterday.score
        : 0;

      rankChanges.push({
        username: todayEntry.username,
        userId: todayEntry.userId,
        currentRank: todayEntry.rank,
        previousRank: yesterday?.rank || null,
        rankChange,
        direction,
        currentScore: todayEntry.totalScore,
        previousScore: yesterday?.score || null,
        scoreChange,
      });
    }

    const duration = Date.now() - startTime;

    console.log(`✅ [getRankChanges] 랭킹 변동 계산 완료: ${rankChanges.length}명 (${duration}ms)`);

    // 6. 응답 반환
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        data: {
          period,
          comparisonDate: yesterdayDate,
          changes: rankChanges,
          total: rankChanges.length,
          summary: {
            new: rankChanges.filter(c => c.direction === 'new').length,
            up: rankChanges.filter(c => c.direction === 'up').length,
            down: rankChanges.filter(c => c.direction === 'down').length,
            same: rankChanges.filter(c => c.direction === 'same').length,
          },
        },
        meta: {
          apiVersion: '1.0',
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        },
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`❌ [getRankChanges] 예외 발생 (${duration}ms):`, error);

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        meta: {
          duration: `${duration}ms`,
        },
      }),
    };
  }
};
