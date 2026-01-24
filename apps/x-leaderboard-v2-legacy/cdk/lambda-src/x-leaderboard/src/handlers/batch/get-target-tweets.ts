// Step Functions 워크플로우 - 1단계: 수집 대상 트윗 목록 조회 (True Snapshot V3)

import { Context } from "aws-lambda";
import { TwitterApiService } from "../../services/twitter-api";
import { GetTargetTweetsInput, GetTargetTweetsOutput } from "../../types/cumulative";
import { getEnvConfigV2, validateEnvConfigV2, getSnapshotDateRange, SNAPSHOT_CONFIG } from "../../utils/env";
import { secureTokenManager } from "../../services/secure-token-manager";
import { cloudWatchMetrics } from "../../services/cloudwatch-metrics";
import { RateLimitError, DataValidationError, createStepFunctionsError } from "../../utils/step-functions-errors";
import { SnapshotTracker } from "../../utils/snapshot-tracker";

/**
 * 트윗 수에 따른 적응형 대기 시간 계산 (Phase 2A)
 *
 * @param tweetCount 수집된 트윗 개수
 * @returns 대기 시간 (초 단위)
 *
 * 계산 로직:
 * - 1개: 45분 (2700초) - 최대 안전 대기
 * - 20개 이상: 15분 (900초) - 최소 안전 대기
 * - 중간값: 선형 보간으로 계산
 */
function calculateAdaptiveWaitTime(tweetCount: number): number {
  const MIN_WAIT_SECONDS = 15 * 60;  // 15분 - X API Basic Plan 최소 안전 간격
  const MAX_WAIT_SECONDS = 45 * 60;  // 45분 - 트윗이 적을 때 여유 간격

  // 트윗이 없거나 1개면 최대 대기 (안전성 우선)
  if (tweetCount <= 1) {
    return MAX_WAIT_SECONDS;
  }

  // 트윗이 20개 이상이면 최소 대기 (효율성 우선)
  if (tweetCount >= 20) {
    return MIN_WAIT_SECONDS;
  }

  // 선형 보간: 1개(45분) → 20개(15분)
  const factor = (20 - tweetCount) / 19;  // 19개 차이로 정규화
  const adaptiveWait = Math.round(MIN_WAIT_SECONDS + factor * (MAX_WAIT_SECONDS - MIN_WAIT_SECONDS));

  console.log(`📊 [ADAPTIVE_WAIT] 트윗 ${tweetCount}개 → 대기시간 ${Math.round(adaptiveWait/60)}분 (${adaptiveWait}초)`);

  return adaptiveWait;
}

/**
 * Step Functions 1단계: 수집할 트윗 목록을 조회하여 반환 (True Snapshot V3)
 *
 * 입력: GetTargetTweetsInput (EventBridge 또는 수동 호출)
 * 출력: GetTargetTweetsOutput (트윗 목록, 타겟 사용자, 스냅샷 전략 정보)
 *
 * 🆕 True Snapshot V3 방식:
 * - V1 (롤링 윈도우): 6일 룩백 (동일 트윗 6회 수집) → 100% API 사용
 * - V2 (스냅샷): 특정 날짜만 수집 (Likes 3일, Quotes 5일) → 17% API 사용
 * - V3 (True Snapshot): DB 마킹 기반 중복 방지 + Passive/Active 그룹화 → 완벽한 멱등성
 *
 * 핵심 개선사항:
 * 1. getUserTweetsWithReplies() 사용 → 타겟의 댓글(replies) 포함 수집
 * 2. SnapshotTracker를 통한 중복 수집 방지
 * 3. Passive(3일) / Active(1일) 그룹 분리
 * 4. 수집 후 DB 마킹으로 재수집 방지
 *
 * 데이터 범위:
 * - Passive (Likes/Quotes/Retweets): 3일 전 트윗 (완숙 후 1회 수집)
 * - Active (Replies): 1일 전 트윗 (대화 완료 후 1회 수집)
 * - Mentions: collect-mentions.ts에서 별도 수집 (1일 전)
 */
