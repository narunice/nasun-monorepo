// V2 Snapshot Collection System - 멱등성 보장 추적 유틸리티

import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export interface SnapshotMetadata {
  tweetId: string;
  engagementType: 'likes' | 'quotes' | 'retweets' | 'replies';
  tweetCreatedAt: string;
  collectedAt: string;
  daysElapsed: number;
  engagementCount: number;
  collectionDate: string; // YYYY-MM-DD
}

export interface TwitterTweetWithStrategy {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  lang?: string;
  isReply?: boolean;
  collectionStrategies?: ('likes' | 'quotes' | 'retweets' | 'replies')[];
  [key: string]: any;
}

/**
 * SnapshotTracker - True Snapshot Collection의 핵심 멱등성 보장 클래스
 *
 * 역할:
 * 1. 각 트윗+인게이지먼트 타입 조합이 수집되었는지 추적
 * 2. 중복 수집 방지 (같은 트윗을 여러 번 수집하지 않음)
 * 3. 수집 메타데이터 저장 (언제, 얼마나 수집되었는지)
 *
 * 사용 시나리오:
 * - Day 1: 트윗 생성
 * - Day 4: 첫 수집 (3일 경과) → markAsCollected()
 * - Day 5+: isCollected() = true → 수집 건너뜀
 *
 * 저장 구조:
 * pk: SNAPSHOT#COLLECTED
 * sk: TWEET#<tweet_id>#<TYPE>
 *
 * 예시:
 * pk: SNAPSHOT#COLLECTED
 * sk: TWEET#1976194953291452749#LIKES
 * collectedAt: 2025-10-12T14:30:00.000Z
 * engagementCount: 14
 */
