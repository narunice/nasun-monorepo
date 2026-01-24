import { 
  UserProfile, 
  CachedProfile, 
  ProfileCandidate, 
  ProfileMergeResult, 
  BatchProfileResult,
  ProfileSource,
  EngagementProfileData,
  ExistingProfileData,
  TwitterUserData,
  PROFILE_QUALITY_THRESHOLDS,
  FIELD_QUALITY_WEIGHTS,
  SOURCE_RELIABILITY_SCORES,
  ProfileValidators
} from '../types/profile';

/**
 * 🎯 중앙집중식 프로필 관리자
 * 
 * 모든 사용자 프로필 관련 작업의 단일 진입점
 * - 데이터 병합 및 품질 관리
 * - 캐시 최적화
 * - API 호출 최소화
 */
export class CentralizedProfileManager {
  constructor(
    private dynamoClient: any,
    private config: any,
    private cacheService?: any, // ProfileCacheService (추후 주입)
    private apiOptimizer?: any   // TwitterAPIOptimizer (추후 주입)
  ) {}

  /**
   * 🎯 핵심 메서드: 인게이지먼트 데이터에서 사용자 프로필 통합 처리
   * 
   * @param engagements 인게이지먼트 데이터 배열
   * @param existingProfiles 기존 프로필 데이터 (선택적)
   * @returns 통합된 사용자 프로필 맵
   */
  async processUserProfiles(
    engagements: any[], 
    existingProfiles?: Map<string, ExistingProfileData>
  ): Promise<BatchProfileResult> {
    const startTime = Date.now();
    const stats = {
      totalProcessed: 0,
      cacheHits: 0,
      apiCalls: 0,
      qualityImprovements: 0,
      averageQualityScore: 0
    };
    const timing = {
      cacheTime: 0,
      apiTime: 0,
      mergeTime: 0,
      totalTime: 0
    };

    try {
      // 1. 유니크 사용자 추출
      const userIds = this.extractUniqueUsers(engagements);
      stats.totalProcessed = userIds.length;

      console.log(`👥 [PROFILE_MANAGER] 처리 시작: ${userIds.length}명의 사용자`);

      // 2. 캐시에서 기존 프로필 조회 (캐시 서비스가 있는 경우)
      const cacheStartTime = Date.now();
      let cachedProfiles = new Map<string, CachedProfile>();
      if (this.cacheService) {
        cachedProfiles = await this.cacheService.batchGetProfiles(userIds);
        stats.cacheHits = cachedProfiles.size;
      }
      timing.cacheTime = Date.now() - cacheStartTime;

      // 3. API 호출이 필요한 사용자 식별
      const needsAPIUpdate = this.identifyAPINeeds(userIds, cachedProfiles);
      
      // 4. Twitter API 호출 (API 최적화 서비스가 있는 경우)
      const apiStartTime = Date.now();
      let apiData = new Map<string, TwitterUserData>();
      if (this.apiOptimizer && needsAPIUpdate.length > 0) {
        apiData = await this.apiOptimizer.batchGetUsers(needsAPIUpdate);
        stats.apiCalls = apiData.size;
      }
      timing.apiTime = Date.now() - apiStartTime;

      // 5. 프로필 병합 및 생성
      const mergeStartTime = Date.now();
      const profiles = new Map<string, UserProfile>();
      let totalQualityScore = 0;

      for (const userId of userIds) {
        const engagementData = this.extractEngagementData(userId, engagements);
        const cachedData = cachedProfiles.get(userId);
        const existingData = existingProfiles?.get(userId);
        const apiData_user = apiData.get(userId);

        const mergeResult = this.mergeProfileData(
          engagementData,
          cachedData,
          existingData,
          apiData_user
        );

        profiles.set(userId, mergeResult.profile);
        totalQualityScore += mergeResult.profile.qualityScore;

        if (mergeResult.hasImprovement) {
          stats.qualityImprovements++;
          console.log(`📈 [PROFILE_MANAGER] 품질 향상: ${userId} (+${mergeResult.qualityImprovement}점, 필드: ${mergeResult.improvedFields.join(', ')})`);
        }

        // 고품질 프로필은 캐시에 저장
        if (this.cacheService && mergeResult.profile.qualityScore >= PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
          await this.cacheService.setCachedProfile(mergeResult.profile);
        }
      }

      timing.mergeTime = Date.now() - mergeStartTime;
      timing.totalTime = Date.now() - startTime;

      stats.averageQualityScore = userIds.length > 0 ? totalQualityScore / userIds.length : 0;

      console.log(`✅ [PROFILE_MANAGER] 처리 완료: ${userIds.length}명, 평균 품질 ${stats.averageQualityScore.toFixed(1)}점, ${timing.totalTime}ms`);
      console.log(`📊 [PROFILE_MANAGER] 통계: 캐시 ${stats.cacheHits}개, API ${stats.apiCalls}개, 개선 ${stats.qualityImprovements}개`);

      return {
        profiles,
        stats,
        timing
      };

    } catch (error) {
      console.error(`❌ [PROFILE_MANAGER] 처리 실패:`, error);
      
      // 오류 발생 시 기본 프로필 생성
      const fallbackProfiles = new Map<string, UserProfile>();
      const userIds = this.extractUniqueUsers(engagements);
      
      for (const userId of userIds) {
        const engagementData = this.extractEngagementData(userId, engagements);
        fallbackProfiles.set(userId, this.createFallbackProfile(engagementData));
      }

      return {
        profiles: fallbackProfiles,
        stats: { ...stats, totalProcessed: fallbackProfiles.size },
        timing: { ...timing, totalTime: Date.now() - startTime }
      };
    }
  }

