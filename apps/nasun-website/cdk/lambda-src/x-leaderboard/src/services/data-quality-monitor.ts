/**
 * 데이터 품질 모니터링 대시보드 서비스
 * 
 * 전체 데이터 파이프라인의 품질을 실시간 모니터링하고
 * 이상 패턴을 감지하여 대시보드로 시각화합니다.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from "@aws-sdk/client-cloudwatch";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cloudWatchClient = new CloudWatchClient({});

/**
 * 데이터 품질 메트릭 인터페이스
 */
export interface DataQualityMetrics {
  // Engagement Type 품질
  validEngagementTypeRatio: number;      // 유효한 engagement_type 비율
  unknownEngagementTypeCount: number;    // 미분류 engagement_type 수
  engagementTypeDistribution: Map<string, number>; // 타입별 분포
  
  // Followers Count 품질
  followersCountCoverageRatio: number;   // followers_count 수집 비율
  followersCountDistribution: Map<string, number>; // 범위별 분포
  averageFollowersCount: number;         // 평균 팔로워 수
  
  // Score Calculation 품질
  weightCalculationAccuracy: number;     // 가중치 계산 정확도
  koreanCommunityRatio: number;         // 한국 커뮤니티 비율
  globalCommunityRatio: number;         // 글로벌 커뮤니티 비율
  averageWeightApplied: number;         // 평균 적용 가중치
  
  // Data Pipeline 품질
  dataProcessingLatency: number;        // 데이터 처리 지연 시간 (분)
  errorRate: number;                   // 오류 발생률
  dataCompletenessRatio: number;       // 데이터 완성도
  dailyProcessedCount: number;         // 일일 처리 건수
  
  // Anomaly Detection
  suspiciousPatterns: AnomalyPattern[]; // 의심스러운 패턴들
  alertLevel: 'GREEN' | 'YELLOW' | 'RED'; // 전체 경고 수준
}

/**
 * 이상 패턴 인터페이스
 */
export interface AnomalyPattern {
  type: 'IDENTICAL_COUNTS' | 'EXCESSIVE_ENGAGEMENT' | 'WEIGHT_CALCULATION_ERROR' | 'DATA_MISSING';
  userId?: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  detectedAt: string;
  metadata: { [key: string]: any };
}

/**
 * 대시보드 위젯 데이터
 */
export interface DashboardWidget {
  id: string;
  title: string;
  type: 'metric' | 'chart' | 'table' | 'alert';
  data: any;
  status: 'healthy' | 'warning' | 'critical';
  lastUpdated: string;
}

/**
 * 데이터 품질 모니터링 서비스
 */
export class DataQualityMonitor {
  private tableName: string;
  
  constructor(tableName: string = process.env.CUMULATIVE_TABLE_NAME || '') {
    this.tableName = tableName;
  }

  /**
   * 전체 데이터 품질 메트릭 수집
   */
  async collectQualityMetrics(targetDate?: string): Promise<DataQualityMetrics> {
    const date = targetDate || new Date().toISOString().split('T')[0];
    
    console.log(`🔍 데이터 품질 메트릭 수집 시작: ${date}`);
    
    try {
      // 병렬로 각 품질 메트릭 수집
      const [
        engagementMetrics,
        followersMetrics,
        scoreMetrics,
        pipelineMetrics,
        anomalies
      ] = await Promise.all([
        this.analyzeEngagementTypeQuality(date),
        this.analyzeFollowersCountQuality(date),
        this.analyzeScoreCalculationQuality(date),
        this.analyzePipelineQuality(date),
        this.detectAnomalies(date)
      ]);

      const metrics: DataQualityMetrics = {
        ...engagementMetrics,
        ...followersMetrics,
        ...scoreMetrics,
        ...pipelineMetrics,
        suspiciousPatterns: anomalies,
        alertLevel: this.calculateAlertLevel(anomalies)
      };

      // CloudWatch 메트릭 전송
      await this.publishToCloudWatch(metrics, date);
      
      console.log(`✅ 데이터 품질 메트릭 수집 완료`);
      return metrics;
      
    } catch (error) {
      console.error('❌ 데이터 품질 메트릭 수집 실패:', error);
      throw error;
    }
  }

