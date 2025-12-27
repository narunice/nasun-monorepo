// V2 시스템용 환경변수 설정
//
// ============================================================================
// Target Account 환경변수 가이드
// ============================================================================
//
// TARGET_USER_ID (필수):
//   - X API 호출에 사용되는 numeric ID
//   - 예: "1863020068785004544" (Dev), "1936784207453507584" (Prod)
//   - 용도: v2.tweets.search(), v2.userMentionTimeline() 등
//   - ⚠️ X API v2는 Username으로 직접 호출 불가! 반드시 numeric ID 필요
//
// TARGET_USERNAME (필수):
//   - 표시/로깅용 사용자명 (변경 가능)
//   - 예: "Naru010110" (Dev), "Nasun_io" (Prod)
//   - 용도: 멘션 텍스트 파싱, 로그 출력, 하드코딩 매핑 폴백
//
// ============================================================================

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

function getOptionalEnvVar(key: string, defaultValue?: string): string | undefined {
  const value = process.env[key];
  return value || defaultValue;
}

export interface EnvConfigV2 {
  // DynamoDB 설정
  awsRegion: string; // AWS 리전
  cumulativeTableName: string;
  userIdentityMapTable?: string; // 🆕 UserIdentityMap 테이블명

  // Twitter API 설정
  twitterBearerToken: string;
  targetUsername: string;
  targetUserId: string;
  adminUsernames: string[];

  // OAuth 1.0a credentials
  twitterApiKey: string;
  twitterApiSecret: string;
  twitterAccessToken: string;
  twitterAccessTokenSecret: string;

  // OAuth 2.0 credentials (북마크 API용)
  oauth2ClientId: string;
  oauth2ClientSecret: string;
  oauth2UserAccessToken?: string;
  oauth2RefreshToken?: string;
  oauth2RedirectUri: string;

  // 인증 전략 설정
  enableOAuthAuthentication: boolean;
  fallbackToBearerToken: boolean;
  enableOAuth2Authentication: boolean;

  // 북마크 기능 설정
  enableBookmarkScoring: boolean;
  bookmarkScoreValue: number;

  // 시스템 설정
  

  // 이벤트 기간 설정
  event1StartDate: string;
  event1EndDate: string;
  event2StartDate: string;
  event2EndDate: string;
  event3StartDate: string;
  event3EndDate: string;

  // TTL 설정 (일 단위)
  leaderboardDataTtlDays: number;
  mentionTtlDays: number;
  replyCounterTtlDays: number;
  recentActivityTtlDays: number;
  dailySnapshotTtlDays: number;
  profileCacheTtlDays: number;

  // V2 전용 설정
  systemVersion: "v2";
  enableCumulativeScoring: boolean;

  // 동점자 처리 - 누적 활동 일수 설정
  activeDaysPeriod: number;
  activeDaysWeight: number;
  activeDaysMinActivities: number;
  enableActiveDaysTieBreaker: boolean;

  // 🆕 Activity Bonus/Penalty System (2025-10-27)
  enableActivityBonus: boolean;
  activityBonusWeightPerDay: number;
  activityBonusThresholdDays: number;
  activityBonusPeriodDays: number;
  enableInactivityPenalty: boolean;
  inactivityPenaltyThreshold: number;
  inactivityPenaltyPerDay: number;
  inactivityPenaltyMax: number;

  // 점수 가중치 설정
  scoreWeightLikes: number;
  scoreWeightReplies: number;
  scoreWeightReposts: number;
  scoreWeightQuotes: number;
  scoreWeightMentions: number;

  // 🆕 X API 데이터 수집 제한 (2025-10-28)
  maxMentionsPerDay: number;
  maxLikesPerTweet: number;
  maxRepostsPerTweet: number;
  visibleLeaderboards: string[];
}

