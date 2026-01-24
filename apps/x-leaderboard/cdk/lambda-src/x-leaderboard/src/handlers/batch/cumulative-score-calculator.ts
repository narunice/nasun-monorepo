// V2 누적 점수 계산 엔진

import { Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

import { getEnvConfigV2, getScoreWeights, ScoreWeights } from "../../utils/env";
import { EngagementData } from "../../types/cumulative";
import { DeltaCalculator, UserDelta } from "../../services/delta-calculator";
import { CumulativeScoreManager } from "../../services/cumulative-score-manager";
import { RecentActivityTracker } from "../../services/recent-activity-tracker";
import { CommunityClassificationService } from "../../services/community-classification-service";
import { TwitterApiService } from "../../services/twitter-api";
import { SecureTokenManager } from "../../services/secure-token-manager";
import { DEFAULT_WEIGHT_CONFIG, CommunityType } from "../../types/community";

// 🔥 Phase 3: 중앙화된 프로필 관리 시스템 통합
import { CentralizedProfileManager } from "../../services/centralized-profile-manager";
import { ProfileCacheService } from "../../services/profile-cache-service";
import { TwitterAPIOptimizer } from "../../services/twitter-api-optimizer";
import { ExistingProfileData, ProfileValidators, PROFILE_QUALITY_THRESHOLDS } from "../../types/profile";

// 🔥 Phase 2.2.2: 실시간 프로필 품질 모니터링 시스템 통합
import { ProfileQualityMonitor } from "../../services/profile-quality-monitor";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambdaClient = new LambdaClient({});
const cloudWatchMetrics = new CloudWatchClient({});

interface ScoreCalculatorInput {
  targetDate?: string;
  forceRecalculation?: boolean;
  engagementsProcessed?: number;
  collectedEngagements?: EngagementData[]; // 데이터 수집 함수에서 전달받은 인게이지먼트
  
  // EventBridge 자동화 파라미터
  source?: string;
  scheduledExecution?: boolean;
  workflowPhase?: string;
  triggerLeaderboardGeneration?: boolean;
  isBackupExecution?: boolean;
  description?: string;
}

interface ScoreCalculatorOutput {
  success: boolean;
  targetDate: string;
  usersUpdated: number;
  totalScoreChanges: number;
  newUsers: number;
  processingStats: {
    currentEngagements: number;
    deltaCalculated: number;
    cumulativeUpdated: number;
    recentActivitiesAdded: number;
    recentActivitiesRemoved: number;
  };
  nextSteps: string[];
  executedAt: string;
}

export const handler = async (
  event: ScoreCalculatorInput,
  context: Context
): Promise<ScoreCalculatorOutput> => {
  console.log("🧮 V2 누적 점수 계산 엔진 시작");
  console.log("Event:", JSON.stringify(event, null, 2));

  const startTime = Date.now();
  const targetDate = (event.targetDate && event.targetDate !== "unknown")
    ? event.targetDate
    : new Date().toISOString().split('T')[0];

  if (event.targetDate === "unknown") {
    console.warn(`⚠️ targetDate="unknown" 수신, 오늘 날짜로 fallback: ${targetDate}`);
    console.warn(`⚠️ aggregate-results의 collectionDate 추출 로직을 확인하세요!`);
  }

  try {
    // 환경 설정 로드
    const config = getEnvConfigV2();
    console.log(`📊 점수 계산 시작 - 날짜: ${targetDate}`);

    // 환경변수에서 점수 가중치 로드
    const scoreWeights = getScoreWeights(config);
    console.log("✅ 점수 가중치 로드 완료:", scoreWeights);

    // 서비스 초기화 (Secrets Manager에서 OAuth 토큰 로드)
    try {
      console.log("🔧 [INIT] SecureTokenManager를 통해 OAuth 토큰 로드 중...");
      const secureTokenManager = new SecureTokenManager(process.env.AWS_REGION || 'ap-northeast-2');
      const secureTokens = await secureTokenManager.getTokens();

      const twitterApi = new TwitterApiService(config as any, secureTokens);
      const communityService = new CommunityClassificationService(
        new DynamoDBClient({}),
        twitterApi,
        { tableName: config.cumulativeTableName }
      );
      var deltaCalculator = new DeltaCalculator(dynamoClient, config.cumulativeTableName, communityService, scoreWeights);
      console.log("✅ [INIT] CommunityClassificationService 초기화 성공 (Secure Tokens)");
    } catch (error: any) {
      console.error("❌ [INIT] CommunityClassificationService 초기화 실패");
      console.error("에러 상세:", error);
      console.error("스택:", error.stack);

      // 🔧 BUGFIX: CommunityService 초기화 실패해도 fallback 언어 분류 수행
      // communityService 없이 DeltaCalculator 생성 (undefined 전달)
      // enableCommunityWeights는 true로 유지하여 fallback 언어 분류 로직 실행
      var deltaCalculator = new DeltaCalculator(dynamoClient, config.cumulativeTableName, undefined, scoreWeights);
      // setCommunityWeightsEnabled(true)가 기본값이므로 명시적 호출 불필요
      // fallback 로직(Line 737-759)이 실행되어 inferCommunityLanguageFromUsername() 호출됨
      console.log("⚠️ [INIT] Fallback 모드: communityService 없이 휴리스틱 언어 분류 수행");
    }
    const scoreManager = new CumulativeScoreManager(dynamoClient, config.cumulativeTableName);
    const activityTracker = new RecentActivityTracker(dynamoClient, config.cumulativeTableName);

    // 🔥 Phase 3: 중앙화된 프로필 관리 시스템 초기화
    const profileCacheService = new ProfileCacheService(new DynamoDBClient({}));
    const twitterApiOptimizer = new TwitterAPIOptimizer(); // TwitterAPI 서비스는 추후 주입 가능
    const centralizedProfileManager = new CentralizedProfileManager(profileCacheService, twitterApiOptimizer);
    console.log("✅ [INIT] CentralizedProfileManager 초기화 성공");

    // 🔥 Phase 2.2.2: 실시간 프로필 품질 모니터링 시스템 초기화
    const profileQualityMonitor = new ProfileQualityMonitor(cloudWatchMetrics, null);
    console.log("✅ [INIT] ProfileQualityMonitor 초기화 성공");

    let processingStats = {
      currentEngagements: 0,
      deltaCalculated: 0,
      cumulativeUpdated: 0,
      recentActivitiesAdded: 0,
      recentActivitiesRemoved: 0
    };

    // 1. 수집된 인게이지먼트 사용 또는 기존 데이터 처리
    let currentEngagements: EngagementData[] = [];
    
    if (event.collectedEngagements && event.collectedEngagements.length > 0) {
      console.log(`📥 데이터 수집 함수에서 전달받은 인게이지먼트: ${event.collectedEngagements.length}개`);
      currentEngagements = event.collectedEngagements;
    } else {
      console.log("📥 새로운 인게이지먼트가 없음 - 기존 RECENT 데이터로 점수 재계산 시도");
      // 새로운 인게이지먼트가 없어도 기존 데이터로 점수 계산 진행
      // Delta 계산기가 기존 RECENT 데이터를 읽어서 처리함
    }

    processingStats.currentEngagements = currentEngagements.length;

    // 2. 📸 스냅샷 모드 점수 계산 (Delta 비교 없이 직접 계산)
    console.log(`📸 스냅샷 모드 점수 계산 시작...`);
    console.log(`   ℹ️ 스냅샷 수집 방식: 모든 인게이지먼트는 이미 "신규"이므로 Delta 비교 불필요`);
    const deltaResult = await deltaCalculator.calculateSnapshotScores(currentEngagements, targetDate);
    processingStats.deltaCalculated = deltaResult.totalChangedUsers;
    console.log(`✅ 스냅샷 점수 계산 완료: ${deltaResult.totalChangedUsers}명 처리됨`);

    

    // 3. 최근 활동 데이터 저장 (Delta 계산 후에 실행)
    console.log(`💾 최근 활동 데이터 저장 중...`);
    const trackingResult = await activityTracker.saveRecentActivity(currentEngagements, targetDate);
    processingStats.recentActivitiesAdded = trackingResult.savedEngagements;
    processingStats.recentActivitiesRemoved = trackingResult.replacedEngagements;
    console.log(`✅ 최근 활동 추적 완료: ${trackingResult.savedEngagements}개 저장, ${trackingResult.replacedEngagements}개 교체`);

    // ✅ Delta가 없으면 점수 업데이트 불필요 (중복 누적 방지)
    // 🔥 단, forceRecalculation 모드에서는 CUMULATIVE_SCORE 복구를 위해 계속 진행
    if (deltaResult.userDeltas.length === 0) {
      console.log("📋 Delta 변경사항 없음");

      if (!event.forceRecalculation) {
        console.log("⏩ 점수 업데이트 건너뜀 (일반 모드)");
        return createSuccessResponse(
          targetDate,
          0,  // usersUpdated
          0,  // totalScoreChanges
          0,  // newUsers
          processingStats,
          ["변경사항 없음 - 점수 업데이트 건너뜀"],
          startTime
        );
      }

      // [데이터 복구 로직] 강제 재계산 모드이고 신규 활동이 없을 때, 점수 중복/초기화 버그를 방지하기 위해 아무 작업도 하지 않음.
      console.log("🔄 [Backfill] 강제 재계산 모드 감지되었으나, 신규 활동이 없어 점수 변경을 건너뜁니다 (버그 방지).");
      deltaResult.userDeltas = []; // 빈 배열을 반환하여 점수 변경 없음을 명시
    }

    // 4. 프로필 품질 모니터링 준비 - 업데이트 전 상태 캡처
    console.log(`🔍 [품질모니터링] CUMULATIVE_SCORE 업데이트 전 프로필 상태 캡처 중...`);
    const profileChangesForMonitoring = await capturePreUpdateProfiles(scoreManager, deltaResult.userDeltas, targetDate);
    console.log(`✅ [품질모니터링] ${profileChangesForMonitoring.length}명의 사전 프로필 상태 캡처 완료`);

    // 5. [중복 키 방지] userDeltas 배열에서 중복된 사용자를 병합합니다.
    console.log(`🛡️ [DEDUPE] 중복 키 방지를 위해 ${deltaResult.userDeltas.length}개의 UserDelta 항목 병합 시작...`);
    const userDeltaMap = new Map<string, UserDelta>();

    for (const delta of deltaResult.userDeltas) {
      const existingDelta = userDeltaMap.get(delta.userId);
      if (existingDelta) {
        // 이미 있는 Delta에 현재 Delta의 값을 합산합니다.
        existingDelta.scoreChange += delta.scoreChange;
        existingDelta.likesChange += delta.likesChange;
        existingDelta.repliesChange += delta.repliesChange;
        existingDelta.repostsChange += delta.repostsChange;
        existingDelta.quotesChange += delta.quotesChange;
        existingDelta.mentionsChange += delta.mentionsChange;
        existingDelta.addedEngagements.push(...delta.addedEngagements);
        // 다른 필드들은 첫 번째 Delta 값을 유지합니다 (username, displayName 등).
      } else {
        // 새로운 사용자 ID인 경우 Map에 추가합니다.
        userDeltaMap.set(delta.userId, { ...delta });
      }
    }

    const uniqueUserDeltas = Array.from(userDeltaMap.values());
    console.log(`✅ [DEDUPE] 병합 완료. 고유 사용자: ${uniqueUserDeltas.length}명`);


    // 5. 누적 점수 업데이트
    console.log(`📊 누적 점수 업데이트 시작...`);
    const scoreUpdateResult = await scoreManager.updateCumulativeScores(
      uniqueUserDeltas,
      targetDate,
      event.forceRecalculation || false  // 🔥 forceRecalculation 플래그 전달
    );
    processingStats.cumulativeUpdated = scoreUpdateResult.updatedUsers;
    console.log(`✅누적 점수 업데이트 완료: ${scoreUpdateResult.updatedUsers}명 업데이트, ${scoreUpdateResult.newUsers}명 신규`);

    // 6. 프로필 품질 변화 감지 및 모니터링
    console.log(`🔍 [품질모니터링] CUMULATIVE_SCORE 업데이트 후 품질 변화 감지 중...`);
    const qualityDetections = await monitorProfileQualityChanges(
      scoreManager, 
      profileQualityMonitor, 
      profileChangesForMonitoring, 
      targetDate
    );
    
    const significantDegradations = qualityDetections.filter(d => d.isSignificantDegradation).length;
    const recoveryRequired = qualityDetections.filter(d => d.requiresImmediateRecovery).length;
    
    console.log(`✅ [품질모니터링] 품질 변화 감지 완료:`);
    console.log(`   - 총 모니터링: ${qualityDetections.length}명`);
    console.log(`   - 유의미한 품질 저하: ${significantDegradations}명`);
    console.log(`   - 즉시 복구 필요: ${recoveryRequired}명`);

    // 7. 다음 단계 호출 (리더보드 업데이트)
    const nextSteps = [];
    
    // 🔥 Step Functions가 리더보드 생성을 담당하므로 직접 호출 로직 제거
    // 점수 변경이 있었는지 여부만 반환값에 포함하여 Step Functions가 판단하도록 함
    if (scoreUpdateResult.totalScoreChanges > 0) {
      nextSteps.push("점수 변경 감지 - Step Functions에서 리더보드 생성 필요");
    } else {
      nextSteps.push("점수 변경 없음 - 리더보드 생성 불필요");
    }

    const result = createSuccessResponse(
      targetDate, 
      scoreUpdateResult.updatedUsers, 
      scoreUpdateResult.totalScoreChanges,
      scoreUpdateResult.newUsers,
      processingStats, 
      nextSteps, 
      startTime
    );

    console.log("🎉 V2 점수 계산 엔진 완료:", result);
    return result;

  } catch (error: any) {
    console.error("❌ V2 점수 계산 실패:", error);
    
    return {
      success: false,
      targetDate,
      usersUpdated: 0,
      totalScoreChanges: 0,
      newUsers: 0,
      processingStats: {
        currentEngagements: 0,
        deltaCalculated: 0,
        cumulativeUpdated: 0,
        recentActivitiesAdded: 0,
        recentActivitiesRemoved: 0
      },
      nextSteps: [`오류 발생: ${error.message}`],
      executedAt: new Date().toISOString(),
    };
  }
};

// 헬퍼 함수들

/**
 * 사용자 정보를 기반으로 커뮤니티 타입 추론
 * 간단한 휴리스틱 기반 한국/글로벌 분류
 */
function inferCommunityTypeFromUser(delta: UserDelta): CommunityType {
  const username = (delta.username || '').toLowerCase();
  const displayName = (delta.displayName || '').toLowerCase();
  
  // 한국어 패턴 감지 (정교한 매칭)
  const koreanPatterns = [
    /[가-힣]/, // 한글
    /korea|korean|seoul|busan|kr$/i,
    /케이팝|kpop|한국|대한민국/i,
    /서울|부산|대구|인천|광주|대전|울산|제주/i,
    /김(?![a-z])|이(?![a-z])|박(?![a-z])|최(?![a-z])|정(?![a-z])|강(?![a-z])|조(?![a-z])|윤(?![a-z])|장(?![a-z])|임(?![a-z])/, // 한국 성씨 (정확한 매칭)
    /삼성|lg|sk|네이버|카카오|현대/i, // 한국 기업
    /한글|hangul|kimchi|bibimbap|taekwondo/i // 한국 문화
  ];
  
  const hasKoreanPattern = koreanPatterns.some(pattern => 
    pattern.test(username) || pattern.test(displayName)
  );
  
  // 추가 검증: 명백한 영어권 패턴은 글로벌로 분류
  const globalPatterns = [
    /^[a-z]+[0-9]+$/, // 영어+숫자 조합 (예: john123)
    /john|mike|david|sarah|mary|robert|james|william/i, // 서구권 이름
    /usa|uk|canada|australia|america|britain/i, // 영어권 국가
    /crypto|bitcoin|nft|web3|defi/i // 글로벌 크립토 용어
  ];
  
  const hasGlobalPattern = globalPatterns.some(pattern => 
    pattern.test(username) || pattern.test(displayName)
  );
  
  // 한국 패턴이 있고 글로벌 패턴이 없으면 한국으로 분류
  if (hasKoreanPattern && !hasGlobalPattern) {
    console.log(`🇰🇷 [COMMUNITY] 한국 커뮤니티로 분류: ${delta.userId} (${username})`);
    return 'korean';
  }
  
  console.log(`🌍 [COMMUNITY] 글로벌 커뮤니티로 분류: ${delta.userId} (${username})`);
  return 'global';
}

/**
 * 🔥 [Phase 3 개선] 중앙화된 프로필 관리를 사용한 양수 점수 계산
 * CentralizedProfileManager를 활용하여 고품질 프로필 데이터로 계산
 * 기존 사용자 정보 보존 로직을 중앙화된 시스템으로 교체
 */
async function calculateDirectPositiveUserDeltasV3(
  engagements: EngagementData[],
  scoreManager: CumulativeScoreManager,
  centralizedProfileManager: CentralizedProfileManager,
  scoreWeights: ScoreWeights
): Promise<UserDelta[]> {
  console.log(`🔥 [V3] ${engagements.length}개 인게이지먼트를 중앙화된 프로필 시스템으로 처리 중...`);
  
  // 1. 중앙화된 프로필 관리자로 고품질 프로필 데이터 생성
  try {
    // 기존 누적 데이터에서 사용자 프로필 정보 추출
    const existingProfileData = new Map<string, ExistingProfileData>();
    const uniqueUserIds = [...new Set(engagements.map(e => e.engaging_user_id))];
    
    console.log(`👥 [V3] 고유 사용자 ${uniqueUserIds.length}명의 기존 프로필 데이터 조회 중...`);
    
    // 기존 누적 데이터에서 사용자 정보 수집
    for (const userId of uniqueUserIds) {
      try {
        const existingUser = await scoreManager.getUserCumulativeScore(userId);
        if (existingUser && existingUser.username) {
          existingProfileData.set(userId, {
            userId,
            username: existingUser.username,
            displayName: existingUser.displayName || existingUser.username,
            profileImageUrl: undefined, // 누적 데이터에는 이미지 URL이 없을 수 있음
            followersCount: existingUser.followersCount || 0
          });
        }
      } catch (error) {
        // 개별 사용자 조회 실패는 무시하고 계속 진행
        console.warn(`⚠️ [V3] 사용자 ${userId} 기존 데이터 조회 실패:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    console.log(`📊 [V3] 기존 프로필 데이터 ${existingProfileData.size}개 수집 완료`);
    
    // 2. CentralizedProfileManager로 고품질 프로필 생성
    const profileResult = await centralizedProfileManager.processUserProfiles(engagements, existingProfileData);
    
    console.log(`✅ [V3] 프로필 처리 완료: ${profileResult.profiles.size}개 프로필, 평균 품질 ${profileResult.stats.averageQualityScore.toFixed(1)}점`);
    console.log(`📈 [V3] 처리 통계: 캐시 ${profileResult.stats.cacheHits}회, API ${profileResult.stats.apiCalls}회, 품질 개선 ${profileResult.stats.qualityImprovements}회`);
    
    // 3. 개선된 프로필 데이터로 UserDelta 생성
    const userDeltaMap = new Map<string, UserDelta>();
    
    for (const engagement of engagements) {
      const userId = engagement.engaging_user_id;
      const profile = profileResult.profiles.get(userId);
      
      if (!userDeltaMap.has(userId)) {
        // 🛡️ 단순화된 프로필 처리 - CentralizedProfileManager 결과 신뢰
        // 더 이상 이중 병합 로직 없이, 이미 처리된 고품질 프로필 사용
        
        // CentralizedProfileManager에서 처리된 프로필 또는 안전한 기본값 사용
        const safeProfile = profile || {
          username: engagement.engaging_username || userId,
          displayName: engagement.engaging_display_name || engagement.engaging_displayName || engagement.engaging_username || userId,
          followersCount: engagement.engaging_followers_count || engagement.followersCount || 0,
          profileImageUrl: engagement.engaging_profile_image_url || engagement.engaging_profileImageUrl
        };
        
        console.log(`🛡️ [SAFE_PROFILE] ${userId}: CentralizedProfileManager 결과 사용 - ${profile ? '이미 처리된 프로필' : '안전한 기본 프로필'}`);
        console.log(`  ✅ username: ${safeProfile.username}`);
        console.log(`  ✅ displayName: ${safeProfile.displayName}`);
        console.log(`  ✅ followersCount: ${safeProfile.followersCount}`);

        // 🆕 Phase 1.1: Fallback 언어 분류 추가 (tweet_lang 우선 사용)
        const inferredLanguage = DeltaCalculator.inferLanguageFromEngagements(
          [engagement],
          safeProfile.username,
          safeProfile.displayName,
          userId
        );

        userDeltaMap.set(userId, {
          userId,
          username: safeProfile.username,
          displayName: safeProfile.displayName,
          followersCount: safeProfile.followersCount,
          profileImageUrl: safeProfile.profileImageUrl,
          scoreChange: 0,
          likesChange: 0,
          repliesChange: 0,
          repostsChange: 0,
          quotesChange: 0,
          mentionsChange: 0,
          addedEngagements: [],
          removedEngagements: [],
          // dominantLanguage 필드 추가
          dominantLanguage: inferredLanguage,
          communityType: inferredLanguage === 'ko' ? 'korean' : 'global',
          communityWeight: 1.0, // 재계산 시에는 가중치 미적용
          logBase: 30,
          languageMultiplier: 1.0,
          followerWeight: 1.0,
          cappedAtMax: false
        });

        console.log(`  🌍 [V3_RECALC] ${safeProfile.username} (${userId}): ${inferredLanguage}`);
      }

      const delta = userDeltaMap.get(userId)!;
      
      // 인게이지먼트 타입별 양수 점수 직접 추가 (환경변수 기반 점수)
      let scoreWeight = 0;
      switch (engagement.engagement_type) {
        case 'like':
          scoreWeight = scoreWeights.likes;
          delta.likesChange++;
          break;
        case 'reply':
          scoreWeight = scoreWeights.replies;
          delta.repliesChange++;
          break;
        case 'repost':
          scoreWeight = scoreWeights.reposts;
          delta.repostsChange++;
          break;
        case 'quote':
          scoreWeight = scoreWeights.quotes;
          delta.quotesChange++;
          break;
        case 'mention':
          scoreWeight = scoreWeights.mentions;
          delta.mentionsChange++;
          break;
        default:
          console.warn(`⚠️ [V3] Unknown engagement_type: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          scoreWeight = 0;
          break;
      }
      
      delta.scoreChange += scoreWeight;
      delta.addedEngagements.push(engagement);
    }
    
    const userDeltas = Array.from(userDeltaMap.values()).filter(delta => delta.scoreChange > 0);
    console.log(`🔢 [V3] 필터링 후 사용자 수: ${userDeltas.length}명 (전체 ${userDeltaMap.size}명 중)`);

    // 🆕 Phase 1.2: 프로필 데이터 복구 로직
    console.log(`🔍 [V3_PROFILE_RECOVERY] 프로필 검증 시작: ${userDeltas.length}명`);
    let recoveredCount = 0;

    for (const delta of userDeltas) {
      const needsRecovery = !delta.username ||
                           delta.username === delta.userId ||
                           delta.username === 'unknown' ||
                           delta.username === 'undefined';

      if (needsRecovery) {
        console.log(`⚠️ [V3_PROFILE_RECOVERY] 불완전한 프로필 감지: ${delta.userId} (username: ${delta.username})`);

        // CUMULATIVE_SCORE에서 프로필 조회
        try {
          const existingUser = await scoreManager.getUserCumulativeScore(delta.userId);

          if (existingUser && existingUser.username && existingUser.username !== delta.userId) {
            delta.username = existingUser.username;

            if (existingUser.displayName) delta.displayName = existingUser.displayName;
            if (existingUser.profileImageUrl) delta.profileImageUrl = existingUser.profileImageUrl;
            if (existingUser.followersCount) delta.followersCount = existingUser.followersCount;

            recoveredCount++;
            console.log(`✅ [V3_PROFILE_RECOVERY] 프로필 복구 성공: ${delta.userId} → ${delta.username}`);
          }
        } catch (error) {
          console.error(`❌ [V3_PROFILE_RECOVERY] 복구 실패: ${delta.userId}`, error);
        }
      }
    }

    if (recoveredCount > 0) {
      console.log(`✅ [V3_PROFILE_RECOVERY] 총 ${recoveredCount}명 프로필 복구 완료`);
    }

    // 커뮤니티 가중치 적용 (기존 로직 유지)
    let totalOriginalScore = 0;
    let totalWeightedScore = 0;
    let koreanCount = 0;
    let globalCount = 0;
    
    userDeltas.forEach((delta, index) => {
      const originalScore = delta.originalScore || delta.scoreChange;
      const communityType: CommunityType = delta.communityType || inferCommunityTypeFromUser(delta);
      
      if (communityType === 'korean') {
        koreanCount++;
      } else {
        globalCount++;
      }
      
      if (!delta.originalScore) {
        delta.originalScore = originalScore;
      }
      if (!delta.communityType) {
        delta.communityType = communityType;
      }
      
      totalOriginalScore += originalScore;
      totalWeightedScore += delta.scoreChange;
      
      if (index < 5) {
        const qualityInfo = profileResult.profiles.get(delta.userId) ? 
          `(프로필 품질: ${profileResult.profiles.get(delta.userId)?.qualityScore}점)` :
          '(프로필 정보 없음)';
        console.log(`📊 [V3-${delta.userId}] 점수 처리: ${originalScore} → ${delta.scoreChange} ${qualityInfo}`);
      }
    });
    
    const averageWeightedScore = totalWeightedScore / userDeltas.length;
    const averageOriginalScore = totalOriginalScore / userDeltas.length;
    const weightMultiplier = averageWeightedScore / averageOriginalScore;
    
    console.log(`✅ [V3] 중앙화된 프로필 시스템 처리 완료:`);
    console.log(`   📊 평균 원본 점수: ${averageOriginalScore.toFixed(2)}`);
    console.log(`   📈 평균 가중 점수: ${averageWeightedScore.toFixed(2)}`);
    console.log(`   🔢 평균 가중치 배수: ${weightMultiplier.toFixed(2)}x`);
    console.log(`   👥 총 ${userDeltas.length}명 처리 (고품질 프로필 적용)`);
    console.log(`   🇰🇷 한국 커뮤니티: ${koreanCount}명 (${(koreanCount/userDeltas.length*100).toFixed(1)}%)`);
    console.log(`   🌍 글로벌 커뮤니티: ${globalCount}명 (${(globalCount/userDeltas.length*100).toFixed(1)}%)`);
    console.log(`   📈 프로필 품질 향상: 평균 ${profileResult.stats.averageQualityScore.toFixed(1)}점`);
    
    return userDeltas;
    
  } catch (error) {
    console.error(`❌ [V3] 중앙화된 프로필 시스템 처리 실패, 기존 방식으로 폴백:`, error);

    // 오류 발생시 기존 방식으로 폴백
    return calculateDirectPositiveUserDeltas(engagements, scoreManager, scoreWeights);
  }
}

/**
 * 기존 인게이지먼트 데이터를 직접 양수 점수로 계산 (기존 방식 - 폴백용)
 * Delta 계산을 완전히 우회하여 처음부터 양수로 계산
 * 기존 사용자 정보 보존 로직 포함
 */
async function calculateDirectPositiveUserDeltas(
  engagements: EngagementData[],
  scoreManager: CumulativeScoreManager,
  scoreWeights: ScoreWeights
): Promise<UserDelta[]> {
  console.log(`🔧 ${engagements.length}개 인게이지먼트를 직접 양수 점수로 계산 중...`);
  
  const userDeltaMap = new Map<string, UserDelta>();
  
  // 각 인게이지먼트를 직접 양수로 처리
  for (const engagement of engagements) {
    const userId = engagement.engaging_user_id;
    
    if (!userDeltaMap.has(userId)) {
      // 🔧 Phase 1 수정: 기존 사용자 정보 보존 로직
      let preservedUsername = engagement.engaging_username || userId;
      let preservedDisplayName = engagement.engaging_display_name || engagement.engaging_displayName || engagement.engaging_username || "Unknown";
      let preservedFollowersCount = engagement.engaging_followers_count || engagement.followersCount || 0;
      
      // 기존 사용자 정보가 있다면 조회해서 보존
      try {
        const existingUser = await scoreManager.getUserCumulativeScore(userId);
        if (existingUser) {
          // 기존 username이 Unknown이 아니면 보존
          if (existingUser.username && existingUser.username !== "Unknown" && existingUser.username !== userId) {
            preservedUsername = existingUser.username;
          }
          
          // 기존 displayName이 Unknown이 아니고 username과 다르면 보존
          if (existingUser.displayName && 
              existingUser.displayName !== "Unknown" && 
              existingUser.displayName !== existingUser.username &&
              existingUser.displayName !== userId) {
            preservedDisplayName = existingUser.displayName;
          }
          
          // 기존 팔로워 수가 더 신뢰할 만하면 보존
          if (existingUser.followersCount && 
              existingUser.followersCount > 0 &&
              (!engagement.engaging_followers_count && !engagement.followersCount)) {
            preservedFollowersCount = existingUser.followersCount;
          }
          
          console.log(`👤 [${userId}] 기존 정보 보존 - username: ${existingUser.username} → ${preservedUsername}, displayName: ${existingUser.displayName} → ${preservedDisplayName}, 팔로워 수: ${existingUser.followersCount} → ${preservedFollowersCount}`);
        }
      } catch (error) {
        console.error(`⚠️ [${userId}] 기존 사용자 정보 조회 실패, 새 정보 사용:`, error instanceof Error ? error.message : String(error));
      }
      
      // 🆕 Phase 1.1: Fallback 언어 분류 추가 (tweet_lang 우선 사용)
      const inferredLanguage = DeltaCalculator.inferLanguageFromEngagements(
        [engagement],
        preservedUsername,
        preservedDisplayName,
        userId
      );

      userDeltaMap.set(userId, {
        userId,
        username: preservedUsername,
        displayName: preservedDisplayName,
        followersCount: preservedFollowersCount,
        scoreChange: 0,
        likesChange: 0,
        repliesChange: 0,
        repostsChange: 0,
        quotesChange: 0,
        mentionsChange: 0,
        addedEngagements: [],
        removedEngagements: [],
        // dominantLanguage 필드 추가
        dominantLanguage: inferredLanguage,
        communityType: inferredLanguage === 'ko' ? 'korean' : 'global',
        communityWeight: 1.0, // 재계산 시에는 가중치 미적용
        logBase: 30,
        languageMultiplier: 1.0,
        followerWeight: 1.0,
        cappedAtMax: false
      });

      console.log(`  🌍 [RECALC] ${preservedUsername} (${userId}): ${inferredLanguage}`);
    }

    const delta = userDeltaMap.get(userId)!;

    // 인게이지먼트 타입별 양수 점수 직접 추가 (환경변수 기반 점수)
    let scoreWeight = 0;
    switch (engagement.engagement_type) {
      case 'like':
        scoreWeight = scoreWeights.likes;
        delta.likesChange++;
        break;
      case 'reply':
        scoreWeight = scoreWeights.replies;
        delta.repliesChange++;
        break;
      case 'repost':
        scoreWeight = scoreWeights.reposts;
        delta.repostsChange++;
        break;
      case 'quote':
        scoreWeight = scoreWeights.quotes;
        delta.quotesChange++;
        break;
      case 'mention':
        scoreWeight = scoreWeights.mentions;
        delta.mentionsChange++;
        break;
      default:
        console.warn(`⚠️ [DIRECT_CALC] Unknown engagement_type: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
        scoreWeight = 0; // 미분류 타입은 0점
        // 미분류 타입은 카운트도 증가시키지 않음
        break;
    }
    
    // 양수로만 추가 (빼기 없음)
    delta.scoreChange += scoreWeight;
    delta.addedEngagements.push(engagement);
  }
  
  const userDeltas = Array.from(userDeltaMap.values()).filter(delta => delta.scoreChange > 0);
  console.log(`🔢 필터링 후 사용자 수: ${userDeltas.length}명 (전체 ${userDeltaMap.size}명 중)`);

  // 🆕 Phase 1.2: 프로필 데이터 복구 로직
  console.log(`🔍 [RECALC_PROFILE_RECOVERY] 프로필 검증 시작: ${userDeltas.length}명`);
  let recoveredCount = 0;

  for (const delta of userDeltas) {
    const needsRecovery = !delta.username ||
                         delta.username === delta.userId ||
                         delta.username === 'unknown' ||
                         delta.username === 'undefined';

    if (needsRecovery) {
      console.log(`⚠️ [RECALC_PROFILE_RECOVERY] 불완전한 프로필 감지: ${delta.userId} (username: ${delta.username})`);

      // CUMULATIVE_SCORE에서 프로필 조회
      try {
        const existingUser = await scoreManager.getUserCumulativeScore(delta.userId);

        if (existingUser && existingUser.username && existingUser.username !== delta.userId) {
          delta.username = existingUser.username;

          if (existingUser.displayName) delta.displayName = existingUser.displayName;
          if (existingUser.profileImageUrl) delta.profileImageUrl = existingUser.profileImageUrl;
          if (existingUser.followersCount) delta.followersCount = existingUser.followersCount;

          recoveredCount++;
          console.log(`✅ [RECALC_PROFILE_RECOVERY] 프로필 복구 성공: ${delta.userId} → ${delta.username}`);
        }
      } catch (error) {
        console.error(`❌ [RECALC_PROFILE_RECOVERY] 복구 실패: ${delta.userId}`, error);
      }
    }
  }

  if (recoveredCount > 0) {
    console.log(`✅ [RECALC_PROFILE_RECOVERY] 총 ${recoveredCount}명 프로필 복구 완료`);
  }

  // 커뮤니티 가중치 적용 (설정값 기반)
  let totalOriginalScore = 0;
  let totalWeightedScore = 0;
  let koreanCount = 0;
  let globalCount = 0;
  
  userDeltas.forEach((delta, index) => {
    // 🔧 [수정] delta-calculator에서 이미 가중치가 적용되었으므로 중복 계산 제거
    // delta.originalScore가 있으면 사용, 없으면 현재 scoreChange를 원본으로 간주
    const originalScore = delta.originalScore || delta.scoreChange;
    
    // delta-calculator에서 설정된 커뮤니티 타입 사용 (없으면 추론)
    const communityType: CommunityType = delta.communityType || inferCommunityTypeFromUser(delta);
    
    // 커뮤니티별 통계 수집
    if (communityType === 'korean') {
      koreanCount++;
    } else {
      globalCount++;
    }
    
    // 🚨 중복 가중치 적용 제거 - delta-calculator에서 이미 적용됨
    // delta.scoreChange는 이미 가중치가 적용된 최종 점수
    
    // 메타데이터 보완 (delta-calculator에서 설정되지 않은 경우에만)
    if (!delta.originalScore) {
      delta.originalScore = originalScore;
    }
    if (!delta.communityType) {
      delta.communityType = communityType;
    }
    
    totalOriginalScore += originalScore;
    totalWeightedScore += delta.scoreChange;
    
    // 처음 5명의 상세 로그 (가중치 정보 표시)
    if (index < 5) {
      const weightInfo = delta.communityWeight ? 
        `(가중치: ${delta.communityWeight.toFixed(2)}, 커뮤니티: ${delta.communityType})` :
        '(가중치 정보 없음)';
      console.log(`📊 [${delta.userId}] 점수 처리: ${originalScore} → ${delta.scoreChange} ${weightInfo}`);
    }
  });
  
  const averageWeightedScore = totalWeightedScore / userDeltas.length;
  const averageOriginalScore = totalOriginalScore / userDeltas.length;
  const weightMultiplier = averageWeightedScore / averageOriginalScore;
  
  console.log(`✅ 가중치 적용된 점수 처리 완료:`);
  console.log(`   📊 평균 원본 점수: ${averageOriginalScore.toFixed(2)}`);
  console.log(`   📈 평균 가중 점수: ${averageWeightedScore.toFixed(2)}`);
  console.log(`   🔢 평균 가중치 배수: ${weightMultiplier.toFixed(2)}x`);
  console.log(`   👥 총 ${userDeltas.length}명 처리 (가중치는 delta-calculator에서 적용됨)`);
  console.log(`   🇰🇷 한국 커뮤니티: ${koreanCount}명 (${(koreanCount/userDeltas.length*100).toFixed(1)}%)`);
  console.log(`   🌍 글로벌 커뮤니티: ${globalCount}명 (${(globalCount/userDeltas.length*100).toFixed(1)}%)`);
  
  console.log(`✅ 직접 양수 계산 완료: ${userDeltas.length}명`);
  return userDeltas;
}

// ❌ REMOVED: recalculateExistingUserScores 함수 삭제 (점수 중복 누적 버그 원인)
// 이 함수는 기존 RECENT 데이터를 "신규"로 재계산하여 점수를 중복 누적시켰습니다.
// Delta가 없으면 점수 업데이트를 건너뛰는 것이 정상입니다.

async function invokeCumulativeLeaderboardGenerator(payload: any): Promise<void> {
  await lambdaClient.send(new InvokeCommand({
    FunctionName: "nasun-leaderboard-generator",
    InvocationType: "Event", // 비동기 호출
    Payload: JSON.stringify(payload)
  }));
}

/**
 * 🔥 Phase 2.2.2: CUMULATIVE_SCORE 업데이트 전 프로필 상태 캡처
 */
async function capturePreUpdateProfiles(
  scoreManager: CumulativeScoreManager,
  userDeltas: UserDelta[],
  targetDate: string
): Promise<Array<{ userId: string; previousProfile: any | null }>> {
  const profileChanges: Array<{ userId: string; previousProfile: any | null }> = [];
  
  for (const delta of userDeltas) {
    try {
      // 기존 CUMULATIVE_SCORE 레코드에서 프로필 정보 추출
      const existingRecord = await scoreManager.getUserCumulativeScore(delta.userId);
      
      if (existingRecord) {
        // 기존 프로필 정보를 UserProfile 형태로 변환
        const previousProfile = {
          userId: delta.userId,
          username: existingRecord.username || 'unknown',
          displayName: existingRecord.displayName || 'unknown',
          profileImageUrl: existingRecord.profileImageUrl,
          followersCount: existingRecord.followersCount,
          qualityScore: 0, // 실시간으로 계산됨
          lastUpdated: existingRecord.lastUpdated || new Date().toISOString(),
          lastAPIUpdate: existingRecord.followersCountUpdatedAt || new Date().toISOString(),
          sources: ['existing_score' as any],
          completeness: {
            hasValidUsername: !!existingRecord.username && existingRecord.username !== 'unknown',
            hasValidDisplayName: !!existingRecord.displayName && existingRecord.displayName !== 'unknown',
            hasProfileImage: !!existingRecord.profileImageUrl,
            hasFollowersCount: existingRecord.followersCount !== undefined
          },
          ttl: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30일
          version: "v2" as const
        };
        
        profileChanges.push({
          userId: delta.userId,
          previousProfile
        });
      } else {
        // 신규 사용자의 경우 null로 설정
        profileChanges.push({
          userId: delta.userId,
          previousProfile: null
        });
      }
    } catch (error) {
      console.error(`업데이트 전 프로필 캡처 실패 - ${delta.userId}:`, error);
      profileChanges.push({
        userId: delta.userId,
        previousProfile: null
      });
    }
  }
  
  return profileChanges;
}

/**
 * 🔥 Phase 2.2.2: CUMULATIVE_SCORE 업데이트 후 프로필 품질 변화 감지
 */
async function monitorProfileQualityChanges(
  scoreManager: CumulativeScoreManager,
  profileQualityMonitor: ProfileQualityMonitor,
  profileChangesForMonitoring: Array<{ userId: string; previousProfile: any | null }>,
  targetDate: string
) {
  const qualityDetections = [];
  
  for (const { userId, previousProfile } of profileChangesForMonitoring) {
    try {
      // 업데이트된 CUMULATIVE_SCORE 레코드에서 현재 프로필 정보 추출
      const updatedRecord = await scoreManager.getUserCumulativeScore(userId);
      
      if (!updatedRecord) {
        console.warn(`업데이트된 레코드를 찾을 수 없음: ${userId}`);
        continue;
      }
      
      // 현재 프로필 정보를 UserProfile 형태로 변환
      const currentProfile = {
        userId,
        username: updatedRecord.username || 'unknown',
        displayName: updatedRecord.displayName || 'unknown',
        profileImageUrl: updatedRecord.profileImageUrl,
        followersCount: updatedRecord.followersCount,
        qualityScore: 0, // 실시간으로 계산됨
        lastUpdated: updatedRecord.lastUpdated || new Date().toISOString(),
        lastAPIUpdate: updatedRecord.followersCountUpdatedAt || new Date().toISOString(),
        sources: ['existing_score' as any],
        completeness: {
          hasValidUsername: !!updatedRecord.username && updatedRecord.username !== 'unknown',
          hasValidDisplayName: !!updatedRecord.displayName && updatedRecord.displayName !== 'unknown',
          hasProfileImage: !!updatedRecord.profileImageUrl,
          hasFollowersCount: updatedRecord.followersCount !== undefined
        },
        ttl: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30일
        version: "v2" as const
      };
      
      // 프로필 품질 변화 감지
      const detection = await profileQualityMonitor.monitorProfileQualityChange(
        userId,
        previousProfile,
        currentProfile
      );
      
      qualityDetections.push(detection);
      
      // 중요한 품질 저하가 감지된 경우 상세 로그
      if (detection.isSignificantDegradation) {
        console.warn(`🚨 [품질저하] ${detection.username} (${userId}): ${detection.qualityChange}점 하락`);
        console.warn(`   저하된 필드: ${detection.degradedFields.join(', ')}`);
        if (detection.requiresImmediateRecovery) {
          console.error(`🆘 [즉시복구필요] ${detection.username}: 현재 품질 ${detection.currentQualityScore}점`);
        }
      }
      
    } catch (error) {
      console.error(`프로필 품질 변화 감지 실패 - ${userId}:`, error);
    }
  }
  
  return qualityDetections;
}

function createSuccessResponse(
  targetDate: string,
  usersUpdated: number,
  totalScoreChanges: number,
  newUsers: number,
  processingStats: any,
  nextSteps: string[],
  startTime: number
): ScoreCalculatorOutput {
  return {
    success: true,
    targetDate,
    usersUpdated,
    totalScoreChanges,
    newUsers,
    processingStats,
    nextSteps,
    executedAt: new Date().toISOString(),
  };
}