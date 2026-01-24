// Step Functions 워크플로우 - 실패 처리: Dead-Letter 핸들러

import { Context } from "aws-lambda";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { HandleFailureInput } from "../../types/cumulative";
import { cloudWatchMetrics } from "../../services/cloudwatch-metrics";

const snsClient = new SNSClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Step Functions 실패 처리: 최종적으로 실패한 작업의 추적 및 알림
 * 
 * 역할:
 * 1. 실패한 트윗의 ID와 에러 내용을 CloudWatch에 에러 레벨 로그로 기록
 * 2. 운영팀이 즉시 인지할 수 있도록 SNS 토픽으로 알림 발송
 * 3. 실패한 작업의 상세 내용을 Dead-Letter DynamoDB 테이블에 저장
 */
export const handler = async (
  event: HandleFailureInput,
  context: Context
): Promise<{ handled: boolean; failureId: string }> => {
  const startTime = Date.now();
  const failureId = `${event.collectionDate}_${event.tweet?.id || 'unknown'}_${Date.now()}`;
  
  console.error("🚨 [DEAD_LETTER] 최종 실패 처리 시작");
  console.error("📡 실패 정보:", JSON.stringify({
    tweetId: event.tweet?.id,
    errorType: event.error.Error,
    retryCount: event.retryCount,
    collectionDate: event.collectionDate
  }, null, 2));

  try {
    const errorMessage = JSON.parse(event.error.Cause || '{}');
    const tweetId = event.tweet?.id || 'unknown';
    
    // 1. CloudWatch 에러 로그 기록
    console.error(`❌ [CRITICAL_FAILURE] 트윗 ${tweetId} 수집 최종 실패`);
    console.error(`🔍 [ERROR_DETAILS] 에러 타입: ${event.error.Error}`);
    console.error(`🔍 [ERROR_DETAILS] 에러 메시지: ${errorMessage.errorMessage || 'Unknown'}`);
    console.error(`🔍 [ERROR_DETAILS] 재시도 횟수: ${event.retryCount}`);
    console.error(`🔍 [ERROR_DETAILS] 수집 날짜: ${event.collectionDate}`);
    
    if (errorMessage.stackTrace) {
      console.error(`🔍 [STACK_TRACE]:`, errorMessage.stackTrace.join('\n'));
    }

    // 2. SNS 즉시 알림 발송
    const snsTopicArn = process.env.FAILURE_SNS_TOPIC_ARN;
    if (snsTopicArn) {
      const alertMessage = createCriticalAlert({
        tweetId,
        errorType: event.error.Error,
        errorMessage: errorMessage.errorMessage || 'Unknown error',
        retryCount: event.retryCount,
        collectionDate: event.collectionDate,
        failureId,
        timestamp: new Date().toISOString()
      });
      
      try {
        await snsClient.send(new PublishCommand({
          TopicArn: snsTopicArn,
          Subject: `🚨 [CRITICAL] 데이터 수집 최종 실패 - 트윗 ${tweetId}`,
          Message: alertMessage
        }));
        
        console.log(`📢 [SNS] Critical 알림 발송 완료 - Topic: ${snsTopicArn}`);
      } catch (snsError) {
        console.error(`❌ [SNS] 알림 발송 실패:`, snsError);
      }
    } else {
      console.warn(`⚠️ [SNS] FAILURE_SNS_TOPIC_ARN 환경변수가 설정되지 않음`);
    }

    // 3. Dead-Letter DynamoDB 테이블 저장
    const deadLetterTableName = process.env.DEAD_LETTER_TABLE_NAME;
    if (deadLetterTableName) {
      const failureRecord = {
        pk: `FAILED_COLLECTION#${event.collectionDate}`,
        sk: `TWEET#${tweetId}#${Date.now()}`,
        failureId,
        tweetId,
        tweetData: event.tweet ? {
          id: event.tweet.id,
          text: event.tweet.text?.substring(0, 200) || '', // 200자로 제한
          created_at: event.tweet.created_at,
          author_id: event.tweet.author_id
        } : null,
        errorDetails: {
          errorType: event.error.Error,
          errorMessage: errorMessage.errorMessage || 'Unknown error',
          stackTrace: errorMessage.stackTrace || [],
          originalCause: event.error.Cause
        },
        retryCount: event.retryCount,
        collectionDate: event.collectionDate,
        targetUser: event.targetUser ? {
          id: event.targetUser.id,
          username: event.targetUser.username
        } : null,
        failedAt: new Date().toISOString(),
        status: 'FAILED',
        requiresManualReview: true,
        ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90일 보존
      };
      
      try {
        await dynamoClient.send(new PutCommand({
          TableName: deadLetterTableName,
          Item: failureRecord
        }));
        
        console.log(`💾 [DEAD_LETTER_TABLE] 실패 기록 저장 완료 - ID: ${failureId}`);
      } catch (dbError) {
        console.error(`❌ [DEAD_LETTER_TABLE] 저장 실패:`, dbError);
      }
    } else {
      console.warn(`⚠️ [DEAD_LETTER_TABLE] DEAD_LETTER_TABLE_NAME 환경변수가 설정되지 않음`);
    }

    // CloudWatch 메트릭 기록
    const processingTime = Date.now() - startTime;
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/HandleFailure', 'FailureHandled', 1);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/HandleFailure', 'Duration', processingTime);
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/HandleFailure', 'CriticalFailures', 1);
    
    // 에러 타입별 메트릭
    if (event.error.Error === 'RateLimitError') {
      await cloudWatchMetrics.putMetric('NASUN/StepFunctions/HandleFailure', 'RateLimitFailures', 1);
    } else if (event.error.Error === 'TwitterAPIError') {
      await cloudWatchMetrics.putMetric('NASUN/StepFunctions/HandleFailure', 'TwitterAPIFailures', 1);
    }

    console.log(`✅ [DEAD_LETTER] 실패 처리 완료 - ID: ${failureId}, 시간: ${processingTime}ms`);
    
    return {
      handled: true,
      failureId
    };

  } catch (handlerError: any) {
    console.error(`❌ [DEAD_LETTER] 실패 처리 중 오류 발생:`, handlerError);
    
    // 실패 처리 자체가 실패한 경우에도 메트릭 기록
    await cloudWatchMetrics.putMetric('NASUN/StepFunctions/HandleFailure', 'HandlerError', 1);
    
    // 실패 처리가 실패해도 Step Functions 워크플로우는 계속 진행
    return {
      handled: false,
      failureId
    };
  }
};

