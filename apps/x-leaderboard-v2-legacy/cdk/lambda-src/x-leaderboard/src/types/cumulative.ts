// V2 누적 점수 리더보드 타입 정의

import { TwitterTweet, TwitterUser } from "../services/twitter-api";

// === Step Functions 워크플로우 관련 타입 ===
export interface GetTargetTweetsInput {
  targetDate?: string;        // YYYY-MM-DD 형식 (선택사항)
  forceFullCollection?: boolean;  // 전체 재수집 여부
  testMode?: boolean;         // 테스트 모드
}

/**
 * 스냅샷 수집 전략 정보 (V3 - True Snapshot)
 *
 * Passive/Active 그룹화된 수집 전략:
 * - Passive (Likes/Quotes/Retweets): 3일 전 포스트 (완숙 후 1회 수집)
 * - Active (Replies/Mentions): 1일 전 포스트 (대화 완료 후 1회 수집)
 *
 * 변경사항 (V2 → V3):
 * - V2: likesAndRetweets(3일) + quotes(5일) 개별 관리
 * - V3: passive(3일) + active(1일) 그룹 관리
 * - 수집 후 DB 마킹으로 완벽한 멱등성 보장
 */
export interface SnapshotStrategyV3 {
  passive: {
    start: string;   // ISO 8601 timestamp
    end: string;     // ISO 8601 timestamp
    daysAgo: number; // 며칠 전 (예: 3)
    types: ('likes' | 'quotes' | 'retweets')[];
  };
  active: {
    start: string;   // ISO 8601 timestamp
    end: string;     // ISO 8601 timestamp
    daysAgo: number; // 며칠 전 (예: 1)
    types: ('replies' | 'mentions')[];
  };
}

// 하위 호환성을 위한 alias
export type SnapshotStrategy = SnapshotStrategyV3;

export interface GetTargetTweetsOutput {
  tweets: TwitterTweet[];
  targetUser: TwitterUser;
  dateRange: {
    start: string;
    end: string;
  };
  collectionDate: string;
  targetUserId: string;
  targetUsername: string;
  adaptiveWaitSeconds?: number;  // Phase 2A: 적응형 대기 시간 (초 단위)
  snapshotStrategy?: SnapshotStrategy;  // 🆕 스냅샷 전략 정보 (2025-10-12)
  targetTweetIds?: string[];  // 🆕 타겟 계정의 트윗 ID 목록 (중복 방지용, 2025-10-26)
}

export interface CollectEngagementsInput {
  tweet: TwitterTweet;
  targetUser: TwitterUser;
  dateRange: {
    start: string;
    end: string;
  };
  collectionDate: string;
}

export interface CollectEngagementsOutput {
  tweetId: string;
  engagements: EngagementData[];
  apiCallCount: number;
  processingTime: number;
  success: boolean;
  error?: string;
}

export interface CollectMentionsOutput {
  success: boolean;
  mentionCount: number;
  mentions: EngagementData[];
  apiCallCount: number;
  processingTime: number;
  error?: string;
  executedAt: string;
}

export interface AggregateResultsInput {
  [0]: CollectEngagementsOutput[]; // Branch A: 트윗별 인게이지먼트 수집 결과 배열
  [1]: CollectMentionsOutput;      // Branch B: 멘션 수집 결과
  collectionDate: string;          // 수집 날짜
}

export interface AggregateResultsOutput {
  success: boolean;
  collectionDate: string;
  tweetsProcessed: number;
  engagementsCollected: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    mentions: number;
    total: number;
  };
  collectedEngagements: EngagementData[];
  processingTime: string;
  nextSteps: string[];
  executedAt: string;
}

export interface HandleFailureInput {
  tweet?: TwitterTweet;
  error: {
    Error: string;
    Cause: string;
  };
  targetUser?: TwitterUser;
  collectionDate: string;
  retryCount: number;
}

// 다중 답글 3회 집계 관련 타입 추가
export interface ReplyCounterData {
  pk: string;                    // "REPLY_COUNTER#{targetTweetId}"
  sk: string;                    // "USER#{userId}"
  targetTweetId: string;         // 대상 포스트 ID
  userId: string;                // 답글 작성자 ID
  replyCount: number;            // 현재 답글 횟수 (1-3)
  firstReplyAt: string;          // 첫 답글 시간 (ISO string)
  lastReplyAt: string;           // 마지막 답글 시간 (ISO string)
  maxReachedAt?: string;         // 3회 도달 시간 (선택적)
  ttl: number;                   // TTL (환경변수로 설정)
  version: string;               // 버전 정보 "v2"
}

