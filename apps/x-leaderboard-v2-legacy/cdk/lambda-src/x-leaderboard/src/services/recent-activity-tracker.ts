// V2 누적 점수 시스템 - 최근 활동 추적 서비스

import { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementData } from "../types/cumulative";

export interface ActivityTrackingResult {
  savedEngagements: number;
  replacedEngagements: number;
  deletedExpiredEngagements: number;
  errors: string[];
}

export class RecentActivityTracker {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(dynamoClient: DynamoDBDocumentClient, tableName: string) {
    this.dynamoClient = dynamoClient;
    this.tableName = tableName;
  }

  /**
   * 최근 수집된 인게이지먼트를 DynamoDB에 저장
   * @param engagements 저장할 인게이지먼트 데이터
   * @param collectionDate 수집 날짜 (YYYY-MM-DD) - 멱등성 보장용
   * @returns 저장 결과
   */
  async saveRecentActivity(engagements: EngagementData[], collectionDate: string): Promise<ActivityTrackingResult> {
    console.log(`📝 최근 활동 저장 시작 - ${engagements.length}개 인게이지먼트 (날짜: ${collectionDate})`);

    const result: ActivityTrackingResult = {
      savedEngagements: 0,
      replacedEngagements: 0,
      deletedExpiredEngagements: 0,
      errors: []
    };

    if (engagements.length === 0) {
      console.log("📝 저장할 인게이지먼트가 없습니다.");
      return result;
    }

    // ✅ FIX: Upsert 패턴으로 전환 (clearPreviousRecentActivity 제거)
    // - 동일 키(pk + sk) 존재 시 자동 덮어쓰기
    // - 신규 키는 추가
    // - 원자성 보장 (삭제 실패 시 데이터 손실 문제 해결)
    // 🆕 멱등성 보장: lastProcessedDate 필드 추가
    console.log(`💾 인게이지먼트 저장 중 (Upsert 모드 + 멱등성 보장)...`);
    const savedCount = await this.batchSaveEngagements(engagements, collectionDate);
    result.savedEngagements = savedCount;
    console.log(`✅ ${savedCount}개 레코드 저장/업데이트 완료 (lastProcessedDate: ${collectionDate})`);

    console.log(`🎉 최근 활동 추적 저장 완료 (Upsert + Idempotency):`);
    console.log(`  - 저장된 인게이지먼트: ${result.savedEngagements}개`);
    console.log(`  - ℹ️ 기존 레코드는 자동 덮어쓰기, 신규는 추가됨`);
    console.log(`  - 🔒 멱등성: lastProcessedDate=${collectionDate}로 중복 처리 방지`);

    return result;
  }

  /**
   * ❌ DEPRECATED: 기존의 모든 RECENT# 레코드 삭제 (사용 중지)
   *
   * 이 메서드는 점수 중복 누적 버그의 원인이었으므로 사용하지 않습니다.
   *
   * 문제점:
   * 1. 삭제 성공 후 저장 실패 시 모든 이전 기록 손실
   * 2. 다음 실행 시 "첫 실행"으로 오인하여 점수 중복 집계
   * 3. 원자성(Atomicity) 부재로 인한 데이터 정합성 문제
   *
   * 대체 방안:
   * - BatchWriteCommand의 PutRequest는 기본적으로 Upsert 동작
   * - 동일 키 존재 시 자동 덮어쓰기, 신규 키는 추가
   * - TTL 설정으로 오래된 데이터 자동 정리
   *
   * @deprecated 2025-10-08 - Upsert 패턴으로 전환
   */
  private async clearPreviousRecentActivity(): Promise<number> {
    console.warn("⚠️ [DEPRECATED] clearPreviousRecentActivity() 호출됨 - 이 메서드는 더 이상 사용되지 않습니다.");
    return 0;
  }