export function getEnvConfigV2(): EnvConfigV2 {
  return {
    // DynamoDB
    awsRegion: getEnvVar("AWS_REGION", "ap-northeast-2"),
    cumulativeTableName: getEnvVar("CUMULATIVE_TABLE_NAME", "nasun-leaderboard-data"),
    userIdentityMapTable: getOptionalEnvVar("USER_IDENTITY_MAP_TABLE"), // 🆕 추가

    // Twitter API (선택적)
    twitterBearerToken: getEnvVar("TWITTER_BEARER_TOKEN", ""), // 기본값으로 빈 문자열
    targetUsername: getEnvVar("TARGET_USERNAME", "Naru010110"),
    targetUserId: getEnvVar("TARGET_USER_ID", "1863020068785004544"),
    adminUsernames: getEnvVar("ADMIN_USERNAMES", "Naru010110,overclocksalmon")
      .split(",")
      .map(username => username.trim()),
    
    // OAuth 1.0a credentials
    twitterApiKey: getEnvVar("TWITTER_API_KEY", ""),
    twitterApiSecret: getEnvVar("TWITTER_API_SECRET", ""),
    twitterAccessToken: getEnvVar("TWITTER_ACCESS_TOKEN", ""),
    twitterAccessTokenSecret: getEnvVar("TWITTER_ACCESS_TOKEN_SECRET", ""),
    
    // OAuth 2.0 credentials (북마크 API용)
    oauth2ClientId: getEnvVar("OAUTH2_CLIENT_ID", ""),
    oauth2ClientSecret: getEnvVar("OAUTH2_CLIENT_SECRET", ""),
    oauth2UserAccessToken: getOptionalEnvVar("OAUTH2_USER_ACCESS_TOKEN"),
    oauth2RefreshToken: getOptionalEnvVar("OAUTH2_REFRESH_TOKEN"),
    oauth2RedirectUri: getEnvVar("OAUTH2_REDIRECT_URI", "http://localhost:3000/auth/callback"),
    
    // 인증 전략
    enableOAuthAuthentication: getEnvVar("ENABLE_OAUTH_AUTHENTICATION", "true") === "true",
    fallbackToBearerToken: getEnvVar("FALLBACK_TO_BEARER_TOKEN", "true") === "true",
    enableOAuth2Authentication: getEnvVar("ENABLE_OAUTH2_AUTHENTICATION", "false") === "true",
    
    // 북마크 기능 설정
    enableBookmarkScoring: getEnvVar("ENABLE_BOOKMARK_SCORING", "false") === "true",
    bookmarkScoreValue: parseFloat(getEnvVar("BOOKMARK_SCORE_VALUE", "3.5")),
    
    // 시스템 설정
    
    // 이벤트 기간 설정
    event1StartDate: getEnvVar("EVENT1_START_DATE", "2025-10-19"),
    event1EndDate: getEnvVar("EVENT1_END_DATE", "2025-10-21"),
    event2StartDate: getEnvVar("EVENT2_START_DATE", "2025-10-21"),
    event2EndDate: getEnvVar("EVENT2_END_DATE", "2025-10-23"),
    event3StartDate: getEnvVar("EVENT3_START_DATE", "2025-12-11"),
    event3EndDate: getEnvVar("EVENT3_END_DATE", "2025-12-30"),
    
    // TTL 설정 (일 단위)
    leaderboardDataTtlDays: parseInt(getEnvVar("LEADERBOARD_DATA_TTL_DAYS", "365")),
    mentionTtlDays: parseInt(getEnvVar("MENTION_TTL_DAYS", "365")),
    replyCounterTtlDays: parseInt(getEnvVar("REPLY_COUNTER_TTL_DAYS", "365")),
    recentActivityTtlDays: parseInt(getEnvVar("RECENT_ACTIVITY_TTL_DAYS", "365")),
    dailySnapshotTtlDays: parseInt(getEnvVar("DAILY_SNAPSHOT_TTL_DAYS", "365")),
    profileCacheTtlDays: parseInt(getEnvVar("PROFILE_CACHE_TTL_DAYS", "7")),
    
    // V2 전용
    systemVersion: "v2",
    enableCumulativeScoring: getEnvVar("ENABLE_CUMULATIVE_SCORING", "true") === "true",
    
    // 동점자 처리 - 누적 활동 일수 설정
    activeDaysPeriod: parseInt(getEnvVar("ACTIVE_DAYS_PERIOD", "60")),
    activeDaysWeight: parseFloat(getEnvVar("ACTIVE_DAYS_WEIGHT", "0.1")),
    activeDaysMinActivities: parseInt(getEnvVar("ACTIVE_DAYS_MIN_ACTIVITIES", "1")),
    enableActiveDaysTieBreaker: getEnvVar("ENABLE_ACTIVE_DAYS_TIE_BREAKER", "true") === "true",

    // 🆕 Activity Bonus/Penalty System (2025-10-27)
    enableActivityBonus: getEnvVar("ACTIVITY_BONUS_ENABLED", "true") === "true",
    activityBonusWeightPerDay: parseFloat(getEnvVar("ACTIVITY_BONUS_WEIGHT_PER_DAY", "0.28")),
    activityBonusThresholdDays: parseInt(getEnvVar("ACTIVITY_BONUS_THRESHOLD_DAYS", "3")),
    activityBonusPeriodDays: parseInt(getEnvVar("ACTIVITY_BONUS_PERIOD_DAYS", "7")),
    enableInactivityPenalty: getEnvVar("INACTIVITY_PENALTY_ENABLED", "true") === "true",
    inactivityPenaltyThreshold: parseInt(getEnvVar("INACTIVITY_PENALTY_THRESHOLD", "3")),
    inactivityPenaltyPerDay: parseFloat(getEnvVar("INACTIVITY_PENALTY_PER_DAY", "0.3")),
    inactivityPenaltyMax: parseFloat(getEnvVar("INACTIVITY_PENALTY_MAX", "5.0")),

    // 점수 가중치 설정
    scoreWeightLikes: parseFloat(getEnvVar("SCORE_WEIGHT_LIKES", "0.2")),
    scoreWeightReplies: parseFloat(getEnvVar("SCORE_WEIGHT_REPLIES", "0.4")),
    scoreWeightReposts: parseFloat(getEnvVar("SCORE_WEIGHT_REPOSTS", "0.4")),
    scoreWeightQuotes: parseFloat(getEnvVar("SCORE_WEIGHT_QUOTES", "0.6")),
    scoreWeightMentions: parseFloat(getEnvVar("SCORE_WEIGHT_MENTIONS", "0.5")),

    // 🆕 X API 데이터 수집 제한 (2025-10-28)
    maxMentionsPerDay: parseInt(getEnvVar("MAX_MENTIONS_PER_DAY", "1000")),
    maxLikesPerTweet: parseInt(getEnvVar("MAX_LIKES_PER_TWEET", "500")),
    maxRepostsPerTweet: parseInt(getEnvVar("MAX_REPOSTS_PER_TWEET", "500")),
    visibleLeaderboards: getEnvVar("VISIBLE_LEADERBOARDS", "CUMULATIVE,EVENT1,EVENT2,EVENT3")
      .split(',')
      .map(id => id.trim()),
  };
}

