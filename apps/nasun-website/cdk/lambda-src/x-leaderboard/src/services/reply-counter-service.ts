// ReplyCounterService - 다중 답글 3회 집계 관리 서비스
// 포스트별 사용자 답글 횟수를 원자적으로 추적하고 3회 제한을 적용

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { cloudWatchMetrics } from './cloudwatch-metrics';
import { createAuditLogger } from './audit-logger';
import { getEnvConfigV2 } from '../utils/env';

/**
 * 답글 카운터 데이터 인터페이스
 */
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

/**
 * 답글 인게이지먼트 데이터 인터페이스 (확장)
 */
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

/**
 * 답글 카운터 결과 인터페이스
 */
export interface ReplyCounterResult {
  success: boolean;              // 성공 여부
  currentCount: number;          // 현재 답글 횟수
  sequence: number;              // 할당된 순번 (1, 2, 3)
  shouldCount: boolean;          // 점수 집계 여부
  maxReached: boolean;           // 3회 제한 도달 여부
  message: string;               // 결과 메시지
}

/**
 * ReplyCounterService 클래스
 * 포스트별 사용자 답글 횟수를 원자적으로 관리하고 3회 제한을 적용
 */
export class ReplyCounterService {
  private readonly dynamoClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly auditLogger = createAuditLogger();
  private readonly envConfig = getEnvConfigV2();
  
  // 상수 정의
  private readonly MAX_REPLIES_PER_POST = 3;
  private readonly CURRENT_VERSION = 'v2';

  constructor(tableName: string) {
    this.dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    this.tableName = tableName;
    
    console.log(`🔢 [REPLY_COUNTER] ReplyCounterService 초기화 완료 - 테이블: ${tableName}`);
  }

  /**
   * 답글 추가 시도 - 원자적 카운터 증가
   * @param targetTweetId 대상 포스트 ID
   * @param userId 답글 작성자 ID
   * @param username 답글 작성자 사용자명
   * @param replyTweetId 답글 트윗 ID
   * @param replyText 답글 내용
   * @param conversationId 대화 ID
   * @param targetDate 대상 날짜
   * @returns ReplyCounterResult
   */
  async incrementReplyCount(
    targetTweetId: string,
    userId: string,
    username: string,
    replyTweetId: string,
    replyText: string,
    conversationId: string,
    targetDate: string
  ): Promise<ReplyCounterResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🔢 [REPLY_COUNTER] 답글 카운터 증가 시도 - 포스트: ${targetTweetId}, 사용자: ${userId}`);
      
      // 1단계: 원자적 카운터 증가 시도
      const counterResult = await this.atomicIncrementCounter(targetTweetId, userId);
      
      if (!counterResult.success) {
        console.log(`🚫 [REPLY_COUNTER] 3회 제한 초과 - 포스트: ${targetTweetId}, 사용자: ${userId}`);
        
        // 실패 메트릭 전송
        console.log(`📊 [METRICS] 답글 카운터 3회 제한 도달 메트릭 전송`);
        
        return {
          success: false,
          currentCount: this.MAX_REPLIES_PER_POST,
          sequence: 0,
          shouldCount: false,
          maxReached: true,
          message: `3회 답글 제한에 도달했습니다.`
        };
      }
      
      // 2단계: 답글 인게이지먼트 데이터 저장
      await this.saveReplyEngagement(
        targetTweetId,
        userId,
        username,
        replyTweetId,
        replyText,
        conversationId,
        targetDate,
        counterResult.sequence
      );
      
      // 성공 메트릭 전송 (CloudWatch 클라이언트 사용)
      console.log(`📊 [METRICS] 답글 카운터 성공 메트릭 전송: 순번 ${counterResult.sequence}`);
      
      // 감사 로그 기록
      this.auditLogger.logReplyCounterOperation({
        operation: 'increment',
        targetTweetId,
        userId,
        sequence: counterResult.sequence,
        currentCount: counterResult.currentCount,
        duration: Date.now() - startTime
      });
      
      console.log(`✅ [REPLY_COUNTER] 답글 카운터 증가 성공 - 순번: ${counterResult.sequence}, 현재 횟수: ${counterResult.currentCount}`);
      
      return {
        success: true,
        currentCount: counterResult.currentCount,
        sequence: counterResult.sequence,
        shouldCount: true, // 1-3번째 답글은 모두 점수에 반영
        maxReached: false,
        message: `답글 순번 ${counterResult.sequence} 할당됨 (총 ${counterResult.currentCount}개)`
      };
      
    } catch (error) {
      console.error(`❌ [REPLY_COUNTER] 답글 카운터 증가 실패:`, error);
      
      // 실패 메트릭 전송
      console.log(`📊 [METRICS] 답글 카운터 오류 메트릭 전송`);
      
      throw error;
    }
  }

  /**
   * 원자적 카운터 증가 (Conditional Update 사용)
   * @param targetTweetId 대상 포스트 ID
   * @param userId 답글 작성자 ID
   * @returns 카운터 결과
   */
  private async atomicIncrementCounter(
    targetTweetId: string,
    userId: string
  ): Promise<{ success: boolean; currentCount: number; sequence: number }> {
    const pk = `REPLY_COUNTER#${targetTweetId}`;
    const sk = `USER#${userId}`;
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (this.envConfig.replyCounterTtlDays * 24 * 60 * 60);
    
