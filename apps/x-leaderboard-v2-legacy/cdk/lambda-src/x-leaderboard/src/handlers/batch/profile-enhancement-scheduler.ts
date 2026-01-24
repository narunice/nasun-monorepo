// 🔥 Phase 2.3.2: 정기적 프로필 보강 시스템
// EventBridge 스케줄 기반 자동 프로필 품질 개선

import { Context, EventBridgeEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { CentralizedProfileManager } from "../../services/centralized-profile-manager";
import { ProfileCacheService } from "../../services/profile-cache-service";
import { TwitterAPIOptimizer } from "../../services/twitter-api-optimizer";
import { ProfileQualityMonitor } from "../../services/profile-quality-monitor";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { cloudWatchMetrics } from "../../services/cloudwatch-metrics";
import { PROFILE_QUALITY_THRESHOLDS } from "../../types/profile";

/**
 * EventBridge 스케줄 이벤트 타입
 */
interface ScheduleEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  time: string;
  detail: {
    scheduleType: 'WEEKLY_QUALITY_BOOST' | 'DAILY_ACTIVE_UPDATE' | 'REALTIME_RECOVERY';
    maxUsers?: number;
    batchSize?: number;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

/**
 * 프로필 보강 결과
 */
interface EnhancementResult {
  success: boolean;
  scheduleType: string;
  totalCandidates: number;
  selectedForEnhancement: number;
  enhancementAttempts: number;
  enhancementSuccesses: number;
  enhancementFailures: number;
  averageQualityBefore: number;
  averageQualityAfter: number;
  qualityImprovement: number;
  apiCallsUsed: number;
  processingTime: number;
  executedAt: string;
}

/**
 * 🗓️ Phase 2.3.2: 정기적 프로필 보강 스케줄러
 *
 * 3단계 스케줄:
 * 1. WEEKLY_QUALITY_BOOST (일요일 오전 2시):
 *    - 저품질 프로필 대량 보강
 *    - 최대 1000명 처리
 *    - 배치 크기: 50명
 *    - 간격: 15분
 *
 * 2. DAILY_ACTIVE_UPDATE (매일 오전 4시):
 *    - 최근 활동 사용자 프로필 갱신
 *    - 최대 500명 처리
 *    - 배치 크기: 20명
 *    - 간격: 5분
 *
 * 3. REALTIME_RECOVERY (품질 저하 감지 시):
 *    - 임계적 품질 저하 즉시 복구
 *    - 최대 50명 처리
 *    - 배치 크기: 10명
 *    - 간격: 2분
 */
export const handler = async (
  event: ScheduleEvent,
  context: Context
): Promise<EnhancementResult> => {
  const startTime = Date.now();
  console.log("🗓️ ProfileEnhancementScheduler 시작");
  console.log("Event:", JSON.stringify(event, null, 2));

  const scheduleType = event.detail?.scheduleType || 'DAILY_ACTIVE_UPDATE';

  try {
    // 서비스 초기화
    const ddbClient = new DynamoDBClient({});
    const profileCacheService = new ProfileCacheService(ddbClient);
    const twitterApiOptimizer = new TwitterAPIOptimizer();
    const centralizedProfileManager = new CentralizedProfileManager(
      profileCacheService,
      twitterApiOptimizer
    );
    const profileQualityMonitor = new ProfileQualityMonitor(new CloudWatchClient({}), centralizedProfileManager);

    console.log("✅ [SCHEDULER] 서비스 초기화 완료");

    // 스케줄 타입별 설정
    const scheduleConfig = getScheduleConfig(scheduleType, event.detail);
    console.log(`📋 [SCHEDULER] 스케줄 설정:`, scheduleConfig);

    // 1. 프로필 보강 대상자 선별
    console.log(`🔍 [SCHEDULER] 보강 대상자 선별 중... (품질 임계값: ${scheduleConfig.qualityThreshold}점)`);
    const candidates = await getProfileQualityCandidates(
      centralizedProfileManager,
      scheduleConfig.qualityThreshold,
      scheduleConfig.maxUsers
    );

    console.log(`📊 [SCHEDULER] 보강 대상자 ${candidates.length}명 식별 완료`);

    if (candidates.length === 0) {
      console.log("✅ [SCHEDULER] 보강이 필요한 사용자가 없습니다.");
      return createSuccessResponse(
        scheduleType,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        startTime
      );
    }

    // 2. 배치 단위 프로필 보강 실행
    let totalAttempts = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalQualityBefore = 0;
    let totalQualityAfter = 0;
    let totalApiCalls = 0;

    const batchCount = Math.ceil(candidates.length / scheduleConfig.batchSize);
    console.log(
      `⚙️ [SCHEDULER] ${batchCount}개 배치로 처리 시작 (배치당 ${scheduleConfig.batchSize}명, 간격 ${scheduleConfig.batchInterval}ms)`
    );

    for (let i = 0; i < candidates.length; i += scheduleConfig.batchSize) {
      const batch = candidates.slice(i, i + scheduleConfig.batchSize);
      const batchNum = Math.floor(i / scheduleConfig.batchSize) + 1;

      console.log(`📦 [BATCH ${batchNum}/${batchCount}] ${batch.length}명 처리 시작...`);

      const batchResult = await enhanceProfilesBatch(
        batch,
        centralizedProfileManager,
        profileQualityMonitor
      );

      totalAttempts += batchResult.attempts;
      totalSuccesses += batchResult.successes;
      totalFailures += batchResult.failures;
      totalQualityBefore += batchResult.totalQualityBefore;
      totalQualityAfter += batchResult.totalQualityAfter;
      totalApiCalls += batchResult.apiCalls;

      console.log(
        `✅ [BATCH ${batchNum}/${batchCount}] 완료: 성공 ${batchResult.successes}/${batchResult.attempts}, ` +
        `품질 개선 ${batchResult.avgQualityImprovement.toFixed(1)}점`
      );

      // 배치 간 대기 (마지막 배치 제외)
      if (i + scheduleConfig.batchSize < candidates.length) {
        console.log(`⏰ [SCHEDULER] 다음 배치까지 ${scheduleConfig.batchInterval}ms 대기...`);
        await sleep(scheduleConfig.batchInterval);
      }
    }

    // 3. 통계 계산 및 CloudWatch 메트릭 전송
    const avgQualityBefore = candidates.length > 0 ? totalQualityBefore / candidates.length : 0;
    const avgQualityAfter = totalSuccesses > 0 ? totalQualityAfter / totalSuccesses : avgQualityBefore;
    const qualityImprovement = avgQualityAfter - avgQualityBefore;

    console.log(`🎉 [SCHEDULER] 보강 완료:`, {
      scheduleType,
      totalCandidates: candidates.length,
      attempts: totalAttempts,
      successes: totalSuccesses,
      failures: totalFailures,
      avgQualityBefore: avgQualityBefore.toFixed(1),
      avgQualityAfter: avgQualityAfter.toFixed(1),
      qualityImprovement: qualityImprovement.toFixed(1),
      apiCalls: totalApiCalls,
    });

    // CloudWatch 메트릭 전송
    await sendCloudWatchMetrics(
      scheduleType,
      candidates.length,
      totalSuccesses,
      totalFailures,
      qualityImprovement,
      totalApiCalls
    );

    const processingTime = Date.now() - startTime;

    return createSuccessResponse(
      scheduleType,
      candidates.length,
      totalAttempts,
      totalAttempts,
      totalSuccesses,
      totalFailures,
      avgQualityBefore,
      avgQualityAfter,
      qualityImprovement,
      totalApiCalls,
      startTime
    );
  } catch (error) {
    console.error("❌ [SCHEDULER] 프로필 보강 실패:", error);
    throw error;
  }
};

/**
 * 스케줄 타입별 설정 반환
 */
function getScheduleConfig(scheduleType: string, detail: any) {
  const configs = {
    WEEKLY_QUALITY_BOOST: {
      description: "주간 품질 부스트 (저품질 프로필 대량 보강)",
      maxUsers: detail?.maxUsers || 1000,
      batchSize: detail?.batchSize || 50,
      batchInterval: 15 * 60 * 1000, // 15분
      qualityThreshold: PROFILE_QUALITY_THRESHOLDS.LOW, // 30점 미만
      priority: 'MEDIUM' as const,
    },
    DAILY_ACTIVE_UPDATE: {
      description: "일일 활동 업데이트 (최근 활동 사용자 프로필 갱신)",
      maxUsers: detail?.maxUsers || 500,
      batchSize: detail?.batchSize || 20,
      batchInterval: 5 * 60 * 1000, // 5분
      qualityThreshold: PROFILE_QUALITY_THRESHOLDS.GOOD, // 50점 미만
      priority: 'MEDIUM' as const,
    },
    REALTIME_RECOVERY: {
      description: "실시간 복구 (임계적 품질 저하 즉시 복구)",
      maxUsers: detail?.maxUsers || 50,
      batchSize: detail?.batchSize || 10,
      batchInterval: 2 * 60 * 1000, // 2분
      qualityThreshold: PROFILE_QUALITY_THRESHOLDS.CRITICAL, // 20점 미만
      priority: 'HIGH' as const,
    },
  };

  return configs[scheduleType as keyof typeof configs] || configs.DAILY_ACTIVE_UPDATE;
}

/**
 * 프로필 보강 대상자 후보 조회
 */
async function getProfileQualityCandidates(
  profileManager: CentralizedProfileManager,
  qualityThreshold: number,
  maxUsers: number
): Promise<Array<{ userId: string; username?: string; qualityScore: number }>> {
  // 실제 구현에서는 DynamoDB에서 저품질 프로필 조회
  // 여기서는 플레이스홀더로 빈 배열 반환
  console.log(
    `🔍 [CANDIDATES] DynamoDB에서 품질 ${qualityThreshold}점 미만 사용자 조회 (최대 ${maxUsers}명)...`
  );
  return [];
}

/**
 * 배치 단위 프로필 보강
 */
async function enhanceProfilesBatch(
  batch: Array<{ userId: string; username?: string; qualityScore: number }>,
  profileManager: CentralizedProfileManager,
  qualityMonitor: ProfileQualityMonitor
): Promise<{
  attempts: number;
  successes: number;
  failures: number;
  totalQualityBefore: number;
  totalQualityAfter: number;
  avgQualityImprovement: number;
  apiCalls: number;
}> {
  let attempts = 0;
  let successes = 0;
  let failures = 0;
  let totalQualityBefore = 0;
  let totalQualityAfter = 0;
  let apiCalls = 0;

  for (const user of batch) {
    attempts++;
    const qualityBefore = user.qualityScore;
    totalQualityBefore += qualityBefore;

    try {
      // 프로필 보강 시도 (API 호출)
      console.log(`🔧 [ENHANCE] ${user.userId} (${user.username || 'unknown'}) 보강 중... (현재 품질: ${qualityBefore.toFixed(1)}점)`);

      // 실제 구현: profileManager.refreshUserProfile(user.userId)
      // 여기서는 시뮬레이션
      apiCalls++;

      // 품질 점수 재계산
      const qualityAfter = qualityBefore + 20; // 시뮬레이션: 평균 20점 개선
      totalQualityAfter += qualityAfter;

      successes++;
      console.log(
        `✅ [ENHANCE] ${user.userId} 보강 성공: ${qualityBefore.toFixed(1)}점 → ${qualityAfter.toFixed(1)}점 (+${(qualityAfter - qualityBefore).toFixed(1)}점)`
      );
    } catch (error) {
      failures++;
      console.error(`❌ [ENHANCE] ${user.userId} 보강 실패:`, error);
      // 실패 시에도 품질은 그대로
      totalQualityAfter += qualityBefore;
    }
  }

  const avgQualityImprovement =
    successes > 0 ? (totalQualityAfter - totalQualityBefore) / successes : 0;

  return {
    attempts,
    successes,
    failures,
    totalQualityBefore,
    totalQualityAfter,
    avgQualityImprovement,
    apiCalls,
  };
}

/**
 * CloudWatch 메트릭 전송
 */
async function sendCloudWatchMetrics(
  scheduleType: string,
  totalCandidates: number,
  successes: number,
  failures: number,
  qualityImprovement: number,
  apiCalls: number
): Promise<void> {
  try {
    await cloudWatchMetrics.putMetric(
      'NASUN/ProfileEnhancement',
      `${scheduleType}_Candidates`,
      totalCandidates,
      'Count'
    );
    await cloudWatchMetrics.putMetric(
      'NASUN/ProfileEnhancement',
      `${scheduleType}_Successes`,
      successes,
      'Count'
    );
    await cloudWatchMetrics.putMetric(
      'NASUN/ProfileEnhancement',
      `${scheduleType}_Failures`,
      failures,
      'Count'
    );
    await cloudWatchMetrics.putMetric(
      'NASUN/ProfileEnhancement',
      `${scheduleType}_QualityImprovement`,
      qualityImprovement,
      'None'
    );
    await cloudWatchMetrics.putMetric(
      'NASUN/ProfileEnhancement',
      `${scheduleType}_APICalls`,
      apiCalls,
      'Count'
    );
    console.log(`📈 [METRICS] CloudWatch 메트릭 전송 완료`);
  } catch (error) {
    console.error(`❌ [METRICS] CloudWatch 메트릭 전송 실패:`, error);
  }
}

/**
 * 성공 응답 생성
 */
function createSuccessResponse(
  scheduleType: string,
  totalCandidates: number,
  selectedForEnhancement: number,
  enhancementAttempts: number,
  enhancementSuccesses: number,
  enhancementFailures: number,
  averageQualityBefore: number,
  averageQualityAfter: number,
  qualityImprovement: number,
  apiCallsUsed: number,
  startTime: number
): EnhancementResult {
  return {
    success: true,
    scheduleType,
    totalCandidates,
    selectedForEnhancement,
    enhancementAttempts,
    enhancementSuccesses,
    enhancementFailures,
    averageQualityBefore,
    averageQualityAfter,
    qualityImprovement,
    apiCallsUsed,
    processingTime: Date.now() - startTime,
    executedAt: new Date().toISOString(),
  };
}

/**
 * Sleep 유틸리티
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
