// QuoteCounterService - 인용 일일 5회 집계 관리 서비스
// 사용자별 인용 횟수를 원자적으로 추적하고 일일 5회 제한 + 2시간 쿨다운을 적용

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { cloudWatchMetrics } from './cloudwatch-metrics';
import { createAuditLogger } from './audit-logger';
import { QUOTE_RULES, calculateQuoteScore, calculateQuoteCooldownBonus } from '../types/cumulative';
import { evaluateQuoteQuality } from '../utils/quote-quality-evaluator';

/**
 * 인용 카운터 데이터 인터페이스
 */
export interface QuoteCounterData {
  pk: string;                    // "QUOTE_COUNTER#{userId}#{date}"
  sk: string;                    // "DAILY_TRACK"
  userId: string;                // 인용 작성자 ID
  targetDate: string;            // 대상 날짜 (YYYY-MM-DD)
  quoteCount: number;            // 현재 인용 횟수 (1-5)
  firstQuoteAt: string;          // 첫 인용 시간 (ISO string)
  lastQuoteAt: string;           // 마지막 인용 시간 (ISO string)
  maxReachedAt?: string;         // 5회 도달 시간 (선택적)
  ttl: number;                   // TTL (365일 후 자동 삭제)
  version: string;               // 버전 정보 "v2"
}

/**
 * 인용 인게이지먼트 데이터 인터페이스
 */
export interface QuoteEngagementData {
  pk: string;                    // "USER#{userId}"
  sk: string;                    // "QUOTE#{quoteTweetId}#{sequence}#{timestamp}"
  userId: string;                // 인용 작성자 ID
  username: string;              // 인용 작성자 사용자명
  quoteTweetId: string;          // 인용 트윗 ID
  quoteTweetText: string;        // 인용 트윗 내용 (280자 제한)
  originalTweetId: string;       // 원본 트윗 ID
  originalTweetText: string;     // 원본 트윗 내용 (품질 평가용)
  sequence: number;              // 인용 순번 (1, 2, 3, 4, 5)
  shouldCount: boolean;          // 점수 집계 여부 (1-5번째만 true)
  qualityScore: number;          // 품질 점수 (0-1)
  finalScore: number;            // 최종 계산된 점수
  addedAt: string;               // 추가 시간 (ISO string)
  targetDate: string;            // 대상 날짜 (YYYY-MM-DD)
  lastQuoteInterval: number;     // 이전 인용 간격 (시간)
  ttl: number;                   // TTL (365일 후 자동 삭제)
  version: string;               // 버전 정보 "v2"
}

/**
 * 인용 카운터 결과 인터페이스
 */
export interface QuoteCounterResult {
  success: boolean;              // 성공 여부
  currentCount: number;          // 현재 인용 횟수
  sequence: number;              // 할당된 순번 (1, 2, 3, 4, 5)
  shouldCount: boolean;          // 점수 집계 여부
  maxReached: boolean;           // 5회 제한 도달 여부
  cooldownViolated: boolean;     // 쿨다운 위반 여부
  intervalHours: number;         // 이전 인용 간격 (시간)
  finalScore?: number;           // 최종 계산된 점수 (성공 시에만)
  message: string;               // 결과 메시지
}

/**
 * QuoteCounterService 클래스
 * 사용자별 일일 인용 횟수를 원자적으로 관리하고 5회 제한 + 2시간 쿨다운을 적용
 */
export class QuoteCounterService {
  private readonly dynamoClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly auditLogger = createAuditLogger();

  constructor(tableName: string) {
    this.dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    this.tableName = tableName;
    
    console.log(`💬 [QUOTE_COUNTER] QuoteCounterService 초기화 완료 - 테이블: ${tableName}`);
  }

