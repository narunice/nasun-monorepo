/**
 * 커뮤니티 분류 배치 처리 Lambda 함수
 * 
 * EventBridge 스케줄에 의해 실행되어 활성 사용자들을 
 * 한국/글로벌 커뮤니티로 분류하는 배치 처리를 수행합니다.
 */

import { EventBridgeEvent, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { CommunityClassificationService } from '../../services/community-classification-service';
import { TwitterApiService } from '../../services/twitter-api';
import { SecureTokenManager } from '../../services/secure-token-manager';
import { BatchClassificationStats } from '../../types/community';

/**
 * 환경변수 인터페이스
 */
interface BatchProcessorConfig {
  tableName: string;
  batchSize: number;
  maxUsers: number;
  dryRun: boolean;
  processingTimeoutMs: number;
}

/**
 * 배치 이벤트 입력
 */
interface BatchEvent {
  source: string;
  detail?: {
    forceRefresh?: boolean;
    targetUserIds?: string[];
    maxUsers?: number;
    dryRun?: boolean;
  };
}

// DynamoDB 클라이언트 초기화
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
}));

// SecureTokenManager 초기화
const secureTokenManager = new SecureTokenManager(process.env.AWS_REGION || 'ap-northeast-2');

// Global instances (will be initialized in handler)
let twitterApi: TwitterApiService;
let communityService: CommunityClassificationService;

/**
 * 환경변수에서 설정 로드
 */
function loadConfig(): BatchProcessorConfig {
  return {
    tableName: process.env.CUMULATIVE_TABLE_NAME || 'nasun-leaderboard-data',
    batchSize: parseInt(process.env.BATCH_SIZE || '5'), // 동시 처리 수 (Rate Limit 고려)
    maxUsers: parseInt(process.env.MAX_USERS_PER_RUN || '100'), // 한 번에 최대 처리할 사용자 수
    dryRun: process.env.DRY_RUN === 'true',
    processingTimeoutMs: parseInt(process.env.PROCESSING_TIMEOUT_MS || '840000') // 14분 (15분 Lambda 타임아웃 - 1분 여유)
  };
}

/**
 * Twitter API 및 커뮤니티 서비스 초기화
 * Secrets Manager에서 OAuth 2.0 토큰을 로드하여 사용
 */
async function initializeServices(): Promise<void> {
  if (twitterApi && communityService) {
    console.log(`♻️ [INIT] 서비스가 이미 초기화되어 있음 - 재사용`);
    return;
  }

  console.log(`🔧 [INIT] Twitter API 및 커뮤니티 서비스 초기화 중...`);

  // Secrets Manager에서 OAuth 토큰 로드
  const secureTokens = await secureTokenManager.getTokens();

  // Twitter API 서비스 초기화 (환경변수 + Secure Tokens)
  const twitterApiConfig = {
    cumulativeTableName: process.env.CUMULATIVE_TABLE_NAME || 'nasun-leaderboard-data',
    targetUsername: process.env.TARGET_USERNAME || 'Naru010110',
    targetUserId: process.env.TARGET_USER_ID || '1863020068785004544',
    adminUsernames: (process.env.ADMIN_USERNAMES || 'Naru010110').split(','),
    twitterApiKey: process.env.TWITTER_API_KEY || '',
    twitterApiSecret: process.env.TWITTER_API_SECRET || '',
    twitterAccessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    twitterAccessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    oauth2ClientId: process.env.OAUTH2_CLIENT_ID || '',
    oauth2ClientSecret: process.env.OAUTH2_CLIENT_SECRET || '',
    oauth2RedirectUri: process.env.OAUTH2_REDIRECT_URI || '',
    enableOAuthAuthentication: process.env.ENABLE_OAUTH_AUTHENTICATION === 'true',
    fallbackToBearerToken: process.env.FALLBACK_TO_BEARER_TOKEN === 'true',
    enableOAuth2Authentication: process.env.ENABLE_OAUTH2_AUTHENTICATION === 'true',
    enableBookmarkScoring: process.env.ENABLE_BOOKMARK_SCORING === 'true',
    bookmarkScoreValue: parseFloat(process.env.BOOKMARK_SCORE_VALUE || '3.5'),
    scoreWeightLikes: parseFloat(process.env.SCORE_WEIGHT_LIKES || '1.0'),
    scoreWeightReplies: parseFloat(process.env.SCORE_WEIGHT_REPLIES || '2.5'),
    scoreWeightReposts: parseFloat(process.env.SCORE_WEIGHT_REPOSTS || '2.0'),
    scoreWeightQuotes: parseFloat(process.env.SCORE_WEIGHT_QUOTES || '3.0'),
    scoreWeightMentions: parseFloat(process.env.SCORE_WEIGHT_MENTIONS || '2.5'),
    systemStartDate: process.env.SYSTEM_START_DATE || '2025-09-23',
    event1StartDate: process.env.EVENT1_START_DATE || '2025-09-23',
    event1EndDate: process.env.EVENT1_END_DATE || '2025-09-29',
    event2StartDate: process.env.EVENT2_START_DATE || '2025-09-30',
    event2EndDate: process.env.EVENT2_END_DATE || '2025-10-06',
    leaderboardDataTtlDays: parseInt(process.env.LEADERBOARD_DATA_TTL_DAYS || '365'),
    mentionTtlDays: parseInt(process.env.MENTION_TTL_DAYS || '365'),
    replyCounterTtlDays: parseInt(process.env.REPLY_COUNTER_TTL_DAYS || '365'),
    recentActivityTtlDays: parseInt(process.env.RECENT_ACTIVITY_TTL_DAYS || '365'),
    dailySnapshotTtlDays: parseInt(process.env.DAILY_SNAPSHOT_TTL_DAYS || '365'),
    profileCacheTtlDays: parseInt(process.env.PROFILE_CACHE_TTL_DAYS || '7'),
    systemVersion: "v2" as const,
    enableCumulativeScoring: process.env.ENABLE_CUMULATIVE_SCORING === 'true',
    activeDaysPeriod: parseInt(process.env.ACTIVE_DAYS_PERIOD || '60'),
    activeDaysWeight: parseFloat(process.env.ACTIVE_DAYS_WEIGHT || '0.1'),
    activeDaysMinActivities: parseInt(process.env.ACTIVE_DAYS_MIN_ACTIVITIES || '1'),
    enableActiveDaysTieBreaker: process.env.ENABLE_ACTIVE_DAYS_TIE_BREAKER === 'true'
  };

  twitterApi = new TwitterApiService(twitterApiConfig, secureTokens);

  // 커뮤니티 분류 서비스 초기화
  communityService = new CommunityClassificationService(
    new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
    twitterApi
  );

  console.log(`✅ [INIT] 서비스 초기화 완료`);
}