export interface ReplyEngagementData {
  pk: string;                    // "USER#{userId}"
  sk: string;                    // "REPLY#{targetTweetId}#{sequence}#{timestamp}"
  userId: string;                // 답글 작성자 ID
  username: string;              // 답글 작성자 사용자명
  targetTweetId: string;         // 대상 포스트 ID
  replyTweetId: string;          // 답글 트윗 ID
  replyText: string;             // 답글 내용 (500자 제한)
  sequence: number;              // 답글 순번 (1, 2, 3)
  shouldCount: boolean;          // 점수 집계 여부 (1-3번째만 true)
  conversationId: string;        // 대화 ID
  addedAt: string;               // 추가 시간 (ISO string)
  targetDate: string;            // 대상 날짜 (YYYY-MM-DD)
  ttl: number;                   // TTL (환경변수로 설정)
  version: string;               // 버전 정보 "v2"
}

export interface CumulativeScoreRecord {
  pk: string;                    // "USER#{userId}"
  sk: string;                    // "CUMULATIVE_SCORE"
  userId: string;
  username?: string;             // undefined 허용 (프로필 복구 대상)
  displayName?: string;         // 사용자의 실제 표시 이름 (예: "Overclocked 🛸")
  profileImageUrl?: string;     // 프로필 이미지 URL
  followersCount?: number;      // 팔로워 수
  followersCountUpdatedAt?: string; // 팔로워 수 마지막 업데이트 시간
  dominantLanguage?: string;    // 감지된 주요 언어 (ISO 639-1: ko, en, ja, zh, unknown)
  totalScore: number;           // 누적 총점
  totalLikes: number;           // 누적 좋아요
  totalReplies: number;         // 누적 답글
  totalReposts: number;         // 누적 리포스트
  totalQuotes: number;          // 누적 인용
  totalMentions: number;        // 누적 멘션
  // 이벤트 기간별 점수 필드 추가
  event1Score?: number;         // 1차 이벤트 기간 점수 (9/8-9/21)
  event2Score?: number;         // 2차 이벤트 기간 점수 (9/22-10/5)
  // 이벤트 기간별 랭킹 필드 추가  
  event1Rank?: number;          // 1차 이벤트 기간 랭킹
  event2Rank?: number;          // 2차 이벤트 기간 랭킹
  // 이벤트 기간별 활동 수 추가
  event1Activities?: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    mentions: number;
  };
  event2Activities?: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    mentions: number;
  };
  firstActivity: string;        // 최초 활동일 (ISO)
  lastUpdated: string;          // 마지막 업데이트 (ISO)
  version: "v2";                 // 버전 식별
}

// CumulativeUserScore 타입 별칭 (호환성 위해)
export type CumulativeUserScore = CumulativeScoreRecord;

export interface CumulativeLeaderboardEntry {
  pk: string;                    // "LEADERBOARD"
  sk: string;                    // "RANK#{rank:04d}#{timestamp}"
  rank: number;
  user_id: string;
  username: string;
  total_score: number;
  last_updated: string;
  version: "v2";
}

export interface RecentActivityRecord {
  pk: string;                    // "USER#{user_id}"
  sk: string;                    // "RECENT#{tweet_id}#{engagement_type}"
  tweet_id: string;
  engagement_type: "like" | "reply" | "repost" | "quote" | "mention";
  added_at: string;              // 활동이 추가된 시간
  tweet_created_at: string;      // 트윗 생성 시간
  score_value?: number;          // 북마크 점수 등 특별한 점수가 있는 경우
  ttl: number;                   // TTL (X API 수집 데이터는 365일)
}

// 이벤트 기간별 점수 스냅샷 (WeeklyScoreSnapshot 대체)
export interface EventPeriodScoreSnapshot {
  pk: string;                    // "USER#{user_id}"
  sk: string;                    // "EVENT_SCORE#{period}#{timestamp}"
  user_id: string;
  username: string;
  event_period: "event1" | "event2";  // 이벤트 기간 식별자
  period_score: number;          // 해당 이벤트 기간 점수
  period_activities: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    mentions: number;
  };
  period_start: string;          // 이벤트 기간 시작일 (YYYY-MM-DD)
  period_end: string;            // 이벤트 기간 종료일 (YYYY-MM-DD)
  calculated_at: string;         // 계산 시점 (ISO)
}

