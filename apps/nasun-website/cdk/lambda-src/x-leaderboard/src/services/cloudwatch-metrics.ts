/**
 * Phase 8: 북마크 수집 및 시스템 모니터링을 위한 CloudWatch 메트릭 서비스
 * 보안 강화 - API 호출 감사, 성능 모니터링, 알림 시스템
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';

export interface BookmarkCollectionMetrics {
  // 수집 성공/실패
  bookmarkCollectionSuccess: number;
  bookmarkCollectionFailure: number;
  bookmarkCollectionLatency: number;
  bookmarkDataPoints: number;
  
  // Rate Limit 모니터링  
  bookmarkRateLimitHits: number;
  bookmarkRateLimitRemaining: number;
  
  // OAuth 토큰 상태
  oauth2TokenExpiration: number;
  oauth2TokenRefreshSuccess: number;
  oauth2TokenRefreshFailure: number;
  
  // 데이터 품질
  bookmarkDataQualityScore: number;
  bookmarkDuplicateCount: number;
}

export interface MentionCounterMetrics {
  // 멘션 처리 성공/실패
  mentionProcessingSuccess: number;
  mentionProcessingFailure: number;
  mentionProcessingLatency: number;
  
  // 제한 관련
  mentionDailyLimitReached: number;
  mentionCooldownViolations: number;
  mentionContentQualityFailures: number;
  
  // 점수 관련
  mentionScoreCalculated: number;
  mentionQualityScore: number;
  mentionCooldownBonus: number;
  
  // 패턴 분석
  mentionSpamDetected: number;
  mentionValidTargetFound: number;
  mentionContentLength: number;
}

// 🔧 Phase 2.2.1: 프로필 정보 품질 모니터링 메트릭
export interface ProfileQualityMetrics {
  // 프로필 완성도
  profileCompletionRate: number;        // 전체 프로필 완성도 (%)
  profileImageCompletionRate: number;   // 프로필 이미지 완성도 (%)
  usernameCompletionRate: number;       // 유효한 사용자명 완성도 (%)
  displayNameCompletionRate: number;    // 유효한 표시명 완성도 (%)
  followersCountCompletionRate: number; // 팔로워 수 완성도 (%)
  
  // 프로필 품질 점수 분포
  highQualityProfiles: number;          // 80점 이상 고품질 프로필 수
  mediumQualityProfiles: number;        // 50-79점 중간품질 프로필 수  
  lowQualityProfiles: number;           // 50점 미만 저품질 프로필 수
  averageProfileQualityScore: number;   // 평균 프로필 품질 점수
  
  // 데이터 손실 추적
  profileDataLossEvents: number;        // 프로필 데이터 손실 이벤트 수
  nullValueDetectedCount: number;       // null 값 감지 횟수
  invalidValueDetectedCount: number;    // 무효 값 감지 횟수
  profileRecoveryAttempts: number;      // 프로필 복구 시도 횟수
  profileRecoverySuccess: number;       // 프로필 복구 성공 횟수
  
  // API 데이터 품질
  apiNullResponseCount: number;         // API에서 null 응답 수신 횟수
  apiValidResponseCount: number;        // API에서 유효 데이터 수신 횟수
  cacheHitRate: number;                 // 캐시 적중률 (%)
  profileMergeOperations: number;       // 프로필 병합 작업 수
}

export interface SystemPerformanceMetrics {
  // Lambda 성능
  lambdaDuration: number;
  lambdaMemoryUsage: number;
  lambdaColdStart: number;
  
  // DynamoDB 성능
  dynamodbReadLatency: number;
  dynamodbWriteLatency: number;
  dynamodbThrottles: number;
  
  // API 호출 패턴
  apiCallFrequency: number;
  apiErrorRate: number;
  
  // 시스템 건강성
  systemHealthScore: number;
}

export interface SecurityAuditMetrics {
  // 토큰 보안
  tokenAccessAttempts: number;
  tokenValidationFailures: number;
  suspiciousApiUsage: number;
  
  // 접근 제어
  unauthorizedAccess: number;
  failedAuthentication: number;
  
  // 데이터 보호
  dataEncryptionStatus: number;
  secretsManagerAccess: number;
}

export class CloudWatchMetricsService {
  private client: CloudWatchClient;
  private namespace: string;
  private defaultDimensions: { Name: string; Value: string }[];

  /**
   * 🔧 CloudWatch Dimension Value를 ASCII 안전 문자열로 변환
   * 비-ASCII 문자를 URL 인코딩하여 CloudWatch API 호환성 확보
   */
  private sanitizeDimensionValue(value: string): string {
    try {
      // 비-ASCII 문자를 URL 인코딩으로 변환
      return encodeURIComponent(value)
        .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`) // 추가 특수문자 인코딩
        .substring(0, 255); // CloudWatch Dimension Value 최대 길이 제한
    } catch (error) {
      console.warn(`⚠️ [CLOUDWATCH] Dimension 값 인코딩 실패: ${value}`, error);
      return 'encoding_failed'; // fallback
    }
  }

  constructor(region: string = 'ap-northeast-2', namespace: string = 'NASUN/BookmarkSystem') {
    this.client = new CloudWatchClient({ region });
    this.namespace = namespace;
    this.defaultDimensions = [
      { Name: 'System', Value: 'NASUN-Leaderboard-V2' },
      { Name: 'Environment', Value: process.env.NODE_ENV || 'production' }
    ];
  }

  /**
   * 북마크 수집 메트릭 전송
   */
  async putBookmarkCollectionMetrics(metrics: Partial<BookmarkCollectionMetrics>, additionalDimensions?: { Name: string; Value: string }[]): Promise<void> {
    const dimensions = [...this.defaultDimensions];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }

    const metricData: MetricDatum[] = [];

    // 수집 성공/실패 메트릭
    if (metrics.bookmarkCollectionSuccess !== undefined) {
      metricData.push({
        MetricName: 'BookmarkCollectionSuccess',
        Value: metrics.bookmarkCollectionSuccess,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    if (metrics.bookmarkCollectionFailure !== undefined) {
      metricData.push({
        MetricName: 'BookmarkCollectionFailure', 
        Value: metrics.bookmarkCollectionFailure,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    // 지연시간 메트릭
    if (metrics.bookmarkCollectionLatency !== undefined) {
      metricData.push({
        MetricName: 'BookmarkCollectionLatency',
        Value: metrics.bookmarkCollectionLatency,
        Unit: 'Milliseconds',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    // 데이터 포인트 메트릭
    if (metrics.bookmarkDataPoints !== undefined) {
      metricData.push({
        MetricName: 'BookmarkDataPoints',
        Value: metrics.bookmarkDataPoints,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    // Rate Limit 메트릭
    if (metrics.bookmarkRateLimitHits !== undefined) {
      metricData.push({
        MetricName: 'BookmarkRateLimitHits',
        Value: metrics.bookmarkRateLimitHits,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    if (metrics.bookmarkRateLimitRemaining !== undefined) {
      metricData.push({
        MetricName: 'BookmarkRateLimitRemaining',
        Value: metrics.bookmarkRateLimitRemaining,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    // OAuth 토큰 메트릭
    if (metrics.oauth2TokenExpiration !== undefined) {
      metricData.push({
        MetricName: 'OAuth2TokenExpiration',
        Value: metrics.oauth2TokenExpiration,
        Unit: 'Seconds',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    if (metrics.oauth2TokenRefreshSuccess !== undefined) {
      metricData.push({
        MetricName: 'OAuth2TokenRefreshSuccess',
        Value: metrics.oauth2TokenRefreshSuccess,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    if (metrics.oauth2TokenRefreshFailure !== undefined) {
      metricData.push({
        MetricName: 'OAuth2TokenRefreshFailure',
        Value: metrics.oauth2TokenRefreshFailure,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    // 데이터 품질 메트릭
    if (metrics.bookmarkDataQualityScore !== undefined) {
      metricData.push({
        MetricName: 'BookmarkDataQualityScore',
        Value: metrics.bookmarkDataQualityScore,
        Unit: 'Percent',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    if (metrics.bookmarkDuplicateCount !== undefined) {
      metricData.push({
        MetricName: 'BookmarkDuplicateCount',
        Value: metrics.bookmarkDuplicateCount,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      });
    }

    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }

  /**
   * 시스템 성능 메트릭 전송
   */
  async putSystemPerformanceMetrics(metrics: Partial<SystemPerformanceMetrics>, additionalDimensions?: { Name: string; Value: string }[]): Promise<void> {
    const dimensions = [...this.defaultDimensions];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }

    const metricData: MetricDatum[] = [];

    // Lambda 성능 메트릭
    if (metrics.lambdaDuration !== undefined) {
      metricData.push({
        MetricName: 'LambdaDuration',
        Value: metrics.lambdaDuration,
        Unit: 'Milliseconds',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'Performance' }],
        Timestamp: new Date()
      });
    }

    if (metrics.lambdaMemoryUsage !== undefined) {
      metricData.push({
        MetricName: 'LambdaMemoryUsage',
        Value: metrics.lambdaMemoryUsage,
        Unit: 'Megabytes',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'Performance' }],
        Timestamp: new Date()
      });
    }

    if (metrics.lambdaColdStart !== undefined) {
      metricData.push({
        MetricName: 'LambdaColdStart',
        Value: metrics.lambdaColdStart,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'Performance' }],
        Timestamp: new Date()
      });
    }

    // DynamoDB 성능 메트릭
    if (metrics.dynamodbReadLatency !== undefined) {
      metricData.push({
        MetricName: 'DynamoDBReadLatency',
        Value: metrics.dynamodbReadLatency,
        Unit: 'Milliseconds',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'Database' }],
        Timestamp: new Date()
      });
    }

    if (metrics.dynamodbWriteLatency !== undefined) {
      metricData.push({
        MetricName: 'DynamoDBWriteLatency',
        Value: metrics.dynamodbWriteLatency,
        Unit: 'Milliseconds',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'Database' }],
        Timestamp: new Date()
      });
    }

    if (metrics.dynamodbThrottles !== undefined) {
      metricData.push({
        MetricName: 'DynamoDBThrottles',
        Value: metrics.dynamodbThrottles,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'Database' }],
        Timestamp: new Date()
      });
    }

    // API 패턴 메트릭
    if (metrics.apiCallFrequency !== undefined) {
      metricData.push({
        MetricName: 'APICallFrequency',
        Value: metrics.apiCallFrequency,
        Unit: 'Count/Second',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'API' }],
        Timestamp: new Date()
      });
    }

    if (metrics.apiErrorRate !== undefined) {
      metricData.push({
        MetricName: 'APIErrorRate',
        Value: metrics.apiErrorRate,
        Unit: 'Percent',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'API' }],
        Timestamp: new Date()
      });
    }

    // 시스템 건강성 메트릭
    if (metrics.systemHealthScore !== undefined) {
      metricData.push({
        MetricName: 'SystemHealthScore',
        Value: metrics.systemHealthScore,
        Unit: 'Percent',
        Dimensions: [...dimensions, { Name: 'MetricType', Value: 'Health' }],
        Timestamp: new Date()
      });
    }

    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }

  /**
   * 🔧 Phase 2.2.1: 프로필 정보 품질 모니터링 메트릭 전송
   */
  async putProfileQualityMetrics(metrics: Partial<ProfileQualityMetrics>, additionalDimensions?: { Name: string; Value: string }[]): Promise<void> {
    const dimensions = [...this.defaultDimensions, { Name: 'MetricType', Value: 'ProfileQuality' }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }

    const metricData: MetricDatum[] = [];

    // 프로필 완성도 메트릭
    if (metrics.profileCompletionRate !== undefined) {
      metricData.push({
        MetricName: 'ProfileCompletionRate',
        Value: metrics.profileCompletionRate,
        Unit: 'Percent',
        Dimensions: [...dimensions, { Name: 'QualityCategory', Value: 'Completion' }],
        Timestamp: new Date()
      });
    }

    if (metrics.profileImageCompletionRate !== undefined) {
      metricData.push({
        MetricName: 'ProfileImageCompletionRate',
        Value: metrics.profileImageCompletionRate,
        Unit: 'Percent',
        Dimensions: [...dimensions, { Name: 'QualityCategory', Value: 'ProfileImage' }],
        Timestamp: new Date()
      });
    }

    if (metrics.usernameCompletionRate !== undefined) {
      metricData.push({
        MetricName: 'UsernameCompletionRate',
        Value: metrics.usernameCompletionRate,
        Unit: 'Percent',
        Dimensions: [...dimensions, { Name: 'QualityCategory', Value: 'Username' }],
        Timestamp: new Date()
      });
    }

    if (metrics.displayNameCompletionRate !== undefined) {
      metricData.push({
        MetricName: 'DisplayNameCompletionRate',
        Value: metrics.displayNameCompletionRate,
        Unit: 'Percent',
        Dimensions: [...dimensions, { Name: 'QualityCategory', Value: 'DisplayName' }],
        Timestamp: new Date()
      });
    }

    if (metrics.followersCountCompletionRate !== undefined) {
      metricData.push({
        MetricName: 'FollowersCountCompletionRate',
        Value: metrics.followersCountCompletionRate,
        Unit: 'Percent',
        Dimensions: [...dimensions, { Name: 'QualityCategory', Value: 'FollowersCount' }],
        Timestamp: new Date()
      });
    }

    // 프로필 품질 점수 분포 메트릭
    if (metrics.highQualityProfiles !== undefined) {
      metricData.push({
        MetricName: 'HighQualityProfiles',
        Value: metrics.highQualityProfiles,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'QualityTier', Value: 'High' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mediumQualityProfiles !== undefined) {
      metricData.push({
        MetricName: 'MediumQualityProfiles',
        Value: metrics.mediumQualityProfiles,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'QualityTier', Value: 'Medium' }],
        Timestamp: new Date()
      });
    }

    if (metrics.lowQualityProfiles !== undefined) {
      metricData.push({
        MetricName: 'LowQualityProfiles',
        Value: metrics.lowQualityProfiles,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'QualityTier', Value: 'Low' }],
        Timestamp: new Date()
      });
    }

    if (metrics.averageProfileQualityScore !== undefined) {
      metricData.push({
        MetricName: 'AverageProfileQualityScore',
        Value: metrics.averageProfileQualityScore,
        Unit: 'None',
        Dimensions: [...dimensions, { Name: 'QualityCategory', Value: 'Average' }],
        Timestamp: new Date()
      });
    }

    // 데이터 손실 추적 메트릭
    if (metrics.profileDataLossEvents !== undefined) {
      metricData.push({
        MetricName: 'ProfileDataLossEvents',
        Value: metrics.profileDataLossEvents,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'DataLossCategory', Value: 'Events' }],
        Timestamp: new Date()
      });
    }

    if (metrics.nullValueDetectedCount !== undefined) {
      metricData.push({
        MetricName: 'NullValueDetectedCount',
        Value: metrics.nullValueDetectedCount,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'DataLossCategory', Value: 'NullValues' }],
        Timestamp: new Date()
      });
    }

    if (metrics.invalidValueDetectedCount !== undefined) {
      metricData.push({
        MetricName: 'InvalidValueDetectedCount',
        Value: metrics.invalidValueDetectedCount,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'DataLossCategory', Value: 'InvalidValues' }],
        Timestamp: new Date()
      });
    }

    if (metrics.profileRecoveryAttempts !== undefined) {
      metricData.push({
        MetricName: 'ProfileRecoveryAttempts',
        Value: metrics.profileRecoveryAttempts,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'RecoveryCategory', Value: 'Attempts' }],
        Timestamp: new Date()
      });
    }

    if (metrics.profileRecoverySuccess !== undefined) {
      metricData.push({
        MetricName: 'ProfileRecoverySuccess',
        Value: metrics.profileRecoverySuccess,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'RecoveryCategory', Value: 'Success' }],
        Timestamp: new Date()
      });
    }

    // API 데이터 품질 메트릭
    if (metrics.apiNullResponseCount !== undefined) {
      metricData.push({
        MetricName: 'APINullResponseCount',
        Value: metrics.apiNullResponseCount,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'APIQualityCategory', Value: 'NullResponse' }],
        Timestamp: new Date()
      });
    }

    if (metrics.apiValidResponseCount !== undefined) {
      metricData.push({
        MetricName: 'APIValidResponseCount',
        Value: metrics.apiValidResponseCount,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'APIQualityCategory', Value: 'ValidResponse' }],
        Timestamp: new Date()
      });
    }

    if (metrics.cacheHitRate !== undefined) {
      metricData.push({
        MetricName: 'ProfileCacheHitRate',
        Value: metrics.cacheHitRate,
        Unit: 'Percent',
        Dimensions: [...dimensions, { Name: 'CacheCategory', Value: 'HitRate' }],
        Timestamp: new Date()
      });
    }

    if (metrics.profileMergeOperations !== undefined) {
      metricData.push({
        MetricName: 'ProfileMergeOperations',
        Value: metrics.profileMergeOperations,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'OperationCategory', Value: 'ProfileMerge' }],
        Timestamp: new Date()
      });
    }

    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }

  /**
   * 보안 감사 메트릭 전송
   */
  async putSecurityAuditMetrics(metrics: Partial<SecurityAuditMetrics>, additionalDimensions?: { Name: string; Value: string }[]): Promise<void> {
    const dimensions = [...this.defaultDimensions, { Name: 'MetricType', Value: 'Security' }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }

    const metricData: MetricDatum[] = [];

    // 토큰 보안 메트릭
    if (metrics.tokenAccessAttempts !== undefined) {
      metricData.push({
        MetricName: 'TokenAccessAttempts',
        Value: metrics.tokenAccessAttempts,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'SecurityCategory', Value: 'TokenSecurity' }],
        Timestamp: new Date()
      });
    }

    if (metrics.tokenValidationFailures !== undefined) {
      metricData.push({
        MetricName: 'TokenValidationFailures',
        Value: metrics.tokenValidationFailures,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'SecurityCategory', Value: 'TokenSecurity' }],
        Timestamp: new Date()
      });
    }

    if (metrics.suspiciousApiUsage !== undefined) {
      metricData.push({
        MetricName: 'SuspiciousAPIUsage',
        Value: metrics.suspiciousApiUsage,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'SecurityCategory', Value: 'APIUsage' }],
        Timestamp: new Date()
      });
    }

    // 접근 제어 메트릭
    if (metrics.unauthorizedAccess !== undefined) {
      metricData.push({
        MetricName: 'UnauthorizedAccess',
        Value: metrics.unauthorizedAccess,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'SecurityCategory', Value: 'AccessControl' }],
        Timestamp: new Date()
      });
    }

    if (metrics.failedAuthentication !== undefined) {
      metricData.push({
        MetricName: 'FailedAuthentication',
        Value: metrics.failedAuthentication,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'SecurityCategory', Value: 'AccessControl' }],
        Timestamp: new Date()
      });
    }

    // 데이터 보호 메트릭
    if (metrics.dataEncryptionStatus !== undefined) {
      metricData.push({
        MetricName: 'DataEncryptionStatus',
        Value: metrics.dataEncryptionStatus,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'SecurityCategory', Value: 'DataProtection' }],
        Timestamp: new Date()
      });
    }

    if (metrics.secretsManagerAccess !== undefined) {
      metricData.push({
        MetricName: 'SecretsManagerAccess',
        Value: metrics.secretsManagerAccess,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'SecurityCategory', Value: 'DataProtection' }],
        Timestamp: new Date()
      });
    }

    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }

  /**
   * 멘션 카운터 메트릭 전송
   */
  async putMentionCounterMetrics(metrics: Partial<MentionCounterMetrics>, additionalDimensions?: { Name: string; Value: string }[]): Promise<void> {
    const dimensions = [...this.defaultDimensions, { Name: 'MetricType', Value: 'MentionCounter' }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }

    const metricData: MetricDatum[] = [];

    // 멘션 처리 성공/실패 메트릭
    if (metrics.mentionProcessingSuccess !== undefined) {
      metricData.push({
        MetricName: 'MentionProcessingSuccess',
        Value: metrics.mentionProcessingSuccess,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'ProcessingCategory', Value: 'Success' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mentionProcessingFailure !== undefined) {
      metricData.push({
        MetricName: 'MentionProcessingFailure',
        Value: metrics.mentionProcessingFailure,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'ProcessingCategory', Value: 'Failure' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mentionProcessingLatency !== undefined) {
      metricData.push({
        MetricName: 'MentionProcessingLatency',
        Value: metrics.mentionProcessingLatency,
        Unit: 'Milliseconds',
        Dimensions: [...dimensions, { Name: 'ProcessingCategory', Value: 'Performance' }],
        Timestamp: new Date()
      });
    }

    // 제한 관련 메트릭
    if (metrics.mentionDailyLimitReached !== undefined) {
      metricData.push({
        MetricName: 'MentionDailyLimitReached',
        Value: metrics.mentionDailyLimitReached,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'LimitCategory', Value: 'DailyLimit' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mentionCooldownViolations !== undefined) {
      metricData.push({
        MetricName: 'MentionCooldownViolations',
        Value: metrics.mentionCooldownViolations,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'LimitCategory', Value: 'Cooldown' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mentionContentQualityFailures !== undefined) {
      metricData.push({
        MetricName: 'MentionContentQualityFailures',
        Value: metrics.mentionContentQualityFailures,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'QualityCategory', Value: 'ContentFilter' }],
        Timestamp: new Date()
      });
    }

    // 점수 관련 메트릭
    if (metrics.mentionScoreCalculated !== undefined) {
      metricData.push({
        MetricName: 'MentionScoreCalculated',
        Value: metrics.mentionScoreCalculated,
        Unit: 'None',
        Dimensions: [...dimensions, { Name: 'ScoreCategory', Value: 'Final' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mentionQualityScore !== undefined) {
      metricData.push({
        MetricName: 'MentionQualityScore',
        Value: metrics.mentionQualityScore,
        Unit: 'None',
        Dimensions: [...dimensions, { Name: 'ScoreCategory', Value: 'Quality' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mentionCooldownBonus !== undefined) {
      metricData.push({
        MetricName: 'MentionCooldownBonus',
        Value: metrics.mentionCooldownBonus,
        Unit: 'None',
        Dimensions: [...dimensions, { Name: 'ScoreCategory', Value: 'Bonus' }],
        Timestamp: new Date()
      });
    }

    // 패턴 분석 메트릭
    if (metrics.mentionSpamDetected !== undefined) {
      metricData.push({
        MetricName: 'MentionSpamDetected',
        Value: metrics.mentionSpamDetected,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'PatternCategory', Value: 'Spam' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mentionValidTargetFound !== undefined) {
      metricData.push({
        MetricName: 'MentionValidTargetFound',
        Value: metrics.mentionValidTargetFound,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'PatternCategory', Value: 'TargetMention' }],
        Timestamp: new Date()
      });
    }

    if (metrics.mentionContentLength !== undefined) {
      metricData.push({
        MetricName: 'MentionContentLength',
        Value: metrics.mentionContentLength,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'PatternCategory', Value: 'ContentLength' }],
        Timestamp: new Date()
      });
    }

    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }

  /**
   * 복합 메트릭 전송 (사용량 분석)
   */
  async putUsageAnalyticsMetrics(
    totalBookmarks: number,
    uniqueUsers: number, 
    avgBookmarksPerUser: number,
    bookmarkTrends: number[],
    timeRange: string
  ): Promise<void> {
    const dimensions = [
      ...this.defaultDimensions,
      { Name: 'MetricType', Value: 'Analytics' },
      { Name: 'TimeRange', Value: timeRange }
    ];

    const metricData: MetricDatum[] = [
      {
        MetricName: 'TotalBookmarks',
        Value: totalBookmarks,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      },
      {
        MetricName: 'UniqueBookmarkUsers',
        Value: uniqueUsers,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      },
      {
        MetricName: 'AvgBookmarksPerUser',
        Value: avgBookmarksPerUser,
        Unit: 'Count',
        Dimensions: dimensions,
        Timestamp: new Date()
      }
    ];

    // 트렌드 분석 (지난 7일간 평균)
    if (bookmarkTrends.length > 0) {
      const trendAverage = bookmarkTrends.reduce((sum, val) => sum + val, 0) / bookmarkTrends.length;
      metricData.push({
        MetricName: 'BookmarkTrendAverage',
        Value: trendAverage,
        Unit: 'Count',
        Dimensions: [...dimensions, { Name: 'AnalysisType', Value: 'Trend' }],
        Timestamp: new Date()
      });
    }

    await this.sendMetrics(metricData);
  }

  /**
   * 메트릭 데이터를 CloudWatch로 전송
   */
  private async sendMetrics(metricData: MetricDatum[]): Promise<void> {
    try {
      // CloudWatch는 한 번에 최대 20개의 메트릭만 받을 수 있음
      const batchSize = 20;
      
      for (let i = 0; i < metricData.length; i += batchSize) {
        const batch = metricData.slice(i, i + batchSize);
        
        const command = new PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: batch
        });

        await this.client.send(command);
        
        console.log(`📊 [METRICS] CloudWatch 메트릭 전송 완료: ${batch.length}개 (배치 ${Math.floor(i / batchSize) + 1})`);
        
        // 배치 간 잠시 대기 (Rate Limit 방지)
        if (i + batchSize < metricData.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error(`❌ [METRICS] CloudWatch 메트릭 전송 실패:`, error);
      throw error;
    }
  }

  /**
   * 간단한 메트릭 전송 함수
   */
  async putMetric(namespace: string, metricName: string, value: number, unit: string = 'Count'): Promise<void> {
    const metricData: MetricDatum[] = [{
      MetricName: metricName,
      Value: value,
      Unit: unit as any,
      Timestamp: new Date(),
      Dimensions: this.defaultDimensions
    }];

    const command = new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: metricData
    });

    try {
      await this.client.send(command);
      console.log(`📊 [METRICS] 메트릭 전송 완료: ${metricName} = ${value}`);
    } catch (error) {
      console.error(`❌ [METRICS] 메트릭 전송 실패: ${metricName}`, error);
      throw error;
    }
  }

  /**
   * 🔧 Phase 2.2.1: 편의 함수 - 프로필 데이터 손실 이벤트 기록
   */
  async recordProfileDataLossEvent(lossType: string, userId?: string): Promise<void> {
    const additionalDimensions: { Name: string; Value: string }[] = [
      { Name: 'DataLossType', Value: lossType }
    ];
    if (userId) {
      additionalDimensions.push({ Name: 'UserId', Value: userId });
    }

    await this.putProfileQualityMetrics({
      profileDataLossEvents: 1,
      nullValueDetectedCount: lossType === 'null' ? 1 : 0,
      invalidValueDetectedCount: lossType === 'invalid' ? 1 : 0
    }, additionalDimensions);
  }

  /**
   * 편의 함수: 프로필 복구 시도 기록
   */
  async recordProfileRecoveryAttempt(recoveryType: string, success: boolean): Promise<void> {
    await this.putProfileQualityMetrics({
      profileRecoveryAttempts: 1,
      profileRecoverySuccess: success ? 1 : 0
    }, [{ Name: 'RecoveryType', Value: recoveryType }]);
  }

  /**
   * 편의 함수: API 응답 품질 기록
   */
  async recordAPIResponseQuality(isValidResponse: boolean, responseType: string): Promise<void> {
    await this.putProfileQualityMetrics({
      apiValidResponseCount: isValidResponse ? 1 : 0,
      apiNullResponseCount: isValidResponse ? 0 : 1
    }, [{ Name: 'ResponseType', Value: responseType }]);
  }

  /**
   * 편의 함수: 프로필 완성도 집계 기록
   */
  async recordProfileCompletionRates(options: {
    totalUsers: number;
    usersWithValidProfiles: number;
    usersWithValidImages: number;
    usersWithValidUsernames: number;
    usersWithValidDisplayNames: number;
    usersWithValidFollowersCounts: number;
    averageQualityScore: number;
    highQualityCount: number;
    mediumQualityCount: number;
    lowQualityCount: number;
  }): Promise<void> {
    const profileCompletionRate = options.totalUsers > 0 
      ? (options.usersWithValidProfiles / options.totalUsers) * 100 : 0;
    
    const profileImageCompletionRate = options.totalUsers > 0
      ? (options.usersWithValidImages / options.totalUsers) * 100 : 0;
    
    const usernameCompletionRate = options.totalUsers > 0
      ? (options.usersWithValidUsernames / options.totalUsers) * 100 : 0;
    
    const displayNameCompletionRate = options.totalUsers > 0
      ? (options.usersWithValidDisplayNames / options.totalUsers) * 100 : 0;
    
    const followersCountCompletionRate = options.totalUsers > 0
      ? (options.usersWithValidFollowersCounts / options.totalUsers) * 100 : 0;

    await this.putProfileQualityMetrics({
      profileCompletionRate,
      profileImageCompletionRate,
      usernameCompletionRate,
      displayNameCompletionRate,
      followersCountCompletionRate,
      averageProfileQualityScore: options.averageQualityScore,
      highQualityProfiles: options.highQualityCount,
      mediumQualityProfiles: options.mediumQualityCount,
      lowQualityProfiles: options.lowQualityCount
    });
  }

  /**
   * 편의 함수: 캐시 적중률 및 프로필 병합 작업 기록
   */
  async recordCacheAndMergeOperations(cacheHitRate: number, mergeOperationsCount: number): Promise<void> {
    await this.putProfileQualityMetrics({
      cacheHitRate,
      profileMergeOperations: mergeOperationsCount
    });
  }

  /**
   * 편의 함수: 북마크 수집 성공 메트릭
   */
  async recordBookmarkCollectionSuccess(count: number, latency: number): Promise<void> {
    await this.putBookmarkCollectionMetrics({
      bookmarkCollectionSuccess: 1,
      bookmarkDataPoints: count,
      bookmarkCollectionLatency: latency
    });
  }

  /**
   * 편의 함수: 북마크 수집 실패 메트릭
   */
  async recordBookmarkCollectionFailure(errorType: string): Promise<void> {
    await this.putBookmarkCollectionMetrics({
      bookmarkCollectionFailure: 1
    }, [{ Name: 'ErrorType', Value: errorType }]);
  }

  /**
   * 편의 함수: OAuth 토큰 갱신 성공
   */
  async recordOAuth2TokenRefreshSuccess(): Promise<void> {
    await this.putBookmarkCollectionMetrics({
      oauth2TokenRefreshSuccess: 1
    });
  }

  /**
   * 편의 함수: OAuth 토큰 갱신 실패
   */
  async recordOAuth2TokenRefreshFailure(errorReason: string): Promise<void> {
    await this.putBookmarkCollectionMetrics({
      oauth2TokenRefreshFailure: 1
    }, [{ Name: 'ErrorReason', Value: errorReason }]);
  }

  /**
   * 편의 함수: Rate Limit 히트 기록
   */
  async recordRateLimitHit(remaining: number): Promise<void> {
    await this.putBookmarkCollectionMetrics({
      bookmarkRateLimitHits: 1,
      bookmarkRateLimitRemaining: remaining
    });
  }

  /**
   * 다중 답글 집계 시스템 전용 메트릭
   */
  async putMultiReplyMetrics(options: {
    totalRepliesProcessed: number;
    validReplies: number;
    rejectedReplies: number;
    maxReachedUsers: number;
    averageRepliesPerUser: number;
    processingTime: number;
  }): Promise<void> {
    const metrics: MetricDatum[] = [
      {
        MetricName: 'MultiReply_TotalRepliesProcessed',
        Value: options.totalRepliesProcessed,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MultiReply_ValidReplies',
        Value: options.validReplies,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MultiReply_RejectedReplies',
        Value: options.rejectedReplies,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MultiReply_MaxReachedUsers',
        Value: options.maxReachedUsers,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MultiReply_AverageRepliesPerUser',
        Value: options.averageRepliesPerUser,
        Unit: 'None',
        Timestamp: new Date()
      },
      {
        MetricName: 'MultiReply_ProcessingTime',
        Value: options.processingTime,
        Unit: 'Milliseconds',
        Timestamp: new Date()
      },
      {
        MetricName: 'MultiReply_ApprovalRate',
        Value: options.totalRepliesProcessed > 0 ? (options.validReplies / options.totalRepliesProcessed) * 100 : 0,
        Unit: 'Percent',
        Timestamp: new Date()
      }
    ];

    // 'NASUN/MultiReply' 네임스페이스로 직접 전송
    const command = new PutMetricDataCommand({
      Namespace: 'NASUN/MultiReply',
      MetricData: metrics
    });

    try {
      await this.client.send(command);
      console.log(`📊 [METRICS] 다중 답글 집계 메트릭 전송 완료: ${metrics.length}개`);
    } catch (error) {
      console.error(`❌ [METRICS] 다중 답글 집계 메트릭 전송 실패:`, error);
    }
  }

  /**
   * 편의 함수: 멘션 처리 성공 기록
   */
  async recordMentionProcessingSuccess(score: number, qualityScore: number, cooldownBonus: number, contentLength: number): Promise<void> {
    await this.putMentionCounterMetrics({
      mentionProcessingSuccess: 1,
      mentionScoreCalculated: score,
      mentionQualityScore: qualityScore,
      mentionCooldownBonus: cooldownBonus,
      mentionContentLength: contentLength
    });
  }

  /**
   * 편의 함수: 멘션 일일 제한 도달 기록
   */
  async recordMentionDailyLimitReached(userId: string): Promise<void> {
    await this.putMentionCounterMetrics({
      mentionDailyLimitReached: 1
    }, [{ Name: 'UserId', Value: userId }]);
  }

  /**
   * 편의 함수: 멘션 쿨다운 위반 기록
   */
  async recordMentionCooldownViolation(intervalHours: number): Promise<void> {
    await this.putMentionCounterMetrics({
      mentionCooldownViolations: 1
    }, [{ Name: 'IntervalHours', Value: intervalHours.toString() }]);
  }

  /**
   * 편의 함수: 멘션 콘텐츠 품질 실패 기록
   */
  async recordMentionContentQualityFailure(failureReason: string): Promise<void> {
    await this.putMentionCounterMetrics({
      mentionContentQualityFailures: 1
    }, [{ Name: 'FailureReason', Value: this.sanitizeDimensionValue(failureReason) }]);
  }

  /**
   * 편의 함수: 멘션 스팸 탐지 기록
   */
  async recordMentionSpamDetected(spamType: string): Promise<void> {
    await this.putMentionCounterMetrics({
      mentionSpamDetected: 1
    }, [{ Name: 'SpamType', Value: this.sanitizeDimensionValue(spamType) }]);
  }

  /**
   * 편의 함수: 멘션 처리 실패 기록
   */
  async recordMentionProcessingFailure(errorReason: string): Promise<void> {
    await this.putMentionCounterMetrics({
      mentionProcessingFailure: 1
    }, [{ Name: 'ErrorReason', Value: this.sanitizeDimensionValue(errorReason) }]);
  }

  /**
   * 멘션 카운터 집계 시스템 전용 메트릭
   */
  async putMentionSummaryMetrics(options: {
    totalMentionsProcessed: number;
    validMentions: number;
    rejectedMentions: number;
    dailyLimitReached: number;
    cooldownViolations: number;
    spamDetected: number;
    avgQualityScore: number;
    avgFinalScore: number;
    processingTime: number;
  }): Promise<void> {
    const metrics: MetricDatum[] = [
      {
        MetricName: 'MentionSummary_TotalProcessed',
        Value: options.totalMentionsProcessed,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_ValidMentions',
        Value: options.validMentions,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_RejectedMentions',
        Value: options.rejectedMentions,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_DailyLimitReached',
        Value: options.dailyLimitReached,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_CooldownViolations',
        Value: options.cooldownViolations,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_SpamDetected',
        Value: options.spamDetected,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_AvgQualityScore',
        Value: options.avgQualityScore,
        Unit: 'None',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_AvgFinalScore',
        Value: options.avgFinalScore,
        Unit: 'None',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_ProcessingTime',
        Value: options.processingTime,
        Unit: 'Milliseconds',
        Timestamp: new Date()
      },
      {
        MetricName: 'MentionSummary_ApprovalRate',
        Value: options.totalMentionsProcessed > 0 ? (options.validMentions / options.totalMentionsProcessed) * 100 : 0,
        Unit: 'Percent',
        Timestamp: new Date()
      }
    ];

    // 'NASUN/MentionCounter' 네임스페이스로 직접 전송
    const command = new PutMetricDataCommand({
      Namespace: 'NASUN/MentionCounter',
      MetricData: metrics
    });

    try {
      await this.client.send(command);
      console.log(`📊 [METRICS] 멘션 카운터 집계 메트릭 전송 완료: ${metrics.length}개`);
    } catch (error) {
      console.error(`❌ [METRICS] 멘션 카운터 집계 메트릭 전송 실패:`, error);
    }
  }
}

// 싱글톤 인스턴스
export const cloudWatchMetrics = new CloudWatchMetricsService();