// V3 통합 사용자 프로필 시스템 타입 정의

/**
 * 프로필 데이터 소스 타입
 */
export type ProfileSource = 'engagement' | 'direct_api' | 'cache' | 'existing_score';

/**
 * 프로필 완전성 지표
 */
export interface ProfileCompleteness {
  hasValidUsername: boolean;
  hasValidDisplayName: boolean;
  hasProfileImage: boolean;
  hasFollowersCount: boolean;
}

/**
 * 통합 사용자 프로필 인터페이스 (V3)
 * 모든 프로필 관련 작업의 표준 데이터 구조
 */
export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  profileImageUrl?: string;
  followersCount?: number;
  
  // 메타데이터
  qualityScore: number;          // 0-100 (품질 점수)
  lastUpdated: string;           // ISO 문자열
  lastAPIUpdate: string;         // 마지막 API 호출 시간
  sources: ProfileSource[];      // 데이터 소스 목록
  
  // 완전성 지표 (숫자 또는 객체 두 형태 지원)
  completeness: ProfileCompleteness | number;
  
  // 캐싱
  ttl: number;                   // Unix timestamp
  version: "v2";
}

/**
 * 캐시된 프로필 (DynamoDB 저장용)
 */
export interface CachedProfile extends UserProfile {
  pk: string;                    // "USER_PROFILE#{userId}"
  sk: string;                    // "LATEST"
}

/**
 * 프로필 병합을 위한 후보 데이터
 */
export interface ProfileCandidate {
  value: any;
  score: number;
  source: ProfileSource;
}

/**
 * 프로필 병합 결과
 */
export interface ProfileMergeResult {
  profile: UserProfile;
  hasImprovement: boolean;
  improvedFields: string[];
  qualityImprovement: number;
}

/**
 * 배치 프로필 처리 결과
 */
export interface BatchProfileResult {
  profiles: Map<string, UserProfile>;
  stats: {
    totalProcessed: number;
    cacheHits: number;
    apiCalls: number;
    qualityImprovements: number;
    averageQualityScore: number;
  };
  timing: {
    cacheTime: number;
    apiTime: number;
    mergeTime: number;
    totalTime: number;
  };
}

/**
 * API 사용 계획
 */
export interface APIUsagePlan {
  canProceed: boolean;
  estimatedCost: number;
  remainingQuota: number;
  recommendedBatchSize: number;
  estimatedCompletionTime: number;
  reason?: string;
}

/**
 * 프로필 품질 임계값
 */
export const PROFILE_QUALITY_THRESHOLDS = {
  HIGH_QUALITY: 80,        // 80점 이상: 고품질
  CACHE_WORTHY: 70,        // 70점 이상: 캐시 저장
  MEDIUM: 60,              // 60점 이상: 중품질
  GOOD: 50,                // 50점 이상: 양호 (ACCEPTABLE과 동일)
  ACCEPTABLE: 50,          // 50점 이상: 사용 가능
  LOW: 40,                 // 40점 이상: 저품질 (개선 필요)
  NEEDS_UPDATE: 30,        // 30점 미만: 업데이트 필요
  CRITICAL: 20             // 20점 미만: 심각한 품질 저하
} as const;

/**
 * 필드별 품질 점수 가중치
 */
export const FIELD_QUALITY_WEIGHTS = {
  username: 30,            // 필수 필드
  displayName: 30,         // 필수 필드  
  profileImageUrl: 20,     // 중요 필드
  followersCount: 20       // 중요 필드
} as const;

/**
 * 데이터 소스별 신뢰도 점수
 */
export const SOURCE_RELIABILITY_SCORES = {
  direct_api: 100,         // 최고 신뢰도
  cache: 80,               // 높은 신뢰도
  existing_score: 60,      // 중간 신뢰도
  engagement: 40           // 기본 신뢰도
} as const;

/**
 * 프로필 필드 유효성 검증 함수들
 */
