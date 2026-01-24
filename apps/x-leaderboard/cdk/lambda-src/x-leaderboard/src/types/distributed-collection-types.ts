// 분산 수집 시스템 타입 정의
// 모든 분산 컬렉터가 사용하는 공통 인터페이스

/**
 * 분산 수집 이벤트 - 각 분산 컬렉터가 받는 입력 데이터
 */
export interface DistributedCollectionEvent {
  /** 배치 ID - 오케스트레이션에서 할당 */
  batchId: string;
  
  /** 오케스트레이션 ID - 전체 수집 작업 추적용 */
  orchestrationId: string;
  
  /** 이 컬렉터가 처리해야 할 작업 항목들 */
  workItems: WorkItem[];
  
  /** 수집 대상 날짜 (YYYY-MM-DD) */
  targetDate?: string;
  
  /** 타임아웃 (밀리초) */
  timeoutMs?: number;
  
  /** 컬렉터 타입 확인용 */
  collectorType: CollectorType;
  
  /** 테스트 모드 여부 */
  testMode?: boolean;
  
  /** 추가 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 작업 항목 - 각 컬렉터가 처리할 개별 트윗 정보
 */
export interface WorkItem {
  /** 트윗 ID */
  tweetId: string;
  
  /** 트윗 작성자 ID */
  authorId: string;
  
  /** 트윗 작성자 사용자명 */
  authorUsername: string;
  
  /** 트윗 텍스트 (선택사항) */
  tweetText?: string;
  
  /** 트윗 생성 시간 */
  createdAt?: string;
  
  /** 우선순위 (1-10, 높을수록 우선) */
  priority?: number;
  
  /** 추가 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 컬렉터 타입 열거
 */
export type CollectorType = 
  | 'likes'
  | 'replies' 
  | 'reposts'
  | 'quotes'
  | 'mentions'
  | 'bookmarks'
  | 'retweet-bonus';

/**
 * 수집 결과 - 각 분산 컬렉터가 반환하는 결과
 */
export interface CollectionResult {
  /** 성공 여부 */
  success: boolean;
  
  /** 배치 ID */
  batchId: string;
  
  /** 오케스트레이션 ID */
  orchestrationId: string;
  
  /** 컬렉터 타입 */
  collectorType: CollectorType;
  
  /** 처리된 항목 수 */
  itemsProcessed: number;
  
  /** 수집된 데이터 수 (인게이지먼트 개수) */
  dataCollected: number;
  
  /** 오류 목록 */
  errors: string[];
  
  /** 실행 시간 (밀리초) */
  duration: number;
  
  /** 추가 메타데이터 */
  metadata?: {
    /** Rate Limit 사용량 */
    rateLimitUsed?: number;
    /** 최대 허용량 */
    maxAllowed?: number;
    /** API 호출 수 */
    apiCalls?: number;
    /** 데이터베이스 저장 수 */
    dbWrites?: number;
    /** 추가 정보 */
    [key: string]: any;
  };
}

/**
 * 작업 분할 - HybridExecutionEngine에서 사용
 */
export interface WorkPartition {
  /** 파티션 ID */
  partitionId: string;
  
  /** 컬렉터 타입 */
  collectorType: CollectorType;
  
  /** 할당된 작업 항목들 */
  workItems: WorkItem[];
  
  /** 예상 처리 시간 (밀리초) */
  estimatedDuration: number;
  
  /** 예상 API 호출 수 */
  estimatedApiCalls: number;
  
  /** 우선순위 (1-10) */
  priority: number;
}

/**
 * 오케스트레이션 상태 - CollectionOrchestrator에서 사용
 */
export interface OrchestrationStatus {
  /** 오케스트레이션 ID */
  orchestrationId: string;
  
  /** 전체 상태 */
  overallStatus: 'PENDING' | 'RUNNING' | 'READY_FOR_SCORING' | 'COMPLETED' | 'FAILED';
  
  /** 개별 태스크 상태 */
  taskStatuses: Record<CollectorType, TaskStatus>;
  
  /** 시작 시간 */
  startedAt: string;
  
  /** 완료 시간 (완료된 경우) */
  completedAt?: string;
  
  /** 전체 진행률 (0-100) */
  progressPercentage: number;
  
  /** 에러 메시지들 */
  errors: string[];
  
  /** 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 개별 태스크 상태
 */
export interface TaskStatus {
  /** 상태 */
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  
  /** 시작 시간 */
  startedAt?: string;
  
  /** 완료 시간 */
  completedAt?: string;
  
  /** 처리된 항목 수 */
  itemsProcessed?: number;
  
  /** 수집된 데이터 수 */
  dataCollected?: number;
  
  /** 재시도 횟수 */
  retryCount?: number;
  
  /** 에러 메시지 */
  errorMessage?: string;
  
  /** 배치 ID */
  batchId?: string;
}

/**
 * 분산 수집 설정
 */
export interface DistributedCollectionConfig {
  /** 배치당 최대 작업 항목 수 */
  maxItemsPerBatch: number;
  
  /** 전체 타임아웃 (밀리초) */
  totalTimeoutMs: number;
  
  /** 개별 컬렉터 타임아웃 (밀리초) */
  collectorTimeoutMs: number;
  
  /** 최대 재시도 횟수 */
  maxRetries: number;
  
  /** 재시도 간격 (밀리초) */
  retryIntervalMs: number;
  
  /** Rate Limit 보호 설정 */
  rateLimitProtection: {
    /** 요청 간 최소 간격 (밀리초) */
    minIntervalMs: number;
    /** 배치 간 지연 (밀리초) */
    batchDelayMs: number;
    /** Circuit Breaker 임계값 */
    failureThreshold: number;
  };
}

/**
 * 성능 메트릭
 */
export interface PerformanceMetrics {
  /** 컬렉터 타입 */
  collectorType: CollectorType;
  
  /** 실행 시간 (밀리초) */
  executionTime: number;
  
  /** 처리량 (항목/초) */
  throughput: number;
  
  /** API 응답 시간 평균 (밀리초) */
  avgApiResponseTime: number;
  
  /** 에러율 (0-1) */
  errorRate: number;
  
  /** Rate Limit 사용률 (0-1) */
  rateLimitUsage: number;
  
  /** 메모리 사용량 (MB) */
  memoryUsed: number;
  
  /** 타임스탬프 */
  timestamp: string;
}