  /**
   * Engagement Type 품질 분석
   */
  private async analyzeEngagementTypeQuality(date: string) {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#pk, :userPrefix) AND contains(#sk, :date)',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk'
      },
      ExpressionAttributeValues: {
        ':userPrefix': 'USER#',
        ':date': date
      },
      ProjectionExpression: 'engagement_type, validation_stats'
    }));

    const items = response.Items || [];
    const totalEngagements = items.length;
    let validCount = 0;
    let unknownCount = 0;
    const typeDistribution = new Map<string, number>();

    items.forEach(item => {
      const engagementType = item.engagement_type;
      if (engagementType && ['like', 'reply', 'repost', 'quote', 'mention'].includes(engagementType)) {
        validCount++;
        typeDistribution.set(engagementType, (typeDistribution.get(engagementType) || 0) + 1);
      } else {
        unknownCount++;
        typeDistribution.set('unknown', (typeDistribution.get('unknown') || 0) + 1);
      }
    });

    return {
      validEngagementTypeRatio: totalEngagements > 0 ? validCount / totalEngagements : 1.0,
      unknownEngagementTypeCount: unknownCount,
      engagementTypeDistribution: typeDistribution
    };
  }

  /**
   * Followers Count 품질 분석
   */
  private async analyzeFollowersCountQuality(date: string) {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#pk, :userPrefix) AND contains(#sk, :date)',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk'
      },
      ExpressionAttributeValues: {
        ':userPrefix': 'USER#',
        ':date': date
      },
      ProjectionExpression: 'engaging_followers_count'
    }));

    const items = response.Items || [];
    const totalItems = items.length;
    let withFollowersCount = 0;
    let totalFollowers = 0;
    const distribution = new Map<string, number>();

    items.forEach(item => {
      const followersCount = item.engaging_followers_count;
      if (followersCount !== undefined && followersCount !== null) {
        withFollowersCount++;
        totalFollowers += followersCount;
        
        // 범위별 분류
        const category = this.categorizeFollowersCount(followersCount);
        distribution.set(category, (distribution.get(category) || 0) + 1);
      }
    });

    return {
      followersCountCoverageRatio: totalItems > 0 ? withFollowersCount / totalItems : 0,
      followersCountDistribution: distribution,
      averageFollowersCount: withFollowersCount > 0 ? totalFollowers / withFollowersCount : 0
    };
  }

  /**
   * Score Calculation 품질 분석
   */
  private async analyzeScoreCalculationQuality(date: string) {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#pk, :cumulativePrefix)',
      ExpressionAttributeNames: {
        '#pk': 'pk'
      },
      ExpressionAttributeValues: {
        ':cumulativePrefix': 'CUMULATIVE#'
      },
      ProjectionExpression: 'community_type, weight_applied, log_base, language_multiplier'
    }));

    const items = response.Items || [];
    let koreanCount = 0;
    let globalCount = 0;
    let totalWeight = 0;
    let validWeightCount = 0;

    items.forEach(item => {
      if (item.community_type === 'korean') koreanCount++;
      if (item.community_type === 'global') globalCount++;
      
      if (item.weight_applied && item.weight_applied > 0) {
        totalWeight += item.weight_applied;
        validWeightCount++;
      }
    });

    const totalUsers = items.length;

    return {
      weightCalculationAccuracy: validWeightCount / Math.max(totalUsers, 1),
      koreanCommunityRatio: totalUsers > 0 ? koreanCount / totalUsers : 0,
      globalCommunityRatio: totalUsers > 0 ? globalCount / totalUsers : 0,
      averageWeightApplied: validWeightCount > 0 ? totalWeight / validWeightCount : 0
    };
  }

  /**
   * Data Pipeline 품질 분석
   */
  private async analyzePipelineQuality(date: string) {
    // 최근 24시간 데이터 처리 통계
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#sk, :date) OR contains(#sk, :yesterday)',
      ExpressionAttributeNames: {
        '#sk': 'sk'
      },
      ExpressionAttributeValues: {
        ':date': date,
        ':yesterday': yesterdayDate
      },
      ProjectionExpression: 'created_at, processing_error'
    }));

    const items = response.Items || [];
    const todayItems = items.filter(item => item.sk && item.sk.includes(date));
    const errorItems = items.filter(item => item.processing_error);
    
    // 처리 지연 시간 계산 (단순화)
    const avgLatency = 5; // 실제 구현시 타임스탬프 기반 계산

    return {
      dataProcessingLatency: avgLatency,
      errorRate: items.length > 0 ? errorItems.length / items.length : 0,
      dataCompletenessRatio: 0.95, // 실제 구현시 더 정교한 계산
      dailyProcessedCount: todayItems.length
    };
  }

  /**
   * 이상 패턴 감지
   */
  private async detectAnomalies(date: string): Promise<AnomalyPattern[]> {
    const anomalies: AnomalyPattern[] = [];

    // 1. 동일한 카운트 패턴 감지 (like @mdkitchen7 case)
    const identicalCountsAnomalies = await this.detectIdenticalCounts(date);
    anomalies.push(...identicalCountsAnomalies);

    // 2. 과도한 engagement 감지
    const excessiveEngagementAnomalies = await this.detectExcessiveEngagement(date);
    anomalies.push(...excessiveEngagementAnomalies);

    // 3. 가중치 계산 오류 감지
    const weightErrorAnomalies = await this.detectWeightCalculationErrors(date);
    anomalies.push(...weightErrorAnomalies);

    return anomalies;
  }

  /**
   * 동일한 카운트 패턴 감지
   */
  private async detectIdenticalCounts(date: string): Promise<AnomalyPattern[]> {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#pk, :cumulativePrefix)',
      ExpressionAttributeNames: {
        '#pk': 'pk'
      },
      ExpressionAttributeValues: {
        ':cumulativePrefix': 'CUMULATIVE#'
      },
      ProjectionExpression: 'user_id, username, replies, mentions, likes, reposts, quotes'
    }));

    const anomalies: AnomalyPattern[] = [];
    const items = response.Items || [];

    items.forEach(item => {
      const { replies = 0, mentions = 0, likes = 0, reposts = 0, quotes = 0 } = item;
      
      // 의심스러운 동일 카운트 패턴 감지
      if (replies > 0 && mentions > 0 && replies === mentions) {
        anomalies.push({
          type: 'IDENTICAL_COUNTS',
          userId: item.user_id,
          description: `User ${item.username || item.user_id} has identical replies (${replies}) and mentions (${mentions}) counts`,
          severity: 'HIGH',
          detectedAt: new Date().toISOString(),
          metadata: { replies, mentions, likes, reposts, quotes }
        });
      }
    });

    return anomalies;
  }

  /**
   * 과도한 engagement 감지
   */
  private async detectExcessiveEngagement(date: string): Promise<AnomalyPattern[]> {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#pk, :cumulativePrefix)',
      ExpressionAttributeNames: {
        '#pk': 'pk'
      },
      ExpressionAttributeValues: {
        ':cumulativePrefix': 'CUMULATIVE#'
      },
      ProjectionExpression: 'user_id, username, total_score, replies, mentions, likes, reposts, quotes'
    }));

    const anomalies: AnomalyPattern[] = [];
    const items = response.Items || [];

    items.forEach(item => {
      const totalEngagements = (item.replies || 0) + (item.mentions || 0) + 
                             (item.likes || 0) + (item.reposts || 0) + (item.quotes || 0);
      
      // 비정상적으로 높은 engagement 감지 (임계값: 1000)
      if (totalEngagements > 1000) {
        anomalies.push({
          type: 'EXCESSIVE_ENGAGEMENT',
          userId: item.user_id,
          description: `User ${item.username || item.user_id} has excessive engagement count: ${totalEngagements}`,
          severity: 'MEDIUM',
          detectedAt: new Date().toISOString(),
          metadata: { totalEngagements, totalScore: item.total_score }
        });
      }
    });

    return anomalies;
  }

  /**
   * 가중치 계산 오류 감지
   */
  private async detectWeightCalculationErrors(date: string): Promise<AnomalyPattern[]> {
    const response = await dynamoClient.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'contains(#pk, :cumulativePrefix)',
      ExpressionAttributeNames: {
        '#pk': 'pk'
      },
      ExpressionAttributeValues: {
        ':cumulativePrefix': 'CUMULATIVE#'
      },
      ProjectionExpression: 'user_id, username, community_type, weight_applied, language_multiplier'
    }));

    const anomalies: AnomalyPattern[] = [];
    const items = response.Items || [];

    items.forEach(item => {
      const { community_type, weight_applied, language_multiplier } = item;
      
      // 가중치 계산 오류 감지
      if (community_type === 'korean' && language_multiplier !== 1.2) {
        anomalies.push({
          type: 'WEIGHT_CALCULATION_ERROR',
          userId: item.user_id,
          description: `Korean user ${item.username || item.user_id} has incorrect language multiplier: ${language_multiplier} (expected: 1.2)`,
          severity: 'HIGH',
          detectedAt: new Date().toISOString(),
          metadata: { community_type, weight_applied, language_multiplier }
        });
      }
      
      if (community_type === 'global' && language_multiplier !== 1.0) {
        anomalies.push({
          type: 'WEIGHT_CALCULATION_ERROR',
          userId: item.user_id,
          description: `Global user ${item.username || item.user_id} has incorrect language multiplier: ${language_multiplier} (expected: 1.0)`,
          severity: 'HIGH',
          detectedAt: new Date().toISOString(),
          metadata: { community_type, weight_applied, language_multiplier }
        });
      }
    });

    return anomalies;
  }

  /**
   * 대시보드 위젯 데이터 생성
   */
  async generateDashboardWidgets(metrics: DataQualityMetrics): Promise<DashboardWidget[]> {
    const widgets: DashboardWidget[] = [];

    // 1. Engagement Type 품질 위젯
    widgets.push({
      id: 'engagement-type-quality',
      title: 'Engagement Type 품질',
      type: 'metric',
      data: {
        validRatio: (metrics.validEngagementTypeRatio * 100).toFixed(2) + '%',
        unknownCount: metrics.unknownEngagementTypeCount,
        distribution: Array.from(metrics.engagementTypeDistribution.entries())
      },
      status: metrics.validEngagementTypeRatio > 0.95 ? 'healthy' : 
             metrics.validEngagementTypeRatio > 0.9 ? 'warning' : 'critical',
      lastUpdated: new Date().toISOString()
    });

    // 2. Followers Count 커버리지 위젯
    widgets.push({
      id: 'followers-coverage',
      title: 'Followers Count 커버리지',
      type: 'metric',
      data: {
        coverageRatio: (metrics.followersCountCoverageRatio * 100).toFixed(2) + '%',
        averageFollowers: Math.round(metrics.averageFollowersCount),
        distribution: Array.from(metrics.followersCountDistribution.entries())
      },
      status: metrics.followersCountCoverageRatio > 0.9 ? 'healthy' : 
             metrics.followersCountCoverageRatio > 0.7 ? 'warning' : 'critical',
      lastUpdated: new Date().toISOString()
    });

    // 3. 가중치 계산 정확도 위젯
    widgets.push({
      id: 'weight-calculation',
      title: '가중치 계산 정확도',
      type: 'metric',
      data: {
        accuracy: (metrics.weightCalculationAccuracy * 100).toFixed(2) + '%',
        koreanRatio: (metrics.koreanCommunityRatio * 100).toFixed(2) + '%',
        globalRatio: (metrics.globalCommunityRatio * 100).toFixed(2) + '%',
        averageWeight: metrics.averageWeightApplied.toFixed(2)
      },
      status: metrics.weightCalculationAccuracy > 0.95 ? 'healthy' : 
             metrics.weightCalculationAccuracy > 0.9 ? 'warning' : 'critical',
      lastUpdated: new Date().toISOString()
    });

    // 4. 이상 패턴 알림 위젯
    widgets.push({
      id: 'anomaly-alerts',
      title: '이상 패턴 알림',
      type: 'alert',
      data: {
        totalAnomalies: metrics.suspiciousPatterns.length,
        highSeverity: metrics.suspiciousPatterns.filter(a => a.severity === 'HIGH').length,
        mediumSeverity: metrics.suspiciousPatterns.filter(a => a.severity === 'MEDIUM').length,
        lowSeverity: metrics.suspiciousPatterns.filter(a => a.severity === 'LOW').length,
        patterns: metrics.suspiciousPatterns.slice(0, 5) // 최근 5개만
      },
      status: metrics.alertLevel === 'GREEN' ? 'healthy' : 
             metrics.alertLevel === 'YELLOW' ? 'warning' : 'critical',
      lastUpdated: new Date().toISOString()
    });

    // 5. 데이터 파이프라인 상태 위젯
    widgets.push({
      id: 'pipeline-status',
      title: '데이터 파이프라인 상태',
      type: 'metric',
      data: {
        latency: metrics.dataProcessingLatency + ' minutes',
        errorRate: (metrics.errorRate * 100).toFixed(2) + '%',
        completeness: (metrics.dataCompletenessRatio * 100).toFixed(2) + '%',
        dailyProcessed: metrics.dailyProcessedCount
      },
      status: metrics.errorRate < 0.01 && metrics.dataCompletenessRatio > 0.95 ? 'healthy' : 
             metrics.errorRate < 0.05 && metrics.dataCompletenessRatio > 0.9 ? 'warning' : 'critical',
      lastUpdated: new Date().toISOString()
    });

    return widgets;
  }

  /**
   * CloudWatch 메트릭 발행
   */
  private async publishToCloudWatch(metrics: DataQualityMetrics, date: string) {
    const metricData: MetricDatum[] = [
      {
        MetricName: 'ValidEngagementTypeRatio',
        Value: metrics.validEngagementTypeRatio,
        Unit: 'Percent',
        Timestamp: new Date()
      },
      {
        MetricName: 'FollowersCountCoverage',
        Value: metrics.followersCountCoverageRatio,
        Unit: 'Percent',
        Timestamp: new Date()
      },
      {
        MetricName: 'WeightCalculationAccuracy',
        Value: metrics.weightCalculationAccuracy,
        Unit: 'Percent',
        Timestamp: new Date()
      },
      {
        MetricName: 'AnomalyCount',
        Value: metrics.suspiciousPatterns.length,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'DataProcessingLatency',
        Value: metrics.dataProcessingLatency,
        Unit: 'Seconds',
        Timestamp: new Date()
      },
      {
        MetricName: 'ErrorRate',
        Value: metrics.errorRate,
        Unit: 'Percent',
        Timestamp: new Date()
      }
    ];

    try {
      await cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: 'NASUN/DataQuality',
        MetricData: metricData
      }));
      console.log('📊 CloudWatch 메트릭 발행 완료');
    } catch (error) {
      console.error('❌ CloudWatch 메트릭 발행 실패:', error);
    }
  }

  /**
   * 전체 경고 수준 계산
   */
  private calculateAlertLevel(anomalies: AnomalyPattern[]): 'GREEN' | 'YELLOW' | 'RED' {
    const highSeverityCount = anomalies.filter(a => a.severity === 'HIGH').length;
    const mediumSeverityCount = anomalies.filter(a => a.severity === 'MEDIUM').length;

    if (highSeverityCount > 0 || mediumSeverityCount > 10) {
      return 'RED';
    } else if (mediumSeverityCount > 0 || anomalies.length > 20) {
      return 'YELLOW';
    } else {
      return 'GREEN';
    }
  }

  /**
   * 팔로워 수 범위별 분류
   */
  private categorizeFollowersCount(count: number): string {
    if (count === 0) return '0';
    if (count <= 100) return '1-100';
    if (count <= 500) return '101-500';
    if (count <= 1000) return '501-1K';
    if (count <= 5000) return '1K-5K';
    if (count <= 10000) return '5K-10K';
    if (count <= 50000) return '10K-50K';
    if (count <= 100000) return '50K-100K';
    if (count <= 500000) return '100K-500K';
    if (count <= 1000000) return '500K-1M';
    return '1M+';
  }

  /**
   * 품질 리포트 생성
   */
  async generateQualityReport(targetDate?: string): Promise<string> {
    const metrics = await this.collectQualityMetrics(targetDate);
    const widgets = await this.generateDashboardWidgets(metrics);
    
    let report = '\n=== NASUN 데이터 품질 모니터링 리포트 ===\n\n';
    report += `📅 분석 일자: ${targetDate || new Date().toISOString().split('T')[0]}\n`;
    report += `🚨 전체 경고 수준: ${metrics.alertLevel}\n\n`;

    // 각 위젯별 상태 요약
    widgets.forEach(widget => {
      const statusIcon = widget.status === 'healthy' ? '✅' : 
                        widget.status === 'warning' ? '⚠️' : '❌';
      report += `${statusIcon} ${widget.title}: ${widget.status.toUpperCase()}\n`;
    });

    report += '\n--- 상세 메트릭 ---\n';
    report += `📊 Engagement Type 품질: ${(metrics.validEngagementTypeRatio * 100).toFixed(2)}% (미분류: ${metrics.unknownEngagementTypeCount}건)\n`;
    report += `👥 Followers Count 커버리지: ${(metrics.followersCountCoverageRatio * 100).toFixed(2)}% (평균: ${Math.round(metrics.averageFollowersCount)})\n`;
    report += `⚖️ 가중치 계산 정확도: ${(metrics.weightCalculationAccuracy * 100).toFixed(2)}%\n`;
    report += `🇰🇷 한국 커뮤니티: ${(metrics.koreanCommunityRatio * 100).toFixed(2)}% | 🌍 글로벌: ${(metrics.globalCommunityRatio * 100).toFixed(2)}%\n`;
    report += `⏱️ 처리 지연시간: ${metrics.dataProcessingLatency}분 | 오류율: ${(metrics.errorRate * 100).toFixed(2)}%\n`;
    report += `📈 일일 처리량: ${metrics.dailyProcessedCount}건\n`;

    if (metrics.suspiciousPatterns.length > 0) {
      report += '\n--- 감지된 이상 패턴 ---\n';
      metrics.suspiciousPatterns.slice(0, 10).forEach((pattern, index) => {
        const severityIcon = pattern.severity === 'HIGH' ? '🔴' : 
                           pattern.severity === 'MEDIUM' ? '🟡' : '🟢';
        report += `${severityIcon} ${pattern.description}\n`;
      });
    }

    report += '\n==============================================\n';
    
    return report;
  }
}