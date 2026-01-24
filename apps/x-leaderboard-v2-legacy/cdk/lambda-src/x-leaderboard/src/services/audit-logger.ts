/**
 * Phase 8: API 접근 로그 및 감사 추적 서비스
 * 보안 강화 - 모든 API 호출, 토큰 접근, 데이터 변경사항 추적
 */

export interface APIAuditLog {
  // 기본 정보
  timestamp: string;
  requestId: string;
  userId?: string;
  username?: string;
  
  // API 호출 정보
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  
  // 요청 데이터 (민감 정보 제외)
  requestSize: number;
  responseSize: number;
  
  // 보안 정보
  authMethod: 'OAuth1.0a' | 'OAuth2.0' | 'BearerToken' | 'None';
  tokenExpiry?: number;
  
  // 컨텍스트 정보
  userAgent?: string;
  sourceIP?: string;
  
  // 에러 정보
  errorCode?: string;
  errorMessage?: string;
  
  // 메타데이터
  system: 'NASUN-Leaderboard-V2';
  version: '1.0';
}

export interface TokenAuditLog {
  // 기본 정보
  timestamp: string;
  requestId: string;
  
  // 토큰 정보
  tokenType: 'OAuth1.0a' | 'OAuth2.0' | 'BearerToken';
  operation: 'ACCESS' | 'REFRESH' | 'VALIDATION' | 'EXPIRY_CHECK';
  success: boolean;
  
  // 보안 정보
  sourceFunction: string;
  accessMethod: 'SecretsManager' | 'Environment' | 'Cache';
  
  // 상태 정보
  tokenValidUntil?: number;
  refreshRequired?: boolean;
  
  // 에러 정보
  errorCode?: string;
  errorMessage?: string;
  
  // 메타데이터
  system: 'NASUN-Leaderboard-V2';
  version: '1.0';
}

export interface DataChangeAuditLog {
  // 기본 정보
  timestamp: string;
  requestId: string;
  
  // 데이터 변경 정보
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_INSERT';
  tableName: string;
  recordCount: number;
  
  // 변경 내용
  changeType: 'EngagementData' | 'UserProfile' | 'LeaderboardEntry' | 'TokenData';
  affectedKeys: string[];
  
  // 데이터 품질
  dataQualityScore?: number;
  duplicateCount?: number;
  validationErrors?: string[];
  
  // 성능 정보
  duration: number;
  throughput: number; // records per second
  
  // 메타데이터
  system: 'NASUN-Leaderboard-V2';
  version: '1.0';
}

export interface SecurityEventLog {
  // 기본 정보
  timestamp: string;
  requestId: string;
  
  // 보안 이벤트 정보
  eventType: 'RATE_LIMIT_HIT' | 'AUTH_FAILURE' | 'TOKEN_EXPIRED' | 'SUSPICIOUS_ACTIVITY' | 'PERMISSION_DENIED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // 상세 정보
  description: string;
  affectedResources: string[];
  
  // 컨텍스트
  sourceFunction?: string;
  relatedUserId?: string;
  
  // 대응 상태
  autoResolved: boolean;
  resolutionAction?: string;
  
  // 메타데이터
  system: 'NASUN-Leaderboard-V2';
  version: '1.0';
}

export class AuditLoggerService {
  private requestId: string;
  private startTime: number;

  constructor(requestId?: string) {
    this.requestId = requestId || this.generateRequestId();
    this.startTime = Date.now();
  }

