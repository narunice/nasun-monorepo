export interface CumulativeScoreRecord {
  pk: string; // USER#{user_id}
  sk: string; // CUMULATIVE_SCORE
  userId: string;
  username: string;
  dominantLanguage?: string;
  totalScore: number;
  isCommunityMember?: boolean;
  totalLikes: number;
  totalReplies: number;
  totalReposts: number;
  totalQuotes: number;
  totalMentions: number;
  // 프로필 관련 필드 추가
  displayName?: string;
  profileImageUrl?: string;
  followersCount?: number;
  followersCountUpdatedAt?: string;
  isRegisteredMember?: boolean; // NASUN 웹사이트에 X 계정 연동한 사용자
  updatedAt?: string;
  firstActivity: string;
  lastUpdated: string;
  version: "v2";
}

export interface CumulativeLeaderboardData {
  period?: string;
  entries: CumulativeScoreRecord[];
  generated_at?: string;
  total_entries?: number;
  stats?: {
    topScore: number;
    averageScore: number;
    totalParticipants: number;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  metadata?: {
    totalUsers: number;
    systemVersion: string;
    dataStartDate: string;
    lastUpdated: string;
    description: string;
    period: LeaderboardPeriod;
    periodStartDate?: string;  // 이벤트 시작일 (환경변수 기반)
    periodEndDate?: string;    // 이벤트 종료일 (환경변수 기반)
    isEventEnded?: boolean;        // 🆕 이벤트 종료 여부
    isFinalRanking?: boolean;      // 🆕 최종 순위 여부
    finalRankingDate?: string;     // 🆕 최종 순위 날짜 (YYYY-MM-DD)
  };
}

export interface RecentActivityRecord {
  pk: string; // USER#{user_id}
  sk: string; // RECENT#{tweet_id}#{engagement_type}
  userId: string;
  tweetId: string;
  engagementType: "like" | "reply" | "repost" | "quote" | "mention";
  addedAt: string;
  tweetCreatedAt: string;
  scoreValue?: number; // 북마크 점수 등 특별한 점수가 있는 경우
}

export interface LeaderboardEntry {
  pk: string; // LEADERBOARD#{period}
  sk: string; // RANK#{rank:04d}#{timestamp}
  rank: number;
  userId: string;
  username: string;
  displayName?: string;
  profileImageUrl?: string;
  totalScore: number;
  totalLikes: number;
  totalReplies: number;
  totalReposts: number;
  totalQuotes: number;
  totalMentions: number;
  isRegisteredMember?: boolean; // NASUN 웹사이트에 X 계정 연동한 사용자
  lastUpdated: string;
  period: LeaderboardPeriod;
  periodStartDate: string;
  periodEndDate: string;
  periodDescription: string;
}

export interface LeaderboardMetadata {
  pk: string; // LEADERBOARD#{period}
  sk: string; // METADATA
  totalEntries: number;
  description: string;
  period: LeaderboardPeriod;
  periodStartDate: string;
  periodEndDate: string;
  lastUpdated: string;
  version: "v2";
}

export enum LeaderboardPeriod {
  CUMULATIVE = "CUMULATIVE", // 기존 ALL_TIME을 CUMULATIVE로 변경
  EVENT1 = "EVENT1",         // 1차 이벤트 기간 (9/8-9/21)
  EVENT2 = "EVENT2",         // 2차 이벤트 기간 (9/22-10/5)
  EVENT3 = "EVENT3"          // 3차 이벤트 기간 (12/11-12/30)
}

// 이벤트 기간 설정 타입
export interface EventPeriodConfig {
  period: LeaderboardPeriod;
  name: string;
  description: string;
  startDate: string; // 이벤트 시작일 (YYYY-MM-DD)
  endDate: string;   // 이벤트 종료일 (YYYY-MM-DD)
}

import { getEnvConfigV2 } from '../utils/env';

// 이벤트 기간 설정을 환경변수에서 동적으로 생성하는 함수
export function getEventPeriodConfigs(): Record<LeaderboardPeriod, EventPeriodConfig | null> {
  const config = getEnvConfigV2();
  
  return {
    [LeaderboardPeriod.CUMULATIVE]: null, // 누적은 전체 기간
    [LeaderboardPeriod.EVENT1]: {
      period: LeaderboardPeriod.EVENT1,
      name: "1차 이벤트",
      description: "1차 이벤트 기간 (환경변수 기반)",
      startDate: config.event1StartDate,
      endDate: config.event1EndDate
    },
    [LeaderboardPeriod.EVENT2]: {
      period: LeaderboardPeriod.EVENT2,
      name: "2차 이벤트",
      description: "2차 이벤트 기간 (환경변수 기반)",
      startDate: config.event2StartDate,
      endDate: config.event2EndDate
    },
    [LeaderboardPeriod.EVENT3]: {
      period: LeaderboardPeriod.EVENT3,
      name: "3차 이벤트",
      description: "3차 이벤트 기간 (환경변수 기반)",
      startDate: config.event3StartDate,
      endDate: config.event3EndDate
    }
  };
}

// 하위 호환성을 위한 상수 (deprecated - getEventPeriodConfigs() 함수 사용 권장)
export const EVENT_PERIOD_CONFIGS: Record<LeaderboardPeriod, EventPeriodConfig | null> = getEventPeriodConfigs();

// 이벤트 기간별 리더보드 엔트리 (기존 LeaderboardEntry 확장)
export interface EventPeriodLeaderboardEntry extends LeaderboardEntry {
  eventPeriodConfig?: EventPeriodConfig;
  isEventPeriod: boolean;
}

export interface UserPeriodScore {
  userId: string;
  username: string;
  totalScore: number;
  totalLikes: number;
  totalReplies: number;
  totalReposts: number;
  totalQuotes: number;
  totalMentions: number;
}

export interface LeaderboardGenerationResult {
  period: LeaderboardPeriod;
  entriesGenerated: number;
  topScore: number;
  description: string;
}

export interface DeltaChange {
  userId: string;
  username: string;
  scoreChange: number;
  likesChange: number;
  repliesChange: number;
  repostsChange: number;
  quotesChange: number;
  mentionsChange: number;
  activitiesAdded: RecentActivityRecord[];
  activitiesRemoved: RecentActivityRecord[];
}

export interface UserProfile {
  pk: string; // USER#{user_id}
  sk: string; // PROFILE
  userId: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  description?: string;
  publicMetrics?: {
    followersCount: number;
    followingCount: number;
    tweetCount: number;
    listedCount: number;
    likeCount: number;
  };
  createdAt?: string;
  lastUpdated: string;
}

export interface LeaderboardApiResponse {
  success: boolean;
  version: "v2";
  data: {
    entries: Array<{
      rank: number;
      userId: string;
      username: string;
      displayName?: string;
      profileImageUrl?: string;
      totalScore: number;
      totalLikes: number;
      totalReplies: number;
      totalReposts: number;
      totalQuotes: number;
      totalMentions: number;
      lastUpdated: string;
      xUrl: string;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    metadata: {
      totalUsers: number;
      systemVersion: string;
      dataStartDate: string;
      lastUpdated: string;
      period: string;
      periodStartDate: string;
      periodEndDate: string;
      periodDescription?: string;
      isEventEnded?: boolean;        // 🆕 이벤트 종료 여부
      isFinalRanking?: boolean;      // 🆕 최종 순위 여부
      finalRankingDate?: string;     // 🆕 최종 순위 날짜 (YYYY-MM-DD)
      scoreWeights: {
        likes: number;
        replies: number;
        reposts: number;
        quotes: number;
        mentions: number;
      };
    };
  };
  processingTimeMs: number;
  timestamp: string;
}

export interface LeaderboardApiErrorResponse {
  success: false;
  error: string;
  code: string;
  processingTimeMs: number;
  timestamp: string;
}

// ========== Phase 1: User Rank Search Types ==========

export interface RankChangeData {
  direction: 'up' | 'down' | 'same' | 'new';
  amount: number;
  scoreChange: number;
}

export interface UserRankData {
  username: string;
  rank: number;
  totalScore: number;
  totalUsers: number;
  page: number; // 해당 사용자가 있는 페이지 번호
  entry: LeaderboardEntry; // 전체 리더보드 엔트리
  rankChange?: RankChangeData; // 랭킹 변동 (Phase 3)
}

export interface UserRankResponse {
  success: boolean;
  data?: UserRankData;
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

export interface SearchMatch {
  username: string;
  rank: number;
  totalScore: number;
  displayName?: string;
  profileImageUrl?: string;
}

export interface SearchResultData {
  matches: SearchMatch[];
  exactMatch: SearchMatch | null;
  total: number;
}

export interface SearchResponse {
  success: boolean;
  data?: SearchResultData;
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

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

// ========== My Account Rank History Types ==========

/**
 * 사용자별 랭킹 히스토리 엔트리
 * DynamoDB에 사용자별 일자별 랭킹 기록을 저장
 */
export interface RankHistoryEntry {
  pk: string;                    // USER#{userId}
  sk: string;                    // RANK_HISTORY#{period}#{date}
  userId: string;                // 사용자 ID
  username: string;              // 사용자명
  period: LeaderboardPeriod;     // 리더보드 기간
  date: string;                  // YYYY-MM-DD
  rank: number;                  // 해당 날짜의 순위
  totalScore: number;            // 해당 날짜의 총점
  totalLikes: number;
  totalReplies: number;
  totalReposts: number;
  totalQuotes: number;
  totalMentions: number;
  displayName?: string;
  profileImageUrl?: string;
  followersCount?: number;
  dominantLanguage?: string;
  ttl: number;                   // 1년 후 자동 삭제
  lastUpdated: string;           // ISO 8601
}

/**
 * 랭킹 히스토리 조회 응답
 */
export interface RankHistoryResponse {
  success: boolean;
  data?: {
    history: RankHistoryEntry[];
    stats: {
      bestRank: number;
      worstRank: number;
      averageRank: number;
      currentRank: number;
      totalDays: number;
      scoreIncrease: number;      // 기간 내 점수 증가량
      rankImprovement: number;    // 기간 내 순위 개선 (음수면 하락)
    };
  };
  error?: string;
  code?: string;
  processingTimeMs: number;
  timestamp: string;
}

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
  period: LeaderboardPeriod;
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