/**
 * 활성 사용자 목록 수집
 * @param config 설정
 * @returns 활성 사용자 ID 배열
 */
async function getActiveUsers(config: BatchProcessorConfig): Promise<string[]> {
  console.log(`👥 [BATCH] 활성 사용자 수집 시작 (최대 ${config.maxUsers}명)`);
  
  try {
    // 최근 30일 활동한 사용자들 조회
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString();

    const result = await dynamoClient.send(new ScanCommand({
      TableName: config.tableName,
      FilterExpression: "sk = :sk AND lastUpdated > :cutoff",
      ExpressionAttributeValues: {
        ":sk": "CUMULATIVE_SCORE",
        ":cutoff": cutoffDate
      },
      ProjectionExpression: "userId, username, lastUpdated, totalScore",
      Limit: config.maxUsers
    }));

    if (!result.Items) {
      console.log(`📭 [BATCH] 활성 사용자가 없습니다`);
      return [];
    }

    const activeUsers = result.Items
      .filter(item => item.userId && item.totalScore > 0) // 점수가 있는 사용자만
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()) // 최근 활동순
      .map(item => item.userId);

    console.log(`✅ [BATCH] 활성 사용자 ${activeUsers.length}명 수집 완료`);
    return activeUsers;
    
  } catch (error) {
    console.error(`❌ [BATCH] 활성 사용자 수집 실패:`, error);
    return [];
  }
}

/**
 * 분류가 필요한 사용자 필터링
 * @param userIds 사용자 ID 배열
 * @param forceRefresh 강제 새로고침 여부
 * @returns 분류가 필요한 사용자 ID 배열
 */