export interface CumulativeMetadata {
  pk: string;                    // "LEADERBOARD"
  sk: string;                    // "METADATA"
  total_users: number;
  leaderboard_entries: number;
  last_updated: string;
  system_version: "v2";
  data_start_date: string;       // 누적 시작일
  description: string;
}

// API 응답 타입 - 이벤트 기간 지원 추가
export interface CumulativeLeaderboardResponse {
  success: boolean;
  version: "v2";
  data: {
    entries: Array<{
      rank: number;
      userId: string;
      username: string;
      displayName: string;
      profileImageUrl: string;
      followersCount?: number;     // 팔로워 수
      dominantLanguage?: string;   // 감지된 주요 언어 (ISO 639-1)
      totalScore: number;          // 누적 총점 또는 이벤트 기간 점수
      totalActivities: number;     // 총 활동 수
      firstActivity: string;       // 최초 활동일
      lastActivity: string;        // 최근 활동일
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
        isActive: boolean;         // 현재 진행 중인 이벤트인지
        progressPercentage?: number; // 이벤트 진행률
      };
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
    };
  };
  processingTimeMs: number;
  timestamp: string;
  message?: string;
}

// 점수 계산용 인터페이스
export interface UserDelta {
  user_id: string;
  username: string;
  score_change: number;
  activity_changes: {
    likes: number;      // +1 또는 -1
    replies: number;
    reposts: number;
    quotes: number;
    mentions: number;
  };
}

export interface EngagementDelta {
  current: EngagementRecord[];
  previous: EngagementRecord[];
}

export interface EngagementRecord {
  tweet_id: string;
  user_id: string;
  username: string;
  engagement_type: "like" | "reply" | "repost" | "quote" | "mention";
  timestamp: string;
  collected_at: string;
  score_value?: number; // 북마크 점수 등 특별한 점수가 있는 경우
}

// 새로운 EngagementData 인터페이스 (TwitterApiService에서 사용)
export interface EngagementData {
  tweet_id: string;
  engagement_type: 'like' | 'repost' | 'quote' | 'reply' | 'mention';
  engaging_user_id: string;
  engaging_username?: string; // undefined 허용 (프로필 복구 대상)
  // 프로필 관련 필드들 - snake_case와 camelCase 둘 다 지원
  engaging_display_name?: string; // 사용자의 실제 표시 이름 (새 필드)
  engaging_displayName?: string; // 하위 호환용 (deprecated)
  engaging_profile_image_url?: string; // 프로필 이미지 URL (새 필드)
  engaging_profileImageUrl?: string; // 하위 호환용 (deprecated)
  engaging_followers_count?: number; // 팔로워 수 (새 필드)
  followersCount?: number; // 하위 호환용 (deprecated)
  engaging_tweet_lang?: string; // X API lang 필드 (ISO 639-1: ko, ja, en 등)
  tweet_created_at: string;
  added_at: string;
  score_value?: number; // 북마크 점수 (3.5점) 또는 기타 특별 점수
}

// 점수 가중치 타입 정의 (V2 시스템) - 5가지 인게이지먼트 타입 (사용자→타겟)
// ⚠️ 실제 점수 값은 환경변수(.env)에서 관리됩니다.
// 이 타입은 타입 안전성을 위한 정의이며, env.ts의 getScoreWeights()를 사용하세요.
export type ScoreWeights = {
  likes: number;       // 좋아요: 기본 1.0점
  replies: number;     // 답글 (멘션 형태): 기본 2.0점 - 타겟 포스트에 대한 답글
  reposts: number;     // 리포스트: 기본 2.0점
  quotes: number;      // 인용: 기본 3.0점
  mentions: number;    // 독립 멘션: 기본 2.5점 - 독립 포스트에서 타겟 계정 멘션
  // bookmark 제거됨 (X API로 조회 불가능)
};

// 멘션 점수 시스템 규칙 및 제한사항
export const MENTION_RULES = {
  dailyLimit: 3,           // 일일 멘션 제한: 3개
  baseScore: 2.5,          // 기본 점수: 2.5점 (2.3 → 2.5 상향 조정)
  cooldownHours: 4,        // 쿨다운: 4시간
  minContentLength: 20,    // 최소 콘텐츠 길이: 20자
  ttlDays: 365,           // TTL: 1년 (환경변수로 변경 예정)
  currentVersion: 'v2'     // 버전: v2
} as const;

