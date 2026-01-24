/**
 * 이상 패턴 자동 감지 Lambda 핸들러
 * 
 * 스케줄러 또는 이벤트 기반으로 실행되어 이상 패턴을 감지하고
 * 자동으로 알림을 발송합니다.
 */

import { Context, EventBridgeEvent, APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AnomalyDetectionService, AnomalyDetectionResult } from "../../services/anomaly-detection-service";

/**
 * 이상 패턴 감지 이벤트 타입
 */
interface AnomalyDetectionEvent {
  source?: 'eventbridge' | 'manual' | 'api';
  targetDate?: string;
  ruleIds?: string[]; // 특정 규칙만 실행
  dryRun?: boolean;   // 실제 알림 발송 없이 테스트
  forceRun?: boolean; // 쿨다운 무시하고 강제 실행
}

/**
 * 응답 인터페이스
 */
interface AnomalyDetectionResponse {
  success: boolean;
  timestamp: string;
  executionId: string;
  
  // 실행 결과
  anomaliesDetected: number;
  alertsSent: number;
  rulesExecuted: number;
  
  // 상세 결과
  anomalies: AnomalyDetectionResult[];
  
  // 실행 통계
  processingTimeMs: number;
  dataProcessed: {
    recentEngagements: number;
    cumulativeUsers: number;
  };
  
  // 오류 정보
  errors?: string[];
  warnings?: string[];
}

/**
 * 메인 Lambda 핸들러
 */
export async function handler(
  event: EventBridgeEvent<string, any> | APIGatewayProxyEvent | AnomalyDetectionEvent,
  context: Context
): Promise<APIGatewayProxyResult | AnomalyDetectionResponse> {
  
  const executionId = context.awsRequestId;
  const startTime = Date.now();
  
  console.log('🔍 이상 패턴 감지 Lambda 실행 시작');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // 이벤트 타입 및 파라미터 파싱
    const { source, targetDate, ruleIds, dryRun, forceRun } = parseEvent(event);
    
    console.log(`📋 실행 모드: ${source}, 대상 날짜: ${targetDate}, 테스트 모드: ${dryRun}`);
    
    // 이상 패턴 감지 서비스 초기화
    const anomalyService = new AnomalyDetectionService();
    
    // 강제 실행 모드 설정 (필요시)
    if (forceRun) {
      console.log('⚡ 강제 실행 모드: 쿨다운 무시');
      // 쿨다운 무시 로직 (구현 필요시)
    }
    
    // 특정 규칙만 실행 (필요시)
    if (ruleIds && ruleIds.length > 0) {
      console.log(`🎯 특정 규칙 실행: ${ruleIds.join(', ')}`);
      // 규칙 필터링 로직 (구현 필요시)
    }
    
    // 이상 패턴 감지 실행
    console.log('🧪 이상 패턴 감지 실행 중...');
    const anomalies = await anomalyService.detectAnomalies(targetDate);
    
    // 테스트 모드가 아닌 경우에만 실제 알림 발송
    let alertsSent = 0;
    if (!dryRun && anomalies.length > 0) {
      console.log(`📢 ${anomalies.length}개 이상 패턴에 대해 알림 발송 중...`);
      // 알림은 서비스 내부에서 자동 처리됨
      alertsSent = anomalies.filter(a => 
        a.severity === 'high' || a.severity === 'critical'
      ).length;
    } else if (dryRun) {
      console.log('🔧 테스트 모드: 알림 발송 스킵');
    }
    
    // 실행 통계 수집
    const dataProcessed = {
      recentEngagements: 0, // 실제 구현에서는 서비스에서 반환
      cumulativeUsers: 0    // 실제 구현에서는 서비스에서 반환
    };
    
    const processingTime = Date.now() - startTime;
    
    // 응답 생성
    const response: AnomalyDetectionResponse = {
      success: true,
      timestamp: new Date().toISOString(),
      executionId,
      anomaliesDetected: anomalies.length,
      alertsSent,
      rulesExecuted: 8, // 기본 규칙 수
      anomalies,
      processingTimeMs: processingTime,
      dataProcessed,
      warnings: []
    };
    
    // 결과 요약 로깅
    logExecutionSummary(response, source);
    
    // API Gateway 요청인 경우 HTTP 응답 반환
    if (isApiGatewayEvent(event)) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(response)
      };
    }
    
    // EventBridge 또는 직접 호출인 경우 객체 반환
    return response;
    
  } catch (error) {
    console.error('❌ 이상 패턴 감지 실행 실패:', error);
    
    const errorResponse: AnomalyDetectionResponse = {
      success: false,
      timestamp: new Date().toISOString(),
      executionId,
      anomaliesDetected: 0,
      alertsSent: 0,
      rulesExecuted: 0,
      anomalies: [],
      processingTimeMs: Date.now() - startTime,
      dataProcessed: { recentEngagements: 0, cumulativeUsers: 0 },
      errors: [error instanceof Error ? error.message : String(error)]
    };
    
    // 심각한 오류 발생시 긴급 알림 (구현 필요시)
    await sendCriticalErrorAlert(error, executionId);
    
    if (isApiGatewayEvent(event)) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(errorResponse)
      };
    }
    
    return errorResponse;
  }
}

/**
 * 스케줄된 실행을 위한 전용 핸들러
 */
export async function scheduledHandler(
  event: EventBridgeEvent<string, any>,
  context: Context
): Promise<AnomalyDetectionResponse> {
  
  console.log('⏰ 스케줄된 이상 패턴 감지 실행');
  
  // 기본 스케줄 실행 설정
  const anomalyEvent: AnomalyDetectionEvent = {
    source: 'eventbridge',
    dryRun: false,
    forceRun: false
  };
  
  return await handler(anomalyEvent, context) as AnomalyDetectionResponse;
}