export class SnapshotTracker {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string, region: string = 'ap-northeast-2') {
    const dynamoClient = new DynamoDBClient({ region });
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = tableName;
  }

  /**
   * 특정 트윗+인게이지먼트 타입이 이미 수집되었는지 확인
   * @param tweetId 트윗 ID
   * @param engagementType 인게이지먼트 타입
   * @returns true = 이미 수집됨, false = 아직 미수집
   */
  async isCollected(
    tweetId: string,
    engagementType: 'likes' | 'quotes' | 'retweets' | 'replies'
  ): Promise<boolean> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: 'SNAPSHOT#COLLECTED',
          sk: `TWEET#${tweetId}#${engagementType.toUpperCase()}`
        }
      }));

      return !!result.Item;
    } catch (error) {
      console.error(`❌ [SnapshotTracker] isCollected 확인 실패 (${tweetId}, ${engagementType}):`, error);
      // 에러 발생 시 안전하게 false 반환 (재수집 허용)
      return false;
    }
  }

  /**
   * 트윗+인게이지먼트 타입을 수집 완료로 표시
   * @param tweetId 트윗 ID
   * @param engagementType 인게이지먼트 타입
   * @param metadata 수집 메타데이터
   */
  async markAsCollected(
    tweetId: string,
    engagementType: 'likes' | 'quotes' | 'retweets' | 'replies',
    metadata: {
      tweetCreatedAt: string;
      collectedAt: string;
      daysElapsed: number;
      engagementCount: number;
      collectionDate: string;
    }
  ): Promise<void> {
    try {
      await this.docClient.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: 'SNAPSHOT#COLLECTED',
          sk: `TWEET#${tweetId}#${engagementType.toUpperCase()}`,
          tweetId,
          engagementType: engagementType.toUpperCase(),
          tweetCreatedAt: metadata.tweetCreatedAt,
          collectedAt: metadata.collectedAt,
          daysElapsed: metadata.daysElapsed,
          engagementCount: metadata.engagementCount,
          collectionDate: metadata.collectionDate, // YYYY-MM-DD
          ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1년 후 자동 삭제
          version: '1.0'
        }
      }));

      console.log(`✅ [SnapshotTracker] 수집 완료 표시: ${tweetId} - ${engagementType.toUpperCase()} (${metadata.engagementCount}개)`);
    } catch (error) {
      console.error(`❌ [SnapshotTracker] markAsCollected 실패 (${tweetId}, ${engagementType}):`, error);
      // 마킹 실패는 치명적이지 않음 (다음 실행 시 재수집됨)
    }
  }

  /**
   * 여러 트윗 중 특정 인게이지먼트 타입이 아직 수집되지 않은 트윗만 필터링
   * @param tweets 전체 트윗 목록
   * @param engagementType 확인할 인게이지먼트 타입
   * @returns 아직 수집되지 않은 트윗 목록
   */
  async filterUncollectedTweets(
    tweets: TwitterTweetWithStrategy[],
    engagementType: 'likes' | 'quotes' | 'retweets' | 'replies'
  ): Promise<TwitterTweetWithStrategy[]> {
    if (tweets.length === 0) {
      return [];
    }

    console.log(`🔍 [SnapshotTracker] 미수집 트윗 필터링: ${tweets.length}개 트윗 (타입: ${engagementType})`);

    const uncollectedTweets: TwitterTweetWithStrategy[] = [];

    // 병렬 확인 (성능 최적화)
    const checkPromises = tweets.map(async (tweet) => {
      const isCollected = await this.isCollected(tweet.id, engagementType);
      return { tweet, isCollected };
    });

    const results = await Promise.all(checkPromises);

    for (const { tweet, isCollected } of results) {
      if (!isCollected) {
        uncollectedTweets.push(tweet);
      }
    }

    console.log(`✅ [SnapshotTracker] 미수집 트윗: ${uncollectedTweets.length}/${tweets.length}개 (${tweets.length - uncollectedTweets.length}개는 이미 수집됨)`);

    return uncollectedTweets;
  }

  /**
   * 특정 날짜에 수집된 모든 스냅샷 조회 (디버깅/모니터링용)
   * @param collectionDate YYYY-MM-DD 형식
   * @returns 해당 날짜에 수집된 모든 스냅샷 메타데이터
   */
  async getCollectionsByDate(collectionDate: string): Promise<SnapshotMetadata[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        FilterExpression: 'collectionDate = :date',
        ExpressionAttributeValues: {
          ':pk': 'SNAPSHOT#COLLECTED',
          ':date': collectionDate
        }
      }));

      return (result.Items || []).map(item => ({
        tweetId: item.tweetId,
        engagementType: item.engagementType.toLowerCase() as any,
        tweetCreatedAt: item.tweetCreatedAt,
        collectedAt: item.collectedAt,
        daysElapsed: item.daysElapsed,
        engagementCount: item.engagementCount,
        collectionDate: item.collectionDate
      }));
    } catch (error) {
      console.error(`❌ [SnapshotTracker] getCollectionsByDate 실패 (${collectionDate}):`, error);
      return [];
    }
  }

  /**
   * 수집 통계 조회 (모니터링용)
   * @returns 전체 수집 통계
   */
  async getCollectionStats(): Promise<{
    totalCollections: number;
    byType: Record<string, number>;
    latestCollection: string | null;
  }> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': 'SNAPSHOT#COLLECTED'
        }
      }));

      const items = result.Items || [];
      const byType: Record<string, number> = {};
      let latestTimestamp = 0;
      let latestCollection: string | null = null;

      for (const item of items) {
        const type = item.engagementType;
        byType[type] = (byType[type] || 0) + 1;

        const timestamp = new Date(item.collectedAt).getTime();
        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
          latestCollection = item.collectedAt;
        }
      }

      return {
        totalCollections: items.length,
        byType,
        latestCollection
      };
    } catch (error) {
      console.error('❌ [SnapshotTracker] getCollectionStats 실패:', error);
      return {
        totalCollections: 0,
        byType: {},
        latestCollection: null
      };
    }
  }
}
