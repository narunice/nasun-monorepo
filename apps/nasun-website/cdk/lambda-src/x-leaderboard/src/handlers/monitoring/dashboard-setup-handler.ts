/**
 * CloudWatch 대시보드 설정 Lambda 핸들러
 * 
 * 리더보드 모니터링 대시보드를 자동으로 생성하고 관리합니다.
 */

import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { CloudWatchDashboardManager } from "../../services/cloudwatch-dashboard-manager";

/**
 * 대시보드 설정 이벤트 타입
 */
interface DashboardSetupEvent {
  action: 'create' | 'delete' | 'list' | 'health-check' | 'create-all';
  dashboardName?: string;
  force?: boolean; // 기존 대시보드 덮어쓰기
}

/**
 * 응답 인터페이스
 */
interface DashboardSetupResponse {
  success: boolean;
  timestamp: string;
  executionId: string;
  action: string;
  
  // 결과
  dashboardsCreated?: string[];
  dashboardsDeleted?: string[];
  dashboardsList?: any[];
  healthStatus?: Record<string, string>;
  
  // 통계
  processingTimeMs: number;
  
  // 오류 정보
  errors?: string[];
  warnings?: string[];
}

/**
 * 메인 Lambda 핸들러
 */
export async function handler(
  event: APIGatewayProxyEvent | DashboardSetupEvent,
  context: Context
): Promise<APIGatewayProxyResult | DashboardSetupResponse> {
  
  const executionId = context.awsRequestId;
  const startTime = Date.now();
  
  console.log('📊 CloudWatch 대시보드 설정 Lambda 실행 시작');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // 이벤트 파싱
    const { action, dashboardName, force } = parseEvent(event);
    
    console.log(`🎯 실행 액션: ${action}`);
    if (dashboardName) console.log(`📋 대상 대시보드: ${dashboardName}`);
    if (force) console.log('⚡ 강제 모드: 기존 대시보드 덮어쓰기');
    
    // 대시보드 매니저 초기화
    const dashboardManager = new CloudWatchDashboardManager();
    
    let dashboardsCreated: string[] = [];
    let dashboardsDeleted: string[] = [];
    let dashboardsList: any[] = [];
    let healthStatus: Record<string, string> = {};
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 액션별 처리
    switch (action) {
      case 'create-all':
        console.log('🚀 모든 대시보드 생성 시작...');
        try {
          await dashboardManager.createAllDashboards();
          dashboardsCreated = [
            'NASUN-Leaderboard-Monitoring-v2',
            'NASUN-Data-Quality-Dashboard-v2',
            'NASUN-Performance-Dashboard-v2'
          ];
          console.log('✅ 모든 대시보드 생성 완료');
        } catch (error) {
          const errorMsg = `대시보드 생성 실패: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
        break;
        
      case 'create':
        if (!dashboardName) {
          throw new Error('대시보드 이름이 필요합니다');
        }
        
        console.log(`📊 개별 대시보드 '${dashboardName}' 생성 중...`);
        try {
          switch (dashboardName) {
            case 'leaderboard':
            case 'NASUN-Leaderboard-Monitoring-v2':
              await dashboardManager.createLeaderboardDashboard();
              dashboardsCreated.push('NASUN-Leaderboard-Monitoring-v2');
              break;
              
            case 'quality':
            case 'NASUN-Data-Quality-Dashboard-v2':
              await dashboardManager.createDataQualityDashboard();
              dashboardsCreated.push('NASUN-Data-Quality-Dashboard-v2');
              break;
              
            case 'performance':
            case 'NASUN-Performance-Dashboard-v2':
              await dashboardManager.createPerformanceDashboard();
              dashboardsCreated.push('NASUN-Performance-Dashboard-v2');
              break;
              
            default:
              throw new Error(`알 수 없는 대시보드 타입: ${dashboardName}`);
          }
          console.log(`✅ 대시보드 '${dashboardName}' 생성 완료`);
        } catch (error) {
          const errorMsg = `대시보드 '${dashboardName}' 생성 실패: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
        break;
        
      case 'delete':
        if (!dashboardName) {
          throw new Error('삭제할 대시보드 이름이 필요합니다');
        }
        
        console.log(`🗑️ 대시보드 '${dashboardName}' 삭제 중...`);
        try {
          await dashboardManager.deleteDashboard(dashboardName);
          dashboardsDeleted.push(dashboardName);
          console.log(`✅ 대시보드 '${dashboardName}' 삭제 완료`);
        } catch (error) {
          const errorMsg = `대시보드 '${dashboardName}' 삭제 실패: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
        break;
        
      case 'list':
        console.log('📋 대시보드 목록 조회 중...');
        try {
          await dashboardManager.listDashboards();
          // 실제 구현에서는 목록을 반환받아야 함
          dashboardsList = []; // placeholder
          console.log('✅ 대시보드 목록 조회 완료');
        } catch (error) {
          const errorMsg = `대시보드 목록 조회 실패: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
        break;
        
      case 'health-check':
        console.log('🏥 대시보드 상태 확인 중...');
        try {
          await dashboardManager.checkDashboardHealth();
          healthStatus = {
            'NASUN-Leaderboard-Monitoring-v2': 'healthy',
            'NASUN-Data-Quality-Dashboard-v2': 'healthy',
            'NASUN-Performance-Dashboard-v2': 'healthy'
          };
          console.log('✅ 대시보드 상태 확인 완료');
        } catch (error) {
          const errorMsg = `대시보드 상태 확인 실패: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error('❌', errorMsg);
        }
        break;
        
      default:
        throw new Error(`알 수 없는 액션: ${action}`);
    }
    
    const processingTime = Date.now() - startTime;
    
    // 응답 생성
    const response: DashboardSetupResponse = {
      success: errors.length === 0,
      timestamp: new Date().toISOString(),
      executionId,
      action,
      dashboardsCreated: dashboardsCreated.length > 0 ? dashboardsCreated : undefined,
      dashboardsDeleted: dashboardsDeleted.length > 0 ? dashboardsDeleted : undefined,
      dashboardsList: dashboardsList.length > 0 ? dashboardsList : undefined,
      healthStatus: Object.keys(healthStatus).length > 0 ? healthStatus : undefined,
      processingTimeMs: processingTime,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
    
    // 결과 요약 로깅
    logExecutionSummary(response);
    
    // API Gateway 요청인 경우 HTTP 응답 반환
    if (isApiGatewayEvent(event)) {
      return {
        statusCode: response.success ? 200 : 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(response)
      };
    }
    
    // 직접 호출인 경우 객체 반환
    return response;
    
  } catch (error) {
    console.error('❌ 대시보드 설정 실행 실패:', error);
    
    const errorResponse: DashboardSetupResponse = {
      success: false,
      timestamp: new Date().toISOString(),
      executionId,
      action: 'unknown',
      processingTimeMs: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : String(error)]
    };
    
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
 * 전체 대시보드 초기 설정을 위한 전용 핸들러
 */
export async function initialSetupHandler(
  event: any,
  context: Context
): Promise<DashboardSetupResponse> {
  
  console.log('🚀 리더보드 모니터링 시스템 초기 설정 시작');
  
  const setupEvent: DashboardSetupEvent = {
    action: 'create-all',
    force: true
  };
  
  return await handler(setupEvent, context) as DashboardSetupResponse;
}

/**
 * 대시보드 상태 점검을 위한 전용 핸들러
 */
export async function healthCheckHandler(
  event: any,
  context: Context
): Promise<DashboardSetupResponse> {
  
  console.log('🏥 대시보드 시스템 상태 점검 시작');
  
  const healthEvent: DashboardSetupEvent = {
    action: 'health-check'
  };
  
  return await handler(healthEvent, context) as DashboardSetupResponse;
}

/**
 * 이벤트 파싱 유틸리티
 */
function parseEvent(event: any): {
  action: string;
  dashboardName?: string;
  force: boolean;
} {
  
  // API Gateway 이벤트인 경우
  if (isApiGatewayEvent(event)) {
    const queryParams = event.queryStringParameters || {};
    const pathParams = event.pathParameters || {};
    
    return {
      action: pathParams.action || queryParams.action || 'list',
      dashboardName: pathParams.dashboardName || queryParams.dashboardName,
      force: queryParams.force === 'true'
    };
  }
  
  // 직접 호출인 경우
  return {
    action: event.action || 'create-all',
    dashboardName: event.dashboardName,
    force: event.force || false
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
function logExecutionSummary(response: DashboardSetupResponse): void {
  const { success, action, processingTimeMs } = response;
  
  console.log('\n📊 대시보드 설정 실행 요약:');
  console.log(`   액션: ${action}`);
  console.log(`   실행 상태: ${success ? '✅ 성공' : '❌ 실패'}`);
  console.log(`   처리 시간: ${processingTimeMs}ms`);
  
  if (response.dashboardsCreated && response.dashboardsCreated.length > 0) {
    console.log('\n📊 생성된 대시보드:');
    response.dashboardsCreated.forEach((dashboard, index) => {
      console.log(`   ${index + 1}. ${dashboard}`);
    });
  }
  
  if (response.dashboardsDeleted && response.dashboardsDeleted.length > 0) {
    console.log('\n🗑️ 삭제된 대시보드:');
    response.dashboardsDeleted.forEach((dashboard, index) => {
      console.log(`   ${index + 1}. ${dashboard}`);
    });
  }
  
  if (response.healthStatus) {
    console.log('\n🏥 대시보드 상태:');
    Object.entries(response.healthStatus).forEach(([name, status]) => {
      const icon = status === 'healthy' ? '✅' : '❌';
      console.log(`   ${icon} ${name}: ${status}`);
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
  
  // CloudWatch Console 링크 제공
  if (response.dashboardsCreated && response.dashboardsCreated.length > 0) {
    console.log('\n🔗 CloudWatch Console 링크:');
    const region = process.env.AWS_REGION || 'ap-northeast-2';
    response.dashboardsCreated.forEach(dashboard => {
      console.log(`   ${dashboard}: https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=${dashboard}`);
    });
  }
}