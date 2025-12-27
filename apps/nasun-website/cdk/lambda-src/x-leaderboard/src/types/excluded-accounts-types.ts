// Phase 2: Bot 의심 계정 제외 기능 타입 정의
// 환경변수 기반 소프트 제외 방식 (완전한 가역성 보장)

/**
 * 제외 계정 설정 인터페이스
 * 환경변수에서 로드되는 제외 계정 목록
 */
export interface ExcludedAccountsConfig {
  /** 제외할 사용자명 목록 */
  excludedUsernames: string[];
  /** 제외할 사용자 ID 목록 */
  excludedUserIds: string[];
  /** 관리자 사용자명 목록 */
  adminUsernames: string[];
}

/**
 * 제외 계정 확인 결과 인터페이스
 */
export interface ExclusionCheckResult {
  /** 제외 여부 */
  isExcluded: boolean;
  /** 제외 사유 (username 매칭, userId 매칭, 관리자 계정) */
  reason?: 'username_match' | 'user_id_match' | 'admin_account';
  /** 매칭된 값 */
  matchedValue?: string;
}

/**
 * 제외 계정 필터링 통계 인터face
 */
export interface ExclusionFilterStats {
  /** 필터링 전 총 계정 수 */
  totalAccountsBefore: number;
  /** 필터링 후 총 계정 수 */
  totalAccountsAfter: number;
  /** 제외된 계정 수 */
  excludedAccountsCount: number;
  /** 제외된 계정 목록 */
  excludedAccounts: Array<{
    username: string;
    userId: string;
    reason: 'username_match' | 'user_id_match' | 'admin_account';
  }>;
}

/**
 * 관리자 권한 확인 결과 인터페이스
 */
export interface AdminAuthResult {
  /** 관리자 여부 */
  isAdmin: boolean;
  /** 확인된 관리자 사용자명 */
  adminUsername?: string;
}

/**
 * 제외 계정 환경변수 파싱 결과 인터페이스
 */
export interface ExcludedAccountsParsResult {
  /** 파싱 성공 여부 */
  success: boolean;
  /** 파싱된 설정 */
  config: ExcludedAccountsConfig;
  /** 파싱 에러 (실패 시) */
  error?: string;
  /** 파싱된 항목 수 통계 */
  stats: {
    excludedUsernamesCount: number;
    excludedUserIdsCount: number;
    adminUsernamesCount: number;
  };
}

/**
 * 제외 계정 적용 범위 열거형
 */
export enum ExclusionScope {
  /** 인게이지먼트 수집 단계에서 제외 */
  COLLECTION = 'collection',
  /** 리더보드 집계 단계에서 제외 */
  AGGREGATION = 'aggregation',
  /** 리더보드 표시 단계에서 제외 */
  DISPLAY = 'display'
}

/**
 * 제외 계정 설정 상수
 */
export const EXCLUDED_ACCOUNTS_CONFIG = {
  /** 환경변수 키 이름 */
  ENV_KEYS: {
    EXCLUDED_USERNAMES: 'EXCLUDED_USERNAMES',
    EXCLUDED_USER_IDS: 'EXCLUDED_USER_IDS', 
    ADMIN_USERNAMES: 'ADMIN_USERNAMES'
  },
  /** 기본값 */
  DEFAULTS: {
    EXCLUDED_USERNAMES: '',
    EXCLUDED_USER_IDS: '',
    ADMIN_USERNAMES: 'Naru010110,overclocksalmon'
  },
  /** 구분자 */
  DELIMITER: ',',
  /** 최대 제외 계정 수 (안전장치) */
  MAX_EXCLUDED_ACCOUNTS: 1000
} as const;

/**
 * 제외 계정 검증 규칙 상수
 */
export const EXCLUSION_VALIDATION_RULES = {
  /** 사용자명 최소 길이 */
  MIN_USERNAME_LENGTH: 1,
  /** 사용자명 최대 길이 */
  MAX_USERNAME_LENGTH: 50,
  /** 사용자 ID 패턴 (숫자만) */
  USER_ID_PATTERN: /^\d+$/,
  /** 사용자명 패턴 (영문, 숫자, 언더스코어) */
  USERNAME_PATTERN: /^[a-zA-Z0-9_]+$/
} as const;