/**
 * 데이터 품질 모니터링 대시보드 Lambda 핸들러
 * 
 * 주기적으로 실행되어 데이터 품질을 모니터링하고
 * 대시보드 데이터를 업데이트합니다.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DataQualityMonitor, DataQualityMetrics, DashboardWidget } from "../../services/data-quality-monitor";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const qualityMonitor = new DataQualityMonitor();

interface DashboardEvent {
  operation: 'generate' | 'get' | 'alert';
  targetDate?: string;
  alertThreshold?: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface DashboardResponse {
  success: boolean;
  timestamp: string;
  metrics?: DataQualityMetrics;
  widgets?: DashboardWidget[];
  report?: string;
  alerts?: any[];
  error?: string;
}

/**
 * 메인 Lambda 핸들러
 */
export async function handler(
  event: APIGatewayProxyEvent | DashboardEvent,
  context: Context
): Promise<APIGatewayProxyResult | DashboardResponse> {
  console.log('🎯 데이터 품질 대시보드 실행 시작');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // API Gateway 이벤트인지 직접 호출인지 판단
    const isApiGateway = 'httpMethod' in event;
    let operation: string;
    let targetDate: string | undefined;
    let alertThreshold: 'LOW' | 'MEDIUM' | 'HIGH' | undefined;

    if (isApiGateway) {
      const apiEvent = event as APIGatewayProxyEvent;
      operation = apiEvent.queryStringParameters?.operation || 'generate';
      targetDate = apiEvent.queryStringParameters?.targetDate;
      alertThreshold = apiEvent.queryStringParameters?.alertThreshold as any;
    } else {
      const dashboardEvent = event as DashboardEvent;
      operation = dashboardEvent.operation || 'generate';
      targetDate = dashboardEvent.targetDate;
      alertThreshold = dashboardEvent.alertThreshold;
    }

    let result: DashboardResponse;

    switch (operation) {
      case 'generate':
        result = await generateDashboard(targetDate);
        break;
      case 'get':
        result = await getDashboardData(targetDate);
        break;
      case 'alert':
        result = await getAlerts(alertThreshold);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    if (isApiGateway) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: JSON.stringify(result)
      };
    } else {
      return result;
    }

  } catch (error) {
    console.error('❌ 데이터 품질 대시보드 실행 실패:', error);
    
    const errorResult: DashboardResponse = {
      success: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };

    if ('httpMethod' in event) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(errorResult)
      };
    } else {
      return errorResult;
    }
  }
}

/**
 * 새로운 대시보드 데이터 생성
 */
async function generateDashboard(targetDate?: string): Promise<DashboardResponse> {
  const date = targetDate || new Date().toISOString().split('T')[0];
  
  console.log(`📊 대시보드 데이터 생성 시작: ${date}`);
  
  // 데이터 품질 메트릭 수집
  const metrics = await qualityMonitor.collectQualityMetrics(date);
  
  // 위젯 데이터 생성
  const widgets = await qualityMonitor.generateDashboardWidgets(metrics);
  
  // 품질 리포트 생성
  const report = await qualityMonitor.generateQualityReport(date);
  
  // DynamoDB에 대시보드 데이터 저장
  const dashboardData = {
    pk: `DASHBOARD#QUALITY`,
    sk: date,
    timestamp: new Date().toISOString(),
    metrics: metrics,
    widgets: widgets,
    report: report,
    alertLevel: metrics.alertLevel,
    ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30일 TTL
  };
  
  await dynamoClient.send(new PutCommand({
    TableName: process.env.CUMULATIVE_TABLE_NAME,
    Item: dashboardData
  }));
  
  console.log('✅ 대시보드 데이터 생성 및 저장 완료');
  console.log('📋 품질 리포트:');
  console.log(report);
  
  return {
    success: true,
    timestamp: new Date().toISOString(),
    metrics: metrics,
    widgets: widgets,
    report: report
  };
}

/**
 * 기존 대시보드 데이터 조회
 */
