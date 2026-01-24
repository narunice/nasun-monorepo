import { TwitterUserData, APIUsagePlan, ProfileValidators, PROFILE_QUALITY_THRESHOLDS } from '../types/profile';

/**
 * 📊 Rate Limit 상태 정보
 */
export interface RateLimitStatus {
  remaining: number;
  total: number;
  resetTime: number;
  resetTimeISO: string;
  usagePercentage: number;
}

/**
 * 🎯 프로필 수집 우선순위 정보
 */
export interface ProfileCollectionPriority {
  userId: string;
  priorityScore: number;
  reasons: string[];
  estimatedBenefit: number;
  lastUpdated?: string;
  currentQualityScore: number;
}

/**
 * 📈 API 비용 효과성 분석
 */
export interface CostEffectivenessAnalysis {
  totalUsers: number;
  highPriorityUsers: number;
  estimatedAPICalls: number;
  expectedQualityImprovement: number;
  costBenefitRatio: number;
  recommendations: string[];
}

/**
 * ⚡ Twitter API 최적화 서비스
 * 
 * API 호출 효율성 극대화를 위한 최적화 엔진
 * - 중복 제거
 * - 배치 처리
 * - Rate Limit 관리
 * - 사용량 예측
 */
export class TwitterAPIOptimizer {
  private rateLimitCache: RateLimitStatus | null = null;
  private rateLimitCacheTime = 0;
  private readonly CACHE_DURATION = 60 * 1000; // 1분 캐시

  constructor(
    private twitterAPI?: any, // TwitterApiV2Service (추후 주입)
    private config = {
      batchSize: 100,           // Twitter API 제한
      safetyMargin: 0.2,        // 20% 안전 마진
      maxRetries: 3,            // 최대 재시도
      retryDelay: 1000,         // 재시도 지연 (ms)
      // 🎯 Phase 2.3.1: 선별적 수집 설정
      priorityThreshold: 30,    // 우선순위 점수 임계값 (낮춰서 더 많은 사용자 선택)
      qualityThreshold: PROFILE_QUALITY_THRESHOLDS.LOW, // 품질 개선 대상
      maxSelectiveBatch: 50     // 선별적 수집 시 배치 크기
    }
  ) {}

  /**
   * 🎯 Phase 2.3.1: 선별적 프로필 수집 - 품질 점수 기반 우선순위 결정
   * 
   * @param userProfiles 사용자 프로필 정보 배열 (기존 품질 데이터 포함)
   * @returns 우선순위별로 정렬된 수집 대상 배열
   */
  async selectiveProfileCollection(userProfiles: Array<{
    userId: string;
    username?: string;
    displayName?: string;
    profileImageUrl?: string;
    followersCount?: number;
    lastUpdated?: string;
    qualityScore?: number;
  }>): Promise<ProfileCollectionPriority[]> {
    const startTime = Date.now();
    const priorities: ProfileCollectionPriority[] = [];

    console.log(`🎯 [SELECTIVE] 선별적 프로필 수집 분석 시작: ${userProfiles.length}명`);

    for (const profile of userProfiles) {
      const priority = this.calculateProfilePriority(profile);
      
      // 임계값 이상의 우선순위만 포함
      if (priority.priorityScore >= this.config.priorityThreshold) {
        priorities.push(priority);
      }
    }

    // 우선순위 점수 내림차순 정렬
    priorities.sort((a, b) => b.priorityScore - a.priorityScore);

    const duration = Date.now() - startTime;
    console.log(`🎯 [SELECTIVE] 분석 완료: ${priorities.length}/${userProfiles.length}명 선택 (${duration}ms)`);

    return priorities;
  }

