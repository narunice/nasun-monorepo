/**
 * 언어 기반 커뮤니티 분류 시스템 타입 정의
 *
 * dominantLanguage (ISO 639-1 언어 코드)를 기반으로 커뮤니티를 분류하고
 * 가중치를 적용하는 시스템입니다.
 *
 * 확장성: 새 언어 추가 시 환경변수만 추가하면 자동 적용
 */

// 언어 코드 타입 (ISO 639-1 표준 + unknown)
export type LanguageCode = 'ko' | 'en' | 'ja' | 'zh' | 'unknown';

// 레거시 호환용 커뮤니티 타입 (향후 완전 제거 예정)
// 현재는 가중치 선택 용도로만 사용: ko → korean, 나머지 → global
export type CommunityType = 'korean' | 'global';

/**
 * 사용자 커뮤니티 프로필
 * DynamoDB에 저장되는 사용자별 커뮤니티 분류 정보
 */
export interface UserCommunityProfile {
  pk: string;                   // "USER_COMMUNITY#{userId}"
  sk: string;                   // "PROFILE"
  userId: string;               // 사용자 ID
  username: string;             // 사용자명
  communityType: CommunityType; // 분류 결과
  confidence: number;           // 분류 신뢰도 (0.0 ~ 1.0)
  dominantLanguage?: LanguageCode; // 실제 감지된 주요 언어 (ko/en/ja/zh/unknown)

  // 분류 근거
  analysis: {
    koreanTweetRatio: number;   // 한국어 트윗 비율 (0.0 ~ 1.0)
    profileKeywords: string[];  // 발견된 키워드들
    manualOverride: boolean;    // 수동 조정 여부
    totalTweetsAnalyzed: number; // 분석한 트윗 수
  };

  // 메타데이터
  lastAnalyzed: string;         // 마지막 분석 시간 (ISO string)
  analyzedTweetCount: number;   // 분석한 트윗 수
  ttl: number;                 // 30일 TTL (재분석 유도)
  version: string;             // "v2"
}

/**
 * 언어 분석 결과
 * 사용자의 트윗 언어 분석 결과를 담는 인터페이스
 */
export interface LanguageAnalysis {
  koreanRatio: number;          // 한국어 트윗 비율 (0.0 ~ 1.0)
  totalTweets: number;          // 분석한 총 트윗 수
  confidence: number;           // 언어 분석 신뢰도 (0.0 ~ 1.0)
  languageDistribution: {       // 언어별 분포
    [key in LanguageCode]: number;
  };
  dominantLanguage: LanguageCode; // 주요 언어
}

/**
 * 키워드 분석 결과
 * 프로필 텍스트에서 한국 관련 키워드 분석 결과
 */
export interface KeywordAnalysis {
  foundKeywords: string[];      // 발견된 키워드 목록
  score: number;               // 키워드 점수 (0.0 ~ 1.0)
  hasLocationMatch: boolean;   // 지역 키워드 매칭 여부
  categoryMatches: {           // 카테고리별 매칭
    location: string[];        // 지역 관련 키워드
    culture: string[];         // 문화 관련 키워드
    language: string[];        // 언어 관련 키워드
    emoji: string[];          // 이모지 관련
  };
}

/**
 * 커뮤니티 가중치 설정
 * 하이브리드 가중치 시스템 설정
 */
export interface CommunityWeightConfig {
  korean: {
    logBase: number;            // 한국어 로그 밑 (기본: 8)
    languageMultiplier: number; // 언어 가중치 (기본: 1.2)
    maxCap: number;            // 최대 상한선 (기본: 5.0)
  };
  global: {
    logBase: number;            // 글로벌 로그 밑 (기본: 30)
    languageMultiplier: number; // 언어 가중치 (기본: 1.0)
    maxCap: number;            // 최대 상한선 (기본: 4.0)
  };
}

/**
 * 🆕 Phase 3.1.1: 언어 코드 기반 가중치 설정
 * 새로운 언어 커뮤니티 확장을 위한 구조
 */
