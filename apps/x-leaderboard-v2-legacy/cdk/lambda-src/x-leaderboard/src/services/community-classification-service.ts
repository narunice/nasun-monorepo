/**
 * 커뮤니티 분류 서비스
 * 
 * 사용자를 한국/글로벌 커뮤니티로 분류하고 DynamoDB에 결과를 캐싱하는
 * 메인 분류 서비스입니다. 언어 분석과 프로필 키워드 분석을 결합하여
 * 정확한 분류를 수행합니다.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  QueryCommand,
  UpdateCommand 
} from '@aws-sdk/lib-dynamodb';
import {
  UserCommunityProfile,
  ClassificationResult,
  BatchClassificationStats,
  ClassificationConfig,
  DEFAULT_CONFIG,
  CommunityType,
  LanguageCode,
  WeightCalculationResult,
  CommunityWeightConfig,
  CommunityLanguageWeightConfig,
  DEFAULT_WEIGHT_CONFIG,
  DEFAULT_LANGUAGE_WEIGHT_CONFIG,
  getCommunityTypeFromLanguage
} from '../types/community';
import { LanguageAnalyzer, DetailedLanguageAnalysis } from './language-analyzer';
import { analyzeProfileKeywords, UserProfile, recommendCommunityType } from '../utils/profile-keyword-matcher';
import { TwitterApiService } from './twitter-api';
import { DeltaCalculator } from './delta-calculator';

/**
 * 환경변수 설정
 */
interface ServiceConfig extends ClassificationConfig {
  tableName: string;
  ttlDays: number;
  enableCaching: boolean;
  weightConfig: CommunityWeightConfig;
  languageWeightConfig?: CommunityLanguageWeightConfig; // 🆕 Phase 3.1.2: 새로운 언어 코드 기반 가중치 설정
}

/**
 * 커뮤니티 분류 서비스 클래스
 */
export class CommunityClassificationService {
  private dynamoClient: DynamoDBDocumentClient;
  private languageAnalyzer: LanguageAnalyzer;
  private config: ServiceConfig;
  
  // 🆕 [Phase 3.3] 분류 통계 추적
  private classificationStats = {
    totalAttempts: 0,
    successCount: 0,
    failureCount: 0,
    cacheHits: 0,
    heuristicFallbacks: 0,
    errorFallbacks: 0,
    lowConfidenceCount: 0,
    resetTime: Date.now()
  };

  constructor(
    dynamoClient: DynamoDBClient,
    twitterApi: TwitterApiService,
    config: Partial<ServiceConfig> = {}
  ) {
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoClient);
    this.languageAnalyzer = new LanguageAnalyzer(twitterApi, config);
    
    // 🔧 [Phase 2.1] 환경변수 기반 설정 통합
    // 환경변수에서 가중치 설정 읽기
    const envWeightConfig: CommunityWeightConfig = {
      korean: {
        logBase: parseInt(process.env.KOREAN_LOG_BASE || '8'),
        languageMultiplier: parseFloat(process.env.KOREAN_LANGUAGE_MULTIPLIER || '1.2'),
        maxCap: parseFloat(process.env.KOREAN_MAX_CAP || '5.0')
      },
      global: {
        logBase: parseInt(process.env.GLOBAL_LOG_BASE || '30'),
        languageMultiplier: parseFloat(process.env.GLOBAL_LANGUAGE_MULTIPLIER || '1.0'),
        maxCap: parseFloat(process.env.GLOBAL_MAX_CAP || '4.0')
      }
    };

    // 🔧 [Phase 2.3] 설정 우선순위: 사용자 설정 > 환경변수 > 기본값
    // 1단계: 기본값 (DEFAULT_CONFIG)
    // 2단계: 환경변수 값으로 덮어쓰기 (envWeightConfig)  
    // 3단계: 사용자 제공 설정으로 최종 덮어쓰기 (config)
    this.config = {
      ...DEFAULT_CONFIG,
      tableName: process.env.CUMULATIVE_TABLE_NAME || 'nasun-leaderboard-data',
      ttlDays: 60, // API 호출 최적화: 60일마다 재분류 (월 1회)
      enableCaching: true,
      weightConfig: {
        korean: { 
          ...DEFAULT_WEIGHT_CONFIG.korean,     // 기본값
          ...envWeightConfig.korean,           // 환경변수
          ...config.weightConfig?.korean       // 사용자 설정 (최우선)
        },
        global: { 
          ...DEFAULT_WEIGHT_CONFIG.global,     // 기본값
          ...envWeightConfig.global,           // 환경변수
          ...config.weightConfig?.global       // 사용자 설정 (최우선)
        }
      },
      // 🆕 Phase 3.1.3: 새로운 언어 코드 기반 가중치 설정 초기화
      languageWeightConfig: {
        ...DEFAULT_LANGUAGE_WEIGHT_CONFIG,
        ...config.languageWeightConfig
      },
      ...config
    };

