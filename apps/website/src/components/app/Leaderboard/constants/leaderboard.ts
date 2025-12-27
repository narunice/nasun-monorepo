import { ScoreWeights, CumulativePeriod } from "../types/leaderboard";

// 기본 설정
export const LEADERBOARD_CONFIG = {
  DEFAULT_ITEMS_PER_PAGE: 50,
  PAGINATION_DELTA: 2,
  MAX_RETRIES: 3,
  CACHE_DURATION: 5 * 60 * 1000, // 5분
} as const;

// 점수 가중치 (v2.2 리트윗 보너스 업데이트 - 2025-09-12)
export const SCORE_WEIGHTS: ScoreWeights = {
  likes: 1.0, // 좋아요: 1점
  replies: 2.5, // 답글: 2.5점
  reposts: 2.0, // 리포스트(리트윗): 2점
  quotes: 3.0, // 인용 트윗: 3점
  mentions: 2.5, // 멘션: 2.5점
  bookmarks: 3.5, // 북마크: 3.5점 (최고 가중치)
  targetRetweet: 6.0, // 타겟 리트윗 보너스: 6점 (브랜드 확산 기여 보상)
  maxBonus: 0, // 보너스 시스템 제거됨
} as const;

// 순위별 색상
export const RANK_COLORS = {
  1: "bg-nasun-c1", // 금메달 (오렌지)
  2: "bg-nasun-c5/50", // 은메달 (진한 남색/50)
  3: "bg-nasun-c4", // 동메달 (노랑)
  default: "bg-nasun-c4",
} as const;

// 인게이지먼트 배지 스타일 (리트윗 보너스 추가)
export const ENGAGEMENT_BADGE_STYLES = {
  likes: {
    icon: "❤️",
    bgColor: "bg-nasun-scarlet/20 bg-nasun-scarlet/30",
    textColor: "text-nasun-scarlet",
  },
  replies: {
    icon: "💬",
    bgColor: "bg-nasun-c3/30 bg-nasun-c3/30",
    textColor: "text-nasun-c3",
  },
  reposts: {
    icon: "🔁",
    bgColor: "bg-nasun-c4/20 bg-nasun-c4/30",
    textColor: "text-nasun-c4",
  },
  quotes: {
    icon: "🗣️",
    bgColor: "bg-nasun-white/50 bg-nasun-black/50",
    textColor: "text-nasun-white",
  },
  mentions: {
    icon: "📢",
    bgColor: "bg-nasun-white/50 bg-nasun-black/50",
    textColor: "text-nasun-white",
  },
  bookmarks: {
    icon: "🔖",
    bgColor: "bg-nasun-white/50 bg-nasun-black/50",
    textColor: "text-nasun-white",
    description: "북마크 (3.5점) - 최고 가중치",
  },
  targetRetweet: {
    icon: "🏆",
    bgColor:
      "bg-gradient-to-br from-nasun-c1/30 to-nasun-c2/30 dark:from-nasun-c1/20 dark:to-nasun-c2/20",
    textColor: "text-nasun-white",
    description: "타겟 리트윗 보너스 (6.0점) - 브랜드 확산 기여 보상",
  },
} as const;

// API 설정
export const API_CONFIG = {
  TIMEOUT: 10000, // 10초
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 10,
} as const;

// 에러 메시지
export const ERROR_MESSAGES = {
  API_ENDPOINT_MISSING: "API endpoint or API Key not configured",
  FORBIDDEN: "Forbidden: Invalid API Key or usage plan issue.",
  NETWORK_ERROR: "Network error occurred. Please check your connection.",
  UNKNOWN_ERROR: "An unknown error occurred",
  NO_DATA: "No data available",
  INVALID_PAGE: "Invalid page number",
} as const;

// CSS 클래스명 상수
export const CSS_CLASSES = {
  CONTAINER: "container mx-auto px-4 py-20",
  TABLE_HEADER_BG: "bg-nasun-c3/80 ", // 통일된 리더보드 테이블 헤더 배경색
  TABLE_BODY_BG: "bg-black/90", // 통일된 리더보드 테이블 본문 배경색
  TABLE_BODY_DIVIDER: "divide-y divide-gray-600", // 테이블 행 구분선
  TABLE_HEADER: "px-6 py-3 text-left font-medium text-nasun-white uppercase ",
  TABLE_CELL: "px-6 py-2 md:py-3 whitespace-nowrap text-gray-100 ",
  HOVER_ROW: "hover:bg-nasun-c4/20",
  ERROR_CONTAINER:
    "bg-red-900 border border-red-400 border-red-600 text-red-200 px-4 py-3 rounded-lg",
  PAGINATION_BUTTON: "px-3 py-1 text-sm rounded-lg",
  PAGINATION_BUTTON_DISABLED: "disabled:opacity-50 disabled:cursor-not-allowed",
} as const;