  /**
   * 📊 프로필 우선순위 점수 계산
   * 
   * @param profile 사용자 프로필 정보
   * @returns 우선순위 정보
   */
  private calculateProfilePriority(profile: {
    userId: string;
    username?: string;
    displayName?: string;
    profileImageUrl?: string;
    followersCount?: number;
    lastUpdated?: string;
    qualityScore?: number;
  }): ProfileCollectionPriority {
    let priorityScore = 0;
    const reasons: string[] = [];
    let estimatedBenefit = 0;

    // 1. 현재 품질 점수 기반 우선순위 (40점)
    const currentQuality = profile.qualityScore || this.calculateBasicQualityScore(profile);
    if (currentQuality < this.config.qualityThreshold) {
      const qualityGap = this.config.qualityThreshold - currentQuality;
      priorityScore += Math.min(40, qualityGap * 0.8);
      reasons.push(`낮은 품질 점수 (${currentQuality.toFixed(1)}점)`);
      estimatedBenefit += qualityGap * 0.6;
    }

    // 2. 누락된 프로필 요소 기반 (30점)
    let missingElements = 0;
    if (!profile.username || !ProfileValidators.isValidUsername(profile.username)) {
      missingElements++;
      priorityScore += 10;
      reasons.push('사용자명 누락/무효');
      estimatedBenefit += 15;
    }
    if (!profile.displayName || !ProfileValidators.isValidDisplayName(profile.displayName)) {
      missingElements++;
      priorityScore += 8;
      reasons.push('표시명 누락/무효');
      estimatedBenefit += 12;
    }
    if (!profile.profileImageUrl || !ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      missingElements++;
      priorityScore += 12;
      reasons.push('프로필 이미지 누락/무효');
      estimatedBenefit += 18;
    }

    // 3. 팔로워 수 기반 중요도 (20점)
    const followersCount = profile.followersCount || 0;
    if (followersCount > 10000) {
      priorityScore += 20;
      reasons.push(`고팔로워 사용자 (${followersCount.toLocaleString()}명)`);
      estimatedBenefit += 25;
    } else if (followersCount > 1000) {
      priorityScore += 12;
      reasons.push(`중팔로워 사용자 (${followersCount.toLocaleString()}명)`);
      estimatedBenefit += 15;
    } else if (followersCount > 100) {
      priorityScore += 5;
      estimatedBenefit += 8;
    }

    // 4. 마지막 업데이트 시점 기반 (10점)
    if (profile.lastUpdated) {
      const daysSinceUpdate = (Date.now() - new Date(profile.lastUpdated).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceUpdate > 30) {
        priorityScore += 10;
        reasons.push(`오래된 데이터 (${Math.floor(daysSinceUpdate)}일 전)`);
        estimatedBenefit += 10;
      } else if (daysSinceUpdate > 7) {
        priorityScore += 5;
        estimatedBenefit += 5;
      }
    } else {
      priorityScore += 8;
      reasons.push('업데이트 기록 없음');
      estimatedBenefit += 12;
    }

    return {
      userId: profile.userId,
      priorityScore: Math.min(100, priorityScore), // 최대 100점
      reasons,
      estimatedBenefit,
      lastUpdated: profile.lastUpdated,
      currentQualityScore: currentQuality
    };
  }

  /**
   * 📈 API 비용 효과성 분석
   * 
   * @param priorities 우선순위 배열
   * @returns 비용 효과성 분석 결과
   */
  async analyzeCostEffectiveness(priorities: ProfileCollectionPriority[]): Promise<CostEffectivenessAnalysis> {
    const rateLimitStatus = await this.getRateLimitStatus();
    const availableAPICalls = Math.floor(rateLimitStatus.remaining * (1 - this.config.safetyMargin));
    
    const highPriorityUsers = priorities.filter(p => p.priorityScore >= 80).length;
    const estimatedAPICalls = Math.ceil(priorities.length / this.config.maxSelectiveBatch);
    
    const expectedQualityImprovement = priorities.reduce((sum, p) => sum + p.estimatedBenefit, 0) / priorities.length;
    const costBenefitRatio = expectedQualityImprovement / Math.max(1, estimatedAPICalls);

    const recommendations: string[] = [];
    
    if (estimatedAPICalls > availableAPICalls) {
      recommendations.push(`API 할당량 부족: ${estimatedAPICalls}회 필요, ${availableAPICalls}회 가능`);
      recommendations.push(`상위 ${Math.floor(availableAPICalls * this.config.maxSelectiveBatch)}명만 처리 권장`);
    }
    
    if (costBenefitRatio > 15) {
      recommendations.push('매우 높은 효과성: 즉시 처리 권장');
    } else if (costBenefitRatio > 10) {
      recommendations.push('높은 효과성: 우선순위 처리 권장');
    } else if (costBenefitRatio < 5) {
      recommendations.push('낮은 효과성: 처리 연기 고려');
    }

    if (highPriorityUsers > priorities.length * 0.3) {
      recommendations.push('고우선순위 사용자 다수: 배치 크기 확대 고려');
    }

    return {
      totalUsers: priorities.length,
      highPriorityUsers,
      estimatedAPICalls,
      expectedQualityImprovement,
      costBenefitRatio,
      recommendations
    };
  }

