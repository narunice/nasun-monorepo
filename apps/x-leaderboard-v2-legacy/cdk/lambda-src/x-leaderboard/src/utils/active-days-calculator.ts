/**
 * 누적 활동 일수(Active Days) 계산 유틸리티
 * 
 * 목적: 동점자 처리를 위한 보조 지표로 사용자의 장기적 참여도 측정
 * 기능: 최근 특정 기간 동안 최소 1회 이상 활동한 일수의 합계 계산
 * 
 * 활동 정의: 좋아요, 답글, 리포스트, 인용, 멘션 등 모든 인게이지먼트
 * 집계 방법: 일자별 unique 활동 일수 카운트 (하루에 10번 활동해도 1일로 계산)
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandOutput } from "@aws-sdk/lib-dynamodb";

export interface ActiveDaysConfig {
  /** 집계 기간 (일 단위) */
  periodDays: number;
  /** 활동 일수 가중치 (기본 1.0) */
  activeDaysWeight: number;
  /** 최소 활동 임계값 (하루에 최소 몇 개 활동 필요) */
  minActivitiesPerDay: number;
}

export interface ActiveDaysResult {
  /** 총 활동 일수 */
  totalActiveDays: number;
  /** 일별 활동 내역 */
  dailyActivities: Record<string, number>;
  /** 분석 기간 */
  analysisStartDate: string;
  /** 분석 종료일 */
  analysisEndDate: string;
  /** 총 활동 수 */
  totalActivities: number;
}

export class ActiveDaysCalculator {
  private docClient: DynamoDBDocumentClient;

  constructor(
    private ddbClient: DynamoDBClient,
    private tableName: string
  ) {
    this.docClient = DynamoDBDocumentClient.from(ddbClient);
  }

  /**
   * 사용자의 누적 활동 일수 계산
   * 
   * @param userId 사용자 ID
   * @param config 활동 일수 설정
   * @returns 활동 일수 분석 결과
   */
  async calculateActiveDays(
    userId: string, 
    config: ActiveDaysConfig
  ): Promise<ActiveDaysResult> {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - config.periodDays);

    console.log(`📅 사용자 ${userId} 활동 일수 분석 시작`, {
      기간: `${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`,
      집계일수: config.periodDays,
      최소활동임계값: config.minActivitiesPerDay
    });

    // 1. 기간 내 모든 활동 데이터 조회
    const activities = await this.getUserActivitiesInPeriod(userId, startDate, endDate);
    
    // 2. 일별 활동 집계
    const dailyActivities: Record<string, number> = {};
    
    for (const activity of activities) {
      const activityDate = new Date(activity.addedAt || activity.tweet_created_at);
      const dateKey = activityDate.toISOString().split('T')[0]; // YYYY-MM-DD 형식
      
      if (activityDate >= startDate && activityDate <= endDate) {
        dailyActivities[dateKey] = (dailyActivities[dateKey] || 0) + 1;
      }
    }

    // 3. 활동 일수 계산 (하루 최소 활동 임계값 적용)
    let totalActiveDays = 0;
    let totalActivities = 0;

    for (const [date, count] of Object.entries(dailyActivities)) {
      totalActivities += count;
      
      // 하루에 최소 임계값 이상 활동한 경우만 활동일로 인정
      if (count >= config.minActivitiesPerDay) {
        totalActiveDays++;
      }
    }

    console.log(`📊 활동 일수 분석 완료: ${userId}`, {
      총활동일수: totalActiveDays,
      총활동수: totalActivities,
      평균일일활동: totalActivities > 0 ? Math.round(totalActivities / Object.keys(dailyActivities).length * 100) / 100 : 0
    });