    try {
      // 첫 번째 답글인 경우 새 레코드 생성
      try {
        const createParams = {
          TableName: this.tableName,
          Item: {
            pk,
            sk,
            targetTweetId,
            userId,
            replyCount: 1,
            firstReplyAt: now,
            lastReplyAt: now,
            ttl,
            version: this.CURRENT_VERSION
          },
          ConditionExpression: 'attribute_not_exists(pk)'
        };
        
        await this.dynamoClient.send(new PutCommand(createParams));
        
        console.log(`🆕 [REPLY_COUNTER] 첫 답글 레코드 생성 - PK: ${pk}, SK: ${sk}`);
        return { success: true, currentCount: 1, sequence: 1 };
        
      } catch (putError: any) {
        // ConditionalCheckFailedException은 이미 레코드가 존재함을 의미
        if (putError.name !== 'ConditionalCheckFailedException') {
          throw putError;
        }
      }
      
      // 기존 레코드가 있는 경우 카운터 증가 시도
      const updateParams = {
        TableName: this.tableName,
        Key: { pk, sk },
        UpdateExpression: 'ADD replyCount :inc SET lastReplyAt = :timestamp, #ttl = :ttl',
        ConditionExpression: 'replyCount < :maxReplies',
        ExpressionAttributeNames: {
          '#ttl': 'ttl'
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':maxReplies': this.MAX_REPLIES_PER_POST,
          ':timestamp': now,
          ':ttl': ttl
        },
        ReturnValues: 'ALL_NEW' as const
      };
      
      const result = await this.dynamoClient.send(new UpdateCommand(updateParams));
      
      if (result.Attributes) {
        const newCount = result.Attributes.replyCount as number;
        console.log(`🔄 [REPLY_COUNTER] 카운터 증가 성공 - 새 횟수: ${newCount}`);
        return { success: true, currentCount: newCount, sequence: newCount };
      }
      
      throw new Error('UpdateCommand 결과가 예상과 다릅니다.');
      
    } catch (updateError: any) {
      // ConditionalCheckFailedException은 3회 제한 초과를 의미
      if (updateError.name === 'ConditionalCheckFailedException') {
        console.log(`🚫 [REPLY_COUNTER] 3회 제한 도달 - PK: ${pk}, SK: ${sk}`);
        
        // 3회 도달 시점 기록
        await this.markMaxReached(pk, sk);
        
        return { success: false, currentCount: this.MAX_REPLIES_PER_POST, sequence: 0 };
      }
      
      throw updateError;
    }
  }

  /**
   * 3회 제한 도달 시점 기록
   * @param pk Primary Key
   * @param sk Sort Key
   */
  private async markMaxReached(pk: string, sk: string): Promise<void> {
    try {
      const updateParams = {
        TableName: this.tableName,
        Key: { pk, sk },
        UpdateExpression: 'SET maxReachedAt = :timestamp',
        ExpressionAttributeValues: {
          ':timestamp': new Date().toISOString()
        }
      };
      
      await this.dynamoClient.send(new UpdateCommand(updateParams));
      console.log(`📝 [REPLY_COUNTER] 3회 도달 시점 기록 완료 - PK: ${pk}, SK: ${sk}`);
      
    } catch (error) {
      console.error(`❌ [REPLY_COUNTER] 3회 도달 시점 기록 실패:`, error);
      // 이 오류는 크리티컬하지 않으므로 throw하지 않음
    }
  }

  /**
   * 답글 인게이지먼트 데이터 저장
   * @param targetTweetId 대상 포스트 ID
   * @param userId 답글 작성자 ID
   * @param username 답글 작성자 사용자명
   * @param replyTweetId 답글 트윗 ID
   * @param replyText 답글 내용
   * @param conversationId 대화 ID
   * @param targetDate 대상 날짜
   * @param sequence 답글 순번
   */
  private async saveReplyEngagement(
    targetTweetId: string,
    userId: string,
    username: string,
    replyTweetId: string,
    replyText: string,
    conversationId: string,
    targetDate: string,
    sequence: number
  ): Promise<void> {
    const timestamp = Date.now();
    const ttl = Math.floor(timestamp / 1000) + (this.envConfig.replyCounterTtlDays * 24 * 60 * 60);
    
    const engagementData: ReplyEngagementData = {
      pk: `USER#${userId}`,
      sk: `REPLY#${targetTweetId}#${sequence}#${timestamp}`,
      userId,
      username,
      targetTweetId,
      replyTweetId,
      replyText: replyText.substring(0, 500), // 500자 제한
      sequence,
      shouldCount: true, // 1-3번째 답글은 모두 점수에 반영
      conversationId,
      addedAt: new Date().toISOString(),
      targetDate,
      ttl,
      version: this.CURRENT_VERSION
    };
    
    const putParams = {
      TableName: this.tableName,
      Item: engagementData
    };
    
    await this.dynamoClient.send(new PutCommand(putParams));
    
    console.log(`💾 [REPLY_COUNTER] 답글 인게이지먼트 저장 완료 - 순번: ${sequence}, 트윗: ${replyTweetId}`);
  }

  /**
   * 특정 사용자의 특정 포스트 답글 횟수 조회
   * @param targetTweetId 대상 포스트 ID
   * @param userId 사용자 ID
   * @returns 현재 답글 횟수 및 상태
   */
  async getReplyCount(
    targetTweetId: string,
    userId: string
  ): Promise<{ count: number; maxReached: boolean; firstReplyAt?: string; lastReplyAt?: string }> {
    const pk = `REPLY_COUNTER#${targetTweetId}`;
    const sk = `USER#${userId}`;
    
    try {
      const queryParams = {
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND sk = :sk',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':sk': sk
        }
      };
      
      const result = await this.dynamoClient.send(new QueryCommand(queryParams));
      
      if (result.Items && result.Items.length > 0) {
        const item = result.Items[0] as ReplyCounterData;
        return {
          count: item.replyCount,
          maxReached: item.replyCount >= this.MAX_REPLIES_PER_POST,
          firstReplyAt: item.firstReplyAt,
          lastReplyAt: item.lastReplyAt
        };
      }
      
      return { count: 0, maxReached: false };
      
    } catch (error) {
      console.error(`❌ [REPLY_COUNTER] 답글 횟수 조회 실패:`, error);
      throw error;
    }
  }

  /**
   * 특정 포스트의 모든 사용자 답글 통계 조회
   * @param targetTweetId 대상 포스트 ID
   * @returns 포스트별 답글 통계
   */
  async getPostReplyStats(targetTweetId: string): Promise<{
    totalUsers: number;
    totalReplies: number;
    maxReachedUsers: number;
    averageRepliesPerUser: number;
  }> {
    const pk = `REPLY_COUNTER#${targetTweetId}`;
    
    try {
      const queryParams = {
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk
        }
      };
      
      const result = await this.dynamoClient.send(new QueryCommand(queryParams));
      
      if (!result.Items || result.Items.length === 0) {
        return {
          totalUsers: 0,
          totalReplies: 0,
          maxReachedUsers: 0,
          averageRepliesPerUser: 0
        };
      }
      
      const items = result.Items as ReplyCounterData[];
      const totalUsers = items.length;
      const totalReplies = items.reduce((sum, item) => sum + item.replyCount, 0);
      const maxReachedUsers = items.filter(item => item.replyCount >= this.MAX_REPLIES_PER_POST).length;
      const averageRepliesPerUser = totalReplies / totalUsers;
      
      console.log(`📊 [REPLY_COUNTER] 포스트 ${targetTweetId} 통계 - 사용자: ${totalUsers}, 답글: ${totalReplies}, 3회 도달: ${maxReachedUsers}`);
      
      return {
        totalUsers,
        totalReplies,
        maxReachedUsers,
        averageRepliesPerUser
      };
      
    } catch (error) {
      console.error(`❌ [REPLY_COUNTER] 포스트 답글 통계 조회 실패:`, error);
      throw error;
    }
  }
}

// 기본 export
export default ReplyCounterService;