  /**
   * 🔧 Rate Limit 고려 배치 크기 조정
   * 
   * @param requestedUsers 요청된 사용자 수
   * @returns 조정된 배치 크기
   */
  async adjustBatchSizeForRateLimit(requestedUsers: number): Promise<{
    recommendedBatchSize: number;
    maxProcessableUsers: number;
    estimatedBatches: number;
    safetyRecommendations: string[];
  }> {
    const rateLimitStatus = await this.getRateLimitStatus();
    const safeAPICalls = Math.floor(rateLimitStatus.remaining * (1 - this.config.safetyMargin));
    
    let recommendedBatchSize = this.config.maxSelectiveBatch;
    const estimatedBatches = Math.ceil(requestedUsers / recommendedBatchSize);
    
    const safetyRecommendations: string[] = [];

    // Rate Limit 상황에 따른 배치 크기 조정
    if (rateLimitStatus.usagePercentage > 80) {
      recommendedBatchSize = Math.min(25, recommendedBatchSize);
      safetyRecommendations.push('Rate Limit 80% 초과: 소형 배치 권장');
    } else if (rateLimitStatus.usagePercentage > 60) {
      recommendedBatchSize = Math.min(40, recommendedBatchSize);
      safetyRecommendations.push('Rate Limit 60% 초과: 중형 배치 권장');
    }

    // API 호출 가능 횟수 대비 조정
    if (estimatedBatches > safeAPICalls) {
      const maxProcessableUsers = safeAPICalls * recommendedBatchSize;
      safetyRecommendations.push(`API 할당량 초과: 최대 ${maxProcessableUsers}명 처리 가능`);
      
      return {
        recommendedBatchSize,
        maxProcessableUsers,
        estimatedBatches: safeAPICalls,
        safetyRecommendations
      };
    }

    return {
      recommendedBatchSize,
      maxProcessableUsers: requestedUsers,
      estimatedBatches,
      safetyRecommendations
    };
  }

  /**
   * 📊 기본 품질 점수 계산 (프로필 정보 기반)
   */
  private calculateBasicQualityScore(profile: {
    username?: string;
    displayName?: string;
    profileImageUrl?: string;
    followersCount?: number;
  }): number {
    let score = 0;
    
    // 사용자명 (25점)
    if (profile.username && ProfileValidators.isValidUsername(profile.username)) {
      score += 25;
    }
    
    // 표시명 (20점)  
    if (profile.displayName && ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += 20;
    }
    
    // 프로필 이미지 (30점)
    if (profile.profileImageUrl && ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += 30;
    }
    
    // 팔로워 수 (25점)
    if (profile.followersCount !== undefined && profile.followersCount >= 0) {
      score += 25;
    }
    
    return score;
  }

