// MentionCounterService - 멘션 일일 3회 집계 관리 서비스
// 사용자별 멘션 횟수를 원자적으로 추적하고 일일 3회 제한 + 4시간 쿨다운을 적용

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { cloudWatchMetrics } from './cloudwatch-metrics';
import { createAuditLogger } from './audit-logger';
import { MENTION_RULES } from '../types/cumulative';

/**
 * 멘션 카운터 데이터 인터페이스
 */
export interface MentionCounterData {
  pk: string;                    // "MENTION_COUNTER#{userId}#{date}"
  sk: string;                    // "DAILY_TRACK"
  userId: string;                // 멘션 작성자 ID
  targetDate: string;            // 대상 날짜 (YYYY-MM-DD)
  mentionCount: number;          // 현재 멘션 횟수 (1-3)
  firstMentionAt: string;        // 첫 멘션 시간 (ISO string)
  lastMentionAt: string;         // 마지막 멘션 시간 (ISO string)
  maxReachedAt?: string;         // 3회 도달 시간 (선택적)
  ttl: number;                   // TTL (30일 후 자동 삭제)
  version: string;               // 버전 정보 "v2"
}

/**
 * 멘션 인게이지먼트 데이터 인터페이스
 */
export interface MentionEngagementData {
  pk: string;                    // "USER#{userId}"
  sk: string;                    // "MENTION#{tweetId}#{sequence}#{timestamp}"
  userId: string;                // 멘션 작성자 ID
  username: string;              // 멘션 작성자 사용자명
  tweetId: string;               // 멘션 트윗 ID
  tweetText: string;             // 멘션 트윗 내용 (500자 제한)
  mentionedUserId: string;       // 멘션된 사용자 ID (타겟)
  mentionedUsername: string;     // 멘션된 사용자명 (타겟)
  sequence: number;              // 멘션 순번 (1, 2, 3)
  shouldCount: boolean;          // 점수 집계 여부 (1-3번째만 true)
  addedAt: string;               // 추가 시간 (ISO string)
  targetDate: string;            // 대상 날짜 (YYYY-MM-DD)
  lastMentionInterval: number;   // 이전 멘션 간격 (시간)
  ttl: number;                   // TTL (30일 후 자동 삭제)
  version: string;               // 버전 정보 "v2"
}

/**
 * 멘션 카운터 결과 인터페이스
 */
export interface MentionCounterResult {
  success: boolean;              // 성공 여부
  currentCount: number;          // 현재 멘션 횟수
  sequence: number;              // 할당된 순번 (1, 2, 3)
  shouldCount: boolean;          // 점수 집계 여부
  maxReached: boolean;           // 3회 제한 도달 여부
  cooldownViolated: boolean;     // 쿨다운 위반 여부
  intervalHours: number;         // 이전 멘션 간격 (시간)
  message: string;               // 결과 메시지
}

/**
 * MentionCounterService 클래스
 * 사용자별 일일 멘션 횟수를 원자적으로 관리하고 3회 제한 + 4시간 쿨다운을 적용
 */
export class MentionCounterService {
  private readonly dynamoClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly auditLogger = createAuditLogger();

  constructor(tableName: string) {
    this.dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    this.tableName = tableName;
    
    console.log(`🏷️ [MENTION_COUNTER] MentionCounterService 초기화 완료 - 테이블: ${tableName}`);
  }