export function validateEnvConfigV2(config: EnvConfigV2): void {
  // Bearer Token 검증 (OAuth가 비활성화된 경우 필수)
  if (!config.enableOAuthAuthentication && !config.twitterBearerToken) {
    throw new Error("Twitter Bearer Token is required when OAuth authentication is disabled");
  }
  
  // OAuth 1.0a 크리덴셜 검증 (OAuth가 활성화된 경우)
  if (config.enableOAuthAuthentication) {
    const missingOAuthCredentials = [];
    if (!config.twitterApiKey) missingOAuthCredentials.push("TWITTER_API_KEY");
    if (!config.twitterApiSecret) missingOAuthCredentials.push("TWITTER_API_SECRET");
    if (!config.twitterAccessToken) missingOAuthCredentials.push("TWITTER_ACCESS_TOKEN");
    if (!config.twitterAccessTokenSecret) missingOAuthCredentials.push("TWITTER_ACCESS_TOKEN_SECRET");
    
    if (missingOAuthCredentials.length > 0) {
      throw new Error(`OAuth 1.0a authentication is enabled but missing credentials: ${missingOAuthCredentials.join(", ")}`);
    }
  }
  
  // OAuth 2.0 크리덴셜 검증 (OAuth 2.0이 활성화되었거나 북마크 스코어링이 활성화된 경우)
  if (config.enableOAuth2Authentication || config.enableBookmarkScoring) {
    const missingOAuth2Credentials = [];
    if (!config.oauth2ClientId) missingOAuth2Credentials.push("OAUTH2_CLIENT_ID");
    if (!config.oauth2ClientSecret) missingOAuth2Credentials.push("OAUTH2_CLIENT_SECRET");
    if (!config.oauth2RedirectUri) missingOAuth2Credentials.push("OAUTH2_REDIRECT_URI");
    
    // 북마크 스코어링이 활성화된 경우에만 OAuth 2.0 크리덴셜 필수
    if (config.enableBookmarkScoring && missingOAuth2Credentials.length > 0) {
      throw new Error(`OAuth 2.0 authentication is required for bookmark scoring but missing credentials: ${missingOAuth2Credentials.join(", ")}`);
    }
    
    // OAuth 2.0이 명시적으로 활성화된 경우에만 OAuth 2.0 크리덴셜 필수
    if (config.enableOAuth2Authentication && missingOAuth2Credentials.length > 0) {
      throw new Error(`OAuth 2.0 authentication is enabled but missing credentials: ${missingOAuth2Credentials.join(", ")}`);
    }
  }
  
  if (!config.targetUsername) {
    throw new Error("Target username is required");
  }

  // Target User ID 검증 (경고만 출력, 기존 동작 유지)
  if (!config.targetUserId) {
    console.warn("⚠️ TARGET_USER_ID not set, using default value. X API calls may fail.");
  } else if (!/^\d+$/.test(config.targetUserId)) {
    console.warn(`⚠️ TARGET_USER_ID should be numeric format, got: "${config.targetUserId}"`);
  }

  // 북마크 점수 값 검증
  if (config.enableBookmarkScoring && (isNaN(config.bookmarkScoreValue) || config.bookmarkScoreValue <= 0)) {
    throw new Error("Bookmark score value must be a positive number");
  }
}

