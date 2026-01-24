// Phase 3.3: Rate Limit CloudWatch 대시보드 및 알림 서비스
// CloudWatch 대시보드, 메트릭, 알림을 통합 관리하는 서비스

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { RateLimitMonitor, RateLimitMetrics } from '../utils/rate-limit-monitor';

interface RateLimitDashboardMetrics {
  // 기본 Rate Limit 메트릭
  currentUsage: number;
  usagePercentage: number;
  remainingCalls: number;
  windowResetTime: Date;
  
  // 성능 메트릭
  apiResponseTime: number;
  successRate: number;
  errorRate: number;
  
  // 배치 처리 메트릭
  batchProcessingTime: number;
  batchSuccessRate: number;
  averageBatchSize: number;
  
  // 시스템 건강도 메트릭
  systemHealthScore: number; // 0-100 점수
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  emergencyState: boolean;
}

interface AlertCondition {
  metricName: string;
  threshold: number;
  comparisonOperator: 'GreaterThanThreshold' | 'LessThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanOrEqualToThreshold';
  evaluationPeriods: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
}

export class RateLimitDashboardService {
  private cloudWatchClient: CloudWatchClient;
  private rateLimitMonitor: RateLimitMonitor;
  private readonly namespace = 'NASUN/RateLimit/Dashboard';
  
  // 메트릭 수집 통계
  private metricsBuffer: { [key: string]: number[] } = {};
  private lastMetricsSent: Date = new Date();
  
  constructor() {
    this.cloudWatchClient = new CloudWatchClient({
      region: process.env.AWS_REGION || 'ap-northeast-2'
    });
    this.rateLimitMonitor = RateLimitMonitor.getInstance();
  }

  /**
   * 종합 대시보드 메트릭 수집 및 전송
   */
  public async collectAndSendDashboardMetrics(
    apiResponseTime?: number,
    batchProcessingTime?: number,
    batchSize?: number,
    apiSuccess?: boolean
  ): Promise<void> {
    const rateLimitMetrics = this.rateLimitMonitor.getMetrics();
    const dashboardMetrics = this.calculateDashboardMetrics(
      rateLimitMetrics, 
      apiResponseTime, 
      batchProcessingTime, 
      batchSize, 
      apiSuccess
    );

    await this.sendMetricsToCloudWatch(dashboardMetrics);
    
    // 알림 조건 확인
    await this.checkAlertConditions(dashboardMetrics);
    
    console.log(`📊 [DASHBOARD] 대시보드 메트릭 전송 완료 - 건강도: ${dashboardMetrics.systemHealthScore}점`);
  }

  /**
   * 대시보드 메트릭 계산
   */
  private calculateDashboardMetrics(
    rateLimitMetrics: RateLimitMetrics,
    apiResponseTime?: number,
    batchProcessingTime?: number,
    batchSize?: number,
    apiSuccess?: boolean
  ): RateLimitDashboardMetrics {
    
    // API 성능 메트릭 계산
    const successRate = this.calculateSuccessRate(apiSuccess);
    const errorRate = 100 - successRate;
    
    // 시스템 건강도 점수 계산 (0-100)
    const systemHealthScore = this.calculateSystemHealthScore(
      rateLimitMetrics,
      successRate,
      apiResponseTime || 0
    );
    
    return {
      // 기본 Rate Limit 메트릭
      currentUsage: rateLimitMetrics.currentUsage,
      usagePercentage: rateLimitMetrics.usagePercentage,
      remainingCalls: rateLimitMetrics.remainingCalls,
      windowResetTime: rateLimitMetrics.windowReset,
      
      // 성능 메트릭
      apiResponseTime: apiResponseTime || 0,
      successRate,
      errorRate,
      
      // 배치 처리 메트릭
      batchProcessingTime: batchProcessingTime || 0,
      batchSuccessRate: this.calculateBatchSuccessRate(),
      averageBatchSize: batchSize || 0,
      
      // 시스템 건강도 메트릭
      systemHealthScore,
      riskLevel: this.rateLimitMonitor.getRiskLevel(),
      emergencyState: this.rateLimitMonitor.isEmergencyState()
    };
  }