  /**
   * 🔄 프로필 데이터 병합: 모든 소스의 데이터를 통합
   * 
   * @param engagement 인게이지먼트에서 추출한 프로필 데이터
   * @param cached 캐시된 프로필 데이터
   * @param existing 기존 스코어 데이터
   * @param apiData Twitter API 데이터
   * @returns 병합 결과
   */
  private mergeProfileData(
    engagement?: EngagementProfileData,
    cached?: CachedProfile,
    existing?: ExistingProfileData,
    apiData?: TwitterUserData
  ): ProfileMergeResult {
    const originalQuality = cached?.qualityScore || 0;
    const improvedFields: string[] = [];

    // 기본 프로필 구조 생성
    const profile: UserProfile = {
      userId: engagement?.userId || cached?.userId || existing?.userId || apiData?.id || '',
      username: '',
      displayName: '',
      profileImageUrl: undefined,
      followersCount: undefined,
      dominantLanguage: undefined, // ✅ dominantLanguage 필드 추가

      qualityScore: 0,
      lastUpdated: new Date().toISOString(),
      lastAPIUpdate: apiData ? new Date().toISOString() : (cached?.lastAPIUpdate || existing?.followersCountUpdatedAt || ''),
      sources: this.determineSources(engagement, cached, existing, apiData),
      completeness: {
        hasValidUsername: false,
        hasValidDisplayName: false,
        hasProfileImage: false,
        hasFollowersCount: false
      },
      ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7일
      version: "v2"
    };

    // 각 필드별 최적 값 선택
    const usernameResult = this.selectBestField('username', engagement, cached, existing, apiData);
    if (usernameResult.improved) improvedFields.push('username');
    profile.username = usernameResult.value;

    const displayNameResult = this.selectBestField('displayName', engagement, cached, existing, apiData);
    if (displayNameResult.improved) improvedFields.push('displayName');
    profile.displayName = displayNameResult.value;

    const profileImageResult = this.selectBestField('profileImageUrl', engagement, cached, existing, apiData);
    if (profileImageResult.improved) improvedFields.push('profileImageUrl');
    profile.profileImageUrl = profileImageResult.value;

    const followersResult = this.selectBestField('followersCount', engagement, cached, existing, apiData);
    if (followersResult.improved) improvedFields.push('followersCount');
    profile.followersCount = followersResult.value;

    // ✅ dominantLanguage 필드 처리 추가
    const dominantLanguageResult = this.selectBestField('dominantLanguage', engagement, cached, existing, apiData);
    if (dominantLanguageResult.improved) improvedFields.push('dominantLanguage');
    profile.dominantLanguage = dominantLanguageResult.value;

    // 품질 점수 및 완전성 계산
    profile.qualityScore = this.calculateQualityScore(profile);
    profile.completeness = this.calculateCompleteness(profile);

    const qualityImprovement = profile.qualityScore - originalQuality;
    const hasImprovement = improvedFields.length > 0 || qualityImprovement > 0;

    return {
      profile,
      hasImprovement,
      improvedFields,
      qualityImprovement
    };
  }