  /**
   * ⚡ 배치 사용자 조회 최적화
   * 
   * @param userIds 조회할 사용자 ID 배열
   * @returns 사용자 데이터 맵
   */
  async batchGetUsers(userIds: string[]): Promise<Map<string, TwitterUserData>> {
    const startTime = Date.now();
    const results = new Map<string, TwitterUserData>();

    if (userIds.length === 0) {
      return results;
    }

    try {
      // 1. 중복 제거
      const deduped = this.deduplicateUsers(userIds);
      const saved = userIds.length - deduped.length;
      
      console.log(`♻️ [API_OPT] 중복 제거: ${userIds.length}개 → ${deduped.length}개 (${saved}개 절약, ${(saved/userIds.length*100).toFixed(1)}%)`);

      // 2. API 사용 계획 수립
      const plan = await this.planAPIUsage(deduped.length);
      
      if (!plan.canProceed) {
        console.warn(`⚠️ [API_OPT] Rate Limit 부족으로 API 호출 건너뛰기: ${plan.reason}`);
        return results;
      }

      console.log(`📊 [API_OPT] 사용 계획: ${deduped.length}개 요청, 예상 비용 ${plan.estimatedCost}회`);

      // 3. 배치 처리
      const batches = this.chunkArray(deduped, this.config.batchSize);
      let totalProcessed = 0;
      let totalErrors = 0;

      for (const [batchIndex, batch] of batches.entries()) {
        try {
          console.log(`🔥 [API_OPT] 배치 ${batchIndex + 1}/${batches.length}: ${batch.length}개 사용자 조회`);
          
          const batchResults = await this.processBatch(batch, batchIndex);
          
          // 결과 병합
          for (const [userId, userData] of batchResults) {
            results.set(userId, userData);
          }
          
          totalProcessed += batchResults.size;
          
          // Rate Limit 준수를 위한 딜레이 (마지막 배치 제외)
          if (batchIndex < batches.length - 1) {
            await this.delay(200);
          }
          
        } catch (batchError) {
          totalErrors++;
          console.error(`❌ [API_OPT] 배치 ${batchIndex + 1} 실패:`, batchError);
          
          // Rate Limit 오류인 경우 중단
          if (this.isRateLimitError(batchError)) {
            console.warn(`🚨 [API_OPT] Rate Limit 에러로 중단: 배치 ${batchIndex + 1}/${batches.length}`);
            break;
          }
        }
      }

      const duration = Date.now() - startTime;
      const efficiency = deduped.length > 0 ? (totalProcessed / deduped.length * 100).toFixed(1) : '0';
      
      console.log(`🏁 [API_OPT] 완료: ${totalProcessed}/${deduped.length}개 성공 (${efficiency}%), ${totalErrors}개 배치 실패, ${duration}ms`);
      
      return results;
      
    } catch (error) {
      console.error(`❌ [API_OPT] 전체 실패:`, error);
      return results;
    }
  }

  /**
   * 📊 API 사용 계획 수립
   * 
   * @param estimatedUsers 예상 사용자 수
   * @returns API 사용 계획
   */
  async planAPIUsage(estimatedUsers: number): Promise<APIUsagePlan> {
    try {
      const status = await this.getRateLimitStatus();
      const requiredBatches = Math.ceil(estimatedUsers / this.config.batchSize);
      const safeQuota = Math.floor(status.remaining * (1 - this.config.safetyMargin));
      
      const plan: APIUsagePlan = {
        canProceed: safeQuota >= requiredBatches,
        estimatedCost: requiredBatches,
        remainingQuota: status.remaining,
        recommendedBatchSize: Math.min(this.config.batchSize, safeQuota * 50), // 50개씩 여유
        estimatedCompletionTime: requiredBatches * 300 // 배치당 300ms 예상
      };

      if (!plan.canProceed) {
        plan.reason = `Rate Limit 부족: 필요 ${requiredBatches}회, 안전 여유분 ${safeQuota}회`;
      }

      console.log(`📈 [API_OPT] 계획: ${plan.canProceed ? '✅ 진행' : '❌ 중단'} - 필요 ${requiredBatches}회, 여유 ${safeQuota}회`);
      
      return plan;
      
    } catch (error) {
      console.error(`❌ [API_OPT] 계획 수립 실패:`, error);
      return {
        canProceed: false,
        estimatedCost: 0,
        remainingQuota: 0,
        recommendedBatchSize: 0,
        estimatedCompletionTime: 0,
        reason: 'Rate Limit 상태 조회 실패'
      };
    }
  }