async function getDashboardData(targetDate?: string): Promise<DashboardResponse> {
  const date = targetDate || new Date().toISOString().split('T')[0];
  
  console.log(`📖 대시보드 데이터 조회: ${date}`);
  
  try {
    const response = await dynamoClient.send(new GetCommand({
      TableName: process.env.CUMULATIVE_TABLE_NAME,
      Key: {
        pk: `DASHBOARD#QUALITY`,
        sk: date
      }
    }));
    
    if (!response.Item) {
      // 데이터가 없으면 새로 생성
      console.log('📊 기존 데이터가 없어 새로 생성합니다');
      return await generateDashboard(date);
    }
    
    console.log('✅ 기존 대시보드 데이터 조회 완료');
    
    return {
      success: true,
      timestamp: response.Item.timestamp,
      metrics: response.Item.metrics,
      widgets: response.Item.widgets,
      report: response.Item.report
    };
    
  } catch (error) {
    console.error('❌ 대시보드 데이터 조회 실패:', error);
    // 조회 실패시 새로 생성
    return await generateDashboard(date);
  }
}

/**
 * 경고 수준별 알림 조회
 */
async function getAlerts(threshold: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'): Promise<DashboardResponse> {
  console.log(`🚨 경고 알림 조회: ${threshold} 이상`);
  
  // 최근 7일간의 대시보드 데이터에서 알림 수집
  const alerts: any[] = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    try {
      const response = await dynamoClient.send(new GetCommand({
        TableName: process.env.CUMULATIVE_TABLE_NAME,
        Key: {
          pk: `DASHBOARD#QUALITY`,
          sk: date
        }
      }));
      
      if (response.Item && response.Item.metrics) {
        const metrics = response.Item.metrics as DataQualityMetrics;
        
        // 임계값 이상의 이상 패턴 필터링
        const filteredAnomalies = metrics.suspiciousPatterns.filter(pattern => {
          if (threshold === 'LOW') return true;
          if (threshold === 'MEDIUM') return pattern.severity === 'MEDIUM' || pattern.severity === 'HIGH';
          if (threshold === 'HIGH') return pattern.severity === 'HIGH';
          return false;
        });
        
        if (filteredAnomalies.length > 0) {
          alerts.push({
            date: date,
            alertLevel: metrics.alertLevel,
            anomalies: filteredAnomalies,
            totalAnomalies: metrics.suspiciousPatterns.length
          });
        }
      }
    } catch (error) {
      console.error(`❌ ${date} 알림 데이터 조회 실패:`, error);
    }
  }
  
  console.log(`✅ 경고 알림 조회 완료: ${alerts.length}개 일자에서 알림 발견`);
  
  return {
    success: true,
    timestamp: new Date().toISOString(),
    alerts: alerts
  };
}

/**
 * 주기적 실행을 위한 스케줄링 핸들러
 */
export async function scheduledHandler(event: any, context: Context): Promise<void> {
  console.log('⏰ 스케줄된 대시보드 업데이트 실행');
  
  try {
    // 매일 자정에 전날 데이터 분석
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    
    await generateDashboard(yesterday);
    
    // 오늘 데이터도 생성 (실시간 모니터링용)
    const today = new Date().toISOString().split('T')[0];
    await generateDashboard(today);
    
    console.log('✅ 스케줄된 대시보드 업데이트 완료');
    
  } catch (error) {
    console.error('❌ 스케줄된 대시보드 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 실시간 알림을 위한 이벤트 핸들러
 */
export async function alertHandler(event: any, context: Context): Promise<void> {
  console.log('🚨 실시간 알림 체크 실행');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const metrics = await qualityMonitor.collectQualityMetrics(today);
    
    // 높은 심각도 이상 패턴이 있으면 즉시 알림
    const criticalAnomalies = metrics.suspiciousPatterns.filter(
      pattern => pattern.severity === 'HIGH'
    );
    
    if (criticalAnomalies.length > 0) {
      console.log(`🔴 긴급 알림: ${criticalAnomalies.length}개의 심각한 이상 패턴 감지`);
      
      // 실제 환경에서는 여기서 SNS, Slack, 이메일 등으로 알림 발송
      criticalAnomalies.forEach(anomaly => {
        console.log(`- ${anomaly.description}`);
      });
      
      // 긴급 알림 데이터 저장
      await dynamoClient.send(new PutCommand({
        TableName: process.env.CUMULATIVE_TABLE_NAME,
        Item: {
          pk: `ALERT#CRITICAL`,
          sk: new Date().toISOString(),
          anomalies: criticalAnomalies,
          alertLevel: metrics.alertLevel,
          timestamp: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7일 TTL
        }
      }));
    }
    
    console.log('✅ 실시간 알림 체크 완료');
    
  } catch (error) {
    console.error('❌ 실시간 알림 체크 실패:', error);
    throw error;
  }
}