export interface CommunityLanguageWeightConfig {
  KR: {
    logBase: number;            // 한국 커뮤니티 로그 밑 (기본: 8)
    languageMultiplier: number; // 언어 가중치 (기본: 1.2)
    maxCap: number;            // 최대 상한선 (기본: 5.0)
  };
  EN: {
    logBase: number;            // 영어 커뮤니티 로그 밑 (기본: 30)
    languageMultiplier: number; // 언어 가중치 (기본: 1.0)
    maxCap: number;            // 최대 상한선 (기본: 4.0)
  };
  JP?: {                       // 🆕 일본 커뮤니티 (향후 확장용)
    logBase: number;            // 일본 커뮤니티 로그 밑
    languageMultiplier: number; // 언어 가중치
    maxCap: number;            // 최대 상한선
  };
  CN?: {                       // 🆕 중국 커뮤니티 (향후 확장용)
    logBase: number;            // 중국 커뮤니티 로그 밑
    languageMultiplier: number; // 언어 가중치
    maxCap: number;            // 최대 상한선
  };
  UNKNOWN?: {                  // 🆕 알 수 없는 언어
    logBase: number;
    languageMultiplier: number;
    maxCap: number;
  };
  default: {                   // 🆕 기본값 (분류되지 않은 커뮤니티용)
    logBase: number;            // 기본 로그 밑 (기본: 30)
    languageMultiplier: number; // 기본 언어 가중치 (기본: 1.0)
    maxCap: number;            // 기본 상한선 (기본: 4.0)
  };
}

/**
 * 가중치 계산 결과
 * 최종 가중치 계산 결과와 메타데이터
 */
export interface WeightCalculationResult {
  finalWeight: number;         // 최종 가중치
  dominantLanguage: LanguageCode; // 감지된 주요 언어 (ISO 639-1) - config 선택 기준
  followerWeight: number;      // 팔로워 기반 가중치
  languageMultiplier: number;  // 언어 가중치
  logBase: number;            // 사용된 로그 밑
  maxCap: number;             // 적용된 상한선
  cappedAtMax: boolean;       // 상한선 적용 여부
}

/**
 * 분류 서비스 설정
 * CommunityClassificationService 설정 인터페이스
 */
export interface ClassificationConfig {
  sampleTweetCount: number;    // 분석할 트윗 수 (기본: 20)
  koreanThreshold: number;     // 한국 커뮤니티 판정 임계값 (기본: 0.6)
  minimumTweets: number;       // 최소 트윗 수 (기본: 5)
  confidenceBoost: number;     // 언어 분석 기본 신뢰도 (기본: 0.8)
  cacheTtlDays: number;       // 캐시 TTL 일수 (기본: 30)
}

/**
 * 분류 처리 결과
 * 사용자 분류 처리 결과 인터페이스
 */
export interface ClassificationResult {
  success: boolean;            // 성공 여부
  userId: string;             // 사용자 ID
  communityType?: CommunityType; // 분류된 커뮤니티 타입
  dominantLanguage?: LanguageCode; // 감지된 주요 언어
  confidence?: number;         // 분류 신뢰도
  error?: string;             // 오류 메시지
  fromCache: boolean;         // 캐시에서 가져온 결과인지 여부
  processingTime: number;     // 처리 시간 (밀리초)
  fallbackReason?: string;    // 폴백이 사용된 경우 사유
}

/**
 * 배치 분류 통계
 * 배치 처리 결과 통계
 */
export interface BatchClassificationStats {
  totalProcessed: number;      // 총 처리 사용자 수
  successCount: number;        // 성공 수
  errorCount: number;          // 오류 수
  cacheHitCount: number;       // 캐시 히트 수
  koreanCount: number;         // 한국 커뮤니티 분류 수
  globalCount: number;         // 글로벌 커뮤니티 분류 수
  averageConfidence: number;   // 평균 신뢰도
  processingTimeMs: number;    // 총 처리 시간
}

/**
 * 확장된 사용자 델타 (기존 UserDelta 확장)
 * 커뮤니티 가중치 정보가 추가된 사용자 점수 변화
 */
export interface EnhancedUserDelta {
  userId: string;
  scoreChange: number;
  
  // 커뮤니티 가중치 관련 메타데이터
  communityWeight?: number;
  communityType?: CommunityType;
  logBase?: number;
  languageMultiplier?: number;
  followerWeight?: number;
  cappedAtMax?: boolean;
  
  // 기존 필드들
  [key: string]: any;
}

/**
 * 환경변수 설정 타입
 * 시스템 환경변수에서 읽어올 설정들
 */