  /**
   * 인용 추가 시도 - 원자적 카운터 증가 + 쿨다운 검증
   * @param userId 인용 작성자 ID
   * @param username 인용 작성자 사용자명
   * @param quoteTweetId 인용 트윗 ID
   * @param quoteTweetText 인용 트윗 내용
   * @param originalTweetId 원본 트윗 ID
   * @param originalTweetText 원본 트윗 내용
   * @param targetDate 대상 날짜 (YYYY-MM-DD)
   * @returns QuoteCounterResult
   */
  async incrementQuoteCount(
    userId: string,
    username: string,
    quoteTweetId: string,
    quoteTweetText: string,
    originalTweetId: string,
    originalTweetText: string,
    targetDate: string
  ): Promise<QuoteCounterResult> {
    const startTime = Date.now();
    
    try {
      console.log(`💬 [QUOTE_COUNTER] 인용 카운터 증가 시도 - 사용자: ${userId}, 날짜: ${targetDate}`);
      
      // 1. 쿨다운 및 일일 제한 검증
      const validationResult = await this.validateQuoteAttempt(userId, targetDate);
      
      if (!validationResult.success) {
        console.log(`🚫 [QUOTE_COUNTER] 인용 시도 실패: ${validationResult.message}`);
        
        // CloudWatch 메트릭 전송
        await cloudWatchMetrics.putMetric('NASUN/QuoteCounter', 'RejectedQuotes', 1);
        
        return {
          ...validationResult,
          currentCount: 0,
          sequence: 0,
          shouldCount: false,
          maxReached: false,
          cooldownViolated: true
        };
      }
      
      // 2. 원자적 카운터 증가
      const counterResult = await this.atomicIncrement(userId, targetDate);
      
      if (!counterResult.success) {
        console.log(`❌ [QUOTE_COUNTER] 원자적 증가 실패: ${counterResult.message}`);
        return {
          ...counterResult,
          shouldCount: false,
          maxReached: false,
          cooldownViolated: false,
          intervalHours: 0
        };
      }
      
      // 3. 품질 평가 및 점수 계산
      const qualityEvaluation = evaluateQuoteQuality(quoteTweetText);
      const finalScore = calculateQuoteScore(
        QUOTE_RULES.baseScore,
        qualityEvaluation.qualityScore,
        calculateQuoteCooldownBonus(validationResult.intervalHours)
      );
      
      // 4. 인용 인게이지먼트 데이터 저장
      const engagementResult = await this.saveQuoteEngagement(
        userId,
        username,
        quoteTweetId,
        quoteTweetText,
        originalTweetId,
        originalTweetText,
        counterResult.sequence,
        validationResult.intervalHours,
        targetDate
      );
      
      // 5. 최종 결과 생성
      const finalResult: QuoteCounterResult = {
        success: engagementResult.success,
        currentCount: counterResult.currentCount,
        sequence: counterResult.sequence,
        shouldCount: counterResult.sequence <= QUOTE_RULES.dailyLimit,
        maxReached: counterResult.currentCount >= QUOTE_RULES.dailyLimit,
        cooldownViolated: validationResult.intervalHours < QUOTE_RULES.cooldownHours,
        intervalHours: validationResult.intervalHours,
        finalScore: finalScore, // 계산된 품질 점수 추가
        message: engagementResult.success ? '인용 추가 성공' : engagementResult.message
      };
      
      // 6. 감사 로깅 및 메트릭
      // TODO: logQuoteCounter 메서드 구현 필요
      console.log(`📊 [AUDIT] Quote counter: ${userId} - ${counterResult.sequence}/5`);
      // await this.auditLogger.logQuoteCounter({
      //   userId,
      //   username,
      //   quoteTweetId,
      //   sequence: counterResult.sequence,
      //   shouldCount: finalResult.shouldCount,
      //   intervalHours: validationResult.intervalHours,
      //   targetDate,
      //   result: finalResult.success ? 'SUCCESS' : 'FAILED'
      // });
      
      // CloudWatch 메트릭
      if (finalResult.success) {
        await cloudWatchMetrics.putMetric('NASUN/QuoteCounter', 'AcceptedQuotes', 1);
        await cloudWatchMetrics.putMetric('NASUN/QuoteCounter', 'QuoteSequence', counterResult.sequence);
      }
      
      console.log(`✅ [QUOTE_COUNTER] 인용 처리 완료 - 순번: ${counterResult.sequence}, 점수반영: ${finalResult.shouldCount}`);
      console.log(`⏱️ [QUOTE_COUNTER] 처리 시간: ${Date.now() - startTime}ms`);
      
      return finalResult;
      
    } catch (error: any) {
      console.error(`❌ [QUOTE_COUNTER] 인용 카운터 오류:`, error);
      
      await cloudWatchMetrics.putMetric('NASUN/QuoteCounter', 'ProcessingErrors', 1);
      
      return {
        success: false,
        currentCount: 0,
        sequence: 0,
        shouldCount: false,
        maxReached: false,
        cooldownViolated: false,
        intervalHours: 0,
        message: `인용 처리 중 오류 발생: ${error.message}`
      };
    }
  }

