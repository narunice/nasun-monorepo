/**
 * CloudWatch 대시보드 관리 서비스
 * 
 * 데이터 품질, 이상 패턴 감지, 성능 지표를 통합한
 * 실시간 모니터링 대시보드를 구축합니다.
 */

import { 
  CloudWatchClient, 
  PutDashboardCommand,
  GetDashboardCommand,
  ListDashboardsCommand,
  DeleteDashboardsCommand
} from '@aws-sdk/client-cloudwatch';

/**
 * 대시보드 설정 인터페이스
 */
interface DashboardConfig {
  name: string;
  description: string;
  widgets: DashboardWidget[];
  refreshInterval?: number; // 초 단위
  timeRange?: '1h' | '6h' | '12h' | '1d' | '3d' | '1w';
}

/**
 * 위젯 설정 인터페이스
 */
interface DashboardWidget {
  type: 'metric' | 'log' | 'number' | 'text';
  title: string;
  metrics?: MetricConfig[];
  logGroup?: string;
  query?: string;
  position: { x: number; y: number; width: number; height: number; };
  properties?: Record<string, any>;
}

/**
 * 메트릭 설정 인터페이스
 */
interface MetricConfig {
  namespace: string;
  metricName: string;
  dimensions?: Record<string, string>;
  statistic?: 'Average' | 'Sum' | 'Maximum' | 'Minimum' | 'SampleCount';
  period?: number;
}

/**
 * CloudWatch 대시보드 관리자
 */
export class CloudWatchDashboardManager {
  private cloudwatch: CloudWatchClient;
  private readonly region: string;
  
  constructor() {
    this.region = process.env.AWS_REGION || 'ap-northeast-2';
    this.cloudwatch = new CloudWatchClient({ region: this.region });
  }
  
  /**
   * 통합 리더보드 모니터링 대시보드 생성
   */
  async createLeaderboardDashboard(): Promise<void> {
    console.log('📊 리더보드 통합 모니터링 대시보드 생성 중...');
    
    const dashboardConfig: DashboardConfig = {
      name: 'NASUN-Leaderboard-Monitoring-v2',
      description: 'NASUN 리더보드 시스템 통합 모니터링 대시보드',
      timeRange: '6h',
      refreshInterval: 300, // 5분
      widgets: [
        // 1. 시스템 상태 개요
        this.createSystemOverviewWidget(),
        
        // 2. 데이터 품질 지표
        this.createDataQualityWidget(),
        
        // 3. 이상 패턴 감지 현황
        this.createAnomalyDetectionWidget(),
        
        // 4. 성능 지표
        this.createPerformanceWidget(),
        
        // 5. 에러 및 알림 현황
        this.createErrorMonitoringWidget(),
        
        // 6. 사용자 활동 통계
        this.createUserActivityWidget(),
        
        // 7. 데이터 파이프라인 상태
        this.createPipelineStatusWidget(),
        
        // 8. 리소스 사용량
        this.createResourceUsageWidget()
      ]
    };
    
    await this.createDashboard(dashboardConfig);
    console.log('✅ 통합 모니터링 대시보드 생성 완료');
  }
  
  /**
   * 데이터 품질 전용 대시보드 생성
   */
  async createDataQualityDashboard(): Promise<void> {
    console.log('🔍 데이터 품질 전용 대시보드 생성 중...');
    
    const dashboardConfig: DashboardConfig = {
      name: 'NASUN-Data-Quality-Dashboard-v2',
      description: '데이터 품질 모니터링 전용 대시보드',
      timeRange: '12h',
      refreshInterval: 180, // 3분
      widgets: [
        // 데이터 품질 점수
        this.createQualityScoreWidget(),
        
        // 검증 규칙별 상태
        this.createValidationRulesWidget(),
        
        // 데이터 완성도
        this.createDataCompletenessWidget(),
        
        // 일관성 검사
        this.createConsistencyCheckWidget(),
        
        // 정확성 검증
        this.createAccuracyValidationWidget(),
        
        // 커뮤니티별 분포
        this.createCommunityDistributionWidget(),
        
        // 이상 패턴 탐지
        this.createPatternDetectionWidget(),
        
        // 데이터 수집 통계
        this.createCollectionStatsWidget()
      ]
    };
    
    await this.createDashboard(dashboardConfig);
    console.log('✅ 데이터 품질 대시보드 생성 완료');
  }
  