  /**
   * 시스템 건강도 점수 계산 (0-100)
   */
  private calculateSystemHealthScore(
    rateLimitMetrics: RateLimitMetrics,
    successRate: number,
    responseTime: number
  ): number {
    let score = 100;
    
    // Rate Limit 사용률에 따른 감점
    if (rateLimitMetrics.usagePercentage > 80) {
      score -= 30; // 80% 초과시 30점 감점
    } else if (rateLimitMetrics.usagePercentage > 60) {
      score -= 15; // 60% 초과시 15점 감점
    } else if (rateLimitMetrics.usagePercentage > 40) {
      score -= 5;  // 40% 초과시 5점 감점
    }
    
    // API 성공률에 따른 감점
    if (successRate < 95) {
      score -= (95 - successRate) * 2; // 성공률 1% 감소당 2점 감점
    }
    
    // 응답 시간에 따른 감점 (30초 이상)
    if (responseTime > 30000) {
      score -= Math.min((responseTime - 30000) / 1000, 20); // 최대 20점 감점
    }
    
    // 긴급 상황 감점
    if (this.rateLimitMonitor.isEmergencyState()) {
      score -= 50; // 긴급 상황시 50점 감점
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * API 성공률 계산 (최근 기록 기반)
   */
  private calculateSuccessRate(currentApiSuccess?: boolean): number {
    const key = 'apiSuccess';
    
    if (currentApiSuccess !== undefined) {
      if (!this.metricsBuffer[key]) {
        this.metricsBuffer[key] = [];
      }
      
      this.metricsBuffer[key].push(currentApiSuccess ? 1 : 0);
      
      // 최근 50개 기록만 유지
      if (this.metricsBuffer[key].length > 50) {
        this.metricsBuffer[key] = this.metricsBuffer[key].slice(-50);
      }
    }
    
    if (!this.metricsBuffer[key] || this.metricsBuffer[key].length === 0) {
      return 100; // 기본값
    }
    
    const successCount = this.metricsBuffer[key].reduce((sum, success) => sum + success, 0);
    return (successCount / this.metricsBuffer[key].length) * 100;
  }

  /**
   * 배치 처리 성공률 계산
   */
  private calculateBatchSuccessRate(): number {
    const key = 'batchSuccess';
    
    if (!this.metricsBuffer[key] || this.metricsBuffer[key].length === 0) {
      return 100; // 기본값
    }
    
    const successCount = this.metricsBuffer[key].reduce((sum, success) => sum + success, 0);
    return (successCount / this.metricsBuffer[key].length) * 100;
  }

  /**
   * CloudWatch 메트릭 전송
   */
  private async sendMetricsToCloudWatch(metrics: RateLimitDashboardMetrics): Promise<void> {
    try {
      const metricData = [
        // 시스템 건강도 메트릭
        {
          MetricName: 'SystemHealthScore',
          Value: metrics.systemHealthScore,
          Unit: 'None' as const,
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'Environment', Value: process.env.NODE_ENV || 'production' }
          ]
        },
        
        // Rate Limit 세부 메트릭
        {
          MetricName: 'RateLimitUsagePercentage',
          Value: metrics.usagePercentage,
          Unit: 'Percent' as const,
          Timestamp: new Date()
        },
        
        {
          MetricName: 'RemainingApiCalls',
          Value: metrics.remainingCalls,
          Unit: 'Count' as const,
          Timestamp: new Date()
        },
        
        // API 성능 메트릭
        {
          MetricName: 'ApiSuccessRate',
          Value: metrics.successRate,
          Unit: 'Percent' as const,
          Timestamp: new Date()
        },
        
        {
          MetricName: 'ApiResponseTime',
          Value: metrics.apiResponseTime,
          Unit: 'Milliseconds' as const,
          Timestamp: new Date()
        },
        
        // 배치 처리 메트릭
        {
          MetricName: 'BatchProcessingTime',
          Value: metrics.batchProcessingTime,
          Unit: 'Milliseconds' as const,
          Timestamp: new Date()
        },
        
        {
          MetricName: 'BatchSuccessRate',
          Value: metrics.batchSuccessRate,
          Unit: 'Percent' as const,
          Timestamp: new Date()
        },
        
        // 위험도 메트릭 (숫자로 변환)
        {
          MetricName: 'RiskLevel',
          Value: this.riskLevelToNumber(metrics.riskLevel),
          Unit: 'None' as const,
          Timestamp: new Date()
        },
        
        // 긴급 상태 메트릭
        {
          MetricName: 'EmergencyState',
          Value: metrics.emergencyState ? 1 : 0,
          Unit: 'None' as const,
          Timestamp: new Date()
        }
      ];

      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: metricData
      });