  /**
   * 인용 시도 유효성 검증 (쿨다운 및 일일 제한)
   */
  private async validateQuoteAttempt(userId: string, targetDate: string): Promise<{
    success: boolean;
    intervalHours: number;
    message: string;
  }> {
    try {
      const pk = `QUOTE_COUNTER#${userId}#${targetDate}`;
      
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk
        }
      }));
      
      // 첫 인용인 경우
      if (!result.Items || result.Items.length === 0) {
        return {
          success: true,
          intervalHours: 24, // 첫 인용은 충분한 간격으로 간주
          message: '첫 인용 시도'
        };
      }
      
      const counterData = result.Items[0] as QuoteCounterData;
      
      // 일일 제한 확인
      if (counterData.quoteCount >= QUOTE_RULES.dailyLimit) {
        return {
          success: false,
          intervalHours: 0,
          message: `일일 인용 제한 초과 (${QUOTE_RULES.dailyLimit}회)`
        };
      }
      
      // 쿨다운 확인
      const lastQuoteTime = new Date(counterData.lastQuoteAt);
      const now = new Date();
      const intervalHours = (now.getTime() - lastQuoteTime.getTime()) / (1000 * 60 * 60);
      
      if (intervalHours < QUOTE_RULES.cooldownHours) {
        return {
          success: false,
          intervalHours: Math.round(intervalHours * 10) / 10,
          message: `쿨다운 시간 미달 (${QUOTE_RULES.cooldownHours}시간 필요, ${Math.round(intervalHours * 10) / 10}시간 경과)`
        };
      }
      
      return {
        success: true,
        intervalHours: Math.round(intervalHours * 10) / 10,
        message: '유효성 검증 통과'
      };
      
    } catch (error: any) {
      console.error(`❌ [QUOTE_COUNTER] 유효성 검증 오류:`, error);
      return {
        success: false,
        intervalHours: 0,
        message: `검증 중 오류: ${error.message}`
      };
    }
  }

  /**
   * 원자적 카운터 증가
   */
  private async atomicIncrement(userId: string, targetDate: string): Promise<{
    success: boolean;
    currentCount: number;
    sequence: number;
    message: string;
  }> {
    try {
      const pk = `QUOTE_COUNTER#${userId}#${targetDate}`;
      const sk = 'DAILY_TRACK';
      const now = new Date().toISOString();
      const ttl = Math.floor(Date.now() / 1000) + (QUOTE_RULES.ttlDays * 24 * 60 * 60);
      
      const result = await this.dynamoClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { pk, sk },
        UpdateExpression: `
          SET 
            userId = :userId,
            targetDate = :targetDate,
            lastQuoteAt = :now,
            quoteCount = if_not_exists(quoteCount, :zero) + :inc,
            firstQuoteAt = if_not_exists(firstQuoteAt, :now),
            version = :version,
            ttl = :ttl
        `,
        ExpressionAttributeValues: {
          ':userId': userId,
          ':targetDate': targetDate,
          ':now': now,
          ':zero': 0,
          ':inc': 1,
          ':version': QUOTE_RULES.currentVersion,
          ':ttl': ttl
        },
        ReturnValues: 'ALL_NEW'
      }));
      
      const updatedItem = result.Attributes as QuoteCounterData;
      
      // 5회 도달 시 maxReachedAt 업데이트
      if (updatedItem.quoteCount >= QUOTE_RULES.dailyLimit && !updatedItem.maxReachedAt) {
        await this.dynamoClient.send(new UpdateCommand({
          TableName: this.tableName,
          Key: { pk, sk },
          UpdateExpression: 'SET maxReachedAt = :now',
          ExpressionAttributeValues: {
            ':now': now
          }
        }));
      }
      
      return {
        success: true,
        currentCount: updatedItem.quoteCount,
        sequence: updatedItem.quoteCount,
        message: '원자적 증가 성공'
      };
      
    } catch (error: any) {
      console.error(`❌ [QUOTE_COUNTER] 원자적 증가 오류:`, error);
      return {
        success: false,
        currentCount: 0,
        sequence: 0,
        message: `원자적 증가 실패: ${error.message}`
      };
    }
  }

  /**
   * 인용 인게이지먼트 데이터 저장
   */
  private async saveQuoteEngagement(
    userId: string,
    username: string,
    quoteTweetId: string,
    quoteTweetText: string,
    originalTweetId: string,
    originalTweetText: string,
    sequence: number,
    intervalHours: number,
    targetDate: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const timestamp = new Date().toISOString();
      const pk = `USER#${userId}`;
      const sk = `QUOTE#${quoteTweetId}#${sequence}#${timestamp}`;
      const ttl = Math.floor(Date.now() / 1000) + (QUOTE_RULES.ttlDays * 24 * 60 * 60);
      
      // 간단한 품질 점수 계산 (스팸 검증 위주)
      const qualityResult = evaluateQuoteQuality(quoteTweetText, originalTweetText);
      const qualityScore = qualityResult.qualityScore;
      
      const engagementData: QuoteEngagementData = {
        pk,
        sk,
        userId,
        username,
        quoteTweetId,
        quoteTweetText: quoteTweetText, // 길이 제한 제거
        originalTweetId,
        originalTweetText: originalTweetText.substring(0, 280),
        sequence,
        shouldCount: sequence <= QUOTE_RULES.dailyLimit,
        qualityScore,
        finalScore: calculateQuoteScore(
          QUOTE_RULES.baseScore,
          qualityScore,
          calculateQuoteCooldownBonus(intervalHours)
        ), // 실제 점수 계산
        addedAt: timestamp,
        targetDate,
        lastQuoteInterval: intervalHours,
        ttl,
        version: QUOTE_RULES.currentVersion
      };
      
      await this.dynamoClient.send(new PutCommand({
        TableName: this.tableName,
        Item: engagementData,
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)' // 중복 방지
      }));
      
      console.log(`💾 [QUOTE_COUNTER] 인용 인게이지먼트 저장 완료 - ${sk}`);
      
      return {
        success: true,
        message: '인용 인게이지먼트 저장 완료'
      };
      
    } catch (error: any) {
      console.error(`❌ [QUOTE_COUNTER] 인용 인게이지먼트 저장 오류:`, error);
      
      return {
        success: false,
        message: `저장 실패: ${error.message}`
      };
    }
  }

  /**
   * 사용자의 특정 날짜 인용 현황 조회
   */
  async getQuoteStatus(userId: string, targetDate: string): Promise<QuoteCounterData | null> {
    try {
      const pk = `QUOTE_COUNTER#${userId}#${targetDate}`;
      
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk
        }
      }));
      
      if (!result.Items || result.Items.length === 0) {
        return null;
      }
      
      return result.Items[0] as QuoteCounterData;
      
    } catch (error: any) {
      console.error(`❌ [QUOTE_COUNTER] 인용 현황 조회 오류:`, error);
      return null;
    }
  }
}