async function getUsersNeedingClassification(
  userIds: string[], 
  forceRefresh: boolean = false
): Promise<string[]> {
  console.log(`🔍 [BATCH] 분류 필요 사용자 필터링 (강제새로고침: ${forceRefresh})`);
  
  if (forceRefresh) {
    console.log(`🔄 [BATCH] 강제 새로고침 - 모든 사용자 분류 대상`);
    return userIds;
  }

  const usersNeedingClassification: string[] = [];

  // 배치로 커뮤니티 프로필 확인
  for (let i = 0; i < userIds.length; i += 25) {
    const batch = userIds.slice(i, i + 25);
    
    for (const userId of batch) {
      try {
        const profile = await communityService.getUserCommunityProfile(userId);
        
        if (!profile) {
          // 프로필이 없는 경우 분류 필요
          usersNeedingClassification.push(userId);
        } else {
          // TTL 확인
          const now = Math.floor(Date.now() / 1000);
          if (profile.ttl && profile.ttl < now) {
            // TTL 만료된 경우 재분류 필요
            usersNeedingClassification.push(userId);
          }
        }
      } catch (error) {
        console.error(`❌ [BATCH] 사용자 ${userId} 프로필 확인 실패:`, error);
        // 오류 시 분류 대상에 포함
        usersNeedingClassification.push(userId);
      }
    }

    // Rate Limit 방지 지연
    if (i + 25 < userIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ [BATCH] 분류 필요 사용자: ${usersNeedingClassification.length}명`);
  return usersNeedingClassification;
}

/**
 * 배치 처리 진행 상황 추적
 */
class BatchProgressTracker {
  private startTime: number;
  private totalUsers: number;
  private processedUsers: number = 0;
  private successCount: number = 0;
  private errorCount: number = 0;

  constructor(totalUsers: number) {
    this.startTime = Date.now();
    this.totalUsers = totalUsers;
  }

  updateProgress(success: boolean): void {
    this.processedUsers++;
    if (success) {
      this.successCount++;
    } else {
      this.errorCount++;
    }

    // 진행률 로깅 (10% 단위)
    const progressPercent = Math.floor((this.processedUsers / this.totalUsers) * 100);
    if (progressPercent % 10 === 0 && this.processedUsers % Math.ceil(this.totalUsers / 10) === 0) {
      const elapsedMs = Date.now() - this.startTime;
      const estimatedTotalMs = (elapsedMs / this.processedUsers) * this.totalUsers;
      const remainingMs = estimatedTotalMs - elapsedMs;

      console.log(`📊 [BATCH] 진행률: ${progressPercent}% (${this.processedUsers}/${this.totalUsers}) ` +
        `성공: ${this.successCount}, 실패: ${this.errorCount}, ` +
        `예상 남은 시간: ${Math.round(remainingMs / 1000)}초`);
    }
  }

  getStats(): { 
    totalUsers: number; 
    processedUsers: number; 
    successCount: number; 
    errorCount: number; 
    elapsedTimeMs: number; 
  } {
    return {
      totalUsers: this.totalUsers,
      processedUsers: this.processedUsers,
      successCount: this.successCount,
      errorCount: this.errorCount,
      elapsedTimeMs: Date.now() - this.startTime
    };
  }
}

/**
 * CloudWatch 메트릭 전송
 * @param stats 배치 처리 통계
 */
async function sendCloudWatchMetrics(stats: BatchClassificationStats): Promise<void> {
  try {
    // 실제 환경에서는 CloudWatch SDK 사용
    console.log(`📊 [METRIC] NASUN/Community/BatchProcessed: ${stats.totalProcessed}`);
    console.log(`📊 [METRIC] NASUN/Community/BatchSuccess: ${stats.successCount}`);
    console.log(`📊 [METRIC] NASUN/Community/BatchErrors: ${stats.errorCount}`);
    console.log(`📊 [METRIC] NASUN/Community/BatchKoreanUsers: ${stats.koreanCount}`);
    console.log(`📊 [METRIC] NASUN/Community/BatchGlobalUsers: ${stats.globalCount}`);
    console.log(`📊 [METRIC] NASUN/Community/BatchCacheHitRatio: ${(stats.cacheHitCount / Math.max(stats.totalProcessed, 1) * 100).toFixed(1)}`);
    console.log(`📊 [METRIC] NASUN/Community/BatchProcessingTime: ${stats.processingTimeMs}`);
    console.log(`📊 [METRIC] NASUN/Community/BatchAverageConfidence: ${(stats.averageConfidence * 100).toFixed(1)}`);
    
  } catch (error) {
    console.error(`❌ [BATCH] CloudWatch 메트릭 전송 실패:`, error);
  }
}

/**
 * 메인 핸들러
 */
export const handler = async (
  event: EventBridgeEvent<string, BatchEvent>,
  context: Context
): Promise<{
  statusCode: number;
  body: string;
}> => {
  const config = loadConfig();
  const processingStartTime = Date.now();
  
  console.log(`🚀 [BATCH] 커뮤니티 분류 배치 처리 시작`);
  console.log(`📋 [BATCH] 설정:`, {
    batchSize: config.batchSize,
    maxUsers: config.maxUsers,
    dryRun: config.dryRun,
    timeoutMs: config.processingTimeoutMs
  });

  try {
    // 0. 서비스 초기화 (Secrets Manager에서 OAuth 토큰 로드)
    await initializeServices();

    // 1. 타임아웃 체크 함수
    const isTimeoutApproaching = () => {
      return (Date.now() - processingStartTime) > config.processingTimeoutMs;
    };

    // 2. 이벤트에서 옵션 추출
    const eventDetail = (event as any).detail || {};
    const forceRefresh = eventDetail.forceRefresh || false;
    const targetUserIds = eventDetail.targetUserIds;
    const maxUsers = eventDetail.maxUsers || config.maxUsers;
    const dryRun = eventDetail.dryRun ?? config.dryRun;

    if (dryRun) {
      console.log(`🧪 [BATCH] DRY RUN 모드 - 실제 분류는 수행하지 않습니다`);
    }

    // 3. 대상 사용자 결정
    let userIds: string[];
    if (targetUserIds && targetUserIds.length > 0) {
      console.log(`🎯 [BATCH] 지정된 사용자 ${targetUserIds.length}명 처리`);
      userIds = targetUserIds.slice(0, maxUsers);
    } else {
      userIds = await getActiveUsers({ ...config, maxUsers });
    }

    if (userIds.length === 0) {
      console.log(`📭 [BATCH] 처리할 사용자가 없습니다`);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No users to process', processedUsers: 0 })
      };
    }

    // 4. 분류가 필요한 사용자 필터링
    const usersToProcess = await getUsersNeedingClassification(userIds, forceRefresh);
    
    if (usersToProcess.length === 0) {
      console.log(`✅ [BATCH] 모든 사용자가 이미 분류되어 있습니다`);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'All users already classified', processedUsers: 0 })
      };
    }

    // 5. 진행 상황 추적기 초기화
    const progressTracker = new BatchProgressTracker(usersToProcess.length);

    // 6. 배치 처리 실행
    let stats: BatchClassificationStats;
    
    if (dryRun) {
      // DRY RUN 모드 - 실제 분류하지 않고 시뮬레이션만
      console.log(`🧪 [BATCH] DRY RUN: ${usersToProcess.length}명 분류 시뮬레이션`);
      
      stats = {
        totalProcessed: usersToProcess.length,
        successCount: usersToProcess.length,
        errorCount: 0,
        cacheHitCount: 0,
        koreanCount: Math.floor(usersToProcess.length * 0.3), // 30% 가정
        globalCount: Math.floor(usersToProcess.length * 0.7), // 70% 가정
        averageConfidence: 0.85,
        processingTimeMs: Date.now() - processingStartTime
      };
    } else {
      // 실제 배치 분류 수행
      stats = await communityService.classifyBatchUsers(usersToProcess, forceRefresh);
    }

    // 7. CloudWatch 메트릭 전송
    await sendCloudWatchMetrics(stats);

    // 8. 결과 로깅
    const finalProgressStats = progressTracker.getStats();
    const totalElapsedMs = Date.now() - processingStartTime;

    console.log(`🎉 [BATCH] 커뮤니티 분류 배치 처리 완료:`);
    console.log(`  - 총 처리 시간: ${Math.round(totalElapsedMs / 1000)}초`);
    console.log(`  - 처리된 사용자: ${stats.totalProcessed}명`);
    console.log(`  - 성공: ${stats.successCount}명 (${((stats.successCount / stats.totalProcessed) * 100).toFixed(1)}%)`);
    console.log(`  - 오류: ${stats.errorCount}명`);
    console.log(`  - 캐시 히트: ${stats.cacheHitCount}명 (${((stats.cacheHitCount / stats.totalProcessed) * 100).toFixed(1)}%)`);
    console.log(`  - 한국 커뮤니티: ${stats.koreanCount}명`);
    console.log(`  - 글로벌 커뮤니티: ${stats.globalCount}명`);
    console.log(`  - 평균 신뢰도: ${(stats.averageConfidence * 100).toFixed(1)}%`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Batch classification completed successfully',
        stats,
        elapsedTimeMs: totalElapsedMs,
        dryRun
      })
    };

  } catch (error) {
    console.error(`❌ [BATCH] 배치 처리 실패:`, error);
    
    // 오류 메트릭 전송
    console.log(`📊 [METRIC] NASUN/Community/BatchError: 1`);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Batch processing failed',
        message: error instanceof Error ? error.message : String(error),
        elapsedTimeMs: Date.now() - processingStartTime
      })
    };
  }
};