  /**
   * 멘션 추가 시도 - 원자적 카운터 증가 + 쿨다운 검증
   * @param userId 멘션 작성자 ID
   * @param username 멘션 작성자 사용자명
   * @param tweetId 멘션 트윗 ID
   * @param tweetText 멘션 트윗 내용
   * @param mentionedUserId 멘션된 사용자 ID (타겟)
   * @param mentionedUsername 멘션된 사용자명 (타겟)
   * @param targetDate 대상 날짜 (YYYY-MM-DD)
   * @returns MentionCounterResult
   */
  async incrementMentionCount(
    userId: string,
    username: string,
    tweetId: string,
    tweetText: string,
    mentionedUserId: string,
    mentionedUsername: string,
    targetDate: string
  ): Promise<MentionCounterResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🏷️ [MENTION_COUNTER] 멘션 카운터 증가 시도 - 사용자: ${userId}, 날짜: ${targetDate}`);
      
      // 1단계: 원자적 카운터 증가 + 쿨다운 검증 시도
      const counterResult = await this.atomicIncrementWithCooldown(userId, targetDate);
      
      if (!counterResult.success) {
        if (counterResult.maxReached) {
          console.log(`🚫 [MENTION_COUNTER] 일일 3회 제한 초과 - 사용자: ${userId}, 날짜: ${targetDate}`);
        } else if (counterResult.cooldownViolated) {
          console.log(`⏰ [MENTION_COUNTER] 쿨다운 위반 (${counterResult.intervalHours}시간) - 사용자: ${userId}`);
        }
        
        // 실패 메트릭 전송
        console.log(`📊 [METRICS] 멘션 카운터 제한 도달 메트릭 전송`);
        
        return counterResult;
      }
      
      // 2단계: 멘션 인게이지먼트 데이터 저장
      await this.saveMentionEngagement(
        userId,
        username,
        tweetId,
        tweetText,
        mentionedUserId,
        mentionedUsername,
        targetDate,
        counterResult.sequence,
        counterResult.intervalHours
      );
      
      // 성공 메트릭 전송
      console.log(`📊 [METRICS] 멘션 카운터 성공 메트릭 전송: 순번 ${counterResult.sequence}`);
      
      // 감사 로그 기록
      this.auditLogger.logMentionCounterOperation?.({
        operation: 'increment',
        userId,
        targetDate,
        sequence: counterResult.sequence,
        currentCount: counterResult.currentCount,
        intervalHours: counterResult.intervalHours,
        duration: Date.now() - startTime
      });
      
      console.log(`✅ [MENTION_COUNTER] 멘션 카운터 증가 성공 - 순번: ${counterResult.sequence}, 현재 횟수: ${counterResult.currentCount}, 간격: ${counterResult.intervalHours}시간`);
      
      return counterResult;
      
    } catch (error) {
      console.error(`❌ [MENTION_COUNTER] 멘션 카운터 증가 실패:`, error);
      
      // 실패 메트릭 전송
      console.log(`📊 [METRICS] 멘션 카운터 오류 메트릭 전송`);
      
      throw error;
    }
  }

  /**
   * 원자적 카운터 증가 + 쿨다운 검증 (Conditional Update 사용)
   * @param userId 멘션 작성자 ID
   * @param targetDate 대상 날짜 (YYYY-MM-DD)
   * @returns 카운터 결과
   */
  private async atomicIncrementWithCooldown(
    userId: string,
    targetDate: string
  ): Promise<MentionCounterResult> {
    const pk = `MENTION_COUNTER#${userId}#${targetDate}`;
    const sk = 'DAILY_TRACK';
    const now = new Date().toISOString();
    const nowTime = Date.now();
    const ttl = Math.floor(nowTime / 1000) + (MENTION_RULES.ttlDays * 24 * 60 * 60);
    