/**
 * Critical 알림 메시지 생성
 */
function createCriticalAlert(details: {
  tweetId: string;
  errorType: string;
  errorMessage: string;
  retryCount: number;
  collectionDate: string;
  failureId: string;
  timestamp: string;
}): string {
  return `
🚨 NASUN 리더보드 데이터 수집 최종 실패

📊 실패 정보:
• 트윗 ID: ${details.tweetId}
• 에러 타입: ${details.errorType}
• 에러 메시지: ${details.errorMessage}
• 재시도 횟수: ${details.retryCount}
• 수집 날짜: ${details.collectionDate}
• 실패 ID: ${details.failureId}
• 발생 시각: ${details.timestamp}

🎯 필요한 조치:
1. Dead-Letter 테이블에서 실패 상세 정보 확인
2. 에러 원인 분석 및 해결
3. 필요 시 수동 재처리 실행

⚠️ 이 실패로 인해 해당 트윗의 인게이지먼트 데이터가 누락될 수 있습니다.
운영팀은 가능한 한 빠른 시일 내에 원인을 파악하고 조치해 주세요.

---
NASUN Data Collection System
Dead Letter Handler v2
  `.trim();
}

/**
 * 실패 패턴 분석을 위한 유틸리티 (추후 확장 가능)
 */
export function analyzeFailurePattern(errorType: string, errorMessage: string): {
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actionRequired: string;
} {
  if (errorType === 'RateLimitError') {
    return {
      category: 'RATE_LIMIT',
      severity: 'MEDIUM',
      actionRequired: 'API 호출 빈도 조정 검토 필요'
    };
  }
  
  if (errorType === 'TwitterAPIError') {
    return {
      category: 'API_ERROR',
      severity: 'HIGH',
      actionRequired: 'Twitter API 상태 확인 및 인증 검증 필요'
    };
  }
  
  if (errorType === 'DataValidationError') {
    return {
      category: 'DATA_VALIDATION',
      severity: 'LOW',
      actionRequired: '데이터 형식 검증 로직 검토 필요'
    };
  }
  
  return {
    category: 'UNKNOWN',
    severity: 'CRITICAL',
    actionRequired: '즉시 수동 조사 필요'
  };
}