  /**
   * 🥇 최적 필드 값 선택: 품질과 신뢰도 기반 - 강화된 버전
   */
  private selectBestField(
    fieldName: keyof UserProfile,
    engagement?: EngagementProfileData,
    cached?: CachedProfile,
    existing?: ExistingProfileData,
    apiData?: TwitterUserData
  ): { value: any; improved: boolean } {
    const candidates: ProfileCandidate[] = [];
    
    // 🔧 개선: 기존 값을 더 정확하게 가져오기 (cached, existing, engagement 순서로 확인)
    const originalValue = cached?.[fieldName] || this.getExistingFieldValue(existing, fieldName) || 
                         (engagement ? engagement[fieldName as keyof EngagementProfileData] : undefined);

    // API 데이터 (최고 품질) - 🔧 개선: null 체크 강화
    const apiValue = this.getAPIFieldValue(apiData, fieldName);
    if (apiValue !== null && apiValue !== undefined && this.isValidFieldValue(fieldName, apiValue)) {
      candidates.push({
        value: apiValue,
        score: SOURCE_RELIABILITY_SCORES.direct_api,
        source: 'direct_api'
      });
      console.log(`📡 [PROFILE_SELECT] ${fieldName}: API 값 후보 추가 - ${apiValue} (점수: ${SOURCE_RELIABILITY_SCORES.direct_api})`);
    } else if (apiData && apiValue === null) {
      console.log(`⚠️ [PROFILE_SELECT] ${fieldName}: API 응답에서 null 값 감지 - 후보에서 제외`);
    }

    // 캐시된 데이터 (높은 품질)
    if (cached && this.isValidFieldValue(fieldName, cached[fieldName])) {
      candidates.push({
        value: cached[fieldName],
        score: SOURCE_RELIABILITY_SCORES.cache,
        source: 'cache'
      });
      console.log(`💾 [PROFILE_SELECT] ${fieldName}: 캐시 값 후보 추가 - ${cached[fieldName]} (점수: ${SOURCE_RELIABILITY_SCORES.cache})`);
    }

    // 기존 스코어 데이터 (중간 품질)
    const existingValue = this.getExistingFieldValue(existing, fieldName);
    if (this.isValidFieldValue(fieldName, existingValue)) {
      candidates.push({
        value: existingValue,
        score: SOURCE_RELIABILITY_SCORES.existing_score,
        source: 'existing_score'
      });
      console.log(`🗄️ [PROFILE_SELECT] ${fieldName}: 기존 값 후보 추가 - ${existingValue} (점수: ${SOURCE_RELIABILITY_SCORES.existing_score})`);
    }

    // 인게이지먼트 데이터 (기본 품질)
    if (engagement && this.isValidFieldValue(fieldName, engagement[fieldName as keyof EngagementProfileData])) {
      candidates.push({
        value: engagement[fieldName as keyof EngagementProfileData],
        score: SOURCE_RELIABILITY_SCORES.engagement,
        source: 'engagement'
      });
      console.log(`📊 [PROFILE_SELECT] ${fieldName}: 인게이지먼트 값 후보 추가 - ${engagement[fieldName as keyof EngagementProfileData]} (점수: ${SOURCE_RELIABILITY_SCORES.engagement})`);
    }

    // 🚫 기존 데이터 절대 보존 원칙 - 강화된 버전
    if (candidates.length === 0) {
      // 1단계: 기존 값이 있다면 무조건 보존 (Unknown 제외)
      if (originalValue && originalValue !== 'Unknown' && originalValue !== 'unknown' && originalValue !== null) {
        console.log(`🛡️ [SAFE_PRESERVE] ${fieldName}: 기존 데이터 절대 보존: ${originalValue}`);
        return {
          value: originalValue,
          improved: false
        };
      }
      
      // 2단계: 기존 값도 없으면 undefined 반환 (기본값 생성 금지)
      console.log(`⚠️ [SAFE_PRESERVE] ${fieldName}: 기존 데이터 없음 - undefined 반환으로 데이터 손실 방지`);
      return {
        value: undefined,
        improved: false
      };
    }

    // 🔧 개선: 품질 점수와 값 개선도를 모두 고려한 선택
    const sortedCandidates = candidates.sort((a, b) => {
      // 1차: 신뢰도 점수로 정렬
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      
      // 2차: 기존 값 대비 개선도로 정렬
      const aIsImprovement = this.isValueImprovement(originalValue, a.value);
      const bIsImprovement = this.isValueImprovement(originalValue, b.value);
      
      if (aIsImprovement && !bIsImprovement) return -1;
      if (!aIsImprovement && bIsImprovement) return 1;
      
      return 0;
    });

    const best = sortedCandidates[0];
    const improved = best.value !== originalValue && this.isValueImprovement(originalValue, best.value);

    console.log(`✅ [PROFILE_SELECT] ${fieldName}: 최종 선택 - ${best.value} (소스: ${best.source}, 개선: ${improved ? 'Y' : 'N'})`);

    return {
      value: best.value,
      improved
    };
  }

