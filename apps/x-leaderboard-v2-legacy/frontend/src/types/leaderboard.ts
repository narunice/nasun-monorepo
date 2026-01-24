// 기본 리더보드 엔트리 타입
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  finalScore: number;
  totalReplies: number;
  totalLikes: number;
  totalReposts: number;
  totalQuotes: number;
  totalMentions: number;  // 멘션 필드 추가
  totalActivities: number; // 총 활동 수
  firstActivity: string;   // 최초 활동일
  lastActivity: string;    // 최근 활동일 (기존 lastUpdated에서 변경)
  // 이벤트 기간별 정보 (해당 기간 조회시에만 포함)
  eventPeriodInfo?: {
    period: CumulativePeriod;
    periodScore: number;
    periodRank: number;
    periodStartDate?: string;
    periodEndDate?: string;
    isActive: boolean;         // 현재 진행 중인 이벤트인지
    progressPercentage?: number; // 이벤트 진행률
  };
  xUrl: string;
}

// 기간 타입 정의
export enum RankingPeriod {
  // 기존 동적 기간
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  ALL_TIME = 'all_time',
  // 추가 고정 기간
  PERIOD1 = 'period1',
  PERIOD2 = 'period2',
  PERIOD3 = 'period3',
  EVENT = 'event'
}

// V2 전용 기간 타입 정의 - 새로운 이벤트 기간 구조
export enum CumulativePeriod {
  CUMULATIVE = 'cumulative',  // 전체 누적
  EVENT1 = 'event1',          // 1차 이벤트
  EVENT2 = 'event2',          // 2차 이벤트
  EVENT3 = 'event3'           // 3차 이벤트
}



// 이벤트 기간 설정 인터페이스
export interface EventPeriodConfig {
  period: CumulativePeriod;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  progressPercentage?: number;
}



// 리더보드 쿼리 타입
export interface LeaderboardQuery {
  page: number;
  limit: number;
  period: RankingPeriod;
}

// 페이지네이션 타입
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// 메타데이터 타입 - V2 이벤트 기간 지원
export interface LeaderboardMetadata {
  totalUsers: number;
  systemVersion: "v2";
  dataStartDate: string;       // 데이터 시작일
  lastUpdated: string;
  description: string;
  // 이벤트 기간 메타데이터 추가
  period: "cumulative" | "event1" | "event2";
  periodName?: string;         // 이벤트 이름
  periodDescription?: string;  // 이벤트 설명
  periodStartDate?: string;    // 이벤트 시작일
  periodEndDate?: string;      // 이벤트 종료일
}

// 리더보드 데이터 타입
export interface LeaderboardData {
  entries: LeaderboardEntry[];
  pagination: Pagination;
  metadata: LeaderboardMetadata;
}

// API 응답 타입 - 이벤트 기간 지원
export interface ApiResponse {
  success: boolean;
  version: "v2";
  data: LeaderboardData;
  processingTimeMs: number;
  timestamp: string;
  message?: string;
}

// 순위 타입
export type RankPosition = 1 | 2 | 3 | number;

// 페이지 크기 타입
export type PageSize = 10 | 20 | 50 | 100;

// 정렬 가능한 컬럼 타입
export type SortableColumn = 'rank' | 'finalScore' | 'totalReplies' | 'totalLikes' | 'totalReposts' | 'totalQuotes';

// 에러 타입
export type LeaderboardError = 
  | { type: 'API_ERROR'; message: string; status?: number }
  | { type: 'NETWORK_ERROR'; message: string }
  | { type: 'VALIDATION_ERROR'; field: string; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string };

// 페이지네이션 범위 타입 (숫자 또는 "..." 문자열)
export type PaginationRange = (number | string)[];

// 인게이지먼트 타입
export interface EngagementStats {
  totalReplies: number;
  totalLikes: number;
  totalReposts: number;
  totalQuotes: number;
}