    return {
      totalActiveDays,
      dailyActivities,
      analysisStartDate: startDate.toISOString().split('T')[0],
      analysisEndDate: endDate.toISOString().split('T')[0],
      totalActivities
    };
  }

  /**
   * 특정 기간 내 사용자 활동 데이터 조회
   */
  private async getUserActivitiesInPeriod(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<any[]> {
    const allActivities: any[] = [];
    let lastEvaluatedKey;

    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();

    console.log(`🔍 활동 데이터 조회: USER#${userId}`, {
      시작일: startDateStr,
      종료일: endDateStr
    });

    do {
      const command: QueryCommand = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
        FilterExpression: "#added_at BETWEEN :startDate AND :endDate",
        ExpressionAttributeNames: {
          "#added_at": "added_at"
        },
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk_prefix": "RECENT#",
          ":startDate": startDateStr,
          ":endDate": endDateStr
        },
        ExclusiveStartKey: lastEvaluatedKey
      });

      const result: QueryCommandOutput = await this.docClient.send(command);
      
      if (result.Items) {
        allActivities.push(...result.Items);
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
      
      console.log(`📋 활동 데이터 진행 상황: ${allActivities.length}개 활동 수집됨`);
      
    } while (lastEvaluatedKey);

    console.log(`✅ 활동 데이터 조회 완료: ${allActivities.length}개 활동 발견`);

    return allActivities;
  }

  /**
   * 최근 7일간 활동 일수 계산
   *
   * @param userId - 사용자 ID
   * @returns 활동 일수 (0-7)
   */
  async getActiveDaysInLast7Days(userId: string): Promise<number> {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    console.log(`📅 [7-Day Activity Check] User: ${userId}, Period: ${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`);

    // 최근 7일간 활동 데이터 조회
    const activities = await this.getUserActivitiesInPeriod(userId, startDate, endDate);

    // 일별 활동 집계
    const dailyActivities: Record<string, number> = {};

    for (const activity of activities) {
      const activityDate = new Date(activity.added_at || activity.addedAt || activity.tweet_created_at);
      const dateKey = activityDate.toISOString().split('T')[0];

      if (activityDate >= startDate && activityDate <= endDate) {
        dailyActivities[dateKey] = (dailyActivities[dateKey] || 0) + 1;
      }
    }

    // 활동 일수 카운트 (하루에 1개 이상 활동한 날)
    const activeDays = Object.keys(dailyActivities).length;

    console.log(`✅ [7-Day Activity] User: ${userId}, Active Days: ${activeDays}/7`);

    return activeDays;
  }

  /**
   * 마지막 활동 이후 경과일 계산
   *
   * @param userId - 사용자 ID
   * @returns 마지막 활동 이후 경과일 (0-N)
   */
  async getDaysSinceLastActivity(userId: string): Promise<number> {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30); // 최근 30일 조회

    console.log(`🔍 [Last Activity Check] User: ${userId}`);

    // 최근 30일간 활동 데이터 조회
    const activities = await this.getUserActivitiesInPeriod(userId, startDate, now);

    if (activities.length === 0) {
      console.log(`⚠️ [No Recent Activity] User: ${userId} (30+ days)`);
      return 30; // 30일 이상 비활동으로 간주
    }

    // 가장 최근 활동 찾기
    const sortedActivities = activities
      .map(activity => new Date(activity.added_at || activity.addedAt || activity.tweet_created_at))
      .sort((a, b) => b.getTime() - a.getTime());

    const lastActivityDate = sortedActivities[0];
    const daysSince = Math.floor((now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`✅ [Last Activity] User: ${userId}, Days Since: ${daysSince} (${lastActivityDate.toISOString().split('T')[0]})`);

    return daysSince;
  }

  /**
   * 여러 사용자의 활동 일수를 배치로 계산
   * (성능 최적화를 위한 배치 처리)
   */
  async calculateActiveDaysBatch(
    userIds: string[],
    config: ActiveDaysConfig
  ): Promise<Record<string, ActiveDaysResult>> {
    console.log(`🔄 배치 활동 일수 계산 시작: ${userIds.length}명`);
    
    const results: Record<string, ActiveDaysResult> = {};
    
    // 병렬 처리로 성능 향상 (최대 5개씩 동시 처리)
    const batchSize = 5;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (userId) => {
        try {
          const result = await this.calculateActiveDays(userId, config);
          return { userId, result };
        } catch (error) {
          console.error(`❌ 활동 일수 계산 실패: ${userId}`, error);
          return { 
            userId, 
            result: { 
              totalActiveDays: 0, 
              dailyActivities: {}, 
              analysisStartDate: '', 
              analysisEndDate: '', 
              totalActivities: 0 
            } 
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const { userId, result } of batchResults) {
        results[userId] = result;
      }
      
      console.log(`📊 배치 진행 상황: ${Math.min(i + batchSize, userIds.length)}/${userIds.length}명 완료`);
    }
    
    console.log(`✅ 배치 활동 일수 계산 완료: ${userIds.length}명`);
    return results;
  }

  /**
   * 동점자 순위 결정을 위한 활동 일수 점수 계산
   */
  static calculateActiveDaysScore(
    activeDaysResult: ActiveDaysResult,
    config: ActiveDaysConfig
  ): number {
    // 활동 일수에 가중치 적용하여 보조 점수 생성
    // 예: 30일 중 20일 활동 = 20 * 1.0 = 20점
    const score = activeDaysResult.totalActiveDays * config.activeDaysWeight;

    console.log(`📈 활동 일수 점수 계산`, {
      활동일수: activeDaysResult.totalActiveDays,
      가중치: config.activeDaysWeight,
      최종점수: score
    });

    return Math.round(score * 100) / 100; // 소수점 둘째자리까지
  }

  /**
   * 7-Day Activity Bonus 계산 (Threshold=3)
   *
   * @param activeDaysLast7 - 최근 7일 중 활동 일수 (0-7)
   * @param config - 설정 (weightPerDay, threshold)
   * @returns 보너스 점수 (0-1.4점)
   */
  static calculateActivityBonus(
    activeDaysLast7: number,
    config: { weightPerDay: number; threshold: number }
  ): number {
    if (activeDaysLast7 < config.threshold) {
      return 0;
    }

    // Linear scaling: eligibleDays × weightPerDay
    const eligibleDays = activeDaysLast7 - config.threshold + 1;
    const bonus = eligibleDays * config.weightPerDay;

    console.log(`📈 [Activity Bonus]`, {
      activeDaysLast7,
      threshold: config.threshold,
      weightPerDay: config.weightPerDay,
      eligibleDays,
      bonus: Math.round(bonus * 10) / 10  // 소수점 첫째자리
    });

    return Math.round(bonus * 10) / 10; // 소수점 첫째자리 반올림
  }

  /**
   * Inactivity Penalty 계산
   *
   * @param daysSinceLastActivity - 마지막 활동 이후 경과일
   * @param config - 설정 (threshold, penaltyPerDay, maxPenalty)
   * @returns 감점 (음수, 0 to -maxPenalty)
   */
  static calculateInactivityPenalty(
    daysSinceLastActivity: number,
    config: { threshold: number; penaltyPerDay: number; maxPenalty: number }
  ): number {
    if (daysSinceLastActivity < config.threshold) {
      return 0;
    }

    const excessDays = daysSinceLastActivity - (config.threshold - 1);
    const penalty = excessDays * config.penaltyPerDay;
    const finalPenalty = -Math.min(penalty, config.maxPenalty);

    console.log(`📉 [Inactivity Penalty]`, {
      daysSinceLastActivity,
      threshold: config.threshold,
      penaltyPerDay: config.penaltyPerDay,
      maxPenalty: config.maxPenalty,
      excessDays,
      rawPenalty: -penalty,
      finalPenalty
    });

    return Math.round(finalPenalty * 10) / 10; // 소수점 첫째자리
  }
}

/**
 * 기본 활동 일수 설정
 */
export const DEFAULT_ACTIVE_DAYS_CONFIG: ActiveDaysConfig = {
  periodDays: 30,              // 최근 30일 집계
  activeDaysWeight: 1.0,       // 1일 = 1점
  minActivitiesPerDay: 1       // 하루 최소 1개 활동
};

/**
 * 동점자 처리용 확장 설정
 */
export const TIE_BREAKER_ACTIVE_DAYS_CONFIG: ActiveDaysConfig = {
  periodDays: 60,              // 최근 60일 집계 (더 장기적 관점)
  activeDaysWeight: 0.1,       // 1일 = 0.1점 (메인 점수 대비 낮은 가중치)
  minActivitiesPerDay: 1       // 하루 최소 1개 활동
};