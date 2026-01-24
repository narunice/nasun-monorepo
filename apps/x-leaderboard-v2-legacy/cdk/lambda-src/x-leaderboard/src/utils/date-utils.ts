// V2 리더보드 날짜 유틸리티 함수

import { LeaderboardPeriod, getEventPeriodConfigs } from "../types/leaderboard";

/**
 * 날짜 범위 필터링 인터페이스
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * 이벤트 기간에 따른 날짜 범위 반환
 */
export function getEventPeriodDateRange(period: LeaderboardPeriod): DateRange | null {
  const eventPeriodConfigs = getEventPeriodConfigs();
  const config = eventPeriodConfigs[period];
  
  if (!config) {
    // CUMULATIVE의 경우 전체 범위
    if (period === LeaderboardPeriod.CUMULATIVE) {
      return {
        start: new Date(require('../utils/env').getEnvConfigV2().systemStartDate), // 시스템 시작일
        end: new Date() // 현재까지
      };
    }
    return null;
  }

  return {
    start: new Date(config.startDate),
    end: new Date(config.endDate)
  };
}

/**
 * 특정 날짜가 이벤트 기간 범위에 포함되는지 확인
 */
export function isDateInEventPeriod(
  date: Date | string, 
  period: LeaderboardPeriod
): boolean {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const dateRange = getEventPeriodDateRange(period);
  
  if (!dateRange) {
    return false;
  }

  return targetDate >= dateRange.start && targetDate <= dateRange.end;
}

/**
 * 트윗 생성 날짜가 이벤트 기간에 포함되는지 확인
 * (인게이지먼트 데이터 기준으로 필터링)
 */
export function isTweetInEventPeriod(
  tweetCreatedAt: string,
  period: LeaderboardPeriod
): boolean {
  return isDateInEventPeriod(tweetCreatedAt, period);
}

/**
 * 현재 진행 중인 이벤트 기간 확인
 */
export function getCurrentActiveEventPeriod(): LeaderboardPeriod | null {
  const now = new Date();
  
  const eventPeriodConfigs = getEventPeriodConfigs();
  // Event1 체크 (9/8-9/21)
  const event1Config = eventPeriodConfigs[LeaderboardPeriod.EVENT1];
  if (event1Config) {
    const event1Start = new Date(event1Config.startDate);
    const event1End = new Date(event1Config.endDate);
    if (now >= event1Start && now <= event1End) {
      return LeaderboardPeriod.EVENT1;
    }
  }

  // Event2 체크 (9/22-10/5)
  const event2Config = eventPeriodConfigs[LeaderboardPeriod.EVENT2];
  if (event2Config) {
    const event2Start = new Date(event2Config.startDate);
    const event2End = new Date(event2Config.endDate);
    if (now >= event2Start && now <= event2End) {
      return LeaderboardPeriod.EVENT2;
    }
  }

  return null;
}

/**
 * 이벤트 기간 진행률 계산 (0-100%)
 */
export function getEventProgress(period: LeaderboardPeriod): number {
  const eventPeriodConfigs = getEventPeriodConfigs();
  const config = eventPeriodConfigs[period];
  if (!config || period === LeaderboardPeriod.CUMULATIVE) {
    return 100; // 누적은 항상 100%
  }

  const now = new Date();
  const start = new Date(config.startDate);
  const end = new Date(config.endDate);

  if (now < start) {
    return 0; // 아직 시작 안함
  }

  if (now > end) {
    return 100; // 이미 종료
  }

  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();

  return Math.round((elapsed / total) * 100);
}

/**
 * 이벤트 기간 상태 확인
 */
export function getEventStatus(period: LeaderboardPeriod): "upcoming" | "active" | "completed" {
  const eventPeriodConfigs = getEventPeriodConfigs();
  const config = eventPeriodConfigs[period];
  if (!config || period === LeaderboardPeriod.CUMULATIVE) {
    return "active"; // 누적은 항상 활성
  }

  const now = new Date();
  const start = new Date(config.startDate);
  const end = new Date(config.endDate);

  if (now < start) return "upcoming";
  if (now > end) return "completed";
  return "active";
}

/**
 * 이벤트 기간 표시용 문자열 생성
 */
export function getEventPeriodDisplayName(period: LeaderboardPeriod): string {
  const eventPeriodConfigs = getEventPeriodConfigs();
  const config = eventPeriodConfigs[period];
  
  if (period === LeaderboardPeriod.CUMULATIVE) {
    return "전체 누적";
  }

  if (!config) {
    return "알 수 없는 기간";
  }

  return config.name;
}

/**
 * 이벤트 기간 설명 문자열 생성
 */
export function getEventPeriodDescription(period: LeaderboardPeriod): string {
  const eventPeriodConfigs = getEventPeriodConfigs();
  const config = eventPeriodConfigs[period];
  
  if (period === LeaderboardPeriod.CUMULATIVE) {
    return "전체 기간의 누적 점수입니다.";
  }

  if (!config) {
    return "이벤트 기간 정보를 찾을 수 없습니다.";
  }

  return config.description;
}