export const handler = async (
  event: GetTargetTweetsInput,
  context: Context
): Promise<GetTargetTweetsOutput> => {
  const startTime = Date.now();
  console.log("🚀 [STEP_1] Get Target Tweets (True Snapshot V3) 시작");
  console.log("📡 입력:", JSON.stringify(event, null, 2));

  try {
    // 환경 설정 로드 및 검증
    const config = getEnvConfigV2();
    validateEnvConfigV2(config);
    console.log(`✅ V2 설정 로드 완료 - Target: @${config.targetUsername}`);

    // 보안 토큰 및 Twitter 서비스 초기화
    const secureTokens = await secureTokenManager.getTokens();
    const twitterService = new TwitterApiService(config, secureTokens);

    // SnapshotTracker 초기화 (멱등성 보장)
    const snapshotTracker = new SnapshotTracker(config.cumulativeTableName);

    // ⭐ V3 로직: Passive/Active 날짜 범위 계산
    const collectionDate = event.targetDate || new Date().toISOString().split('T')[0];
    const passiveRange = getSnapshotDateRange(SNAPSHOT_CONFIG.passive.daysAgo, collectionDate);  // 3 days ago
    const activeRange = getSnapshotDateRange(SNAPSHOT_CONFIG.active.daysAgo, collectionDate);    // 1 day ago

    console.log(`\n📊 [TRUE_SNAPSHOT_V3] 스냅샷 수집 전략:`);
    console.log(`  🔵 Passive (누적형 지표) - ${SNAPSHOT_CONFIG.passive.daysAgo}일 전:`);
    console.log(`     → 타입: ${SNAPSHOT_CONFIG.passive.types.join(', ')}`);
    console.log(`     → 근거: ${SNAPSHOT_CONFIG.passive.reason}`);
    console.log(`     → 범위: ${passiveRange.start} ~ ${passiveRange.end}`);
    console.log(`  🟢 Active (대화형 지표) - ${SNAPSHOT_CONFIG.active.daysAgo}일 전:`);
    console.log(`     → 타입: ${SNAPSHOT_CONFIG.active.types.join(', ')}`);
    console.log(`     → 근거: ${SNAPSHOT_CONFIG.active.reason}`);
    console.log(`     → 범위: ${activeRange.start} ~ ${activeRange.end}`);
    console.log(`  🎯 수집 날짜: ${collectionDate}\n`);

    // 타겟 사용자 정보 구성 (API 호출 없이 환경 변수 사용)
    console.log(`👤 타겟 사용자 정보 구성: @${config.targetUsername} (${config.targetUserId})`);
    const targetUser = {
      id: config.targetUserId,
      username: config.targetUsername,
      name: config.targetUsername, // 기본값으로 username 사용
    };

    if (!targetUser.id || targetUser.id === '12345') { // 기본값 또는 유효하지 않은 ID 체크
      throw new DataValidationError(`유효한 TARGET_USER_ID가 환경 변수에 설정되지 않았습니다.`);
    }
    console.log(`✅ 타겟 사용자 확인: ${targetUser.name} (${targetUser.id})`);

    // ⭐ V3 핵심 변경: Passive 트윗만 조회 (타겟의 오리지널 포스트)
    // Active 인게이지먼트는 collect-mentions.ts가 별도로 처리
    console.log(`\n🔍 트윗 조회 시작:`);
    console.log(`  - Passive 대상 (Likes/Quotes/Retweets): ${passiveRange.start} ~ ${passiveRange.end}`);
    console.log(`  - Active 대상: collect-mentions.ts에서 별도 처리`);

    const passiveTweets = await twitterService.getUserTweetsWithReplies(
      targetUser.id,
      passiveRange.start,
      passiveRange.end
    );

    console.log(`\n✅ X API 조회 완료:`);
    console.log(`  - Passive 트윗: ${passiveTweets.length}개 (원본 + 댓글)`);

    // ⭐ V3 핵심: 미수집 트윗 필터링 (SnapshotTracker를 통한 멱등성 보장)
    console.log(`\n🔍 중복 수집 방지 체크 (SnapshotTracker):`);

    // Passive 트윗: Likes 기준으로 필터링 (Likes/Quotes/Retweets는 함께 수집됨)
    const uncollectedPassiveTweets = await snapshotTracker.filterUncollectedTweets(passiveTweets, 'likes');
    console.log(`  🔵 Passive: ${passiveTweets.length}개 → ${uncollectedPassiveTweets.length}개 (${passiveTweets.length - uncollectedPassiveTweets.length}개는 이미 수집됨)`);

    // 🔍 Debug: 필터링 전 모든 트윗 정보 로깅
    if (uncollectedPassiveTweets.length > 0) {
      console.log(`\n🔍 [DEBUG] 필터링 전 트윗 상태 (총 ${uncollectedPassiveTweets.length}개):`);
      uncollectedPassiveTweets.forEach((tweet, idx) => {
        console.log(`  ${idx + 1}. Tweet ID: ${tweet.id}`);
        console.log(`     - isReply: ${tweet.isReply}`);
        console.log(`     - conversation_id: ${tweet.conversation_id || 'N/A'}`);
        console.log(`     - referenced_tweets: ${JSON.stringify(tweet.referenced_tweets || [])}`);  // 🆕 추가 (2025-10-28)
        console.log(`     - text: "${tweet.text?.substring(0, 60)}..."`);
      });
    }

    // ⭐ V3: Passive 트윗만 필터링 (원본 포스트만)
    const tweets = uncollectedPassiveTweets
      .filter(tweet => !tweet.isReply)  // 원본 포스트만
      .map(tweet => ({
        ...tweet,
        collectionStrategies: ['likes', 'quotes', 'retweets']
      }));

    console.log(`\n✅ Passive 수집 대상 필터링:`);
    console.log(`  - 원본 포스트: ${tweets.length}개`);
    console.log(`  - 댓글 제외: ${uncollectedPassiveTweets.length - tweets.length}개 (댓글 좋아요는 점수 미반영)`);

    if (tweets.length === 0) {
      console.log("⚠️ 수집할 신규 Passive 트윗이 없습니다 (모두 이전에 수집됨).");
    } else {
      console.log(`\n📝 Passive 수집 대상 트윗 목록:`);
      tweets.forEach((tweet, index) => {
        const strategies = tweet.collectionStrategies?.join(', ') || 'unknown';
        console.log(`  ${index + 1}. [원본] ${tweet.id} [${strategies}] - ${tweet.created_at.substring(0, 10)}`);
        console.log(`      "${tweet.text?.substring(0, 50)}..."`);
      });
    }

    // Phase 2A: 적응형 대기 시간 계산
    const adaptiveWaitSeconds = calculateAdaptiveWaitTime(tweets.length);

    // 성공 메트릭 기록 (V3 Passive 전용)
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/GetTargetTweets', 'SuccessCount', 1);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/GetTargetTweets', 'PassiveTweetsFound', tweets.length);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/GetTargetTweets', 'AdaptiveWaitSeconds', adaptiveWaitSeconds);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/GetTargetTweets', 'Duration', Date.now() - startTime);

    // 🆕 타겟 트윗 ID 목록 추출 (중복 방지용)
    const targetTweetIds = tweets.map(tweet => tweet.id);
    console.log(`🎯 타겟 트윗 ID ${targetTweetIds.length}개 추출됨 (중복 방지용)`);

    // ⭐ Step Functions 출력 형식으로 반환 (V3 스냅샷 전략 정보)
    const result: GetTargetTweetsOutput = {
      tweets,
      targetUser,
      dateRange: passiveRange, // 기본 범위 (하위 호환성)
      collectionDate,
      targetUserId: targetUser.id,
      targetUsername: targetUser.username || config.targetUsername,
      adaptiveWaitSeconds,
      targetTweetIds,  // 🆕 타겟 트윗 ID 목록 (2025-10-26)
      snapshotStrategy: {  // ⭐ V3: Passive/Active 구조
        passive: {
          ...passiveRange,
          daysAgo: SNAPSHOT_CONFIG.passive.daysAgo,
          types: SNAPSHOT_CONFIG.passive.types
        },
        active: {
          ...activeRange,
          daysAgo: SNAPSHOT_CONFIG.active.daysAgo,
          types: SNAPSHOT_CONFIG.active.types
        }
      }
    };

    console.log("\n✅ [STEP_1] Get Target Tweets (True Snapshot V3) 완료:", {
      passiveTweetsCount: tweets.length,
      passiveOriginalPosts: tweets.length,  // 모두 원본 포스트
      adaptiveWaitMinutes: Math.round(adaptiveWaitSeconds/60),
      targetUser: targetUser.username,
      snapshotStrategy: {
        passive: `${SNAPSHOT_CONFIG.passive.daysAgo}일 전 (${SNAPSHOT_CONFIG.passive.types.join(', ')})`,
        active: `${SNAPSHOT_CONFIG.active.daysAgo}일 전 - collect-mentions.ts에서 처리`
      },
      processingTime: `${Date.now() - startTime}ms`
    });

    return result;

  } catch (error: any) {
    console.error("❌ [STEP_1] Get Target Tweets 실패:", error);

    // 에러 메트릭 기록
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/GetTargetTweets', 'ErrorCount', 1);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/GetTargetTweets', 'Duration', Date.now() - startTime);

    // Rate Limit 에러 특별 처리
    if (error.status === 429 || error.message?.includes('Rate limit')) {
      const rateLimitError = new RateLimitError(
        `Twitter API Rate Limit 도달: ${error.message}`,
        new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15분 후
      );
      console.error("🚨 [RATE_LIMIT] Rate Limit 에러 발생 - 15분 대기 필요");
      await cloudWatchMetrics.putMetric('NASUN/StepFunctions/GetTargetTweets', 'RateLimitCount', 1);
      throw rateLimitError;
    }

    // 데이터 검증 에러
    if (error instanceof DataValidationError) {
      throw error; // 재시도하지 않고 즉시 실패
    }

    // 기타 에러는 TwitterAPIError로 래핑 (3회 재시도)
    throw new Error(`Get Target Tweets 실패: ${error.message}`);
  }
};