  /**
   * 🎯 사용자 중복 제거
   * 
   * @param userIds 사용자 ID 배열
   * @returns 중복 제거된 사용자 ID 배열
   */
  private deduplicateUsers(userIds: string[]): string[] {
    const unique = [...new Set(userIds.filter(id => id && id.trim() !== ''))];
    return unique;
  }

  /**
   * 🔥 배치 처리
   * 
   * @param batch 처리할 사용자 ID 배치
   * @param batchIndex 배치 인덱스
   * @returns 배치 처리 결과
   */
  private async processBatch(batch: string[], batchIndex: number): Promise<Map<string, TwitterUserData>> {
    const results = new Map<string, TwitterUserData>();
    
    if (!this.twitterAPI) {
      // Twitter API 서비스가 없는 경우 빈 결과 반환 (가짜 데이터 생성하지 않음)
      console.log(`🔧 [API_OPT] Twitter API 서비스 없음, 빈 결과 반환 (실제 프로필 데이터만 사용)`);
      
      return results; // 빈 Map 반환
    }

    try {
      // 실제 Twitter API 호출
      const users = await this.twitterAPI.getUsersByIds(batch, {
        'user.fields': ['public_metrics', 'profile_image_url', 'name', 'username']
      });

      if (users.data) {
        for (const user of users.data) {
          const userData: TwitterUserData = {
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            profile_image_url: user.profile_image_url,
            public_metrics: user.public_metrics
          };
          
          results.set(user.id, userData);
        }
      }

      // 누락된 사용자에 대한 로그
      const missing = batch.filter(id => !results.has(id));
      if (missing.length > 0) {
        console.log(`⚠️ [API_OPT] 배치 ${batchIndex + 1} 누락: ${missing.length}개 (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''})`);
      }

      return results;
      
    } catch (error) {
      console.error(`❌ [API_OPT] 배치 ${batchIndex + 1} API 호출 실패:`, error);
      throw error;
    }
  }

  /**
   * 📊 Rate Limit 상태 조회
   * 
   * @returns Rate Limit 상태
   */
  private async getRateLimitStatus(): Promise<RateLimitStatus> {
    const now = Date.now();
    
    // 캐시된 상태가 있고 유효한 경우 사용
    if (this.rateLimitCache && (now - this.rateLimitCacheTime) < this.CACHE_DURATION) {
      return this.rateLimitCache;
    }

    try {
      if (this.twitterAPI && this.twitterAPI.getRateLimitStatus) {
        const status = await this.twitterAPI.getRateLimitStatus();
        
        this.rateLimitCache = {
          remaining: status.remaining || 300, // 기본값
          total: status.limit || 300,
          resetTime: status.reset || (now + 15 * 60 * 1000), // 15분 후
          resetTimeISO: new Date(status.reset || (now + 15 * 60 * 1000)).toISOString(),
          usagePercentage: status.remaining && status.limit ? 
            ((status.limit - status.remaining) / status.limit * 100) : 0
        };
        
        this.rateLimitCacheTime = now;
        
        console.log(`📊 [API_OPT] Rate Limit: ${this.rateLimitCache.remaining}/${this.rateLimitCache.total} (${this.rateLimitCache.usagePercentage.toFixed(1)}% 사용)`);
        
        return this.rateLimitCache;
      }
    } catch (error) {
      console.warn(`⚠️ [API_OPT] Rate Limit 조회 실패, 기본값 사용:`, error);
    }

    // 기본값 반환 (보수적 추정)
    const defaultStatus: RateLimitStatus = {
      remaining: 100,
      total: 300,
      resetTime: now + 15 * 60 * 1000,
      resetTimeISO: new Date(now + 15 * 60 * 1000).toISOString(),
      usagePercentage: 66.7
    };

    this.rateLimitCache = defaultStatus;
    this.rateLimitCacheTime = now;
    
    return defaultStatus;
  }

  /**
   * 🔧 유틸리티 메서드들
   */
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRateLimitError(error: any): boolean {
    return error?.status === 429 || 
           error?.code === 'RATE_LIMIT_EXCEEDED' ||
           (error?.message && error.message.toLowerCase().includes('rate limit'));
  }

