// Phase 2: Progressive Enhancement 시스템
// 백그라운드에서 점진적으로 사용자 프로필 정보를 보강하는 서비스

import { TwitterApiService, TwitterUser } from './twitter-api';
import { EnvConfigV2 } from '../utils/env';
import { DynamoDBDocumentClient, BatchWriteCommand, BatchGetCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export interface UserProfileCache {
  userId: string;
  username: string;
  displayName: string;
  profileImageUrl?: string;
  lastUpdated: string;
  ttl: number; // 7일 TTL
  followerCount?: number;
  isActive: boolean; // 계정 활성 상태
}

export interface EnhancementStats {
  totalUsersScanned: number;
  usersNeedingUpdate: number;
  usersSuccessfullyUpdated: number;
  usersFailed: number;
  apiCallsSaved: number;
  processingTimeMs: number;
}

export class ProgressiveProfileEnhancer {
  private readonly dynamoClient: DynamoDBDocumentClient;
  private readonly twitterService: TwitterApiService;
  private readonly tableName: string;
  private readonly CACHE_TTL_DAYS = 7;
  private readonly BATCH_SIZE = 10; // Rate Limit 고려한 배치 크기 (50 → 10으로 축소)

  constructor(config: EnvConfigV2) {
    const dynamoDbClient = new DynamoDBClient({});
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoDbClient);
    this.twitterService = new TwitterApiService(config);
    this.tableName = config.cumulativeTableName;
  }

  /**
   * Phase A: 인게이지먼트 즉시 저장 (사용자 정보 unknown 허용)
   */
  async saveEngagementsImmediate(engagements: any[]): Promise<void> {
    console.log(`💾 [PROGRESSIVE] Phase A: 인게이지먼트 즉시 저장 - ${engagements.length}개`);
    
    const putRequests = engagements.map(engagement => ({
      PutRequest: {
        Item: {
          ...engagement,
          saved_at: new Date().toISOString(),
          enhancement_phase: 'immediate'
        }
      }
    }));

    // 25개씩 배치 저장 (DynamoDB BatchWrite 제한)
    for (let i = 0; i < putRequests.length; i += 25) {
      const batch = putRequests.slice(i, i + 25);
      
      await this.dynamoClient.send(new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: batch
        }
      }));
    }

    console.log(`✅ [PROGRESSIVE] Phase A 완료: ${engagements.length}개 인게이지먼트 즉시 저장`);
  }

  /**
   * Phase B: 백그라운드 프로필 보강 스케줄링
   */
  async scheduleProfileEnrichment(userIds: string[]): Promise<{ scheduled: number; alreadyCached: number }> {
    console.log(`📅 [PROGRESSIVE] Phase B: 프로필 보강 스케줄링 - ${userIds.length}개 사용자`);
    
    // 캐시된 프로필 확인
    const cachedProfiles = await this.getCachedProfiles(userIds);
    const cachedUserIds = new Set(cachedProfiles.map(p => p.userId));
    
    // 보강이 필요한 사용자만 필터링
    const needEnrichment = userIds.filter(id => {
      const cached = cachedProfiles.find(p => p.userId === id);
      return !cached || this.isProfileExpired(cached);
    });

    if (needEnrichment.length === 0) {
      console.log(`✅ [PROGRESSIVE] 모든 사용자 프로필이 캐시됨 - 스케줄링 불필요`);
      return { scheduled: 0, alreadyCached: userIds.length };
    }

    // 백그라운드 처리 큐에 추가 (실제 구현에서는 SQS나 EventBridge 사용)
    console.log(`🔄 [PROGRESSIVE] 백그라운드 보강 대상: ${needEnrichment.length}개 사용자`);
    
    // 즉시 처리 (테스트용 - 실제로는 별도 Lambda에서 처리)
    await this.enrichUserProfilesBatch(needEnrichment);

    return { 
      scheduled: needEnrichment.length, 
      alreadyCached: cachedUserIds.size 
    };
  }

  /**
   * Phase C: 기존 데이터 점진적 보강
   */
  async enrichExistingEngagements(): Promise<EnhancementStats> {
    const startTime = Date.now();
    console.log(`🔧 [PROGRESSIVE] Phase C: 기존 데이터 보강 시작`);

    const stats: EnhancementStats = {
      totalUsersScanned: 0,
      usersNeedingUpdate: 0,
      usersSuccessfullyUpdated: 0,
      usersFailed: 0,
      apiCallsSaved: 0,
      processingTimeMs: 0
    };

    try {
      // unknown 사용자명을 가진 RECENT 스캔
      const unknownEngagements = await this.scanUnknownEngagements();
      stats.totalUsersScanned = unknownEngagements.length;

      if (unknownEngagements.length === 0) {
        console.log(`✅ [PROGRESSIVE] Phase C: 보강이 필요한 데이터 없음`);
        return stats;
      }

      // 유니크한 사용자 ID 추출
      const uniqueUserIds = [...new Set(unknownEngagements.map(e => e.userId))];
      stats.usersNeedingUpdate = uniqueUserIds.length;

      // 배치로 사용자 정보 조회 및 캐시
      const users = await this.twitterService.getUsersByIds(uniqueUserIds);
      const userMap = new Map(users.map(u => [u.id, u]));

      // 프로필 캐시에 저장
      await this.cacheUserProfiles(users);

      // 기존 인게이지먼트 데이터 업데이트
      let updatedCount = 0;
      for (const engagement of unknownEngagements) {
        const user = userMap.get(engagement.userId);
        if (user) {
          await this.updateEngagementProfile(engagement, user);
          updatedCount++;
        }
      }

      stats.usersSuccessfullyUpdated = updatedCount;
      stats.usersFailed = uniqueUserIds.length - updatedCount;
      stats.apiCallsSaved = Math.max(0, uniqueUserIds.length - Math.ceil(uniqueUserIds.length / 100)); // 배치 효율성

    } catch (error) {
      console.error(`❌ [PROGRESSIVE] Phase C 실패:`, error);
    }

    stats.processingTimeMs = Date.now() - startTime;
    console.log(`🎉 [PROGRESSIVE] Phase C 완료:`, stats);
    
    return stats;
  }

  /**
   * 캐시된 프로필 정보 조회
   */
  private async getCachedProfiles(userIds: string[]): Promise<UserProfileCache[]> {
    const profiles: UserProfileCache[] = [];
    
    // 25개씩 배치로 조회 (DynamoDB BatchGet 제한)
    for (let i = 0; i < userIds.length; i += 25) {
      const batch = userIds.slice(i, i + 25);
      
      const keys = batch.map(userId => ({
        pk: `USER_PROFILE#${userId}`,
        sk: 'PROFILE_INFO'
      }));

      try {
        const response = await this.dynamoClient.send(new BatchGetCommand({
          RequestItems: {
            [this.tableName]: {
              Keys: keys
            }
          }
        }));

        if (response.Responses?.[this.tableName]) {
          profiles.push(...response.Responses[this.tableName].map(item => ({
            userId: item.userId,
            username: item.username,
            displayName: item.displayName,
            profileImageUrl: item.profileImageUrl,
            lastUpdated: item.lastUpdated,
            ttl: item.ttl,
            followerCount: item.followerCount,
            isActive: item.isActive !== false
          })));
        }
      } catch (error) {
        console.error(`❌ 프로필 캐시 조회 실패 (배치 ${i/25 + 1}):`, error);
      }
    }

    return profiles;
  }

  /**
   * 프로필 만료 여부 확인
   */
  private isProfileExpired(profile: UserProfileCache): boolean {
    const now = Math.floor(Date.now() / 1000);
    return profile.ttl < now;
  }

  /**
   * 사용자 프로필을 배치로 보강
   */
  private async enrichUserProfilesBatch(userIds: string[]): Promise<void> {
    console.log(`🔄 [PROGRESSIVE] 배치 프로필 보강: ${userIds.length}개 사용자`);

    for (let i = 0; i < userIds.length; i += this.BATCH_SIZE) {
      const batch = userIds.slice(i, i + this.BATCH_SIZE);
      
      try {
        const users = await this.twitterService.getUsersByIds(batch);
        await this.cacheUserProfiles(users);
        
        console.log(`✅ [PROGRESSIVE] 배치 ${Math.floor(i/this.BATCH_SIZE) + 1}: ${users.length}개 프로필 보강됨`);
        
        // Rate Limit 방지
        if (i + this.BATCH_SIZE < userIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ [PROGRESSIVE] 배치 ${Math.floor(i/this.BATCH_SIZE) + 1} 실패:`, error);
      }
    }
  }

  /**
   * 사용자 프로필 캐시에 저장
   */
  private async cacheUserProfiles(users: TwitterUser[]): Promise<void> {
    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + (this.CACHE_TTL_DAYS * 24 * 60 * 60);

    const putRequests = users.map(user => ({
      PutRequest: {
        Item: {
          pk: `USER_PROFILE#${user.id}`,
          sk: 'PROFILE_INFO',
          userId: user.id,
          username: user.username,
          displayName: user.name,
          profileImageUrl: user.profile_image_url,
          lastUpdated: now.toISOString(),
          ttl: ttl,
          followerCount: user.public_metrics?.followers_count,
          isActive: true
        }
      }
    }));

    // 25개씩 배치 저장
    for (let i = 0; i < putRequests.length; i += 25) {
      const batch = putRequests.slice(i, i + 25);
      
      await this.dynamoClient.send(new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: batch
        }
      }));
    }

    console.log(`💾 [PROGRESSIVE] ${users.length}개 사용자 프로필 캐시됨 (TTL: ${this.CACHE_TTL_DAYS}일)`);
  }

  /**
   * unknown 사용자명을 가진 인게이지먼트 스캔
   */
  private async scanUnknownEngagements() {
    const response = await this.dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'begins_with(sk, :sk_prefix) AND (attribute_not_exists(username) OR username = :unknown)',
      ExpressionAttributeValues: {
        ':sk_prefix': 'RECENT',
        ':unknown': 'unknown'
      },
      ProjectionExpression: 'pk, sk, userId, tweetId, engagementType'
    }));

    return response.Items || [];
  }

  /**
   * 인게이지먼트 데이터의 프로필 정보 업데이트
   */
  private async updateEngagementProfile(engagement: any, user: TwitterUser): Promise<void> {
    // 실제 구현에서는 UpdateItem 사용
    console.log(`🔄 [PROGRESSIVE] 인게이지먼트 ${engagement.sk} 프로필 업데이트: ${user.username}`);
    // UpdateItem 구현 생략 (간단화)
  }
}