// 스코어 가중치 인터페이스 (v2.1 리트윗 보너스 업데이트)
export interface ScoreWeights {
  likes: number;      // 좋아요 점수 (1.0점)
  replies: number;    // 답글 점수 (2.5점)
  reposts: number;    // 리포스트 점수 (2.0점)
  quotes: number;     // 인용 점수 (3.0점)
  mentions: number;   // 멘션 점수 (2.5점)
  bookmarks: number;  // 북마크 점수 (3.5점) - 최고 가중치
  targetRetweet: number; // 타겟 리트윗 보너스 점수 (6.0점) - 브랜드 확산 기여 보상
  maxBonus?: number;  // 보너스 시스템 제거됨 (하위 호환성을 위해 옵셔널)
}

// ========== V2 누적 리더보드 전용 타입들 ==========

// V2 누적 리더보드 엔트리 타입
export interface CumulativeLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  followersCount?: number | null; // 팔로워 수 (🆕 추가)
  dominantLanguage?: string; // 감지된 주요 언어 (ISO 639-1: ko, en, ja, zh, unknown)
  isRegisteredMember?: boolean; // 🆕 NASUN 웹사이트에 X 계정 연동한 사용자
  isCommunityMember?: boolean; // 커뮤니티 멤버 (트위터 연동)
  finalScore: number;
  totalActivities: number; // 총 활동 수
  firstActivity: string; // 최초 활동일
  lastActivity: string; // 최근 활동일
  breakdown: {
    totalLikes: number;
    totalReplies: number;
    totalReposts: number;
    totalQuotes: number;
    totalMentions: number;


  };
  // 이벤트 기간별 정보 (해당 기간 조회시에만 포함)
  eventPeriodInfo?: {
    period: "event1" | "event2" | "cumulative";
    periodScore: number;
    periodRank: number;
    periodStartDate?: string;
    periodEndDate?: string;
    isActive: boolean; // 현재 진행 중인 이벤트인지
    progressPercentage?: number; // 이벤트 진행률
  };
  rankChange?: RankChangeData; // 🆕 Phase 3: 랭킹 변동 정보
  xUrl: string;
}

// V2 누적 리더보드 쿼리 타입
export interface CumulativeLeaderboardQuery {
  page: number;
  limit: number;
  period: CumulativePeriod;
  date?: string; // YYYY-MM-DD 형식 (선택사항)
}

// V2 누적 리더보드 메타데이터 타입
export interface CumulativeLeaderboardMetadata {
  totalUsers: number;
  systemVersion: string;
  dataStartDate: string;
  lastUpdated: string;
  period: string;
  periodStartDate: string;
  periodEndDate: string;
  periodDescription?: string;
  warningMessage?: string; // 스냅샷 데이터 없음 경고 메시지
  isEventEnded?: boolean;        // 🆕 이벤트 종료 여부
  isFinalRanking?: boolean;      // 🆕 최종 순위 여부
  finalRankingDate?: string;     // 🆕 최종 순위 날짜 (YYYY-MM-DD)
}

// V2 누적 리더보드 데이터 타입
export interface CumulativeLeaderboardData {
  entries: CumulativeLeaderboardEntry[];
  pagination: Pagination;
  metadata: CumulativeLeaderboardMetadata;
}

// 누적 리더보드 API 응답 타입
export interface CumulativeApiResponse {
  success: boolean;
  version: string;
  data: CumulativeLeaderboardData;
  processingTimeMs: number;
  timestamp: string;
}

// V2 누적 리더보드 에러 응답 타입
export interface CumulativeApiErrorResponse {
  success: false;
  error: string;
  code: string;
  processingTimeMs: number;
  timestamp: string;
}

// 리더보드 시스템 버전 타입 (V2 전용)
export enum LeaderboardVersion {
  V2 = 'v2'
}

// ========== Phase 1: User Rank Search Types ==========

// 랭킹 변동 방향
export type RankChangeDirection = 'up' | 'down' | 'same' | 'new';

// 랭킹 변동 데이터
export interface RankChangeData {
  direction: RankChangeDirection;
  amount: number;        // 순위 변동 크기 (up/down일 때)
  scoreChange: number;   // 점수 변동
}