      await this.cloudWatchClient.send(command);
      this.lastMetricsSent = new Date();

    } catch (error: any) {
      console.error(`❌ [DASHBOARD] CloudWatch 메트릭 전송 실패:`, error.message);
    }
  }

  /**
   * 위험도를 숫자로 변환 (CloudWatch 메트릭용)
   */
  private riskLevelToNumber(riskLevel: string): number {
    switch (riskLevel) {
      case 'LOW': return 1;
      case 'MEDIUM': return 2;
      case 'HIGH': return 3;
      case 'CRITICAL': return 4;
      default: return 0;
    }
  }

  /**
   * 알림 조건 확인 및 발송
   */
  private async checkAlertConditions(metrics: RateLimitDashboardMetrics): Promise<void> {
    const alertConditions: AlertCondition[] = [
      {
        metricName: 'SystemHealthScore',
        threshold: 70,
        comparisonOperator: 'LessThanThreshold',
        evaluationPeriods: 2,
        severity: 'WARNING',
        description: '시스템 건강도 점수가 70점 미만입니다'
      },
      {
        metricName: 'RateLimitUsagePercentage', 
        threshold: 80,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        severity: 'CRITICAL',
        description: 'Rate Limit 사용률이 80%를 초과했습니다'
      },
      {
        metricName: 'ApiSuccessRate',
        threshold: 90,
        comparisonOperator: 'LessThanThreshold',
        evaluationPeriods: 3,
        severity: 'WARNING',
        description: 'API 성공률이 90% 미만입니다'
      },
      {
        metricName: 'EmergencyState',
        threshold: 0.5,
        comparisonOperator: 'GreaterThanThreshold',
        evaluationPeriods: 1,
        severity: 'CRITICAL',
        description: 'Rate Limit 긴급 상황이 감지되었습니다'
      }
    ];

    for (const condition of alertConditions) {
      await this.evaluateAlertCondition(condition, metrics);
    }
  }

  /**
   * 개별 알림 조건 평가
   */
  private async evaluateAlertCondition(
    condition: AlertCondition, 
    metrics: RateLimitDashboardMetrics
  ): Promise<void> {
    const metricValue = this.getMetricValue(condition.metricName, metrics);
    
    if (metricValue === undefined) {
      return;
    }

    const shouldAlert = this.evaluateThreshold(
      metricValue,
      condition.threshold,
      condition.comparisonOperator
    );

    if (shouldAlert) {
      await this.sendAlert(condition, metricValue, metrics);
    }
  }

  /**
   * 메트릭 값 추출
   */
  private getMetricValue(metricName: string, metrics: RateLimitDashboardMetrics): number | undefined {
    switch (metricName) {
      case 'SystemHealthScore': return metrics.systemHealthScore;
      case 'RateLimitUsagePercentage': return metrics.usagePercentage;
      case 'ApiSuccessRate': return metrics.successRate;
      case 'EmergencyState': return metrics.emergencyState ? 1 : 0;
      default: return undefined;
    }
  }

  /**
   * 임계값 평가
   */
  private evaluateThreshold(
    value: number,
    threshold: number,
    operator: string
  ): boolean {
    switch (operator) {
      case 'GreaterThanThreshold': return value > threshold;
      case 'LessThanThreshold': return value < threshold;
      case 'GreaterThanOrEqualToThreshold': return value >= threshold;
      case 'LessThanOrEqualToThreshold': return value <= threshold;
      default: return false;
    }
  }

  /**
   * 알림 발송
   */
  private async sendAlert(
    condition: AlertCondition,
    currentValue: number,
    metrics: RateLimitDashboardMetrics
  ): Promise<void> {
    const alertMessage = `
🚨 [${condition.severity}] Rate Limit 시스템 알림

📊 메트릭: ${condition.metricName}
📈 현재 값: ${currentValue}
⚠️ 임계값: ${condition.threshold}
📝 설명: ${condition.description}

📋 시스템 상태:
- 건강도 점수: ${metrics.systemHealthScore}점
- Rate Limit 사용률: ${metrics.usagePercentage.toFixed(1)}%
- API 성공률: ${metrics.successRate.toFixed(1)}%
- 위험도: ${metrics.riskLevel}

🕒 발생 시각: ${new Date().toISOString()}
`;

    console.log(alertMessage);
    
    // 향후 SNS/Slack 등 실제 알림 시스템 연동 지점
    // await this.sendToNotificationService(alertMessage, condition.severity);
  }

  /**
   * 배치 성공 기록
   */
  public recordBatchSuccess(success: boolean): void {
    const key = 'batchSuccess';
    
    if (!this.metricsBuffer[key]) {
      this.metricsBuffer[key] = [];
    }
    
    this.metricsBuffer[key].push(success ? 1 : 0);
    
    // 최근 20개 기록만 유지
    if (this.metricsBuffer[key].length > 20) {
      this.metricsBuffer[key] = this.metricsBuffer[key].slice(-20);
    }
  }

  /**
   * 대시보드 상태 요약 출력
   */
  public async printDashboardSummary(): Promise<void> {
    const rateLimitMetrics = this.rateLimitMonitor.getMetrics();
    const dashboardMetrics = this.calculateDashboardMetrics(rateLimitMetrics);
    
    console.log(`
📊 === Rate Limit 대시보드 상태 요약 ===
🏥 시스템 건강도: ${dashboardMetrics.systemHealthScore}점/100점
📈 Rate Limit 사용률: ${rateLimitMetrics.usagePercentage.toFixed(1)}%
🔄 API 성공률: ${dashboardMetrics.successRate.toFixed(1)}%
⚡ 배치 성공률: ${dashboardMetrics.batchSuccessRate.toFixed(1)}%
🚦 위험도: ${dashboardMetrics.riskLevel}
🚨 긴급 상태: ${dashboardMetrics.emergencyState ? 'YES' : 'NO'}
🕒 마지막 메트릭 전송: ${this.lastMetricsSent.toISOString()}
==========================================
`);
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const rateLimitDashboard = new RateLimitDashboardService();