// 페이지네이션 설정
export const PAGINATION_CONFIG = {
  DELTA: 2,
  FIRST_PAGE: 1,
  ELLIPSIS: "...",
} as const;

// ========== 누적 리더보드 전용 상수들 ==========

// 누적 리더보드 설정
export const CUMULATIVE_LEADERBOARD_CONFIG = {
  DEFAULT_ITEMS_PER_PAGE: 50,
  MAX_ITEMS_PER_PAGE: 100,
  CACHE_DURATION: 5 * 60 * 1000, // 5분
  API_TIMEOUT: 10000, // 10초
} as const;

// 누적 기간별 표시명 - 이벤트 기간 구조
// ⚠️ 이벤트 날짜는 백엔드 환경변수(EVENT1_START_DATE, EVENT1_END_DATE 등)에서 관리됨
// 프론트엔드 표시용 고정값 (실제 기간은 백엔드에서 동적으로 결정)
export const CUMULATIVE_PERIOD_NAMES = {
  [CumulativePeriod.CUMULATIVE]: "전체 누적",
  [CumulativePeriod.EVENT1]: "1차 이벤트",
  [CumulativePeriod.EVENT2]: "2차 이벤트",
} as const;

// 누적 기간별 설명 - 이벤트 기간 구조
// ⚠️ 실제 이벤트 날짜는 백엔드 환경변수로 관리되며, API 응답의 metadata에서 제공됨
export const CUMULATIVE_PERIOD_DESCRIPTIONS = {
  [CumulativePeriod.CUMULATIVE]: "서비스 시작일부터 현재까지 모든 활동의 누적 점수입니다",
  [CumulativePeriod.EVENT1]: "1차 이벤트 기간 동안의 활동 점수입니다 (백엔드 환경변수로 관리)",
  [CumulativePeriod.EVENT2]: "2차 이벤트 기간 동안의 활동 점수입니다 (백엔드 환경변수로 관리)",
} as const;

// 시스템 특징 설명 (타겟 리트윗 보너스 업데이트)
export const SYSTEM_FEATURES = {
  CUMULATIVE_SCORING: "누적 점수 시스템",
  DELTA_CALCULATION: "변화량 기반 계산",
  DAILY_UPDATE: "일 1회 업데이트",
  ENHANCED_METRICS: "타겟 리트윗 보너스 포함 7가지 메트릭",
  BOOKMARK_SCORING: "북마크 3.5점 (최고 가중치)",
  TARGET_RETWEET: "타겟 리트윗 보너스 6.0점 (브랜드 확산 기여)",
} as const;

// 시스템 특징
export const LEADERBOARD_FEATURES = {
  name: "누적 리더보드",
  description:
    "타겟 리트윗 보너스와 북마크 스코어링을 포함한 누적 점수와 변화량 기반 정교한 순위 시스템",
  features: [
    "누적 점수 시스템",
    "변화량 기반 계산",
    "일 1회 업데이트 (UTC 자정)",
    "타겟 리트윗 보너스 포함 7가지 메트릭",
    "타겟 리트윗 보너스 6.0점 (브랜드 확산 기여)",
    "북마크 3.5점 (최고 가중치)",
  ],
  color: "purple",
  icon: "🚀",
} as const;

// 리더보드 API 엔드포인트 설정
export const LEADERBOARD_API_CONFIG = {
  DEFAULT_ENDPOINT:
    "https://bumvhwfbj4.execute-api.ap-northeast-2.amazonaws.com/prod/api/leaderboard/cumulative",
  VERSION_HEADER: "v2",
  REQUIRED_HEADERS: ["x-api-key", "Content-Type"],
} as const;

// 점수 변화 표시 설정
export const SCORE_CHANGE_CONFIG = {
  POSITIVE_COLOR: "text-green-400",
  NEGATIVE_COLOR: "text-red-400",
  NEUTRAL_COLOR: "text-gray-400",
  ICONS: {
    UP: "↗️",
    DOWN: "↘️",
    SAME: "➡️",
    NEW: "✨",
  },
} as const;

// 차트 색상 팔레트 (점수 시각화용)
export const CHART_COLORS = {
  PRIMARY: "#6366f1", // indigo-500
  SECONDARY: "#8b5cf6", // violet-500
  SUCCESS: "#10b981", // emerald-500
  WARNING: "#f59e0b", // amber-500
  DANGER: "#ef4444", // red-500
  INFO: "#06b6d4", // cyan-500
  GRADIENTS: [
    "rgba(99, 102, 241, 0.8)",
    "rgba(139, 92, 246, 0.8)",
    "rgba(16, 185, 129, 0.8)",
    "rgba(245, 158, 11, 0.8)",
  ],
} as const;

// Note: Types are imported from '../types/leaderboard' but not re-exported
// Import types directly from the types file where needed