export const ProfileValidators = {
  /**
   * 사용자명 유효성 검증 - 강화된 버전
   */
  isValidUsername(username: any): boolean {
    // 기본 타입 및 null 체크
    if (typeof username !== 'string' || username === null || username === undefined) {
      return false;
    }
    
    const trimmed = username.trim();
    
    // 빈 문자열, Unknown 값 체크 (대소문자 구분 없음) - 🔧 개선: 다양한 unknown 패턴
    if (trimmed === '' || trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'n/a' || trimmed === 'null') {
      return false;
    }
    
    // 최소 길이 체크 (1자 이상)
    if (trimmed.length < 1) {
      return false;
    }
    
    // 🔧 개선: 최대 길이 체크 (Twitter username은 15자 제한)
    if (trimmed.length > 15) {
      return false;
    }
    
    // 의미 없는 패턴 체크 (숫자만으로 구성된 사용자명 제외)
    if (/^\d+$/.test(trimmed)) {
      return false;
    }
    
    // 🔧 개선: Twitter username 규칙 준수 체크
    // Twitter username은 영문자, 숫자, 언더스코어만 허용
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return false;
    }
    
    // 🔧 개선: 의심스러운 패턴 체크
    // - 언더스코어로만 구성
    // - 반복되는 문자 패턴
    if (/^_+$/.test(trimmed) || /^(.)\1{4,}$/.test(trimmed)) {
      return false;
    }
    
    // 🚨 Phase 2.1.2++: 시스템 생성 가짜 사용자명 패턴 탐지
    // user_숫자 패턴 (예: user_133568, user_147136)
    if (/^user_\d+$/.test(trimmed)) {
      return false;
    }
    
    // 기타 의심스러운 시스템 생성 패턴
    // account_숫자, test_숫자, temp_숫자 등
    if (/^(account|test|temp|demo|fake)_\d+$/i.test(trimmed)) {
      return false;
    }
    
    return true;
  },

  /**
   * 표시명 유효성 검증 - 강화된 버전
   */
  isValidDisplayName(displayName: any): boolean {
    // 기본 타입 및 null 체크
    if (typeof displayName !== 'string' || displayName === null || displayName === undefined) {
      return false;
    }
    
    const trimmed = displayName.trim();
    
    // 빈 문자열, Unknown 값 체크 - 🔧 개선: 더 많은 무의미 값 패턴
    if (trimmed === '' || trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'n/a' || 
        trimmed === 'null' || trimmed.toLowerCase() === 'undefined' || trimmed === '---') {
      return false;
    }
    
    // 최소 길이 체크 (1자 이상)
    if (trimmed.length < 1) {
      return false;
    }
    
    // 🔧 개선: 최대 길이 체크 (Twitter display name은 50자 제한)
    if (trimmed.length > 50) {
      return false;
    }
    
    // 의미 있는 이름 검증: 단순 숫자나 특수문자만으로 구성된 경우 제외 - 🔧 개선: 패턴 확장
    if (/^[\d\s\-_\.@#$%^&*()]+$/.test(trimmed)) {
      return false;
    }
    
    // 🔧 개선: 스팸성 패턴 체크
    // - 같은 문자/단어의 과도한 반복
    // - 과도한 특수문자 사용 (전체 길이의 50% 이상)
    if (/^(.)\1{6,}$/.test(trimmed) || /(\w+\s*){4,}\1/.test(trimmed)) {
      return false;
    }
    
    const specialCharCount = (trimmed.match(/[^\w\s가-힣]/g) || []).length;
    if (specialCharCount > trimmed.length * 0.5) {
      return false;
    }
    
    // 🚨 Phase 2.1.2++: 시스템 생성 가짜 표시명 패턴 탐지
    // "User 숫자" 패턴 (예: User 3568, User 7136)
    if (/^User \d+$/.test(trimmed)) {
      return false;
    }
    
    // 기타 의심스러운 시스템 생성 패턴
    // "Account 숫자", "Test 숫자", "Demo 숫자" 등
    if (/^(Account|Test|Demo|Fake|Temp|Sample) \d+$/i.test(trimmed)) {
      return false;
    }
    
    return true;
  },

  /**
   * 프로필 이미지 URL 유효성 검증 - 강화된 버전
   */
  isValidProfileImageUrl(url: any): boolean {
    // 기본 타입 및 null 체크
    if (typeof url !== 'string' || url === null || url === undefined) {
      return false;
    }
    
    const trimmed = url.trim();
    
    // 빈 문자열, unknown 값 체크 - 🔧 개선: 더 많은 무의미 값 패턴
    if (trimmed === '' || trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'n/a' || 
        trimmed === 'null' || trimmed === '#' || trimmed === 'undefined') {
      return false;
    }
    
    // HTTP/HTTPS 프로토콜 체크 - 🔧 개선: HTTPS 우선 권장
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return false;
    }
    
    // 기본 URL 형식 검증
    try {
      const urlObj = new URL(trimmed);
      
      // 🔧 개선: 알려진 이미지 호스팅 도메인 검증
      const validImageHosts = [
        'pbs.twimg.com',           // Twitter 공식 이미지
        'abs.twimg.com',           // Twitter 공식 이미지
        'images.unsplash.com',     // Unsplash
        'cdn.discordapp.com',      // Discord CDN
        'i.imgur.com',             // Imgur
        'media.giphy.com',         // Giphy
        'avatars.githubusercontent.com', // GitHub 아바타
        'lh3.googleusercontent.com' // Google 이미지
      ];
      
      const hostname = urlObj.hostname.toLowerCase();
      const isKnownHost = validImageHosts.some(host => hostname.includes(host));
      
      // 알려진 호스트가 아닌 경우 추가 검증
      if (!isKnownHost) {
        // 🔧 개선: 이미지 파일 확장자 체크
        const path = urlObj.pathname.toLowerCase();
        const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(path);
        
        // 이미지 확장자가 없으면 의심스러운 URL로 판단
        if (!hasImageExtension && !path.includes('/avatar') && !path.includes('/profile')) {
          return false;
        }
      }
      
      // 🔧 개선: URL 길이 제한 (2048자)
      if (trimmed.length > 2048) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 팔로워 수 유효성 검증 - 강화된 버전
   */
  isValidFollowersCount(count: any): boolean {
    // 타입 체크
    if (typeof count !== 'number') {
      return false;
    }
    
    // null, undefined, NaN 체크 - 🔧 개선: 추가 엣지 케이스 처리
    if (count === null || count === undefined || Number.isNaN(count) || !Number.isFinite(count)) {
      return false;
    }
    
    // 음수 체크 - 🔧 개선: -0 체크 추가
    if (count < 0 || Object.is(count, -0)) {
      return false;
    }
    
    // 정수 체크
    if (!Number.isInteger(count)) {
      return false;
    }
    
    // 현실적인 범위 체크 (10억 팔로워 이하) - 🔧 개선: 안전 범위 축소
    if (count > 1000000000) {
      return false;
    }
    
    // 🔧 개선: 의심스러운 패턴 체크 (예: 정확히 라운드 넘버인 매우 큰 값들)
    if (count > 10000000 && count % 1000000 === 0) {
      return false; // 천만 이상에서 백만 단위로 딱 떨어지는 값은 의심
    }
    
    return true;
  },

  /**
   * 일반적인 필드 유효성 검증 - 강화된 버전
   */
  isValidField(value: any): boolean {
    // null, undefined 체크
    if (value === null || value === undefined) {
      return false;
    }
    
    // 빈 문자열 체크
    if (typeof value === 'string' && value.trim() === '') {
      return false;
    }
    
    // unknown 값 체크 (대소문자 구분 없음)
    if (typeof value === 'string' && value.toLowerCase() === 'unknown') {
      return false;
    }
    
    return true;
  }
};

/**
 * 인게이지먼트 데이터에서 프로필 정보 추출을 위한 인터페이스
 */
export interface EngagementProfileData {
  userId: string;
  username?: string;
  displayName?: string;
  profileImageUrl?: string;
  followersCount?: number;
}

/**
 * 기존 스코어 데이터에서 프로필 정보 추출을 위한 인터페이스
 */
export interface ExistingProfileData {
  userId: string;
  username?: string;
  displayName?: string;
  profileImageUrl?: string;
  followersCount?: number;
  followersCountUpdatedAt?: string;
}

/**
 * Twitter API 사용자 데이터 인터페이스
 */
export interface TwitterUserData {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}