  /**
   * 📊 품질 점수 계산 (0-100)
   */
  private calculateQualityScore(profile: UserProfile): number {
    let score = 0;

    // 사용자명 (30점)
    if (ProfileValidators.isValidUsername(profile.username)) {
      score += FIELD_QUALITY_WEIGHTS.username;
    }

    // 표시명 (30점)
    if (ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += FIELD_QUALITY_WEIGHTS.displayName;
    }

    // 프로필 이미지 (20점)
    if (ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += FIELD_QUALITY_WEIGHTS.profileImageUrl;
    }

    // 팔로워 수 (20점)
    if (ProfileValidators.isValidFollowersCount(profile.followersCount)) {
      score += FIELD_QUALITY_WEIGHTS.followersCount;
    }

    return Math.min(100, score);
  }

  /**
   * 📈 완전성 지표 계산
   */
  private calculateCompleteness(profile: UserProfile) {
    return {
      hasValidUsername: ProfileValidators.isValidUsername(profile.username),
      hasValidDisplayName: ProfileValidators.isValidDisplayName(profile.displayName),
      hasProfileImage: ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl),
      hasFollowersCount: ProfileValidators.isValidFollowersCount(profile.followersCount)
    };
  }

  /**
   * 👥 유니크 사용자 추출
   */
  private extractUniqueUsers(engagements: any[]): string[] {
    const userIds = new Set<string>();
    
    for (const engagement of engagements) {
      if (engagement.engaging_user_id) {
        userIds.add(engagement.engaging_user_id);
      }
    }
    
    return Array.from(userIds);
  }

  /**
   * 📝 인게이지먼트에서 프로필 데이터 추출
   */
  private extractEngagementData(userId: string, engagements: any[]): EngagementProfileData {
    // 해당 사용자의 첫 번째 인게이지먼트에서 프로필 정보 추출
    const userEngagement = engagements.find(e => e.engaging_user_id === userId);
    
    if (!userEngagement) {
      return { userId };
    }

    return {
      userId,
      username: userEngagement.engaging_username,
      displayName: userEngagement.engaging_display_name,
      profileImageUrl: userEngagement.engaging_profile_image_url,
      followersCount: userEngagement.engaging_followers_count
    };
  }

  /**
   * 🔍 API 업데이트가 필요한 사용자 식별
   */
  private identifyAPINeeds(userIds: string[], cachedProfiles: Map<string, CachedProfile>): string[] {
    const needsUpdate: string[] = [];
    
    for (const userId of userIds) {
      const cached = cachedProfiles.get(userId);
      
      // 캐시가 없거나 품질이 낮은 경우 API 호출 필요
      if (!cached || cached.qualityScore < PROFILE_QUALITY_THRESHOLDS.HIGH_QUALITY) {
        needsUpdate.push(userId);
      }
    }
    
    return needsUpdate;
  }

  /**
   * 🏷️ 데이터 소스 결정
   */
  private determineSources(
    engagement?: EngagementProfileData,
    cached?: CachedProfile,
    existing?: ExistingProfileData,
    apiData?: TwitterUserData
  ): ProfileSource[] {
    const sources: ProfileSource[] = [];
    
    if (apiData) sources.push('direct_api');
    if (cached) sources.push('cache');
    if (existing) sources.push('existing_score');
    if (engagement) sources.push('engagement');
    
    return sources;
  }

  /**
   * 🔧 유틸리티 메서드들
   */
  private getAPIFieldValue(apiData?: TwitterUserData, fieldName?: keyof UserProfile): any {
    if (!apiData) return undefined;
    
    switch (fieldName) {
      case 'username': return apiData.username;
      case 'displayName': return apiData.name;
      case 'profileImageUrl': return apiData.profile_image_url;
      case 'followersCount': return apiData.public_metrics?.followers_count;
      default: return undefined;
    }
  }

  private getExistingFieldValue(existing?: ExistingProfileData, fieldName?: keyof UserProfile): any {
    if (!existing) return undefined;

    switch (fieldName) {
      case 'username': return existing.username;
      case 'displayName': return existing.displayName;
      case 'profileImageUrl': return existing.profileImageUrl;
      case 'followersCount': return existing.followersCount;
      case 'dominantLanguage': return (existing as any).dominantLanguage; // ✅ dominantLanguage case 추가
      default: return undefined;
    }
  }

  private isValidFieldValue(fieldName: keyof UserProfile, value: any): boolean {
    // 🔧 개선된 null 값 검증: null, undefined, 빈 문자열 명시적 거부
    if (value === null || value === undefined || value === '') {
      return false;
    }
    
    // 'unknown' 값 거부 (대소문자 구분 없음)
    if (typeof value === 'string' && value.toLowerCase() === 'unknown') {
      return false;
    }
    
    switch (fieldName) {
      case 'username': return ProfileValidators.isValidUsername(value);
      case 'displayName': return ProfileValidators.isValidDisplayName(value);
      case 'profileImageUrl': return ProfileValidators.isValidProfileImageUrl(value);
      case 'followersCount': return ProfileValidators.isValidFollowersCount(value);
      default: return ProfileValidators.isValidField(value);
    }
  }

  private isValueImprovement(oldValue: any, newValue: any): boolean {
    // 기존 값이 없거나 "Unknown"인 경우는 항상 개선
    if (!oldValue || oldValue === 'Unknown' || oldValue === 'unknown') {
      return true;
    }
    
    // 새 값이 더 길거나 더 정확한 경우
    if (typeof newValue === 'string' && typeof oldValue === 'string') {
      return newValue.length > oldValue.length;
    }
    
    // 숫자 값은 0보다 큰 경우 개선
    if (typeof newValue === 'number' && typeof oldValue === 'number') {
      return newValue > oldValue;
    }
    
    return false;
  }

  private getDefaultValue(fieldName: keyof UserProfile): any {
    // 🚫 절대 'Unknown' 반환 금지 - 기존 데이터 보존 원칙
    // 모든 필드에 대해 undefined 반환하여 기존 데이터 보존
    console.log(`⚠️ [SAFE_DEFAULT] ${fieldName}: 기본값 요청 - undefined 반환으로 기존 데이터 보존`);
    return undefined;
  }

  /**
   * 🆘 폴백 프로필 생성
   */
  private createFallbackProfile(engagement: EngagementProfileData): UserProfile {
    // 🚫 'Unknown' 생산 방지 - 안전한 Fallback 프로필 생성
    const safeDisplayName = engagement.displayName || engagement.username || engagement.userId;
    console.log(`🛡️ [SAFE_FALLBACK] 사용자 ${engagement.userId}: 안전한 Fallback 프로필 생성, displayName=${safeDisplayName}`);
    
    return {
      userId: engagement.userId,
      username: engagement.username || engagement.userId,
      displayName: safeDisplayName,
      profileImageUrl: engagement.profileImageUrl,
      followersCount: engagement.followersCount,
      
      qualityScore: this.calculateQualityScore({
        username: engagement.username || engagement.userId,
        displayName: safeDisplayName,
        profileImageUrl: engagement.profileImageUrl,
        followersCount: engagement.followersCount,
      } as UserProfile),
      lastUpdated: new Date().toISOString(),
      lastAPIUpdate: '',
      sources: ['engagement'],
      completeness: {
        hasValidUsername: ProfileValidators.isValidUsername(engagement.username),
        hasValidDisplayName: ProfileValidators.isValidDisplayName(engagement.displayName),
        hasProfileImage: ProfileValidators.isValidProfileImageUrl(engagement.profileImageUrl),
        hasFollowersCount: ProfileValidators.isValidFollowersCount(engagement.followersCount)
      },
      ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
      version: "v2"
    };
  }

  /**
   * 🔥 Phase 2.3.2: 품질 기반 프로필 후보자 조회
   * 
   * 정기적 프로필 보강을 위해 저품질 프로필 사용자들을 식별합니다.
   * @param criteria 선별 기준
   * @returns 품질 개선 후보자 목록
   */
  async getProfileQualityCandidates(criteria: {
    maxQualityScore?: number;
    maxLastUpdated?: string;
    limit?: number;
  }): Promise<Array<{userId: string; qualityScore: number; lastUpdated: string}>> {
    
    console.log(`🎯 [PROFILE_CANDIDATES] 품질 후보자 조회 시작:`, criteria);
    
    try {
      // DynamoDB에서 CUMULATIVE_SCORE 레코드들을 스캔하여 프로필 품질 분석
      const QueryCommand = require('@aws-sdk/lib-dynamodb').QueryCommand;
      const ScanCommand = require('@aws-sdk/lib-dynamodb').ScanCommand;
      
      const candidates: Array<{userId: string; qualityScore: number; lastUpdated: string}> = [];
      
      // 전체 사용자 프로필 스캔 (production에서는 더 효율적인 방법 필요)
      const scanCommand = new ScanCommand({
        TableName: this.config.cumulativeTableName,
        FilterExpression: 'sk = :sk',
        ExpressionAttributeValues: {
          ':sk': 'CUMULATIVE_SCORE'
        },
        Limit: criteria.limit || 1000
      });
      
      const result = await this.dynamoClient.send(scanCommand);
      
      for (const item of result.Items || []) {
        // 프로필 품질 점수 계산
        const qualityScore = this.calculateProfileQuality({
          username: item.username,
          displayName: item.displayName, 
          profileImageUrl: item.profileImageUrl,
          followersCount: item.followersCount
        });
        
        // 마지막 업데이트 시간 체크
        const lastUpdated = item.lastUpdated || item.lastModified || new Date(0).toISOString();
        
        // 기준에 맞는 후보자 선별
        if (criteria.maxQualityScore && qualityScore > criteria.maxQualityScore) {
          continue;
        }
        
        if (criteria.maxLastUpdated && lastUpdated > criteria.maxLastUpdated) {
          continue;
        }
        
        candidates.push({
          userId: item.pk.replace('USER#', ''),
          qualityScore,
          lastUpdated
        });
      }
      
      // 품질 점수 낮은 순으로 정렬
      candidates.sort((a, b) => a.qualityScore - b.qualityScore);
      
      console.log(`✅ [PROFILE_CANDIDATES] ${candidates.length}명의 후보자 선별 완료`);
      
      return candidates.slice(0, criteria.limit || 1000);
      
    } catch (error) {
      console.error(`❌ [PROFILE_CANDIDATES] 조회 실패:`, error);
      return [];
    }
  }

  /**
   * 🔄 Phase 2.3.2: 최근 활동 사용자 조회
   * 
   * 최근 활동한 사용자들의 프로필을 주기적으로 갱신하기 위해 조회합니다.
   * @param criteria 조회 기준
   * @returns 최근 활동 사용자 목록
   */
  async getRecentlyActiveUsers(criteria: {
    minQualityScore?: number;
    sinceHours?: number;
    limit?: number;
  }): Promise<Array<{userId: string; qualityScore: number; lastActivity: string}>> {
    
    console.log(`🔄 [ACTIVE_USERS] 최근 활동 사용자 조회 시작:`, criteria);
    
    try {
      const ScanCommand = require('@aws-sdk/lib-dynamodb').ScanCommand;
      const sinceTimestamp = new Date(Date.now() - (criteria.sinceHours || 24) * 60 * 60 * 1000).toISOString();
      
      const activeUsers: Array<{userId: string; qualityScore: number; lastActivity: string}> = [];
      
      // 최근 업데이트된 CUMULATIVE_SCORE 레코드 조회
      const scanCommand = new ScanCommand({
        TableName: this.config.cumulativeTableName,
        FilterExpression: 'sk = :sk AND lastModified >= :since',
        ExpressionAttributeValues: {
          ':sk': 'CUMULATIVE_SCORE',
          ':since': sinceTimestamp
        },
        Limit: criteria.limit || 500
      });
      
      const result = await this.dynamoClient.send(scanCommand);
      
      for (const item of result.Items || []) {
        const qualityScore = this.calculateProfileQuality({
          username: item.username,
          displayName: item.displayName,
          profileImageUrl: item.profileImageUrl,
          followersCount: item.followersCount
        });
        
        // 최소 품질 기준 체크
        if (criteria.minQualityScore && qualityScore < criteria.minQualityScore) {
          continue;
        }
        
        activeUsers.push({
          userId: item.pk.replace('USER#', ''),
          qualityScore,
          lastActivity: item.lastModified || item.lastUpdated || new Date().toISOString()
        });
      }
      
      // 최근 활동 순으로 정렬
      activeUsers.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
      
      console.log(`✅ [ACTIVE_USERS] ${activeUsers.length}명의 활동 사용자 조회 완료`);
      
      return activeUsers.slice(0, criteria.limit || 500);
      
    } catch (error) {
      console.error(`❌ [ACTIVE_USERS] 조회 실패:`, error);
      return [];
    }
  }

  /**
   * 🚀 Phase 2.3.2: 배치 프로필 보강 처리
   * 
   * 다수의 사용자 프로필을 한번에 보강 처리합니다.
   * @param userIds 대상 사용자 ID 목록
   * @param options 보강 옵션
   * @returns 보강 처리 결과
   */
  async enhanceProfilesBatch(userIds: string[], options?: {
    forceRefresh?: boolean;
    qualityThreshold?: number;
  }): Promise<{
    processed: number;
    improved: number;
    averageQualityAfter: number;
    apiCalls: number;
    cacheHits: number;
    errors: number;
    improvements: {
      username?: number;
      displayName?: number;
      profileImage?: number;
      followersCount?: number;
    };
  }> {
    
    const stats = {
      processed: 0,
      improved: 0,
      totalQualityAfter: 0,
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      improvements: {
        username: 0,
        displayName: 0,
        profileImage: 0,
        followersCount: 0
      }
    };
    
    console.log(`🚀 [BATCH_ENHANCE] ${userIds.length}명 배치 보강 시작`);
    
    try {
      const QueryCommand = require('@aws-sdk/lib-dynamodb').QueryCommand;
      const UpdateCommand = require('@aws-sdk/lib-dynamodb').UpdateCommand;
      
      for (const userId of userIds) {
        try {
          // 1. 현재 프로필 상태 조회
          const queryCommand = new QueryCommand({
            TableName: this.config.cumulativeTableName,
            KeyConditionExpression: 'pk = :pk AND sk = :sk',
            ExpressionAttributeValues: {
              ':pk': `USER#${userId}`,
              ':sk': 'CUMULATIVE_SCORE'
            }
          });
          
          const result = await this.dynamoClient.send(queryCommand);
          const currentProfile = result.Items?.[0];
          
          if (!currentProfile) {
            console.log(`⚠️ [BATCH_ENHANCE] ${userId} - 프로필 없음, 건너뛰기`);
            continue;
          }
          
          // 2. 현재 품질 점수 계산
          const currentQuality = this.calculateProfileQuality({
            username: currentProfile.username,
            displayName: currentProfile.displayName,
            profileImageUrl: currentProfile.profileImageUrl,
            followersCount: currentProfile.followersCount
          });
          
          // 3. 품질 임계값 체크
          const qualityThreshold = options?.qualityThreshold || 50;
          if (!options?.forceRefresh && currentQuality >= qualityThreshold) {
            console.log(`✅ [BATCH_ENHANCE] ${userId} - 품질 충족 (${currentQuality}점), 건너뛰기`);
            stats.processed++;
            stats.totalQualityAfter += currentQuality;
            continue;
          }
          
          // 4. 프로필 보강 시도 비활성화 - 실제 프로필 데이터만 사용
          console.log(`🚫 [NO_FAKE] 사용자 ${userId}: 가짜 프로필 생성 비활성화, 기존 데이터 유지`);
          
          // 기존 프로필을 그대로 사용 (가짜 데이터 생성 안 함)
          const enhancedProfile = currentProfile;
          stats.cacheHits++; // 기존 데이터 사용
          
          // 5. 개선된 품질 점수 계산
          const enhancedQuality = this.calculateProfileQuality(enhancedProfile);
          
          // 6. 실제 개선이 있는 경우에만 업데이트
          if (enhancedQuality > currentQuality) {
            // 개선 사항 추적
            if (enhancedProfile.username !== currentProfile.username) stats.improvements.username!++;
            if (enhancedProfile.displayName !== currentProfile.displayName) stats.improvements.displayName!++;
            if (enhancedProfile.profileImageUrl !== currentProfile.profileImageUrl) stats.improvements.profileImage!++;
            if (enhancedProfile.followersCount !== currentProfile.followersCount) stats.improvements.followersCount!++;
            
            // DynamoDB 업데이트 (DRY_RUN 모드로 실제 업데이트는 하지 않음)
            console.log(`🎯 [BATCH_ENHANCE] ${userId} - 품질 개선: ${currentQuality}→${enhancedQuality}점`);
            
            stats.improved++;
          }
          
          stats.processed++;
          stats.totalQualityAfter += enhancedQuality;
          
          // Rate Limit 보호
          await new Promise(resolve => setTimeout(resolve, 10)); // 10ms 대기
          
        } catch (error) {
          console.error(`❌ [BATCH_ENHANCE] ${userId} 처리 실패:`, error);
          stats.errors++;
        }
      }
      
      const result = {
        processed: stats.processed,
        improved: stats.improved,
        averageQualityAfter: stats.processed > 0 ? stats.totalQualityAfter / stats.processed : 0,
        apiCalls: stats.apiCalls,
        cacheHits: stats.cacheHits,
        errors: stats.errors,
        improvements: stats.improvements
      };
      
      console.log(`✅ [BATCH_ENHANCE] 완료:`, result);
      
      return result;
      
    } catch (error) {
      console.error(`❌ [BATCH_ENHANCE] 배치 처리 실패:`, error);
      
      return {
        processed: stats.processed,
        improved: 0,
        averageQualityAfter: 0,
        apiCalls: 0,
        cacheHits: 0,
        errors: userIds.length,
        improvements: {}
      };
    }
  }

  /**
   * 🎭 프로필 보강 시뮬레이션 (테스트용)
   * 실제 API 호출 없이 프로필 개선 효과를 시뮬레이션합니다.
   */
  private async simulateProfileEnhancement(currentProfile: any, userId: string): Promise<UserProfile> {
    // 🚫 가짜 프로필 생성 비활성화 - 실제 데이터만 사용
    console.log(`🚫 [DEPRECATED] simulateProfileEnhancement 비활성화됨 - 실제 프로필 데이터만 사용: ${userId}`);
    
    // 기존 프로필 데이터를 그대로 반환 (가짜 이름 생성 안 함)
    const enhanced: UserProfile = {
      userId: userId,
      username: currentProfile.username, // 가짜 이름 생성 안 함
      displayName: currentProfile.displayName, // 가짜 이름 생성 안 함
      profileImageUrl: currentProfile.profileImageUrl, // 실제 이미지만 사용
      followersCount: currentProfile.followersCount, // 실제 팔로워 수만 사용
      lastUpdated: new Date().toISOString(),
      sources: ['preserved_data' as any] as ProfileSource[], // 기존 데이터 보존
      qualityScore: 75,
      lastAPIUpdate: new Date().toISOString(),
      completeness: 90,
      ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
      version: 'v2'
    };
    
    return enhanced;
  }

  /**
   * 📊 프로필 품질 점수 계산
   */
  private calculateProfileQuality(profile: {
    username?: string;
    displayName?: string;
    profileImageUrl?: string;
    followersCount?: number;
  }): number {
    let score = 0;
    
    // Username 검증 (30점)
    if (ProfileValidators.isValidUsername(profile.username)) {
      score += FIELD_QUALITY_WEIGHTS.username;
    }
    
    // DisplayName 검증 (30점)  
    if (ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += FIELD_QUALITY_WEIGHTS.displayName;
    }
    
    // ProfileImage 검증 (20점)
    if (ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += FIELD_QUALITY_WEIGHTS.profileImageUrl;
    }
    
    // FollowersCount 검증 (20점)
    if (ProfileValidators.isValidFollowersCount(profile.followersCount)) {
      score += FIELD_QUALITY_WEIGHTS.followersCount;
    }
    
    return score;
  }
}