  private createMockUserData(userId: string): TwitterUserData {
    // 🚫 가짜 프로필 생성 비활성화 - 실제 Twitter 데이터만 사용
    // 이 메서드는 더 이상 사용되지 않음
    throw new Error(`[DEPRECATED] createMockUserData 비활성화됨 - 실제 프로필 데이터만 사용해야 함: ${userId}`);
  }

  /**
   * 🎯 Phase 2.3.1: 선별적 프로필 수집 및 최적화된 업데이트 수행
   * 
   * @param userProfiles 사용자 프로필 정보 배열
   * @returns 업데이트된 프로필 데이터 맵
   */
  async selectiveProfileUpdate(userProfiles: Array<{
    userId: string;
    username?: string;
    displayName?: string;
    profileImageUrl?: string;
    followersCount?: number;
    lastUpdated?: string;
    qualityScore?: number;
  }>): Promise<{
    updatedProfiles: Map<string, TwitterUserData>;
    analysis: CostEffectivenessAnalysis;
    skippedUsers: string[];
    processingSummary: {
      totalAnalyzed: number;
      selectedForUpdate: number;
      actuallyUpdated: number;
      apiCallsUsed: number;
      processingTime: number;
    };
  }> {
    const startTime = Date.now();
    
    console.log(`🎯 [SELECTIVE_UPDATE] 선별적 프로필 업데이트 시작: ${userProfiles.length}명 분석`);
    
    // 1. 우선순위 분석
    const priorities = await this.selectiveProfileCollection(userProfiles);
    console.log(`🎯 [SELECTIVE_UPDATE] 선별 완료: ${priorities.length}명 선택됨`);
    
    // 2. 비용 효과성 분석
    const analysis = await this.analyzeCostEffectiveness(priorities);
    console.log(`📈 [SELECTIVE_UPDATE] 비용 효과성 분석: 비용 대비 효과 ${analysis.costBenefitRatio.toFixed(1)}`);
    
    // 3. Rate Limit 고려 배치 크기 조정
    const batchAdjustment = await this.adjustBatchSizeForRateLimit(priorities.length);
    console.log(`🔧 [SELECTIVE_UPDATE] 배치 조정: ${batchAdjustment.recommendedBatchSize}개씩, ${batchAdjustment.estimatedBatches}회 처리`);
    
    // 4. 실제 처리 가능한 사용자 선별
    const processableUsers = priorities.slice(0, batchAdjustment.maxProcessableUsers);
    const skippedUsers = priorities.slice(batchAdjustment.maxProcessableUsers).map(p => p.userId);
    
    if (skippedUsers.length > 0) {
      console.log(`⚠️ [SELECTIVE_UPDATE] Rate Limit 초과로 ${skippedUsers.length}명 건너뜀`);
    }
    
    // 5. 선별적 API 호출 수행
    const userIds = processableUsers.map(p => p.userId);
    const updatedProfiles = await this.batchGetUsers(userIds);
    
    const processingTime = Date.now() - startTime;
    
    const processingSummary = {
      totalAnalyzed: userProfiles.length,
      selectedForUpdate: priorities.length,
      actuallyUpdated: updatedProfiles.size,
      apiCallsUsed: Math.ceil(userIds.length / batchAdjustment.recommendedBatchSize),
      processingTime
    };
    
    console.log(`🏁 [SELECTIVE_UPDATE] 완료: ${processingSummary.actuallyUpdated}/${processingSummary.totalAnalyzed}명 업데이트 (${processingTime}ms)`);
    
    return {
      updatedProfiles,
      analysis,
      skippedUsers,
      processingSummary
    };
  }