  /**
   * 인게이지먼트를 배치로 저장 (Upsert + TTL + Idempotency)
   * @param engagements 저장할 인게이지먼트 데이터
   * @param collectionDate 수집 날짜 (YYYY-MM-DD)
   */
  private async batchSaveEngagements(engagements: EngagementData[], collectionDate: string): Promise<number> {
    let savedCount = 0;

    try {
      // 🔧 중복 키 제거: pk + sk 조합의 유니크성 보장 (점수 계산기 내 중복 방지)
      const uniqueEngagements = engagements.filter((engagement, index, self) => {
        const uniqueKey = `USER#${engagement.engaging_user_id}|RECENT#${engagement.tweet_id}#${engagement.engagement_type}#${engagement.engaging_user_id}`;
        return index === self.findIndex(e =>
          `USER#${e.engaging_user_id}|RECENT#${e.tweet_id}#${e.engagement_type}#${e.engaging_user_id}` === uniqueKey
        );
      });

      if (uniqueEngagements.length !== engagements.length) {
        console.log(`🔧 [SCORE_CALC_DUPLICATE_FIX] 중복 제거: ${engagements.length} → ${uniqueEngagements.length} (${engagements.length - uniqueEngagements.length}개 중복 제거됨)`);
      }

      // ✅ TTL 계산: 7일 후 자동 삭제 (DeltaCalculator에서 7일 이내 데이터만 사용)
      const ttlInSeconds = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

      // 25개씩 배치 저장
      for (let i = 0; i < uniqueEngagements.length; i += 25) {
        const batch = uniqueEngagements.slice(i, i + 25);
        const putRequests = batch.map(engagement => ({
          PutRequest: {
            Item: {
              pk: `USER#${engagement.engaging_user_id}`,
              sk: `RECENT#${engagement.tweet_id}#${engagement.engagement_type}#${engagement.engaging_user_id}`,
              tweet_id: engagement.tweet_id,
              engagement_type: engagement.engagement_type,
              engaging_user_id: engagement.engaging_user_id,
              engaging_username: engagement.engaging_username,
              tweet_created_at: engagement.tweet_created_at,
              added_at: engagement.added_at,
              lastProcessedDate: collectionDate, // 🆕 멱등성: 마지막 처리 날짜
              ttl: ttlInSeconds, // ✅ TTL 추가: 7일 후 자동 삭제
              version: "1.0"
            }
          }
        }));

        await this.dynamoClient.send(new BatchWriteCommand({
          RequestItems: { [this.tableName]: putRequests }
        }));

        savedCount += batch.length;
        console.log(`  📦 배치 ${Math.floor(i / 25) + 1}: ${batch.length}개 저장완료 (lastProcessedDate: ${collectionDate}, TTL: 7일)`);

        // 배치 간 잠시 대기 (Write throttling 방지)
        if (i + 25 < engagements.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return savedCount;

    } catch (error) {
      console.error("❌ 인게이지먼트 배치 저장 실패:", error);
      throw error;
    }
  }


  /**
   * 현재 저장된 최근 활동 통계 조회
   */
  async getRecentActivityStats(): Promise<{
    totalRecords: number;
    recordsByType: Record<string, number>;
    oldestRecord: string | null;
    newestRecord: string | null;
  }> {
    try {
      let totalRecords = 0;
      const recordsByType: Record<string, number> = {};
      let oldestTimestamp: number = Number.MAX_SAFE_INTEGER;
      let newestTimestamp: number = 0;
      let lastEvaluatedKey: any = undefined;

      do {
        const scanResult = await this.dynamoClient.send(new ScanCommand({
          TableName: this.tableName,
          FilterExpression: "begins_with(sk, :sk_prefix)",
          ExpressionAttributeValues: {
            ":sk_prefix": "RECENT#"
          },
          ExclusiveStartKey: lastEvaluatedKey,
          ProjectionExpression: "engagement_type, added_at"
        }));

        if (scanResult.Items) {
          for (const item of scanResult.Items) {
            totalRecords++;
            
            const engagementType = item.engagement_type || 'unknown';
            recordsByType[engagementType] = (recordsByType[engagementType] || 0) + 1;

            if (item.added_at) {
              const timestamp = new Date(item.added_at).getTime();
              if (timestamp < oldestTimestamp) oldestTimestamp = timestamp;
              if (timestamp > newestTimestamp) newestTimestamp = timestamp;
            }
          }
        }

        lastEvaluatedKey = scanResult.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return {
        totalRecords,
        recordsByType,
        oldestRecord: oldestTimestamp !== Number.MAX_SAFE_INTEGER ? new Date(oldestTimestamp).toISOString() : null,
        newestRecord: newestTimestamp !== 0 ? new Date(newestTimestamp).toISOString() : null
      };

    } catch (error) {
      console.error("❌ 최근 활동 통계 조회 실패:", error);
      return {
        totalRecords: 0,
        recordsByType: {},
        oldestRecord: null,
        newestRecord: null
      };
    }
  }
}