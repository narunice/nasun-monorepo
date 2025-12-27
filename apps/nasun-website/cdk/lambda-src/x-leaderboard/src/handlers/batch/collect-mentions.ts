
// Step Functions 워크플로우 - 멘션 데이터 수집 (독립적 실행)

import { Context } from "aws-lambda";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { TwitterApiService } from "../../services/twitter-api";
import { EngagementData, CollectMentionsOutput } from "../../types/cumulative";
import { getEnvConfigV2, validateEnvConfigV2, getSnapshotDateRange, SNAPSHOT_CONFIG } from "../../utils/env";
import { secureTokenManager } from "../../services/secure-token-manager";
import { cloudWatchMetrics } from "../../services/cloudwatch-metrics";
import { RateLimitError, TwitterAPIError, isRateLimitError, isRetryableError } from "../../utils/step-functions-errors";
import { SnapshotTracker } from "../../utils/snapshot-tracker";

/**
 * 멘션 수집 입력 타입
 */
export interface CollectMentionsInput {
  targetUser: {
    id: string;
    username: string;
  };
  dateRange: {
    start: string;
    end: string;
  };
  collectionDate: string;
}

// CollectMentionsOutput은 이제 cumulative.ts에서 import됨

/**
 * Step Functions 멘션 수집 단계: 타겟 사용자에 대한 멘션 데이터 수집 (True Snapshot V3)
 *
 * 🆕 True Snapshot V3 방식:
 * - V2 (롤링 윈도우): 최근 24시간 매일 수집 (중복 수집)
 * - V3 (True Snapshot): 1일 전 특정 날짜만 수집 + DB 마킹으로 중복 방지
 *
 * 🎯 수집 대상: 1일 전 작성된 멘션 포스트 (Active 인게이지먼트)
 * 🛡️ 스팸 방지: 사용자당 일일 3회 제한 + 4시간 쿨다운
 * 📊 점수 시스템: 기본 2.5점 + 쿨다운 보너스 (최대 3.0점)
 * 💾 저장 전략: 하이브리드 (감사 로그 필수 + 사용자 뷰 조건부)
 * 📅 스냅샷 전략: Active 그룹 (대화형 지표) → 1일 전 수집 후 DB 마킹
 * 🔒 멱등성: SnapshotTracker로 이미 수집된 멘션 건너뜀
 */