// 사용자 랭킹 데이터
export interface UserRankData {
  username: string;
  rank: number;
  finalScore?: number; // Optional: API 응답에 따라 누락될 수 있음
  totalScore?: number; // 🔄 하위 호환성: 기존 API가 totalScore를 반환하는 경우 대비
  totalUsers: number;
  page: number;          // 해당 사용자가 있는 페이지 번호
  entry: CumulativeLeaderboardEntry; // 전체 리더보드 엔트리
  rankChange?: RankChangeData; // 랭킹 변동 (Phase 3)
}

// 사용자 랭킹 API 응답
export interface UserRankResponse {
  success: boolean;
  data?: UserRankData;
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

// 검색 결과 매치
export interface SearchMatch {
  username: string;
  rank: number;
  finalScore: number;
  totalScore?: number; // 🔄 하위 호환성: 기존 API가 totalScore를 반환하는 경우 대비
  displayName?: string;
  profileImageUrl?: string;
}

// 검색 결과 데이터
export interface SearchResultData {
  matches: SearchMatch[];
  exactMatch: SearchMatch | null;
  total: number;
}

// 검색 API 응답
export interface SearchResponse {
  success: boolean;
  data?: SearchResultData;
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

// 자동완성 API 응답 (Phase 3)
export interface AutocompleteResponse {
  success: boolean;
  data?: {
    suggestions: SearchMatch[];
    total: number;
  };
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

// 나의 랭킹 카드 상태
export type MyRankStatus =
  | 'no_twitter'      // Twitter 계정 미연동
  | 'not_ranked'      // 랭크 없음 (참여 안 함)
  | 'ranked'          // 정상 랭크됨
  | 'loading'         // 로딩 중
  | 'error';          // 에러 발생

// 나의 랭킹 카드 데이터
export interface MyRankCardData {
  status: MyRankStatus;
  userRank?: UserRankData;
  error?: string;
  isSnapshotMode?: boolean; // 스냅샷 모드 여부
}

// ========== Phase 3: Rank Changes Types ==========

// 개별 사용자의 랭킹 변동 정보
export interface RankChange {
  username: string;
  userId: string;
  currentRank: number;
  previousRank: number | null;
  rankChange: number; // 양수 = 상승, 음수 = 하락, 0 = 동일
  direction: RankChangeDirection;
  currentScore: number;
  previousScore: number | null;
  scoreChange: number;
}

// 랭킹 변동 요약 통계
export interface RankChangeSummary {
  new: number;   // 신규 진입
  up: number;    // 상승
  down: number;  // 하락
  same: number;  // 동일
}

// 랭킹 변동 데이터
export interface RankChangesData {
  period: CumulativePeriod;
  comparisonDate: string; // 비교 기준 날짜 (YYYY-MM-DD)
  changes: RankChange[];
  total: number;
  summary: RankChangeSummary;
}

// 랭킹 변동 API 응답
export interface RankChangesResponse {
  success: boolean;
  data?: RankChangesData;
  error?: string;
  code?: string;
  meta?: {
    apiVersion: string;
    duration: string;
    timestamp: string;
  };
}

// ========== Rank History Types (Phase 1-2 Backend, Phase 3 Frontend) ==========

// 랭킹 히스토리 엔트리
export interface RankHistoryEntry {
  pk: string;                    // USER#{userId}
  sk: string;                    // RANK_HISTORY#{period}#{date}
  userId: string;
  username: string;
  period: CumulativePeriod;
  date: string;                  // YYYY-MM-DD
  rank: number;
  finalScore?: number;           // 이전 버전 데이터의 경우 없을 수 있음
  totalScore?: number;           // 이전 버전 데이터의 경우 없을 수 있음
  totalLikes: number;
  totalReplies: number;
  totalReposts: number;
  totalQuotes: number;
  totalMentions: number;
  displayName?: string;
  profileImageUrl?: string;
  followersCount?: number;
  dominantLanguage?: string;
  ttl: number;
  lastUpdated: string;
}

// 랭킹 히스토리 통계
export interface RankHistoryStats {
  bestRank: number;              // 최고 순위 (숫자 작을수록 좋음)
  worstRank: number;             // 최저 순위
  averageRank: number;           // 평균 순위
  currentRank: number;           // 현재 순위
  totalDays: number;             // 전체 일수
  scoreIncrease: number;         // 점수 증가량
  rankImprovement: number;       // 순위 개선 (양수: 상승, 음수: 하락)
}

// 랭킹 히스토리 데이터
export interface RankHistoryData {
  history: RankHistoryEntry[];
  stats: RankHistoryStats;
}

// 랭킹 히스토리 API 응답
export interface RankHistoryResponse {
  success: boolean;
  data?: RankHistoryData;
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

// 날짜 범위 옵션 (프론트엔드 UI용)
export enum DateRangeOption {
  DAYS_7 = 7,
  DAYS_14 = 14,
  DAYS_30 = 30,
  DAYS_90 = 90,
  DAYS_365 = 365,
}

// 날짜 범위 레이블 매핑
export const DATE_RANGE_LABELS: Record<DateRangeOption, { ko: string; en: string }> = {
  [DateRangeOption.DAYS_7]: { ko: '7일', en: '7 days' },
  [DateRangeOption.DAYS_14]: { ko: '2주', en: '2 weeks' },
  [DateRangeOption.DAYS_30]: { ko: '4주', en: '4 weeks' },
  [DateRangeOption.DAYS_90]: { ko: '3개월', en: '3 months' },
  [DateRangeOption.DAYS_365]: { ko: '1년', en: '1 year' },
};

// ========== Top Climbers Spotlight Types ==========

/**
 * 순위 상승 분석 기간
 */
export type TimeRange = 'today' | '7d' | '4w' | '3m';

/**
 * 순위 상승자 개별 엔트리
 */
export interface TopClimberEntry {
  userId: string;
  username: string;
  displayName?: string;
  profileImageUrl?: string;
  currentRank: number;
  previousRank: number;
  rankImprovement: number;        // 순위 상승폭 (previousRank - currentRank)
  currentScore: number;
  previousScore: number;
  scoreIncrease: number;          // 점수 증가량 (절대값)
  percentageIncrease: number;     // 점수 증가율 (%)
  comparisonDate: string;         // 비교 기준 날짜 (YYYY-MM-DD)
  xUrl: string;                   // X 프로필 URL
}

/**
 * Top Climbers 데이터
 */
export interface TopClimbersData {
  period: CumulativePeriod;
  timeRange: TimeRange;
  comparisonDate: string;         // 비교 기준 날짜 (YYYY-MM-DD)
  climbers: TopClimberEntry[];    // 최대 5명
  metadata: {
    totalUsers: number;           // 전체 사용자 수
    totalClimbers: number;        // 순위 상승자 수 (improvement > 0)
    averageImprovement: number;   // 평균 순위 상승폭
  };
}

/**
 * Top Climbers API 응답
 */
export interface TopClimbersResponse {
  success: boolean;
  version: "v2";
  data?: TopClimbersData;
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

/**
 * TimeRange 레이블 매핑
 */
export const TIME_RANGE_LABELS: Record<TimeRange, { ko: string; en: string }> = {
  today: { ko: '오늘', en: 'Today' },
  '7d': { ko: '7일', en: '7D' },
  '4w': { ko: '4주', en: '4W' },
  '3m': { ko: '3개월', en: '3M' },
};

// Leaderboard Config API types
export type LeaderboardPeriodId = 'CUMULATIVE' | 'EVENT1' | 'EVENT2' | 'EVENT3';

export interface LeaderboardConfigItem {
  id: LeaderboardPeriodId;
  name: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
  visible: boolean;
}

export interface LeaderboardConfigResponse {
  success: boolean;
  data: {
    availableLeaderboards: LeaderboardConfigItem[];
  };
}

export interface LeaderboardErrorResponse {
  success: false;
  message: string;
  error?: string;
}

// Type alias for backward compatibility
export type LeaderboardPeriod = CumulativePeriod;