// OAuth 1.0a 크리덴셜 유효성 검사 함수
export function hasValidOAuthCredentials(config: EnvConfigV2): boolean {
  return !!(
    config.twitterApiKey &&
    config.twitterApiSecret &&
    config.twitterAccessToken &&
    config.twitterAccessTokenSecret
  );
}

// OAuth 2.0 크리덴셜 유효성 검사 함수
export function hasValidOAuth2Credentials(config: EnvConfigV2): boolean {
  return !!(
    config.oauth2ClientId &&
    config.oauth2ClientSecret &&
    config.oauth2RedirectUri
  );
}

// OAuth 2.0 사용자 토큰 유효성 검사 함수
export function hasValidOAuth2UserTokens(config: EnvConfigV2): boolean {
  return !!(
    config.oauth2UserAccessToken &&
    config.oauth2RefreshToken
  );
}

// 인증 방식 결정 함수
export function getAuthenticationStrategy(config: EnvConfigV2): 'oauth' | 'bearer' | 'hybrid' {
  const hasOAuth = hasValidOAuthCredentials(config);
  const hasBearerToken = !!config.twitterBearerToken;
  
  if (config.enableOAuthAuthentication && hasOAuth) {
    return config.fallbackToBearerToken && hasBearerToken ? 'hybrid' : 'oauth';
  }
  
  if (hasBearerToken) {
    return 'bearer';
  }
  
  throw new Error('No valid authentication method available');
}

// 편의 함수들
export function getTtlTimestamp(daysFromNow: number): number {
  const now = new Date();
  now.setDate(now.getDate() + daysFromNow);
  return Math.floor(now.getTime() / 1000); // Unix timestamp
}

export function isDateInRange(dateStr: string, startDate: string): boolean {
  const date = new Date(dateStr);
  const start = new Date(startDate);
  return date >= start;
}

export function getDateRangeForRecentActivity(days: number = 7): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

// 점수 가중치 타입 정의
export type ScoreWeights = {
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  mentions: number;
};

// 환경변수에서 점수 가중치 가져오기
export function getScoreWeights(config: EnvConfigV2): ScoreWeights {
  return {
    likes: config.scoreWeightLikes,
    replies: config.scoreWeightReplies,
    reposts: config.scoreWeightReposts,
    quotes: config.scoreWeightQuotes,
    mentions: config.scoreWeightMentions,
  };
}

// 클린 네이밍을 위한 타입 alias
export type EnvConfig = EnvConfigV2;

// ============================================================
// 🆕 스냅샷 방식 데이터 수집 설정 (2025-10-12)
// ============================================================

/**
 * 스냅샷 수집 설정 (V3 - True Snapshot)
 *
 * 각 인게이지먼트 타입별로 "완숙 시점의 최종 상태"를 딱 한 번만 수집
 * - V1 (롤링 윈도우): 6일 룩백, 동일 데이터 6회 수집 → 100% API 사용
 * - V2 (스냅샷): 특정 날짜만 수집 → 17% API 사용 (83% 감소)
 * - V3 (True Snapshot): 수집 후 DB 마킹, 재수집 방지 → 완벽한 멱등성
 *
 * 개선점:
 * 1. Passive/Active 그룹화로 명확한 전략 구분
 * 2. DB 마킹 기반 중복 방지 (SnapshotTracker)
 * 3. 인게이지먼트 완숙 기간 기반 최적 타이밍
 */
export interface SnapshotConfigV3 {
  passive: {
    daysAgo: number;
    types: ('likes' | 'quotes' | 'retweets')[];
    reason: string;
  };
  active: {
    daysAgo: number;
    types: ('replies' | 'mentions')[];
    reason: string;
  };
}