export const handler = async (
  event: CollectMentionsInput,
  context: Context
): Promise<CollectMentionsOutput> => {
  const startTime = Date.now();
  
  console.log(`🚀 [MENTIONS] Collect Mentions 시작`);
  console.log("전체 이벤트:", JSON.stringify(event, null, 2)); // 상세 로깅 추가
  
  // 🔽 [수정] targetUser 안전하게 확보하는 로직 추가
  let targetUser = event.targetUser;
  if (!targetUser) {
    console.log("⚠️ 입력 이벤트에 targetUser가 없습니다. 환경 변수에서 값을 가져옵니다.");
    targetUser = {
      id: process.env.TARGET_USER_ID || "",
      username: process.env.TARGET_USERNAME || ""
    };
  }

  if (!targetUser.id || !targetUser.username) {
    throw new Error("치명적 오류: 타겟 사용자 ID 또는 사용자명을 확인할 수 없습니다.");
  }

  // ⭐ V3 스냅샷 전략: 1일 전 특정 날짜만 수집 (Active 그룹)
  const activeRange = getSnapshotDateRange(SNAPSHOT_CONFIG.active.daysAgo);  // 1 day ago

  if (!event.collectionDate) {
    event.collectionDate = new Date().toISOString().split('T')[0];
    console.log("⚠️ collectionDate가 없어 기본값을 설정합니다:", event.collectionDate);
  }

  console.log(`\n📊 [TRUE_SNAPSHOT_V3] 멘션 수집 전략:`);
  console.log(`  🟢 Active (대화형 지표) - ${SNAPSHOT_CONFIG.active.daysAgo}일 전:`);
  console.log(`  🎯 수집 타입: ${SNAPSHOT_CONFIG.active.types.join(', ')}`);
  console.log(`  📅 이유: ${SNAPSHOT_CONFIG.active.reason}`);
  console.log(`  ⏰ 범위: ${activeRange.start} ~ ${activeRange.end}`);
  console.log(`  🔒 중복 방지: SnapshotTracker 멱등성 체크\n`);

  console.log("📡 입력:", JSON.stringify({
    targetUser: targetUser.username,
    snapshotRange: activeRange,
    collectionDate: event.collectionDate
  }, null, 2));

  try {
    // 환경 설정 및 Twitter 서비스 초기화
    const config = getEnvConfigV2();
    validateEnvConfigV2(config);

    const secureTokens = await secureTokenManager.getTokens();
    const twitterService = new TwitterApiService(config, secureTokens);

    // 멘션 카운터 서비스 초기화
    const tableName = config.cumulativeTableName;
    twitterService.initializeMentionCounter(tableName);

    // ⭐ V3: SnapshotTracker 초기화 (멱등성 보장)
    const snapshotTracker = new SnapshotTracker(tableName);

    console.log(`🔢 [MENTIONS] 멘션 카운터 서비스 초기화 완료`);
    console.log(`🔒 [MENTIONS] SnapshotTracker 초기화 완료 (멱등성 보장)`);
    console.log(`📞 [MENTIONS] 수집 시작 - 사용자: @${targetUser.username} (${targetUser.id})`);
    console.log(`📅 [MENTIONS] 수집 기간 (1일 전 스냅샷): ${activeRange.start} ~ ${activeRange.end}`);

    // 멘션 데이터 수집 실행 (1일 전 스냅샷)
    const mentionStartTime = Date.now();
    const allMentions = await twitterService.collectUserMentions(
      targetUser.id,
      activeRange.start,
      activeRange.end
    );

    console.log(`📞 [MENTIONS] X API 수집 완료: ${allMentions.length}개 멘션`);

    // ⭐ V3: 중복 수집 방지 - 이미 수집된 멘션 필터링
    // 멘션은 트윗 기반이 아니라 engaging_user 기반이므로,
    // 각 멘션의 tweet_id를 기준으로 체크
    const uncollectedMentions: EngagementData[] = [];
    let skippedCount = 0;

    for (const mention of allMentions) {
      const isCollected = await snapshotTracker.isCollected(mention.tweet_id, 'mentions');
      if (!isCollected) {
        uncollectedMentions.push(mention);
      } else {
        skippedCount++;
      }
    }

    console.log(`🔍 [MENTIONS] 중복 수집 방지: ${allMentions.length}개 → ${uncollectedMentions.length}개 (${skippedCount}개는 이미 수집됨)`);

    // ⭐ V3: 수집 완료 마킹 (각 멘션 트윗마다)
    const uniqueTweetIds = new Set(uncollectedMentions.map(m => m.tweet_id));
    for (const tweetId of uniqueTweetIds) {
      const tweetMentions = uncollectedMentions.filter(m => m.tweet_id === tweetId);
      const firstMention = tweetMentions[0];

      await snapshotTracker.markAsCollected(tweetId, 'mentions', {
        tweetCreatedAt: firstMention.tweet_created_at,
        collectedAt: new Date().toISOString(),
        daysElapsed: SNAPSHOT_CONFIG.active.daysAgo,
        engagementCount: tweetMentions.length,
        collectionDate: event.collectionDate
      });
    }

    console.log(`✅ [MENTIONS] 수집 완료 마킹: ${uniqueTweetIds.size}개 트윗`);

    const mentionDuration = Date.now() - mentionStartTime;

    console.log(`📞 [MENTIONS] ✅ 전체 처리 완료: ${uncollectedMentions.length}개 멘션 (${mentionDuration}ms)`);

    // ✅ DB 저장 제거: 데이터는 수집만 하고 ScoreCalculator에서 저장
    // (Race Condition 방지 - Delta 계산 전 DB 저장 금지)

    const totalProcessingTime = Date.now() - startTime;

    console.log(`📞 [MENTIONS] 전체 처리 완료: 수집 ${mentionDuration}ms + 저장 ${totalProcessingTime - mentionDuration}ms = ${totalProcessingTime}ms`);
    
    // 성공 메트릭 기록 (V3: 실제 수집된 개수 기록)
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'SuccessCount', 1);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'MentionsCollected', uncollectedMentions.length);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'MentionsSkipped', skippedCount);
    // ✅ DB 저장 관련 메트릭 제거 (저장은 ScoreCalculator에서 담당)
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'Duration', totalProcessingTime);

    // API 호출 수는 실제 구현에 따라 계산 (현재는 추정값)
    const estimatedApiCalls = Math.ceil(allMentions.length / 100) + 1; // 페이지네이션 기반 추정

    const result: CollectMentionsOutput = {
      success: true,
      mentionCount: uncollectedMentions.length,
      mentions: uncollectedMentions,  // ⭐ V3: 중복 제거된 멘션만 반환
      apiCallCount: estimatedApiCalls,
      processingTime: totalProcessingTime,
      executedAt: new Date().toISOString()
    };

    console.log("✅ [MENTIONS] Collect Mentions 완료 (True Snapshot V3):", {
      totalFetched: allMentions.length,
      skipped: skippedCount,
      collected: uncollectedMentions.length,
      apiCallCount: result.apiCallCount,
      processingTime: `${result.processingTime}ms`
    });
    
    return result;

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error("❌ [MENTIONS] Collect Mentions 실패:", error);
    
    // Rate Limit 오류 처리
    if (isRateLimitError(error)) {
      console.log("🚨 [MENTIONS] Rate Limit 감지 - Step Functions Retry 정책 활성화");
      
      await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'RateLimitErrors', 1);
      await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'Duration', processingTime);
      
      throw new RateLimitError(`멘션 수집 중 Rate Limit 발생: ${error.message}`);
    }
    
    // 재시도 가능한 오류 처리
    if (isRetryableError(error)) {
      console.log("⚠️ [MENTIONS] 재시도 가능한 오류 감지");
      
      await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'RetryableErrors', 1);
      await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'Duration', processingTime);
      
      throw new TwitterAPIError(`멘션 수집 중 재시도 가능한 오류: ${error.message}`);
    }
    
    // 실패 메트릭 기록
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'ErrorCount', 1);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/CollectMentions', 'Duration', processingTime);
    
    // 실패 결과 반환
    const failureResult: CollectMentionsOutput = {
      success: false,
      mentionCount: 0,
      mentions: [],
      apiCallCount: 0,
      processingTime,
      error: error.message,
      executedAt: new Date().toISOString()
    };
    
    throw error;
  }
};