  /**
   * 성능 모니터링 전용 대시보드 생성
   */
  async createPerformanceDashboard(): Promise<void> {
    console.log('⚡ 성능 모니터링 전용 대시보드 생성 중...');
    
    const dashboardConfig: DashboardConfig = {
      name: 'NASUN-Performance-Dashboard-v2',
      description: '리더보드 성능 모니터링 전용 대시보드',
      timeRange: '3d',
      refreshInterval: 120, // 2분
      widgets: [
        // Lambda 성능 지표
        this.createLambdaPerformanceWidget(),
        
        // DynamoDB 성능
        this.createDynamoDBPerformanceWidget(),
        
        // API 응답시간
        this.createAPIResponseTimeWidget(),
        
        // 처리량 통계
        this.createThroughputWidget(),
        
        // 에러율 추적
        this.createErrorRateWidget(),
        
        // 메모리 사용량
        this.createMemoryUsageWidget(),
        
        // 동시 실행 수
        this.createConcurrentExecutionsWidget(),
        
        // 비용 최적화 지표
        this.createCostOptimizationWidget()
      ]
    };
    
    await this.createDashboard(dashboardConfig);
    console.log('✅ 성능 모니터링 대시보드 생성 완료');
  }
  
  /**
   * 시스템 개요 위젯 생성
   */
  private createSystemOverviewWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🏆 시스템 상태 개요',
      position: { x: 0, y: 0, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/Leaderboard',
          metricName: 'SystemHealth',
          statistic: 'Average',
          period: 300
        },
        {
          namespace: 'NASUN/Leaderboard',
          metricName: 'ActiveUsers',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/Leaderboard',
          metricName: 'DataQualityScore',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: false,
        region: this.region,
        title: '시스템 상태 개요'
      }
    };
  }
  
  /**
   * 데이터 품질 위젯 생성
   */
  private createDataQualityWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '📊 데이터 품질 지표',
      position: { x: 12, y: 0, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'QualityScore',
          statistic: 'Average',
          period: 300
        },
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'ValidationFailures',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'DataCompleteness',
          statistic: 'Average',
          period: 300
        },
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'ConsistencyScore',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: false,
        region: this.region,
        title: '데이터 품질 지표',
        yAxis: {
          left: {
            min: 0,
            max: 100
          }
        }
      }
    };
  }
  
  /**
   * 이상 패턴 감지 위젯 생성
   */
  private createAnomalyDetectionWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🚨 이상 패턴 감지 현황',
      position: { x: 0, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/AnomalyDetection',
          metricName: 'CriticalAnomalies',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/AnomalyDetection',
          metricName: 'HighSeverityAnomalies',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/AnomalyDetection',
          metricName: 'MediumSeverityAnomalies',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/AnomalyDetection',
          metricName: 'AlertsSent',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: true,
        region: this.region,
        title: '이상 패턴 감지 현황'
      }
    };
  }
  
  /**
   * 성능 지표 위젯 생성
   */
  private createPerformanceWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '⚡ 성능 지표',
      position: { x: 12, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensions: { 
            FunctionName: 'nasun-cumulative-score-calculator-v2' 
          },
          statistic: 'Average',
          period: 300
        },
        {
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensions: { 
            FunctionName: 'nasun-cumulative-score-calculator-v2' 
          },
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedReadCapacityUnits',
          dimensions: { 
            TableName: 'nasun-leaderboard-data' 
          },
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: false,
        region: this.region,
        title: '성능 지표'
      }
    };
  }
  
  /**
   * 에러 모니터링 위젯 생성
   */
  private createErrorMonitoringWidget(): DashboardWidget {
    return {
      type: 'log',
      title: '❌ 에러 및 알림 현황',
      position: { x: 0, y: 12, width: 24, height: 6 },
      logGroup: '/aws/lambda/nasun-cumulative-score-calculator-v2',
      query: `
        fields @timestamp, @message
        | filter @message like /ERROR/ or @message like /CRITICAL/ or @message like /ANOMALY/
        | sort @timestamp desc
        | limit 50
      `,
      properties: {
        view: 'table',
        region: this.region,
        title: '최근 에러 및 중요 이벤트'
      }
    };
  }
  
  /**
   * 사용자 활동 통계 위젯 생성
   */
  private createUserActivityWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '👥 사용자 활동 통계',
      position: { x: 0, y: 18, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/UserActivity',
          metricName: 'TotalEngagements',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/UserActivity',
          metricName: 'NewUsers',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/UserActivity',
          metricName: 'KoreanCommunityUsers',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/UserActivity',
          metricName: 'GlobalCommunityUsers',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: true,
        region: this.region,
        title: '사용자 활동 통계'
      }
    };
  }
  
  /**
   * 데이터 파이프라인 상태 위젯 생성
   */
  private createPipelineStatusWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🔄 데이터 파이프라인 상태',
      position: { x: 12, y: 18, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/Pipeline',
          metricName: 'DataCollectionSuccess',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/Pipeline',
          metricName: 'DeltaCalculationSuccess',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/Pipeline',
          metricName: 'CumulativeUpdateSuccess',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/Pipeline',
          metricName: 'ValidationSuccess',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: false,
        region: this.region,
        title: '파이프라인 성공률'
      }
    };
  }
  
  /**
   * 리소스 사용량 위젯 생성
   */
  private createResourceUsageWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '💻 리소스 사용량',
      position: { x: 0, y: 24, width: 24, height: 6 },
      metrics: [
        {
          namespace: 'AWS/Lambda',
          metricName: 'MemoryUtilization',
          dimensions: { 
            FunctionName: 'nasun-cumulative-score-calculator-v2' 
          },
          statistic: 'Average',
          period: 300
        },
        {
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedWriteCapacityUnits',
          dimensions: { 
            TableName: 'nasun-leaderboard-data' 
          },
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'AWS/Lambda',
          metricName: 'ConcurrentExecutions',
          statistic: 'Maximum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: false,
        region: this.region,
        title: '리소스 사용량'
      }
    };
  }
  
  /**
   * 품질 점수 위젯 생성
   */
  private createQualityScoreWidget(): DashboardWidget {
    return {
      type: 'number',
      title: '📈 데이터 품질 점수',
      position: { x: 0, y: 0, width: 6, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'OverallQualityScore',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'singleValue',
        region: this.region,
        title: '전체 품질 점수'
      }
    };
  }
  
  /**
   * 검증 규칙 위젯 생성
   */
  private createValidationRulesWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '✅ 검증 규칙별 상태',
      position: { x: 6, y: 0, width: 18, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'CompletenessRulePass',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'ConsistencyRulePass',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'AccuracyRulePass',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'UniquenessRulePass',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: true,
        region: this.region,
        title: '검증 규칙 통과율'
      }
    };
  }
  
  /**
   * Lambda 성능 위젯 생성
   */
  private createLambdaPerformanceWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '⚡ Lambda 성능 지표',
      position: { x: 0, y: 0, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          statistic: 'Average',
          period: 300
        },
        {
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'AWS/Lambda',
          metricName: 'Throttles',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: false,
        region: this.region,
        title: 'Lambda 함수 성능'
      }
    };
  }
  
  /**
   * DynamoDB 성능 위젯 생성
   */
  private createDynamoDBPerformanceWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🗄️ DynamoDB 성능',
      position: { x: 12, y: 0, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'AWS/DynamoDB',
          metricName: 'SuccessfulRequestLatency',
          statistic: 'Average',
          period: 300
        },
        {
          namespace: 'AWS/DynamoDB',
          metricName: 'ThrottledRequests',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: false,
        region: this.region,
        title: 'DynamoDB 성능'
      }
    };
  }
  
  // 추가 위젯 생성 메서드들...
  private createDataCompletenessWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '📋 데이터 완성도',
      position: { x: 0, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'FieldCompletenessRate',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '필드별 완성도'
      }
    };
  }
  
  private createConsistencyCheckWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🔄 일관성 검사',
      position: { x: 12, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'ConsistencyViolations',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '일관성 위반 건수'
      }
    };
  }
  
  private createAccuracyValidationWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🎯 정확성 검증',
      position: { x: 0, y: 12, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/DataQuality',
          metricName: 'AccuracyScore',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '데이터 정확성'
      }
    };
  }
  
  private createCommunityDistributionWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🌍 커뮤니티 분포',
      position: { x: 12, y: 12, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/Community',
          metricName: 'KoreanUsers',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/Community',
          metricName: 'GlobalUsers',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        stacked: true,
        region: this.region,
        title: '커뮤니티별 사용자 분포'
      }
    };
  }
  
  private createPatternDetectionWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🔍 패턴 탐지',
      position: { x: 0, y: 18, width: 24, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/PatternDetection',
          metricName: 'SuspiciousPatterns',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/PatternDetection',
          metricName: 'BotActivity',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '이상 패턴 탐지'
      }
    };
  }
  
  private createCollectionStatsWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '📊 수집 통계',
      position: { x: 0, y: 24, width: 24, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/Collection',
          metricName: 'EngagementsCollected',
          statistic: 'Sum',
          period: 300
        },
        {
          namespace: 'NASUN/Collection',
          metricName: 'ValidationErrors',
          statistic: 'Sum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '데이터 수집 통계'
      }
    };
  }
  
  private createAPIResponseTimeWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '🌐 API 응답시간',
      position: { x: 0, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/API',
          metricName: 'ResponseTime',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: 'API 평균 응답시간'
      }
    };
  }
  
  private createThroughputWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '📈 처리량 통계',
      position: { x: 12, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/Performance',
          metricName: 'RequestsPerSecond',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '초당 요청 처리량'
      }
    };
  }
  
  private createErrorRateWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '❌ 에러율 추적',
      position: { x: 0, y: 12, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'NASUN/Performance',
          metricName: 'ErrorRate',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '시스템 에러율'
      }
    };
  }
  
  private createMemoryUsageWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '💾 메모리 사용량',
      position: { x: 12, y: 12, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'AWS/Lambda',
          metricName: 'MemoryUtilization',
          statistic: 'Average',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: 'Lambda 메모리 사용률'
      }
    };
  }
  
  private createConcurrentExecutionsWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '⚡ 동시 실행 수',
      position: { x: 0, y: 18, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'AWS/Lambda',
          metricName: 'ConcurrentExecutions',
          statistic: 'Maximum',
          period: 300
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '동시 Lambda 실행 수'
      }
    };
  }
  
  private createCostOptimizationWidget(): DashboardWidget {
    return {
      type: 'metric',
      title: '💰 비용 최적화',
      position: { x: 12, y: 18, width: 12, height: 6 },
      metrics: [
        {
          namespace: 'AWS/Lambda',
          metricName: 'BilledDuration',
          statistic: 'Sum',
          period: 3600 // 1시간
        }
      ],
      properties: {
        view: 'timeSeries',
        region: this.region,
        title: '과금 시간 추이'
      }
    };
  }
  
  /**
   * 대시보드 생성
   */
  private async createDashboard(config: DashboardConfig): Promise<void> {
    const dashboardBody = {
      widgets: config.widgets.map(widget => ({
        type: 'metric',
        x: widget.position.x,
        y: widget.position.y,
        width: widget.position.width,
        height: widget.position.height,
        properties: {
          metrics: widget.metrics?.map(metric => [
            metric.namespace,
            metric.metricName,
            ...(metric.dimensions ? Object.entries(metric.dimensions).flat() : []),
            { stat: metric.statistic || 'Average', period: metric.period || 300 }
          ]) || [],
          ...widget.properties,
          period: 300,
          stat: 'Average',
          region: this.region,
          title: widget.title
        }
      }))
    };
    
    const command = new PutDashboardCommand({
      DashboardName: config.name,
      DashboardBody: JSON.stringify(dashboardBody)
    });
    
    await this.cloudwatch.send(command);
    
    console.log(`✅ 대시보드 '${config.name}' 생성 완료`);
    console.log(`🔗 CloudWatch Console: https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${config.name}`);
  }
  
  /**
   * 대시보드 목록 조회
   */
  async listDashboards(): Promise<void> {
    console.log('📋 생성된 대시보드 목록 조회 중...');
    
    const command = new ListDashboardsCommand({});
    const response = await this.cloudwatch.send(command);
    
    if (response.DashboardEntries && response.DashboardEntries.length > 0) {
      console.log('📊 생성된 대시보드:');
      response.DashboardEntries.forEach((dashboard, index) => {
        console.log(`   ${index + 1}. ${dashboard.DashboardName}`);
        console.log(`      수정일: ${dashboard.LastModified?.toISOString()}`);
        console.log(`      크기: ${dashboard.Size} bytes`);
      });
    } else {
      console.log('📭 생성된 대시보드가 없습니다.');
    }
  }
  
  /**
   * 대시보드 삭제
   */
  async deleteDashboard(dashboardName: string): Promise<void> {
    console.log(`🗑️ 대시보드 '${dashboardName}' 삭제 중...`);
    
    const command = new DeleteDashboardsCommand({
      DashboardNames: [dashboardName]
    });
    
    await this.cloudwatch.send(command);
    console.log(`✅ 대시보드 '${dashboardName}' 삭제 완료`);
  }
  
  /**
   * 모든 모니터링 대시보드 생성
   */
  async createAllDashboards(): Promise<void> {
    console.log('🚀 모든 모니터링 대시보드 생성 시작...\n');
    
    try {
      // 1. 통합 모니터링 대시보드
      await this.createLeaderboardDashboard();
      
      // 2. 데이터 품질 전용 대시보드
      await this.createDataQualityDashboard();
      
      // 3. 성능 모니터링 전용 대시보드
      await this.createPerformanceDashboard();
      
      console.log('\n🎉 모든 대시보드 생성 완료!');
      console.log('\n📊 생성된 대시보드:');
      console.log('   1. NASUN-Leaderboard-Monitoring-v2 (통합 모니터링)');
      console.log('   2. NASUN-Data-Quality-Dashboard-v2 (데이터 품질)');
      console.log('   3. NASUN-Performance-Dashboard-v2 (성능 모니터링)');
      
      console.log('\n🔗 CloudWatch Console 접속:');
      console.log(`   https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:`);
      
      // 대시보드 목록 출력
      await this.listDashboards();
      
    } catch (error) {
      console.error('❌ 대시보드 생성 실패:', error);
      throw error;
    }
  }
  
  /**
   * 대시보드 상태 확인
   */
  async checkDashboardHealth(): Promise<void> {
    console.log('🏥 대시보드 상태 확인 중...');
    
    const dashboards = [
      'NASUN-Leaderboard-Monitoring-v2',
      'NASUN-Data-Quality-Dashboard-v2', 
      'NASUN-Performance-Dashboard-v2'
    ];
    
    for (const dashboardName of dashboards) {
      try {
        const command = new GetDashboardCommand({
          DashboardName: dashboardName
        });
        
        const response = await this.cloudwatch.send(command);
        
        if (response.DashboardBody) {
          console.log(`✅ ${dashboardName}: 정상 작동`);
        }
        
      } catch (error) {
        console.log(`❌ ${dashboardName}: 생성 필요`);
      }
    }
  }
}