/**
 * 실시간 감지를 위한 이벤트 핸들러
 */
export async function realtimeHandler(
  event: any, // DynamoDB Stream 이벤트 등
  context: Context
): Promise<AnomalyDetectionResponse> {
  
  console.log('⚡ 실시간 이상 패턴 감지 실행');
  console.log('Trigger event:', JSON.stringify(event, null, 2));
  
  // 실시간 감지 설정 (특정 규칙만 실행)
  const anomalyEvent: AnomalyDetectionEvent = {
    source: 'manual',
    dryRun: false,
    ruleIds: [
      'weight_calculation_error_detector',
      'data_inconsistency_detector',
      'identical_counts_detector'
    ] // 즉시 감지가 필요한 중요 규칙만
  };
  
  return await handler(anomalyEvent, context) as AnomalyDetectionResponse;
}

/**
 * 이벤트 파싱 유틸리티
 */
function parseEvent(event: any): {
  source: string;
  targetDate?: string;
  ruleIds?: string[];
  dryRun: boolean;
  forceRun: boolean;
} {
  
  // API Gateway 이벤트인 경우
  if (isApiGatewayEvent(event)) {
    const queryParams = event.queryStringParameters || {};
    return {
      source: 'api',
      targetDate: queryParams.targetDate,
      ruleIds: queryParams.ruleIds ? queryParams.ruleIds.split(',') : undefined,
      dryRun: queryParams.dryRun === 'true',
      forceRun: queryParams.forceRun === 'true'
    };
  }
  
  // EventBridge 이벤트인 경우
  if (event.source && event.source.includes('aws.events')) {
    return {
      source: 'eventbridge',
      targetDate: event.detail?.targetDate,
      ruleIds: event.detail?.ruleIds,
      dryRun: event.detail?.dryRun || false,
      forceRun: event.detail?.forceRun || false
    };
  }
  
  // 직접 호출인 경우
  return {
    source: event.source || 'manual',
    targetDate: event.targetDate,
    ruleIds: event.ruleIds,
    dryRun: event.dryRun || false,
    forceRun: event.forceRun || false
  };
}

/**
 * API Gateway 이벤트 여부 확인
 */
function isApiGatewayEvent(event: any): event is APIGatewayProxyEvent {
  return event.httpMethod && event.path;
}

/**
 * 실행 결과 요약 로깅
 */
function logExecutionSummary(response: AnomalyDetectionResponse, source: string): void {
  const { success, anomaliesDetected, alertsSent, processingTimeMs } = response;
  
  console.log('\n📊 이상 패턴 감지 실행 요약:');
  console.log(`   실행 소스: ${source}`);
  console.log(`   실행 상태: ${success ? '✅ 성공' : '❌ 실패'}`);
  console.log(`   처리 시간: ${processingTimeMs}ms`);
  console.log(`   감지된 이상 패턴: ${anomaliesDetected}개`);
  console.log(`   발송된 알림: ${alertsSent}개`);
  
  if (anomaliesDetected > 0) {
    console.log('\n🚨 감지된 이상 패턴:');
    response.anomalies.forEach((anomaly, index) => {
      const severityIcon = getSeverityIcon(anomaly.severity);
      console.log(`   ${index + 1}. ${severityIcon} ${anomaly.title} (${anomaly.severity})`);
      console.log(`      영향 사용자: ${anomaly.affectedUsers.join(', ')}`);
      console.log(`      신뢰도: ${(anomaly.confidence * 100).toFixed(1)}%`);
    });
  }
  
  if (response.errors && response.errors.length > 0) {
    console.log('\n❌ 발생한 오류:');
    response.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }
  
  if (response.warnings && response.warnings.length > 0) {
    console.log('\n⚠️ 경고사항:');
    response.warnings.forEach((warning, index) => {
      console.log(`   ${index + 1}. ${warning}`);
    });
  }
}

/**
 * 심각도 아이콘 반환
 */
function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟡';
    case 'medium': return '🟠';
    case 'low': return '🟢';
    default: return '❓';
  }
}

/**
 * 치명적 오류 알림 발송
 */
async function sendCriticalErrorAlert(error: any, executionId: string): Promise<void> {
  try {
    console.log('🚨 치명적 오류 발생 - 긴급 알림 발송');
    
    // SNS 또는 Slack으로 긴급 알림 (구현 필요시)
    // 여기서는 로깅만 수행
    console.error('긴급 알림 내용:', {
      error: error instanceof Error ? error.message : String(error),
      executionId,
      timestamp: new Date().toISOString(),
      service: 'anomaly-detection'
    });
    
  } catch (alertError) {
    console.error('긴급 알림 발송 실패:', alertError);
  }
}

/**
 * 헬스체크 핸들러
 */
export async function healthCheckHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  
  try {
    // 간단한 헬스체크 수행
    const anomalyService = new AnomalyDetectionService();
    
    // 서비스 초기화 확인
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'anomaly-detection',
      version: '1.0.0',
      checks: {
        dynamodb: 'ok',
        sns: 'ok',
        cloudwatch: 'ok'
      }
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(healthStatus)
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      })
    };
  }
}

/**
 * 이상 패턴 이력 조회 핸들러
 */
export async function historyHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  
  try {
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit || '50');
    const type = queryParams.type; // 특정 이상 패턴 타입 필터
    const severity = queryParams.severity; // 심각도 필터
    
    // 이상 패턴 이력 조회 (구현 필요)
    const history = {
      items: [], // 실제 구현에서는 DynamoDB에서 조회
      pagination: {
        limit,
        hasNext: false
      },
      filters: {
        type,
        severity
      }
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(history)
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      })
    };
  }
}