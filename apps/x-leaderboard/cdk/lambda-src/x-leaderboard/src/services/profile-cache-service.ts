import { DynamoDBClient, BatchGetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { 
  marshall, 
  unmarshall 
} from "@aws-sdk/util-dynamodb";

import { 
  UserProfile, 
  CachedProfile,
  PROFILE_QUALITY_THRESHOLDS
} from '../types/profile';

/**
 * 💾 프로필 캐시 서비스
 * 
 * 고품질 사용자 프로필의 지능형 캐싱 관리
 * - TTL 기반 자동 만료
 * - 품질 점수 기반 선별 저장
 * - 배치 최적화
 */
export class ProfileCacheService {
  constructor(
    private dynamodb: DynamoDBClient,
    private tableName: string = process.env.USER_PROFILE_TABLE_NAME || 'nasun-user-profiles-v2'
  ) {}

  /**
   * 🔄 배치 프로필 조회
   * 
   * @param userIds 조회할 사용자 ID 배열
   * @returns 캐시된 프로필 맵
   */
  async batchGetProfiles(userIds: string[]): Promise<Map<string, CachedProfile>> {
    const results = new Map<string, CachedProfile>();
    
    if (userIds.length === 0) {
      return results;
    }

    try {
      // DynamoDB BatchGetItem 제한: 100개씩 처리
      const batches = this.chunkArray(userIds, 100);
      
      console.log(`📦 [CACHE] 배치 조회 시작: ${userIds.length}개 사용자, ${batches.length}개 배치`);
      
      for (const [batchIndex, batch] of batches.entries()) {
        const keys = batch.map(userId => ({
          pk: `USER_PROFILE#${userId}`,
          sk: 'LATEST'
        }));
        
        try {
          const response = await this.dynamodb.send(new BatchGetItemCommand({
            RequestItems: {
              [this.tableName]: {
                Keys: keys.map(key => marshall(key))
              }
            }
          }));
          
          if (response.Responses && response.Responses[this.tableName]) {
            let validCount = 0;
            let expiredCount = 0;
            
            for (const item of response.Responses[this.tableName]) {
              const profile = unmarshall(item) as CachedProfile;
              
              // V2 데이터 호환성: 누락된 필드에 기본값 설정
              if (!profile.qualityScore) profile.qualityScore = 50; // 기본 품질 점수
              if (!profile.completeness) {
                profile.completeness = {
                  hasValidUsername: !!profile.username,
                  hasValidDisplayName: !!profile.displayName,
                  hasProfileImage: !!profile.profileImageUrl,
                  hasFollowersCount: !!profile.followersCount
                };
              }
              if (!profile.sources) profile.sources = ['cache'];
              if (!profile.version) profile.version = 'v2'; // 기본 버전
              
              if (this.isValidCache(profile)) {
                results.set(profile.userId, profile);
                validCount++;
              } else {
                expiredCount++;
                console.log(`⏰ [CACHE] 만료된 캐시: ${profile.userId} (TTL: ${profile.ttl})`);
              }
            }
            
            console.log(`📦 [CACHE] 배치 ${batchIndex + 1}/${batches.length}: ${validCount}개 유효, ${expiredCount}개 만료`);
          }
          
        } catch (batchError) {
          console.error(`❌ [CACHE] 배치 ${batchIndex + 1} 조회 실패:`, batchError);
          // 배치 실패해도 계속 진행
        }
      }
      
      const hitRate = userIds.length > 0 ? (results.size / userIds.length * 100).toFixed(1) : '0';
      console.log(`📊 [CACHE] 조회 완료: ${userIds.length}개 요청, ${results.size}개 히트 (${hitRate}%)`);
      
      return results;
      
    } catch (error) {
      console.error(`❌ [CACHE] 배치 조회 전체 실패:`, error);
      return results;
    }
  }

  /**
   * ✨ 고품질 프로필 캐시 저장
   * 
   * @param profile 저장할 프로필
   * @returns 저장 성공 여부
   */
  async setCachedProfile(profile: UserProfile): Promise<boolean> {
    try {
      // 품질 점수 확인
      if (profile.qualityScore < PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
        console.log(`📉 [CACHE] 품질 부족으로 캐시 건너뛰기: ${profile.userId} (점수: ${profile.qualityScore}/${PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY})`);
        return false;
      }

      const cached: CachedProfile = {
        ...profile,
        pk: `USER_PROFILE#${profile.userId}`,
        sk: 'LATEST'
      };

      await this.dynamodb.send(new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(cached, { removeUndefinedValues: true })
      }));

      console.log(`💾 [CACHE] 저장 성공: ${profile.userId} (품질: ${profile.qualityScore}점, TTL: ${new Date(profile.ttl * 1000).toISOString()})`);
      return true;

    } catch (error) {
      console.error(`❌ [CACHE] 저장 실패: ${profile.userId}`, error);
      return false;
    }
  }

  /**
   * 🔄 배치 프로필 저장
   * 
   * @param profiles 저장할 프로필 배열
   * @returns 저장 결과 통계
   */
  async batchSetProfiles(profiles: UserProfile[]): Promise<{
    totalAttempted: number;
    successCount: number;
    failureCount: number;
    skippedLowQuality: number;
  }> {
    const stats = {
      totalAttempted: profiles.length,
      successCount: 0,
      failureCount: 0,
      skippedLowQuality: 0
    };

    console.log(`💾 [CACHE] 배치 저장 시작: ${profiles.length}개 프로필`);

    for (const profile of profiles) {
      if (profile.qualityScore < PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
        stats.skippedLowQuality++;
        continue;
      }

      const success = await this.setCachedProfile(profile);
      if (success) {
        stats.successCount++;
      } else {
        stats.failureCount++;
      }
    }

    console.log(`📊 [CACHE] 배치 저장 완료: 성공 ${stats.successCount}개, 실패 ${stats.failureCount}개, 품질부족 ${stats.skippedLowQuality}개`);
    return stats;
  }

  /**
   * 📊 캐시 통계 조회
   */
  async getCacheStats(sampleUserIds: string[] = []): Promise<{
    totalSampled: number;
    hitCount: number;
    hitRate: number;
    averageQuality: number;
    expiredCount: number;
  }> {
    if (sampleUserIds.length === 0) {
      return {
        totalSampled: 0,
        hitCount: 0,
        hitRate: 0,
        averageQuality: 0,
        expiredCount: 0
      };
    }

    const cached = await this.batchGetProfiles(sampleUserIds);
    const hitCount = cached.size;
    const hitRate = (hitCount / sampleUserIds.length) * 100;
    
    let totalQuality = 0;
    let expiredCount = 0;

    for (const profile of cached.values()) {
      totalQuality += profile.qualityScore;
      
      if (!this.isValidCache(profile)) {
        expiredCount++;
      }
    }

    const averageQuality = hitCount > 0 ? totalQuality / hitCount : 0;

    return {
      totalSampled: sampleUserIds.length,
      hitCount,
      hitRate: parseFloat(hitRate.toFixed(1)),
      averageQuality: parseFloat(averageQuality.toFixed(1)),
      expiredCount
    };
  }

  /**
   * 🕐 캐시 유효성 검증
   * 
   * @param profile 검증할 프로필
   * @returns 유효성 여부
   */
  private isValidCache(profile: CachedProfile): boolean {
    const now = Math.floor(Date.now() / 1000);
    
    // TTL 만료 검사
    if (profile.ttl <= now) {
      return false;
    }
    
    // 버전 검사 (1.0 버전 허용, 레거시 v2/v3도 호환)
    if (profile.version && !['1.0', 'v2', 'v3'].includes(profile.version)) {
      return false;
    }
    
    // 필수 필드 검사
    if (!profile.userId || !profile.username) {
      return false;
    }
    
    return true;
  }

  /**
   * 🔧 배열 청킹 유틸리티
   * 
   * @param array 청킹할 배열
   * @param size 청크 크기
   * @returns 청크 배열
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 🧹 만료된 캐시 정리 (관리용)
   * 
   * @param userIds 정리할 사용자 ID 배열 (선택적)
   */
  async cleanupExpiredCache(userIds?: string[]): Promise<{
    scanned: number;
    deleted: number;
  }> {
    console.log(`🧹 [CACHE] 만료 캐시 정리 시작`);
    
    // 실제 구현에서는 DynamoDB Scan을 사용하거나
    // TTL을 이용한 자동 정리에 의존할 수 있음
    // 여기서는 기본 구조만 제공
    
    return {
      scanned: 0,
      deleted: 0
    };
  }

  /**
   * 🔍 캐시 품질 분석
   */
  async analyzeCacheQuality(): Promise<{
    qualityDistribution: { [key: string]: number };
    completenessStats: {
      hasValidUsername: number;
      hasValidDisplayName: number;
      hasProfileImage: number;
      hasFollowersCount: number;
    };
  }> {
    // 실제 구현에서는 샘플링을 통한 품질 분석
    // 현재는 기본 구조만 제공
    
    return {
      qualityDistribution: {
        'high (80+)': 0,
        'medium (50-79)': 0,
        'low (<50)': 0
      },
      completenessStats: {
        hasValidUsername: 0,
        hasValidDisplayName: 0,
        hasProfileImage: 0,
        hasFollowersCount: 0
      }
    };
  }
}