export interface EnvironmentConfig {
  COMMUNITY_WEIGHT_ENABLED: boolean;
  KOREAN_LOG_BASE: number;
  KOREAN_LANGUAGE_MULTIPLIER: number;
  KOREAN_MAX_CAP: number;
  GLOBAL_LOG_BASE: number;
  GLOBAL_LANGUAGE_MULTIPLIER: number;
  GLOBAL_MAX_CAP: number;
  LANGUAGE_ANALYSIS_TWEET_COUNT: number;
  KOREAN_THRESHOLD: number;
  COMMUNITY_CACHE_TTL_DAYS: number;
}

/**
 * 한국 관련 키워드 상수
 */
export const KOREAN_KEYWORDS = {
  // 지역 관련
  location: [
    '한국', '대한민국', 'korea', 'seoul', '서울', 
    'busan', '부산', 'incheon', '인천', 'daegu', '대구',
    'daejeon', '대전', 'gwangju', '광주', 'ulsan', '울산',
    'kr', '.kr', 'south korea'
  ],
  
  // 문화 관련
  culture: [
    'kpop', '케이팝', 'k-pop', 'kdrama', '드라마', 
    'kimchi', '김치', 'bibimbap', '비빔밥', 'bulgogi', '불고기',
    'hanbok', '한복', 'taekwondo', '태권도', 'hallyu', '한류'
  ],
  
  // 언어 관련
  language: [
    'korean', '한국어', 'hangul', '한글', '한국말',
    '안녕하세요', '감사합니다', '사랑해'
  ],
  
  // 이모지
  emoji: [
    '🇰🇷', '🥢', '🍚', '🍜', '🥟'
  ]
} as const;

/**
 * 기본 설정값
 *
 * ✨ Twitter Engineering 표준 권장사항:
 * - 샘플 수: 100개 이상 (정확도 향상)
 * - 최소 트윗: 20개 (신뢰할 수 있는 분석 기준)
 */
export const DEFAULT_CONFIG: Required<ClassificationConfig> = {
  sampleTweetCount: 100,  // 20 → 100 (Twitter 표준)
  koreanThreshold: 0.6,
  minimumTweets: 20,      // 5 → 20 (신뢰도 향상)
  confidenceBoost: 0.8,
  cacheTtlDays: 30
};

export const DEFAULT_WEIGHT_CONFIG: CommunityWeightConfig = {
  korean: {
    logBase: 8,
    languageMultiplier: 1.02,
    maxCap: 5.0
  },
  global: {
    logBase: 30,
    languageMultiplier: 1.0,
    maxCap: 4.0
  }
};

/**
 * 🆕 Phase 3.1.2: 언어 코드 기반 기본 가중치 설정
 */
export const DEFAULT_LANGUAGE_WEIGHT_CONFIG: CommunityLanguageWeightConfig = {
  KR: {
    logBase: 8,
    languageMultiplier: 1.2,
    maxCap: 5.0
  },
  EN: {
    logBase: 30,
    languageMultiplier: 1.0,
    maxCap: 4.0
  },
  JP: {                        // 🆕 일본 커뮤니티 기본값
    logBase: 25,               // 한국과 영어의 중간값
    languageMultiplier: 1.1,   // 약간의 보너스
    maxCap: 4.5
  },
  CN: {                        // 🆕 중국 커뮤니티 기본값
    logBase: 25,               // 한국과 영어의 중간값
    languageMultiplier: 1.1,   // 약간의 보너스
    maxCap: 4.5
  },
  default: {                   // 🆕 분류되지 않은 커뮤니티 기본값
    logBase: 30,               // 영어와 동일
    languageMultiplier: 1.0,
    maxCap: 4.0
  }
};

/**
 * 🆕 Phase 2.1.2: 커뮤니티 타입 ↔ 언어 코드 매핑 유틸리티
 */

// dominantLanguage에서 CommunityType 결정 (가중치 선택용)
export function getCommunityTypeFromLanguage(dominantLanguage: LanguageCode): CommunityType {
  return dominantLanguage === 'ko' ? 'korean' : 'global';
}

/**
 * 🆕 Phase 4.3.2: dominantLanguage를 프론트엔드용 뱃지 코드로 변환
 */
export function dominantLanguageToCode(dominantLanguage: LanguageCode): string {
  switch (dominantLanguage) {
    case 'ko': return 'KR';
    case 'en': return 'EN';
    case 'ja': return 'JP';
    case 'zh': return 'CN';
    case 'unknown':
    default:
      return 'GLOBAL';
  }
}