  /**
   * API 호출 감사 로그
   */
  logAPIAccess(
    endpoint: string,
    method: string,
    statusCode: number,
    requestSize: number,
    responseSize: number,
    authMethod: APIAuditLog['authMethod'],
    options?: {
      userId?: string;
      username?: string;
      tokenExpiry?: number;
      userAgent?: string;
      sourceIP?: string;
      errorCode?: string;
      errorMessage?: string;
    }
  ): void {
    const auditLog: APIAuditLog = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      userId: options?.userId,
      username: options?.username,
      endpoint,
      method,
      statusCode,
      duration: Date.now() - this.startTime,
      requestSize,
      responseSize,
      authMethod,
      tokenExpiry: options?.tokenExpiry,
      userAgent: options?.userAgent,
      sourceIP: options?.sourceIP,
      errorCode: options?.errorCode,
      errorMessage: options?.errorMessage,
      system: 'NASUN-Leaderboard-V2',
      version: '1.0'
    };

    this.writeAuditLog('API_ACCESS', auditLog);
  }

  /**
   * 토큰 접근 감사 로그
   */
  logTokenAccess(
    tokenType: TokenAuditLog['tokenType'],
    operation: TokenAuditLog['operation'],
    success: boolean,
    sourceFunction: string,
    accessMethod: TokenAuditLog['accessMethod'],
    options?: {
      tokenValidUntil?: number;
      refreshRequired?: boolean;
      errorCode?: string;
      errorMessage?: string;
    }
  ): void {
    const auditLog: TokenAuditLog = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      tokenType,
      operation,
      success,
      sourceFunction,
      accessMethod,
      tokenValidUntil: options?.tokenValidUntil,
      refreshRequired: options?.refreshRequired,
      errorCode: options?.errorCode,
      errorMessage: options?.errorMessage,
      system: 'NASUN-Leaderboard-V2',
      version: '1.0'
    };

    this.writeAuditLog('TOKEN_ACCESS', auditLog);
  }

  /**
   * 데이터 변경 감사 로그
   */
  logDataChange(
    operation: DataChangeAuditLog['operation'],
    tableName: string,
    recordCount: number,
    changeType: DataChangeAuditLog['changeType'],
    affectedKeys: string[],
    duration: number,
    options?: {
      dataQualityScore?: number;
      duplicateCount?: number;
      validationErrors?: string[];
    }
  ): void {
    const auditLog: DataChangeAuditLog = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      operation,
      tableName,
      recordCount,
      changeType,
      affectedKeys: affectedKeys.slice(0, 10), // 최대 10개만 로깅
      dataQualityScore: options?.dataQualityScore,
      duplicateCount: options?.duplicateCount,
      validationErrors: options?.validationErrors?.slice(0, 5), // 최대 5개 에러만 로깅
      duration,
      throughput: recordCount / Math.max(1, duration / 1000),
      system: 'NASUN-Leaderboard-V2',
      version: '1.0'
    };

    this.writeAuditLog('DATA_CHANGE', auditLog);
  }

  /**
   * 보안 이벤트 감사 로그
   */
  logSecurityEvent(
    eventType: SecurityEventLog['eventType'],
    severity: SecurityEventLog['severity'],
    description: string,
    affectedResources: string[],
    autoResolved: boolean,
    options?: {
      sourceFunction?: string;
      relatedUserId?: string;
      resolutionAction?: string;
    }
  ): void {
    const auditLog: SecurityEventLog = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      eventType,
      severity,
      description,
      affectedResources,
      sourceFunction: options?.sourceFunction,
      relatedUserId: options?.relatedUserId,
      autoResolved,
      resolutionAction: options?.resolutionAction,
      system: 'NASUN-Leaderboard-V2',
      version: '1.0'
    };

    this.writeAuditLog('SECURITY_EVENT', auditLog);
  }

  /**
   * 다중 답글 카운터 운영 감사 로그
   */
  logReplyCounterOperation(options: {
    operation: 'increment' | 'query' | 'stats';
    targetTweetId: string;
    userId: string;
    sequence?: number;
    currentCount?: number;
    maxReached?: boolean;
    duration: number;
    error?: string;
  }): void {
    const auditLog = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      operation: 'REPLY_COUNTER',
      targetTweetId: options.targetTweetId,
      userId: options.userId,
      sequence: options.sequence,
      currentCount: options.currentCount,
      maxReached: options.maxReached,
      duration: options.duration,
      error: options.error,
      system: 'NASUN-Leaderboard-V2',
      version: '1.0'
    };

    this.writeAuditLog('REPLY_COUNTER', auditLog);
  }

  /**
   * 멘션 카운터 운영 감사 로그
   */
  logMentionCounterOperation(options: {
    operation: 'increment' | 'query' | 'stats';
    userId: string;
    targetDate: string;
    sequence?: number;
    currentCount?: number;
    maxReached?: boolean;
    cooldownViolated?: boolean;
    intervalHours?: number;
    duration: number;
    error?: string;
  }): void {
    const auditLog = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      operation: 'MENTION_COUNTER',
      userId: options.userId,
      targetDate: options.targetDate,
      sequence: options.sequence,
      currentCount: options.currentCount,
      maxReached: options.maxReached,
      cooldownViolated: options.cooldownViolated,
      intervalHours: options.intervalHours,
      duration: options.duration,
      error: options.error,
      system: 'NASUN-Leaderboard-V2',
      version: '1.0'
    };

    this.writeAuditLog('MENTION_COUNTER', auditLog);
  }

  /**
   * 분산 수집 감사 로그
   */
  logDistributedCollection(options: {
    collectorType: string;
    batchId: string;
    orchestrationId: string;
    tweetsProcessed: number;
    engagementsCollected: number;
    errors: number;
    duration: number;
  }): void {
    const auditLog = {
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      operation: 'DISTRIBUTED_COLLECTION',
      collectorType: options.collectorType,
      batchId: options.batchId,
      orchestrationId: options.orchestrationId,
      tweetsProcessed: options.tweetsProcessed,
      engagementsCollected: options.engagementsCollected,
      errors: options.errors,
      duration: options.duration,
      system: 'NASUN-Leaderboard-V2',
      version: '1.0'
    };

    this.writeAuditLog('DISTRIBUTED_COLLECTION', auditLog);
  }

  /**
   * OAuth 2.0 토큰 갱신 감사 로그
   */
  logOAuth2TokenRefresh(success: boolean, error?: string): void {
    this.logTokenAccess(
      'OAuth2.0',
      'REFRESH',
      success,
      'oauth2-token-refresh',
      'SecretsManager',
      {
        refreshRequired: true,
        errorMessage: error
      }
    );
  }

  /**
   * 북마크 수집 특화 감사 로그
   */
  logBookmarkCollectionAudit(
    success: boolean,
    bookmarkCount: number,
    duration: number,
    authMethod: 'OAuth2.0',
    options?: {
      rateLimitRemaining?: number;
      errorType?: string;
      errorMessage?: string;
      userIds?: string[];
    }
  ): void {
    // API 접근 로그
    this.logAPIAccess(
      'https://api.twitter.com/2/users/bookmarks',
      'GET',
      success ? 200 : 429,
      0,
      bookmarkCount * 500, // 예상 응답 크기
      authMethod,
      {
        errorCode: options?.errorType,
        errorMessage: options?.errorMessage
      }
    );

    // 데이터 변경 로그 (성공한 경우만)
    if (success && bookmarkCount > 0) {
      this.logDataChange(
        'BULK_INSERT',
        'nasun-leaderboard-data',
        bookmarkCount,
        'EngagementData',
        options?.userIds || [],
        duration
      );
    }

    // 보안 이벤트 로그 (실패한 경우)
    if (!success) {
      const severity: SecurityEventLog['severity'] = options?.errorType === 'RateLimit' ? 'MEDIUM' : 'HIGH';
      this.logSecurityEvent(
        options?.errorType === 'RateLimit' ? 'RATE_LIMIT_HIT' : 'AUTH_FAILURE',
        severity,
        `북마크 수집 실패: ${options?.errorMessage || '알 수 없는 오류'}`,
        ['Twitter API', 'OAuth2.0 Token'],
        false,
        {
          sourceFunction: 'collectBookmarkEngagements',
          resolutionAction: options?.errorType === 'RateLimit' ? '15분 후 자동 재시도' : '토큰 갱신 필요'
        }
      );
    }
  }

  /**
   * 감사 로그 집계 및 분석
   */
  generateAuditSummary(timeRange: '1h' | '24h' | '7d'): {
    apiCalls: number;
    tokenAccess: number;
    dataChanges: number;
    securityEvents: number;
    errorRate: number;
    topEndpoints: Array<{endpoint: string; count: number}>;
    securitySummary: {
      criticalEvents: number;
      authFailures: number;
      rateLimitHits: number;
    };
  } {
    // 실제 구현에서는 CloudWatch Logs Insights나 DynamoDB에서 데이터를 집계
    console.log(`📊 [AUDIT_SUMMARY] ${timeRange} 감사 로그 집계 요청`);
    
    return {
      apiCalls: 0,
      tokenAccess: 0,
      dataChanges: 0,
      securityEvents: 0,
      errorRate: 0,
      topEndpoints: [],
      securitySummary: {
        criticalEvents: 0,
        authFailures: 0,
        rateLimitHits: 0
      }
    };
  }

  /**
   * 감사 로그 작성 (실제로는 CloudWatch Logs나 전용 감사 테이블로)
   */
  private writeAuditLog(logType: string, logData: any): void {
    const structuredLog = {
      logType,
      ...logData,
      rawTimestamp: Date.now()
    };

    // CloudWatch Logs로 전송 (구조화된 JSON 로그)
    console.log(`🔍 [AUDIT_${logType}]`, JSON.stringify(structuredLog, null, 2));
    
    // 추가적으로 보안이 중요한 로그는 별도 DynamoDB 테이블이나 S3에 저장 가능
    if (['SECURITY_EVENT', 'TOKEN_ACCESS'].includes(logType)) {
      console.log(`🔐 [SECURITY_AUDIT] 중요 보안 이벤트 별도 저장 필요: ${logType}`);
    }
  }

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    return `req_${timestamp}_${randomPart}`;
  }

  /**
   * 편의 함수들
   */

  /**
   * Secrets Manager 접근 감사
   */
  logSecretsManagerAccess(operation: 'GET' | 'PUT', success: boolean, errorMessage?: string): void {
    this.logTokenAccess(
      'OAuth2.0',
      operation === 'GET' ? 'ACCESS' : 'REFRESH',
      success,
      'SecureTokenManager',
      'SecretsManager',
      {
        errorCode: success ? undefined : 'SECRETS_ACCESS_FAILED',
        errorMessage: success ? undefined : errorMessage
      }
    );

    if (!success) {
      this.logSecurityEvent(
        'PERMISSION_DENIED',
        'HIGH',
        `Secrets Manager 접근 실패: ${errorMessage}`,
        ['AWS Secrets Manager', 'IAM Role'],
        false,
        {
          sourceFunction: 'SecureTokenManager',
          resolutionAction: 'IAM 권한 확인 필요'
        }
      );
    }
  }

  // Rate Limit 감사
  logRateLimitEvent(endpoint: string, remaining: number): void {
    this.logSecurityEvent(
      'RATE_LIMIT_HIT',
      remaining > 10 ? 'MEDIUM' : 'HIGH',
      `API Rate Limit 근접/초과 (남은 요청: ${remaining})`,
      [endpoint],
      remaining > 0, // 남은 요청이 있으면 자동으로 해결된 것으로 간주
      {
        sourceFunction: 'TwitterApiService',
        resolutionAction: remaining > 0 ? '요청 간격 조절' : '15분 대기 후 재시도'
      }
    );
  }
}

// 글로벌 감사 로거 인스턴스 생성 헬퍼
export function createAuditLogger(context?: any): AuditLoggerService {
  const requestId = context?.awsRequestId || `manual_${Date.now()}`;
  return new AuditLoggerService(requestId);
}