  /**
   * 📊 프로필 품질 개선 잠재력 분석
   * 
   * @param userProfiles 분석할 사용자 프로필 배열
   * @returns 개선 잠재력 분석 결과
   */
  async analyzeImprovementPotential(userProfiles: Array<{
    userId: string;
    username?: string;
    displayName?: string;
    profileImageUrl?: string;
    followersCount?: number;
    lastUpdated?: string;
    qualityScore?: number;
  }>): Promise<{
    totalUsers: number;
    lowQualityUsers: number;
    mediumQualityUsers: number;
    highQualityUsers: number;
    improvementCategories: {
      username: number;
      displayName: number;
      profileImage: number;
      followers: number;
      outdated: number;
    };
    potentialScoreIncrease: number;
    recommendedActions: string[];
  }> {
    let lowQuality = 0, mediumQuality = 0, highQuality = 0;
    const improvementCategories = {
      username: 0,
      displayName: 0,
      profileImage: 0,
      followers: 0,
      outdated: 0
    };
    
    let totalPotentialIncrease = 0;
    const recommendedActions: string[] = [];
    
    for (const profile of userProfiles) {
      const currentQuality = profile.qualityScore || this.calculateBasicQualityScore(profile);
      
      // 품질 등급 분류
      if (currentQuality < PROFILE_QUALITY_THRESHOLDS.LOW) {
        lowQuality++;
      } else if (currentQuality < PROFILE_QUALITY_THRESHOLDS.MEDIUM) {
        mediumQuality++;
      } else {
        highQuality++;
      }
      
      // 개선 잠재력 분석
      let potentialIncrease = 0;
      
      if (!profile.username || !ProfileValidators.isValidUsername(profile.username)) {
        improvementCategories.username++;
        potentialIncrease += 25;
      }
      if (!profile.displayName || !ProfileValidators.isValidDisplayName(profile.displayName)) {
        improvementCategories.displayName++;
        potentialIncrease += 20;
      }
      if (!profile.profileImageUrl || !ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
        improvementCategories.profileImage++;
        potentialIncrease += 30;
      }
      if (profile.followersCount === undefined) {
        improvementCategories.followers++;
        potentialIncrease += 25;
      }
      if (profile.lastUpdated) {
        const daysSinceUpdate = (Date.now() - new Date(profile.lastUpdated).getTime()) / (24 * 60 * 60 * 1000);
        if (daysSinceUpdate > 30) {
          improvementCategories.outdated++;
          potentialIncrease += 10;
        }
      }
      
      totalPotentialIncrease += potentialIncrease;
    }
    
    const averagePotentialIncrease = totalPotentialIncrease / userProfiles.length;
    
    // 추천 액션 생성
    if (improvementCategories.profileImage > userProfiles.length * 0.3) {
      recommendedActions.push('프로필 이미지 복구 우선 처리 권장');
    }
    if (improvementCategories.username > userProfiles.length * 0.2) {
      recommendedActions.push('사용자명 복구 시급 처리 필요');
    }
    if (lowQuality > userProfiles.length * 0.4) {
      recommendedActions.push('대규모 품질 개선 작업 필요');
    }
    if (improvementCategories.outdated > userProfiles.length * 0.5) {
      recommendedActions.push('정기적 프로필 업데이트 시스템 구축 권장');
    }
    
    return {
      totalUsers: userProfiles.length,
      lowQualityUsers: lowQuality,
      mediumQualityUsers: mediumQuality,
      highQualityUsers: highQuality,
      improvementCategories,
      potentialScoreIncrease: averagePotentialIncrease,
      recommendedActions
    };
  }

  /**
   * 📈 최적화 통계 조회
   */
  getOptimizationStats(): {
    totalRequests: number;
    deduplicationSavings: number;
    averageBatchSize: number;
    successRate: number;
  } {
    // 실제 구현에서는 통계 수집
    return {
      totalRequests: 0,
      deduplicationSavings: 0,
      averageBatchSize: this.config.batchSize,
      successRate: 0
    };
  }

  /**
   * ⚙️ 설정 업데이트
   */
  updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`⚙️ [API_OPT] 설정 업데이트:`, newConfig);
  }

  /**
   * 🧹 캐시 정리
   */
  clearCache(): void {
    this.rateLimitCache = null;
    this.rateLimitCacheTime = 0;
    console.log(`🧹 [API_OPT] 캐시 정리 완료`);
  }
}