/**
 * True Snapshot 수집 설정 (2025-10-13)
 *
 * X API 인게이지먼트 완숙 패턴 분석 결과:
 *
 * **Passive (누적형 지표)** - 3일 완숙:
 * - Likes:    70% in 24h, 90% in 48h, 95% in 72h
 * - Retweets: 60% in 24h, 85% in 48h, 93% in 72h
 * - Quotes:   40% in 24h, 65% in 48h, 80% in 72h (5일까지 90%)
 * → 3일 후 수집 시 평균 89% 포착, API 효율성 고려하여 3일 선택
 *
 * **Active (대화형 지표)** - 1일 완숙:
 * - Replies:  대부분 24시간 내 발생 (실시간 대화 특성)
 * - Mentions: 대부분 24시간 내 발생 (실시간 대화 특성)
 * → 1일 후 수집으로 대화 활성도 반영
 *
 * **API 절감 효과**:
 * - 롤링 윈도우: 같은 트윗 6회 수집 (100%)
 * - True Snapshot: 같은 트윗 1회 수집 (16.7%)
 * → 83.3% API 호출 감소
 */
export const SNAPSHOT_CONFIG: SnapshotConfigV3 = {
  passive: {
    daysAgo: 3,
    types: ['likes', 'quotes', 'retweets'],
    reason: "누적형 지표, 3일 경과 후 89-95% 포화 상태 (Quotes는 80%, API 효율성 고려)"
  },
  active: {
    daysAgo: 1,
    types: ['replies', 'mentions'],
    reason: "대화형 지표, 1일 경과 후 대부분 완료, 실시간성 중요"
  }
};

/**
 * N일 전의 특정 날짜에 작성된 트윗만 필터링하는 날짜 범위 생성
 *
 * @param daysAgo 며칠 전 (예: 3일 전 = 3)
 * @returns 해당 날짜의 시작/종료 시각 (ISO 8601)
 *
 * @example
 * // 현재: 2025-10-12 15:00:00 KST
 * getSnapshotDateRange(3)
 * // → { start: "2025-10-09T00:00:00.000Z", end: "2025-10-09T23:59:59.999Z" }
 *
 * @example
 * // 매일 파이프라인 실행 시:
 * // Day 1 (2025-10-12): 3일 전 (2025-10-09) 포스트 수집
 * // Day 2 (2025-10-13): 3일 전 (2025-10-10) 포스트 수집 (다른 날짜!)
 * // → 한 포스트는 딱 1번만 수집됨 ✅
 */
export function getSnapshotDateRange(daysAgo: number, baseDateStr?: string): { start: string; end: string } {
  const baseDate = baseDateStr ? new Date(baseDateStr) : new Date();
  
  const targetDate = new Date(baseDate);
  targetDate.setDate(targetDate.getDate() - daysAgo);

  // 해당 날짜의 00:00:00 (UTC)
  const start = new Date(targetDate);
  start.setUTCHours(0, 0, 0, 0);

  // 해당 날짜의 23:59:59.999 (UTC)
  const end = new Date(targetDate);
  end.setUTCHours(23, 59, 59, 999);

  console.log(`📅 [SNAPSHOT] ${daysAgo}일 전 날짜 범위 (기준: ${baseDate.toISOString()}): ${start.toISOString()} ~ ${end.toISOString()}`);

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

/**
 * 직전 N시간의 시간 범위 생성 (Mentions/Replies용)
 *
 * @param hoursAgo 몇 시간 전 (예: 24시간 = 어제)
 * @returns 시간 범위 (ISO 8601)
 *
 * @example
 * // 현재: 2025-10-12 15:00:00 KST
 * getRecentHoursRange(24)
 * // → { start: "2025-10-11T15:00:00.000Z", end: "2025-10-12T15:00:00.000Z" }
 *
 * @example
 * // 매일 파이프라인 실행 시:
 * // Day 1 (2025-10-12 09:00): 2025-10-11 09:00 ~ 2025-10-12 09:00 수집
 * // Day 2 (2025-10-13 09:00): 2025-10-12 09:00 ~ 2025-10-13 09:00 수집
 * // → 시간 범위가 겹치지 않음 ✅
 */
export function getRecentHoursRange(hoursAgo: number): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

  console.log(`⏰ [RECENT] 최근 ${hoursAgo}시간 범위: ${start.toISOString()} ~ ${now.toISOString()}`);

  return {
    start: start.toISOString(),
    end: now.toISOString()
  };
}