    try {
      // 첫 번째 멘션인 경우 새 레코드 생성
      try {
        const createParams = {
          TableName: this.tableName,
          Item: {
            pk,
            sk,
            userId,
            targetDate,
            mentionCount: 1,
            firstMentionAt: now,
            lastMentionAt: now,
            ttl,
            version: MENTION_RULES.currentVersion
          },
          ConditionExpression: 'attribute_not_exists(pk)'
        };
        
        await this.dynamoClient.send(new PutCommand(createParams));
        
        console.log(`🆕 [MENTION_COUNTER] 첫 멘션 레코드 생성 - PK: ${pk}`);
        return { 
          success: true, 
          currentCount: 1, 
          sequence: 1, 
          shouldCount: true,
          maxReached: false,
          cooldownViolated: false,
          intervalHours: 0,
          message: `첫 멘션 등록됨`
        };
        
      } catch (putError: any) {
        // ConditionalCheckFailedException은 이미 레코드가 존재함을 의미
        if (putError.name !== 'ConditionalCheckFailedException') {
          throw putError;
        }
      }
      
      // 기존 레코드가 있는 경우: 쿨다운 검증 + 카운터 증가 시도
      const existingRecord = await this.getExistingRecord(pk, sk);
      if (!existingRecord) {
        throw new Error('예상치 못한 오류: 레코드 조회 실패');
      }
      
      // 쿨다운 검증
      const lastMentionTime = new Date(existingRecord.lastMentionAt).getTime();
      const intervalMs = nowTime - lastMentionTime;
      const intervalHours = intervalMs / (1000 * 60 * 60);
      const cooldownHours = MENTION_RULES.cooldownHours;
      
      if (intervalHours < cooldownHours) {
        console.log(`⏰ [MENTION_COUNTER] 쿨다운 위반 - 필요: ${cooldownHours}시간, 경과: ${intervalHours.toFixed(1)}시간`);
        return {
          success: false,
          currentCount: existingRecord.mentionCount,
          sequence: 0,
          shouldCount: false,
          maxReached: false,
          cooldownViolated: true,
          intervalHours: Math.round(intervalHours * 10) / 10,
          message: `쿨다운 위반 (${cooldownHours}시간 필요, ${intervalHours.toFixed(1)}시간 경과)`
        };
      }
      
      // 카운터 증가 시도 (3회 제한 검증)
      const updateParams = {
        TableName: this.tableName,
        Key: { pk, sk },
        UpdateExpression: 'ADD mentionCount :inc SET lastMentionAt = :timestamp, #ttl = :ttl',
        ConditionExpression: 'mentionCount < :maxMentions',
        ExpressionAttributeNames: {
          '#ttl': 'ttl'
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':maxMentions': MENTION_RULES.dailyLimit,
          ':timestamp': now,
          ':ttl': ttl
        },
        ReturnValues: 'ALL_NEW' as const
      };
      
      const result = await this.dynamoClient.send(new UpdateCommand(updateParams));
      
      if (result.Attributes) {
        const newCount = result.Attributes.mentionCount as number;
        console.log(`🔄 [MENTION_COUNTER] 카운터 증가 성공 - 새 횟수: ${newCount}, 간격: ${intervalHours.toFixed(1)}시간`);
        
        return { 
          success: true, 
          currentCount: newCount, 
          sequence: newCount, 
          shouldCount: true,
          maxReached: false,
          cooldownViolated: false,
          intervalHours: Math.round(intervalHours * 10) / 10,
          message: `멘션 순번 ${newCount} 할당됨 (총 ${newCount}개)`
        };
      }
      
      throw new Error('UpdateCommand 결과가 예상과 다릅니다.');
      
    } catch (updateError: any) {
      // ConditionalCheckFailedException은 3회 제한 초과를 의미
      if (updateError.name === 'ConditionalCheckFailedException') {
        console.log(`🚫 [MENTION_COUNTER] 일일 3회 제한 도달 - PK: ${pk}`);
        
        // 3회 도달 시점 기록
        await this.markMaxReached(pk, sk);
        
        const existingRecord = await this.getExistingRecord(pk, sk);
        const intervalHours = existingRecord 
          ? (nowTime - new Date(existingRecord.lastMentionAt).getTime()) / (1000 * 60 * 60)
          : 0;
        
        return { 
          success: false, 
          currentCount: MENTION_RULES.dailyLimit, 
          sequence: 0,
          shouldCount: false,
          maxReached: true,
          cooldownViolated: false,
          intervalHours: Math.round(intervalHours * 10) / 10,
          message: `일일 ${MENTION_RULES.dailyLimit}회 멘션 제한에 도달했습니다.`
        };
      }
      
      throw updateError;
    }
  }

  /**
   * 기존 레코드 조회
   * @param pk Primary Key
   * @param sk Sort Key
   * @returns 기존 레코드 또는 null
   */
  private async getExistingRecord(pk: string, sk: string): Promise<MentionCounterData | null> {
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
        return result.Items[0] as MentionCounterData;
      }
      
      return null;
      
    } catch (error) {
      console.error(`❌ [MENTION_COUNTER] 기존 레코드 조회 실패:`, error);
      throw error;
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
      console.log(`📝 [MENTION_COUNTER] 3회 도달 시점 기록 완료 - PK: ${pk}`);
      
    } catch (error) {
      console.error(`❌ [MENTION_COUNTER] 3회 도달 시점 기록 실패:`, error);
      // 이 오류는 크리티컬하지 않으므로 throw하지 않음
    }
  }

  /**
   * 멘션 인게이지먼트 데이터 저장
   * @param userId 멘션 작성자 ID
   * @param username 멘션 작성자 사용자명
   * @param tweetId 멘션 트윗 ID
   * @param tweetText 멘션 트윗 내용
   * @param mentionedUserId 멘션된 사용자 ID (타겟)
   * @param mentionedUsername 멘션된 사용자명 (타겟)
   * @param targetDate 대상 날짜
   * @param sequence 멘션 순번
   * @param intervalHours 이전 멘션 간격 (시간)
   */
  private async saveMentionEngagement(
    userId: string,
    username: string,
    tweetId: string,
    tweetText: string,
    mentionedUserId: string,
    mentionedUsername: string,
    targetDate: string,
    sequence: number,
    intervalHours: number
  ): Promise<void> {
    const timestamp = Date.now();
    const ttl = Math.floor(timestamp / 1000) + (MENTION_RULES.ttlDays * 24 * 60 * 60);
    
    const engagementData: MentionEngagementData = {
      pk: `USER#${userId}`,
      sk: `MENTION#${tweetId}#${sequence}#${timestamp}`,
      userId,
      username,
      tweetId,
      tweetText: tweetText.substring(0, 500), // 500자 제한
      mentionedUserId,
      mentionedUsername,
      sequence,
      shouldCount: true, // 1-3번째 멘션은 모두 점수에 반영
      addedAt: new Date().toISOString(),
      targetDate,
      lastMentionInterval: Math.round(intervalHours * 10) / 10,
      ttl,
      version: MENTION_RULES.currentVersion
    };
    
    const putParams = {
      TableName: this.tableName,
      Item: engagementData
    };
    
    await this.dynamoClient.send(new PutCommand(putParams));
    
    console.log(`💾 [MENTION_COUNTER] 멘션 인게이지먼트 저장 완료 - 순번: ${sequence}, 트윗: ${tweetId}, 간격: ${intervalHours.toFixed(1)}시간`);
  }

  /**
   * 특정 사용자의 특정 날짜 멘션 횟수 조회
   * @param userId 사용자 ID
   * @param targetDate 대상 날짜 (YYYY-MM-DD)
   * @returns 현재 멘션 횟수 및 상태
   */
  async getMentionCount(
    userId: string,
    targetDate: string
  ): Promise<{ count: number; maxReached: boolean; firstMentionAt?: string; lastMentionAt?: string; nextAllowedAt?: string }> {
    const pk = `MENTION_COUNTER#${userId}#${targetDate}`;
    const sk = 'DAILY_TRACK';
    
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
        const item = result.Items[0] as MentionCounterData;
        
        // 다음 허용 시간 계산 (마지막 멘션 + 쿨다운)
        const lastMentionTime = new Date(item.lastMentionAt);
        const nextAllowedTime = new Date(lastMentionTime.getTime() + (MENTION_RULES.cooldownHours * 60 * 60 * 1000));
        
        return {
          count: item.mentionCount,
          maxReached: item.mentionCount >= MENTION_RULES.dailyLimit,
          firstMentionAt: item.firstMentionAt,
          lastMentionAt: item.lastMentionAt,
          nextAllowedAt: nextAllowedTime.toISOString()
        };
      }
      
      return { count: 0, maxReached: false };
      
    } catch (error) {
      console.error(`❌ [MENTION_COUNTER] 멘션 횟수 조회 실패:`, error);
      throw error;
    }
  }

  /**
   * 특정 날짜의 모든 사용자 멘션 통계 조회
   * @param targetDate 대상 날짜 (YYYY-MM-DD)
   * @returns 날짜별 멘션 통계
   */
  async getDailyMentionStats(targetDate: string): Promise<{
    totalUsers: number;
    totalMentions: number;
    maxReachedUsers: number;
    averageMentionsPerUser: number;
    cooldownViolations: number;
  }> {
    // 이 기능은 GSI(Global Secondary Index)가 필요할 수 있음
    // 현재는 기본 구현만 제공
    console.log(`📊 [MENTION_COUNTER] 일일 멘션 통계 조회 요청 - 날짜: ${targetDate}`);
    
    return {
      totalUsers: 0,
      totalMentions: 0,
      maxReachedUsers: 0,
      averageMentionsPerUser: 0,
      cooldownViolations: 0
    };
  }
}

// 기본 export
export default MentionCounterService;