// 인용 점수 시스템 규칙 및 제한사항
export const QUOTE_RULES = {
  dailyLimit: 5,              // 일일 인용 제한: 5개 (멘션보다 여유롭게)
  baseScore: 3.0,             // 기본 점수: 3.0점
  cooldownHours: 2,           // 쿨다운: 2시간 (멘션보다 짧게)
  minContentLength: 15,       // 최소 콘텐츠 길이: 15자 (멘션보다 짧게)
  ttlDays: 365,              // TTL: 1년
  currentVersion: 'v2'        // 버전: v2
} as const;

// 점수 계산을 위한 타입-안전한 함수
// ⚠️ weights 파라미터는 env.ts의 getScoreWeights(config)로 얻으세요
export function getEngagementScore(
  engagementType: keyof ScoreWeights,
  weights: ScoreWeights
): number {
  return weights[engagementType];
}

// 멘션 점수 계산 함수 (쿨다운 및 품질 고려)
export function calculateMentionScore(
  baseScore: number = MENTION_RULES.baseScore,
  qualityMultiplier: number = 1.0,
  cooldownBonus: number = 0
): number {
  const finalScore = baseScore * qualityMultiplier + cooldownBonus;
  return Math.round(finalScore * 10) / 10; // 소수점 첫째자리까지
}

// 인용 점수 계산 함수 (간단한 품질 평가)
export function calculateQuoteScore(
  baseScore: number = QUOTE_RULES.baseScore,
  qualityMultiplier: number = 1.0,
  cooldownBonus: number = 0
): number {
  const finalScore = (baseScore * qualityMultiplier) + cooldownBonus;
  return Math.round(finalScore * 10) / 10; // 소수점 첫째자리까지
}

// 멘션 쿨다운 보너스 계산 (간격이 길수록 보너스)
export function calculateMentionCooldownBonus(intervalHours: number): number {
  if (intervalHours >= 24) return 0.5;      // 24시간 이상: +0.5점 (최대 3.0점)
  if (intervalHours >= 12) return 0.4;      // 12시간 이상: +0.4점 (최대 2.9점)  
  if (intervalHours >= 8) return 0.3;       // 8시간 이상: +0.3점 (최대 2.8점)
  if (intervalHours >= MENTION_RULES.cooldownHours) return 0.1; // 최소 쿨다운: +0.1점 (최대 2.6점)
  return 0; // 쿨다운 미달: 보너스 없음
}

// 인용 쿨다운 보너스 계산 (최대 3.4점까지 가능)
export function calculateQuoteCooldownBonus(intervalHours: number): number {
  if (intervalHours >= 24) return 0.4;      // 24시간 이상: +0.4점 (최대 3.4점)
  if (intervalHours >= 12) return 0.3;      // 12시간 이상: +0.3점 (최대 3.3점)
  if (intervalHours >= 6) return 0.2;       // 6시간 이상: +0.2점 (최대 3.2점)
  if (intervalHours >= QUOTE_RULES.cooldownHours) return 0.0;  // 최소 쿨다운: 0점 (기본 3.0점)
  return 0.0; // 쿨다운 위반: 기본 점수 유지
}


// 쿨다운 보너스 계산 (하위 호환용, 멘션 쿨다운을 참조)
export function calculateCooldownBonus(intervalHours: number): number {
  return calculateMentionCooldownBonus(intervalHours);
}

// 전체 점수 분류 및 설명
export const ENGAGEMENT_SCORE_INFO = {
  likes: {
    score: 0.8,
    description: '좋아요',
    rationale: '기본적인 긍정적 반응'
  },
  replies: {
    score: 2.2,
    description: '답글',
    rationale: '적극적인 참여와 대화 참여'
  },
  reposts: {
    score: 2.0,
    description: '리포스트',
    rationale: '콘텐츠 공유 및 확산'
  },
  quotes: {
    score: 3.0,
    description: '인용',
    rationale: '의견 추가한 콘텐츠 공유'
  },
  mentions: {
    score: 2.3,
    description: '멘션',
    rationale: '타겟 계정을 언급한 트윗'
  }
} as const;