    console.log(`🚀 [COMMUNITY_CLASSIFIER] 서비스 초기화 완료: ${this.config.tableName}`);
    console.log(`⚙️ [COMMUNITY_CLASSIFIER] 가중치 설정:`);
    console.log(`   🇰🇷 한국: logBase=${this.config.weightConfig.korean.logBase}, multiplier=${this.config.weightConfig.korean.languageMultiplier}, maxCap=${this.config.weightConfig.korean.maxCap}`);
    console.log(`   🌍 글로벌: logBase=${this.config.weightConfig.global.logBase}, multiplier=${this.config.weightConfig.global.languageMultiplier}, maxCap=${this.config.weightConfig.global.maxCap}`);
  }

  /**
   * 사용자 커뮤니티 프로필 조회 (캐시 우선)
   * @param userId 사용자 ID
   * @returns 커뮤니티 프로필 또는 null
   */
  async getUserCommunityProfile(userId: string): Promise<UserCommunityProfile | null> {
    if (!this.config.enableCaching) {
      return null;
    }

    try {
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.config.tableName,
        Key: {
          pk: `USER_COMMUNITY#${userId}`,
          sk: 'PROFILE'
        }
      }));

      if (!result.Item) {
        return null;
      }

      const profile = result.Item as UserCommunityProfile;
      
      // TTL 확인
      if (profile.ttl && profile.ttl < Math.floor(Date.now() / 1000)) {
        console.log(`⏰ [COMMUNITY_CLASSIFIER] 캐시 만료됨 (${userId})`);
        return null;
      }

      console.log(`📋 [COMMUNITY_CLASSIFIER] 캐시에서 프로필 조회 (${userId}): ${profile.communityType}`);
      return profile;

    } catch (error) {
      console.error(`❌ [COMMUNITY_CLASSIFIER] 프로필 조회 실패 (${userId}):`, error);
      return null;
    }
  }

  /**
   * 사용자 커뮤니티 분류 수행
   * @param userId 사용자 ID
   * @param forceRefresh 강제 재분석 여부
   * @returns 분류 결과
   */
  async classifyUser(userId: string, forceRefresh: boolean = false): Promise<ClassificationResult> {
    const startTime = Date.now();
    
    // 🆕 [Phase 3.3] 통계 수집 시작
    this.classificationStats.totalAttempts++;
    
    try {
      console.log(`🔍 [COMMUNITY_CLASSIFIER] 사용자 ${userId} 분류 시작 (강제새로고침: ${forceRefresh})`);

      // 1. 캐시 확인 (강제 새로고침이 아닌 경우)
      if (!forceRefresh) {
        const cachedProfile = await this.getUserCommunityProfile(userId);
        if (cachedProfile) {
          // 🆕 [Phase 3.3] 캐시 히트 통계 수집
          this.classificationStats.cacheHits++;
          this.classificationStats.successCount++;

          console.log(`📋 [COMMUNITY_CLASSIFIER] 캐시 히트: ${userId} → ${cachedProfile.communityType} (dominantLanguage: ${cachedProfile.dominantLanguage || 'N/A'})`);

          return {
            success: true,
            userId,
            communityType: cachedProfile.communityType,
            dominantLanguage: cachedProfile.dominantLanguage,
            confidence: cachedProfile.confidence,
            fromCache: true,
            processingTime: Date.now() - startTime
          };
        }
      }

      // 2. 언어 분석 수행
      console.log(`📝 [COMMUNITY_CLASSIFIER] 언어 분석 수행 중 (${userId})`);
      const languageAnalysis = await this.languageAnalyzer.analyzeUserLanguage(userId);

      // 3. 프로필 키워드 분석
      console.log(`🔎 [COMMUNITY_CLASSIFIER] 프로필 키워드 분석 중 (${userId})`);
      const profileAnalysis = analyzeProfileKeywords({
        description: languageAnalysis.userProfile.description,
        location: languageAnalysis.userProfile.location,
        name: languageAnalysis.userProfile.name,
        username: languageAnalysis.userProfile.username
      });

      // 4. 종합 분류 결정
      const languageRecommendation = LanguageAnalyzer.recommendCommunityType(
        languageAnalysis,
        profileAnalysis.score
      );

      const profileRecommendation = recommendCommunityType(
        profileAnalysis,
        languageAnalysis.confidence
      );

      // 5. 최종 결정 로직 (언어 분석 70% + 프로필 분석 30%)
      const finalResult = this.makeFinalDecision(
        languageRecommendation,
        profileRecommendation,
        languageAnalysis,
        profileAnalysis
      );

      // 6. 결과를 DynamoDB에 저장
      if (this.config.enableCaching) {
        await this.saveCommunityProfile({
          pk: `USER_COMMUNITY#${userId}`,
          sk: 'PROFILE',
          userId,
          username: languageAnalysis.userProfile.username,
          communityType: finalResult.type,
          confidence: finalResult.confidence,
          dominantLanguage: languageAnalysis.dominantLanguage, // 실제 감지된 언어 저장
          analysis: {
            koreanTweetRatio: languageAnalysis.koreanRatio,
            profileKeywords: profileAnalysis.foundKeywords,
            manualOverride: false,
            totalTweetsAnalyzed: languageAnalysis.totalTweets
          },
          lastAnalyzed: new Date().toISOString(),
          analyzedTweetCount: languageAnalysis.totalTweets,
          ttl: Math.floor(Date.now() / 1000) + (this.config.ttlDays * 24 * 60 * 60),
          version: 'v2'
        });
      }

      const processingTime = Date.now() - startTime;
      
      // 🆕 [Phase 3.3] 성공 통계 수집
      this.classificationStats.successCount++;
      
      // 낮은 신뢰도 통계 수집 (임계값: 0.6)
      if (finalResult.confidence < 0.6) {
        this.classificationStats.lowConfidenceCount++;
        console.log(`⚠️ [COMMUNITY_CLASSIFIER] 낮은 신뢰도 분류: ${userId} (${(finalResult.confidence * 100).toFixed(1)}%)`);
      }
      
      console.log(`✅ [COMMUNITY_CLASSIFIER] 사용자 ${userId} 분류 완료: ` +
        `${finalResult.type} (신뢰도: ${(finalResult.confidence * 100).toFixed(1)}%, ` +
        `처리시간: ${processingTime}ms)`);
      console.log(`🌐 [COMMUNITY_CLASSIFIER] 감지된 언어: ${languageAnalysis.dominantLanguage}`);

      return {
        success: true,
        userId,
        communityType: finalResult.type,
        dominantLanguage: languageAnalysis.dominantLanguage,
        confidence: finalResult.confidence,
        fromCache: false,
        processingTime
      };

    } catch (error) {
      console.error(`❌ [COMMUNITY_CLASSIFIER] 사용자 ${userId} 분류 실패:`, error);
      
      // 🆕 [Phase 3.3] 실패 통계 수집
      this.classificationStats.failureCount++;
      
      // 🆕 [Phase 3.3] 휴리스틱 폴백 시도
      const fallbackResult = this.inferCommunityTypeFromUserId(userId);
      
      if (fallbackResult) {
        this.classificationStats.heuristicFallbacks++;
        console.log(`🔄 [COMMUNITY_CLASSIFIER] 휴리스틱 폴백 성공: ${userId} → ${fallbackResult}`);

        // dominantLanguage는 휴리스틱으로 추정 - korean이면 'ko', 아니면 'unknown'
        const dominantLanguage: LanguageCode = fallbackResult === 'korean' ? 'ko' : 'unknown';

        return {
          success: true,
          userId,
          communityType: fallbackResult,
          dominantLanguage,
          confidence: 0.3, // 폴백의 경우 낮은 신뢰도
          fromCache: false,
          processingTime: Date.now() - startTime,
          fallbackReason: 'heuristic_analysis'
        };
      } else {
        this.classificationStats.errorFallbacks++;
        console.log(`❌ [COMMUNITY_CLASSIFIER] 휴리스틱 폴백도 실패: ${userId}`);
        
        return {
          success: false,
          userId,
          error: error instanceof Error ? error.message : String(error),
          fromCache: false,
          processingTime: Date.now() - startTime
        };
      }
    }
  }

  /**
   * 최종 커뮤니티 타입 결정
   * @param languageRec 언어 분석 추천
   * @param profileRec 프로필 분석 추천
   * @param languageAnalysis 언어 분석 상세 결과
   * @param profileAnalysis 프로필 분석 결과
   * @returns 최종 결정
   */
  private makeFinalDecision(
    languageRec: { type: CommunityType; confidence: number; reason: string },
    profileRec: { recommendedType: 'korean' | 'global'; confidence: number; reasoning: string[] },
    languageAnalysis: DetailedLanguageAnalysis,
    profileAnalysis: any
  ): { type: CommunityType; confidence: number; reason: string } {
    
    // 언어 분석 가중치: 70%, 프로필 분석 가중치: 30%
    const languageWeight = 0.7;
    const profileWeight = 0.3;

    // 각 분석에서 한국 커뮤니티 점수 계산
    const languageKoreanScore = languageRec.type === 'korean' ? languageRec.confidence : (1 - languageRec.confidence);
    const profileKoreanScore = profileRec.recommendedType === 'korean' ? profileRec.confidence : (1 - profileRec.confidence);

    // 가중 평균 계산
    const finalKoreanScore = (languageKoreanScore * languageWeight) + (profileKoreanScore * profileWeight);

    // 추가 보정 요소들
    let adjustedScore = finalKoreanScore;

    // 1. 트윗 수가 적은 경우 신뢰도 감소
    if (languageAnalysis.totalTweets < 5) {
      adjustedScore *= 0.8;
    }

    // 2. 한국어 비율이 매우 높은 경우 보너스
    if (languageAnalysis.koreanRatio >= 0.8) {
      adjustedScore = Math.min(adjustedScore * 1.1, 1.0);
    }

    // 3. 프로필에 지역 정보가 있는 경우 보너스
    if (profileAnalysis.hasLocationMatch) {
      adjustedScore = Math.min(adjustedScore + 0.05, 1.0);
    }

    // 최종 결정
    const threshold = this.config.koreanThreshold; // 기본값: 0.6
    
    if (adjustedScore >= threshold) {
      return {
        type: 'korean',
        confidence: adjustedScore,
        reason: `종합 분석 (언어: ${languageKoreanScore.toFixed(2)}, 프로필: ${profileKoreanScore.toFixed(2)})`
      };
    } else {
      return {
        type: 'global',
        confidence: 1 - adjustedScore,
        reason: `한국 신호 부족 (종합 점수: ${adjustedScore.toFixed(2)} < ${threshold})`
      };
    }
  }

  /**
   * 커뮤니티 프로필을 DynamoDB에 저장
   * @param profile 저장할 프로필
   */
  private async saveCommunityProfile(profile: UserCommunityProfile): Promise<void> {
    try {
      await this.dynamoClient.send(new PutCommand({
        TableName: this.config.tableName,
        Item: profile
      }));

      console.log(`💾 [COMMUNITY_CLASSIFIER] 프로필 저장 완료 (${profile.userId})`);

    } catch (error) {
      console.error(`❌ [COMMUNITY_CLASSIFIER] 프로필 저장 실패 (${profile.userId}):`, error);
      throw error;
    }
  }

  /**
   * 사용자 커뮤니티 타입 수동 설정 (관리자용)
   * @param userId 사용자 ID
   * @param communityType 설정할 커뮤니티 타입
   * @param reason 변경 사유
   * @returns 처리 결과
   */
  async setUserCommunityType(
    userId: string, 
    communityType: CommunityType, 
    reason: string = '관리자 수동 설정'
  ): Promise<ClassificationResult> {
    try {
      console.log(`🛠️ [COMMUNITY_CLASSIFIER] 수동 설정: ${userId} -> ${communityType}`);

      // 기존 프로필 조회
      const existingProfile = await this.getUserCommunityProfile(userId);
      
      // 새 프로필 생성 또는 업데이트
      const profile: UserCommunityProfile = {
        pk: `USER_COMMUNITY#${userId}`,
        sk: 'PROFILE',
        userId,
        username: existingProfile?.username || 'unknown',
        communityType,
        confidence: 1.0, // 수동 설정은 100% 신뢰도
        analysis: {
          koreanTweetRatio: existingProfile?.analysis.koreanTweetRatio || 0,
          profileKeywords: existingProfile?.analysis.profileKeywords || [],
          manualOverride: true,
          totalTweetsAnalyzed: existingProfile?.analysis.totalTweetsAnalyzed || 0
        },
        lastAnalyzed: new Date().toISOString(),
        analyzedTweetCount: existingProfile?.analyzedTweetCount || 0,
        ttl: Math.floor(Date.now() / 1000) + (this.config.ttlDays * 24 * 60 * 60),
        version: 'v2'
      };

      await this.saveCommunityProfile(profile);

      // dominantLanguage는 수동 설정에서 추정 - korean이면 'ko', 아니면 기존 값 또는 unknown
      const dominantLanguage: LanguageCode =
        existingProfile?.dominantLanguage || (communityType === 'korean' ? 'ko' : 'unknown');

      return {
        success: true,
        userId,
        communityType,
        dominantLanguage,
        confidence: 1.0,
        fromCache: false,
        processingTime: 0
      };

    } catch (error) {
      console.error(`❌ [COMMUNITY_CLASSIFIER] 수동 설정 실패 (${userId}):`, error);
      
      return {
        success: false,
        userId,
        error: error instanceof Error ? error.message : String(error),
        fromCache: false,
        processingTime: 0
      };
    }
  }

  /**
   * 배치 사용자 분류
   * @param userIds 사용자 ID 배열
   * @param forceRefresh 강제 새로고침 여부
   * @returns 배치 처리 통계
   */
  async classifyBatchUsers(
    userIds: string[], 
    forceRefresh: boolean = false
  ): Promise<BatchClassificationStats> {
    const startTime = Date.now();
    console.log(`🔄 [COMMUNITY_CLASSIFIER] 배치 분류 시작: ${userIds.length}명`);

    const stats: BatchClassificationStats = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      cacheHitCount: 0,
      koreanCount: 0,
      globalCount: 0,
      averageConfidence: 0,
      processingTimeMs: 0
    };

    let totalConfidence = 0;

    // 동시 처리 제한 (API Rate Limit 고려)
    const batchSize = 3;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (userId) => {
        try {
          stats.totalProcessed++;
          const result = await this.classifyUser(userId, forceRefresh);
          
          if (result.success) {
            stats.successCount++;
            totalConfidence += result.confidence || 0;
            
            if (result.fromCache) {
              stats.cacheHitCount++;
            }
            
            if (result.communityType === 'korean') {
              stats.koreanCount++;
            } else {
              stats.globalCount++;
            }
          } else {
            stats.errorCount++;
          }
          
          return result;
          
        } catch (error) {
          stats.totalProcessed++;
          stats.errorCount++;
          console.error(`❌ [COMMUNITY_CLASSIFIER] 배치 처리 오류 (${userId}):`, error);
          return null;
        }
      });
      
      await Promise.all(batchPromises);
      
      // Rate Limit 방지를 위한 지연
      if (i + batchSize < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
      }
    }

    stats.averageConfidence = stats.successCount > 0 ? totalConfidence / stats.successCount : 0;
    stats.processingTimeMs = Date.now() - startTime;

    console.log(`✅ [COMMUNITY_CLASSIFIER] 배치 분류 완료:`, {
      처리완료: `${stats.successCount}/${stats.totalProcessed}`,
      한국커뮤니티: stats.koreanCount,
      글로벌커뮤니티: stats.globalCount,
      평균신뢰도: `${(stats.averageConfidence * 100).toFixed(1)}%`,
      처리시간: `${(stats.processingTimeMs / 1000).toFixed(1)}초`
    });

    return stats;
  }

  /**
   * 하이브리드 가중치 계산 (로그 밑 차별화 + 언어별 기본점수 조정)
   * @param userId 사용자 ID
   * @param followers 팔로워 수
   * @param baseScore 기본 점수
   * @returns 가중치 계산 결과
   */
  async calculateCommunityWeight(
    userId: string,
    followers: number,
    baseScore: number = 1.0,
    username?: string,
    displayName?: string,
    engagementLangs?: string[] // X API lang 필드 배열 (Quotes/Mentions만 포함)
  ): Promise<WeightCalculationResult> {
    try {
      // 1. dominantLanguage 결정 (X API lang → username 패턴 분석)
      let dominantLanguage: LanguageCode = 'unknown';

      // Priority 1: X API lang 필드 (Quotes/Mentions에서 수집된 실제 트윗 언어)
      if (engagementLangs && engagementLangs.length > 0) {
        const validLangs = engagementLangs.filter(lang => lang && lang !== 'unknown' && lang !== 'und');
        if (validLangs.length > 0) {
          // 다수결: 가장 많이 나타난 언어 선택
          const langCounts = validLangs.reduce((acc, lang) => {
            acc[lang] = (acc[lang] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const mostCommonLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0][0];
          dominantLanguage = mostCommonLang as LanguageCode;
          console.log(`🌐 [LANG_X_API] ${userId}: X API lang 감지 → ${dominantLanguage} (샘플: ${validLangs.join(', ')})`);
        }
      }

      // Priority 2: username/displayName 패턴 기반 언어 추론
      if (dominantLanguage === 'unknown' && (username || displayName)) {
        dominantLanguage = DeltaCalculator.inferDominantLanguageFromUsername(username, userId, displayName);
        console.log(`🔍 [LANG_PATTERN] ${username} / ${displayName} (${userId}): ${dominantLanguage}`);
      }

      // 2. dominantLanguage 기반 설정 선택
      const config = dominantLanguage === 'ko'
        ? this.config.weightConfig.korean
        : this.config.weightConfig.global;

      console.log(`🔧 [WEIGHT_CALC] ${userId}: ${dominantLanguage} 언어 → ${dominantLanguage === 'ko' ? 'Korean' : 'Global'} config 사용`);

      // 3. 팔로워 기반 로그 가중치 계산
      const followerWeight = Math.min(
        Math.log(followers + 1) / Math.log(config.logBase),
        config.maxCap
      );

      // 4. 최종 점수 계산
      const finalWeight = baseScore * followerWeight * config.languageMultiplier;
      const cappedAtMax = followerWeight >= config.maxCap;

      console.log(`⚖️ [WEIGHT_CALC] ${userId}: ${dominantLanguage} 언어, 팔로워 ${followers}명 → 가중치 ${finalWeight.toFixed(2)}`);

      return {
        finalWeight: Math.round(finalWeight * 100) / 100,
        dominantLanguage,
        followerWeight: Math.round(followerWeight * 100) / 100,
        languageMultiplier: config.languageMultiplier,
        logBase: config.logBase,
        maxCap: config.maxCap,
        cappedAtMax
      };

    } catch (error) {
      console.error(`❌ [COMMUNITY_CLASSIFIER] 가중치 계산 실패 (${userId}):`, error);

      // 환경변수 기반 폴백 처리 - 안전한 글로벌 설정 사용
      const fallbackConfig = this.config.weightConfig.global;

      return {
        finalWeight: baseScore * fallbackConfig.languageMultiplier,
        dominantLanguage: undefined, // ✅ undefined로 설정하여 기존 값 보존
        followerWeight: 1.0,
        languageMultiplier: fallbackConfig.languageMultiplier,
        logBase: fallbackConfig.logBase,
        maxCap: fallbackConfig.maxCap,
        cappedAtMax: false
      };
    }
  }

  /**
   * 🔧 [Phase 3.1] 사용자 프로필 기반 스마트 기본값 시스템
   * 프로필 조회 실패 시 사용하는 다단계 휴리스틱 추론
   */
  private inferCommunityTypeFromUserId(userId: string): CommunityType {
    console.log(`🔍 [SMART_FALLBACK] 사용자 ${userId} 스마트 추론 시작`);
    
    let confidence = 0;
    let reasoning: string[] = [];
    
    // 1차: 사용자 ID 패턴 분석 (매우 기본적)
    if (this.containsKoreanPattern(userId)) {
      confidence += 0.3;
      reasoning.push('사용자 ID에서 한국어 패턴 감지');
    }
    
    // 2차: 숫자 패턴 분석 (한국 사용자들의 ID 패턴)
    if (this.hasKoreanStyleNaming(userId)) {
      confidence += 0.2;
      reasoning.push('한국식 네이밍 패턴 감지');
    }
    
    // 3차: 추가 휴리스틱 (향후 확장 가능)
    // TODO: 네트워크 기반 추론, 팔로잉/팔로워 분석 등
    
    const finalType: CommunityType = confidence >= 0.4 ? 'korean' : 'global';
    
    console.log(`🎯 [SMART_FALLBACK] 결과: ${finalType} (신뢰도: ${confidence.toFixed(2)}, 근거: ${reasoning.join(', ') || '없음'})`);
    
    return finalType;
  }

  /**
   * 🆕 [Phase 3.1] 사용자 ID에서 한국어 패턴 감지
   */
  private containsKoreanPattern(userId: string): boolean {
    // 한국어 유니코드 범위 (가-힣) 또는 한국 관련 영문 패턴
    const koreanRegex = /[가-힣]|korea|seoul|busan|kr$/i;
    return koreanRegex.test(userId);
  }

  /**
   * 🆕 [Phase 3.1] 한국식 네이밍 패턴 감지
   */
  private hasKoreanStyleNaming(userId: string): boolean {
    // 한국 사용자들이 자주 사용하는 패턴들
    const koreanPatterns = [
      /\d{4}$/,           // 연도로 끝나는 패턴 (예: kim2024)
      /_\d+$/,            // 언더스코어 + 숫자 패턴
      /^[a-z]+\d{2,4}$/,  // 영문 + 2-4자리 숫자
    ];
    
    return koreanPatterns.some(pattern => pattern.test(userId));
  }

  /**
   * 🆕 [Phase 3.2] 분류 신뢰도 기반 가중치 조정 계산
   * @param confidence 분류 신뢰도 (0.0 ~ 1.0)
   * @param source 분류 데이터 소스
   * @returns 조정된 가중치 배수
   */
  private calculateConfidenceAdjustment(confidence: number, source: string): number {
    // 기본 조정 공식: 신뢰도가 낮을수록 가중치 감소
    let adjustment = 1.0;
    
    // 소스별 기본 조정
    switch (source) {
      case 'cache': 
        // 캐시된 분류 결과 - 신뢰도에 따라 조정
        adjustment = 0.8 + (confidence * 0.2); // 0.8 ~ 1.0
        break;
      case 'heuristic':
        // 휴리스틱 기반 추론 - 보수적 조정
        adjustment = 0.7 + (confidence * 0.2); // 0.7 ~ 0.9
        break;
      case 'fallback':
        // 오류 상황 폴백 - 더 보수적
        adjustment = 0.6 + (confidence * 0.2); // 0.6 ~ 0.8
        break;
      default:
        adjustment = confidence; // 기본값
    }
    
    // 최소/최대 조정 범위 제한
    return Math.max(0.5, Math.min(1.0, adjustment));
  }

  /**
   * 캐시 초기화 (특정 사용자 또는 전체)
   * @param userId 특정 사용자 ID (선택사항)
   */
  async clearCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        // 특정 사용자 캐시 삭제
        await this.dynamoClient.send(new UpdateCommand({
          TableName: this.config.tableName,
          Key: {
            pk: `USER_COMMUNITY#${userId}`,
            sk: 'PROFILE'
          },
          UpdateExpression: 'SET #ttl = :ttl',
          ExpressionAttributeNames: {
            '#ttl': 'ttl'
          },
          ExpressionAttributeValues: {
            ':ttl': Math.floor(Date.now() / 1000) - 1 // 과거 시간으로 설정하여 만료
          }
        }));
        
        console.log(`🗑️ [COMMUNITY_CLASSIFIER] 사용자 캐시 초기화 완료 (${userId})`);
      } else {
        console.log(`🗑️ [COMMUNITY_CLASSIFIER] 전체 캐시 초기화는 수동으로 TTL 관리됩니다`);
      }
      
    } catch (error) {
      console.error(`❌ [COMMUNITY_CLASSIFIER] 캐시 초기화 실패:`, error);
      throw error;
    }
  }

  /**
   * 서비스 통계 조회
   * @returns 서비스 통계 정보
   */
  async getServiceStats(): Promise<{
    totalProfiles: number;
    koreanProfiles: number;
    globalProfiles: number;
    averageConfidence: number;
  }> {
    try {
      // 실제 구현에서는 GSI를 사용하거나 별도 통계 테이블을 사용할 것을 권장
      console.log(`📊 [COMMUNITY_CLASSIFIER] 서비스 통계 조회 기능은 추후 구현 예정`);
      
      return {
        totalProfiles: 0,
        koreanProfiles: 0,
        globalProfiles: 0,
        averageConfidence: 0
      };
      
    } catch (error) {
      console.error(`❌ [COMMUNITY_CLASSIFIER] 통계 조회 실패:`, error);
      throw error;
    }
  }


  /**
   * 설정 업데이트
   * @param newConfig 새로운 설정
   */
  updateConfig(newConfig: Partial<ServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // LanguageAnalyzer 설정도 업데이트
    this.languageAnalyzer.updateConfig(newConfig);
    
    console.log(`🔧 [COMMUNITY_CLASSIFIER] 설정 업데이트:`, newConfig);
  }

  /**
   * 현재 설정 조회
   * @returns 현재 설정
   */
  getConfig(): ServiceConfig {
    return { ...this.config };
  }

  // 🆕 [Phase 3.3] 분류 통계 모니터링 및 알림 시스템

  /**
   * 현재 분류 통계 조회
   * @returns 분류 통계
   */
  getClassificationStats() {
    const runtime = Date.now() - this.classificationStats.resetTime;
    const runtimeHours = runtime / (1000 * 60 * 60);
    
    const stats = {
      ...this.classificationStats,
      runtime,
      runtimeHours: parseFloat(runtimeHours.toFixed(2)),
      successRate: this.classificationStats.totalAttempts > 0 
        ? parseFloat((this.classificationStats.successCount / this.classificationStats.totalAttempts * 100).toFixed(2))
        : 0,
      failureRate: this.classificationStats.totalAttempts > 0
        ? parseFloat((this.classificationStats.failureCount / this.classificationStats.totalAttempts * 100).toFixed(2))
        : 0,
      cacheHitRate: this.classificationStats.totalAttempts > 0
        ? parseFloat((this.classificationStats.cacheHits / this.classificationStats.totalAttempts * 100).toFixed(2))
        : 0,
      lowConfidenceRate: this.classificationStats.successCount > 0
        ? parseFloat((this.classificationStats.lowConfidenceCount / this.classificationStats.successCount * 100).toFixed(2))
        : 0
    };
    
    return stats;
  }

  /**
   * 분류 통계 리셋
   */
  resetClassificationStats(): void {
    this.classificationStats = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      cacheHits: 0,
      heuristicFallbacks: 0,
      errorFallbacks: 0,
      lowConfidenceCount: 0,
      resetTime: Date.now()
    };
    
    console.log(`📊 [COMMUNITY_CLASSIFIER] 분류 통계 리셋됨`);
  }

  /**
   * 분류 품질 모니터링 및 알림
   * @param thresholds 알림 임계값
   * @returns 모니터링 결과
   */
  monitorClassificationQuality(thresholds = {
    maxFailureRate: 20,     // 실패율 20% 초과 시 알림
    maxLowConfidenceRate: 40, // 낮은 신뢰도 40% 초과 시 알림
    minCacheHitRate: 30,    // 캐시 히트율 30% 미만 시 알림
    minAttempts: 10         // 최소 시도 횟수
  }) {
    const stats = this.getClassificationStats();
    const alerts: string[] = [];
    
    // 최소 시도 횟수 확인
    if (stats.totalAttempts < thresholds.minAttempts) {
      return {
        status: 'insufficient_data',
        message: `분류 시도 횟수 부족 (${stats.totalAttempts}/${thresholds.minAttempts})`,
        stats,
        alerts: []
      };
    }
    
    // 실패율 검사
    if (stats.failureRate > thresholds.maxFailureRate) {
      alerts.push(`🚨 높은 실패율: ${stats.failureRate}% (임계값: ${thresholds.maxFailureRate}%)`);
    }
    
    // 낮은 신뢰도 비율 검사
    if (stats.lowConfidenceRate > thresholds.maxLowConfidenceRate) {
      alerts.push(`⚠️ 높은 낮은 신뢰도 비율: ${stats.lowConfidenceRate}% (임계값: ${thresholds.maxLowConfidenceRate}%)`);
    }
    
    // 캐시 히트율 검사
    if (stats.cacheHitRate < thresholds.minCacheHitRate) {
      alerts.push(`📉 낮은 캐시 히트율: ${stats.cacheHitRate}% (임계값: ${thresholds.minCacheHitRate}%)`);
    }
    
    // 휴리스틱 폴백 과다 사용 검사
    const heuristicFallbackRate = stats.totalAttempts > 0 
      ? (stats.heuristicFallbacks / stats.totalAttempts * 100) 
      : 0;
    if (heuristicFallbackRate > 15) {
      alerts.push(`🔄 과도한 휴리스틱 폴백: ${heuristicFallbackRate.toFixed(1)}% (권장: <15%)`);
    }
    
    const status = alerts.length > 0 ? 'alert' : 'healthy';
    
    // 알림 로그 출력
    if (alerts.length > 0) {
      console.log(`🚨 [COMMUNITY_CLASSIFIER] 분류 품질 알림:`);
      alerts.forEach(alert => console.log(`   ${alert}`));
      console.log(`📊 통계 요약:`, {
        총시도: stats.totalAttempts,
        성공률: `${stats.successRate}%`,
        실패율: `${stats.failureRate}%`,
        캐시히트율: `${stats.cacheHitRate}%`,
        낮은신뢰도율: `${stats.lowConfidenceRate}%`,
        휴리스틱폴백: stats.heuristicFallbacks,
        가동시간: `${stats.runtimeHours}시간`
      });
    } else {
      console.log(`✅ [COMMUNITY_CLASSIFIER] 분류 품질 양호 (성공률: ${stats.successRate}%, 실패율: ${stats.failureRate}%)`);
    }
    
    return {
      status,
      message: status === 'healthy' 
        ? '분류 시스템이 정상적으로 작동 중입니다'
        : `${alerts.length}개의 품질 이슈가 감지되었습니다`,
      stats,
      alerts
    };
  }

  /**
   * 주기적 모니터링 실행 (예: 매 시간)
   * 실제 환경에서는 CloudWatch나 별도 모니터링 시스템과 연동
   */
  schedulePeriodicMonitoring(): void {
    // 실제 구현시에는 cron job이나 EventBridge 사용 권장
    console.log(`⏰ [COMMUNITY_CLASSIFIER] 주기적 모니터링 스케줄 설정 (매 시간 체크)`);
    
    // 예시: 1시간마다 모니터링 실행
    setInterval(() => {
      this.monitorClassificationQuality();
    }, 60 * 60 * 1000); // 1시간
  }
}