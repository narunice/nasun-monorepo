/**
 * 실시간 모니터링 CLI 도구
 * 
 * 리더보드 시스템의 실시간 상태를 모니터링하고
 * 즉시 대응이 필요한 이슈를 감지합니다.
 */

import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { DataQualityMonitor } from '../services/data-quality-monitor';
import { AnomalyDetectionService } from '../services/anomaly-detection-service';

/**
 * 실시간 모니터링 설정
 */
interface MonitoringConfig {
  refreshInterval: number; // 초 단위
  alertThresholds: {
    qualityScore: number;
    errorRate: number;
    responseTime: number;
    criticalAnomalies: number;
  };
  enableSound: boolean;
  autoRefresh: boolean;
}

/**
 * 시스템 상태 정보
 */
interface SystemStatus {
  timestamp: string;
  overall: 'healthy' | 'warning' | 'critical';
  
  // 데이터 품질
  dataQuality: {
    score: number;
    status: 'good' | 'fair' | 'poor';
    issues: string[];
  };
  
  // 성능 지표
  performance: {
    avgResponseTime: number;
    errorRate: number;
    throughput: number;
    status: 'good' | 'degraded' | 'poor';
  };
  
  // 이상 패턴
  anomalies: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    recentAlerts: string[];
  };
  
  // 리소스 사용량
  resources: {
    lambdaMemory: number;
    dynamodbRCU: number;
    dynamodbWCU: number;
    status: 'normal' | 'high' | 'critical';
  };
}

/**
 * 실시간 모니터링 CLI
 */
export class RealTimeMonitoringCLI {
  private cloudwatch: CloudWatchClient;
  private dataQualityMonitor: DataQualityMonitor;
  private anomalyService: AnomalyDetectionService;
  private config: MonitoringConfig;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  
  constructor(config?: Partial<MonitoringConfig>) {
    this.cloudwatch = new CloudWatchClient({ 
      region: process.env.AWS_REGION || 'ap-northeast-2' 
    });
    this.dataQualityMonitor = new DataQualityMonitor();
    this.anomalyService = new AnomalyDetectionService();
    
    this.config = {
      refreshInterval: 30, // 30초
      alertThresholds: {
        qualityScore: 85,
        errorRate: 0.05, // 5%
        responseTime: 2000, // 2초
        criticalAnomalies: 0
      },
      enableSound: false,
      autoRefresh: true,
      ...config
    };
  }
  
  /**
   * 실시간 모니터링 시작
   */
  async startMonitoring(): Promise<void> {
    console.clear();
    this.printHeader();
    
    console.log('🚀 실시간 모니터링 시작...');
    console.log(`📊 갱신 주기: ${this.config.refreshInterval}초`);
    console.log('⌨️  종료하려면 Ctrl+C를 누르세요\n');
    
    this.isRunning = true;
    
    // 즉시 첫 번째 상태 확인
    await this.checkSystemStatus();
    
    // 자동 갱신 설정
    if (this.config.autoRefresh) {
      this.intervalId = setInterval(async () => {
        if (this.isRunning) {
          await this.checkSystemStatus();
        }
      }, this.config.refreshInterval * 1000);
    }
    
    // 종료 시그널 처리
    process.on('SIGINT', () => {
      this.stopMonitoring();
    });
    
    // 키보드 입력 처리
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
      this.handleKeyInput(key);
    });
  }
  
  /**
   * 모니터링 중지
   */
  stopMonitoring(): void {
    console.log('\n🛑 모니터링 중지 중...');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    console.log('✅ 모니터링이 중지되었습니다.');
    process.exit(0);
  }
  
  /**
   * 시스템 상태 확인
   */
  private async checkSystemStatus(): Promise<void> {
    try {
      const status = await this.collectSystemStatus();
      this.displayStatus(status);
      
      // 알림 임계값 확인
      await this.checkAlerts(status);
      
    } catch (error) {
      console.error('❌ 상태 확인 실패:', error);
    }
  }
  
  /**
   * 시스템 상태 정보 수집
   */
  private async collectSystemStatus(): Promise<SystemStatus> {
    const timestamp = new Date().toISOString();
    
    // 데이터 품질 정보 수집
    const qualityReport = await this.dataQualityMonitor.generateQualityReport();
    
    // 이상 패턴 감지
    const anomalies = await this.anomalyService.detectAnomalies();
    
    // 성능 지표 수집
    const performanceMetrics = await this.collectPerformanceMetrics();
    
    // 리소스 사용량 수집
    const resourceMetrics = await this.collectResourceMetrics();
    
    // 전체 시스템 상태 결정
    const overall = this.determineOverallStatus(
      qualityReport.qualityScore,
      performanceMetrics.errorRate,
      anomalies.filter(a => a.severity === 'critical').length,
      resourceMetrics.status
    );
    
    return {
      timestamp,
      overall,
      dataQuality: {
        score: qualityReport.qualityScore,
        status: qualityReport.qualityScore >= 90 ? 'good' : 
                qualityReport.qualityScore >= 70 ? 'fair' : 'poor',
        issues: qualityReport.recommendations.slice(0, 3)
      },
      performance: {
        avgResponseTime: performanceMetrics.avgResponseTime,
        errorRate: performanceMetrics.errorRate,
        throughput: performanceMetrics.throughput,
        status: performanceMetrics.status
      },
      anomalies: {
        critical: anomalies.filter(a => a.severity === 'critical').length,
        high: anomalies.filter(a => a.severity === 'high').length,
        medium: anomalies.filter(a => a.severity === 'medium').length,
        low: anomalies.filter(a => a.severity === 'low').length,
        recentAlerts: anomalies
          .filter(a => a.severity === 'critical' || a.severity === 'high')
          .slice(0, 3)
          .map(a => a.title)
      },
      resources: resourceMetrics
    };
  }
  
  /**
   * 성능 지표 수집
   */
  private async collectPerformanceMetrics(): Promise<{
    avgResponseTime: number;
    errorRate: number;
    throughput: number;
    status: 'good' | 'degraded' | 'poor';
  }> {
    // CloudWatch에서 Lambda 성능 지표 수집
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // 최근 5분
    
    try {
      const command = new GetMetricDataCommand({
        MetricDataQueries: [
          {
            Id: 'duration',
            MetricStat: {
              Metric: {
                Namespace: 'AWS/Lambda',
                MetricName: 'Duration',
                Dimensions: [
                  {
                    Name: 'FunctionName',
                    Value: 'nasun-cumulative-score-calculator-v2'
                  }
                ]
              },
              Period: 300,
              Stat: 'Average'
            }
          },
          {
            Id: 'errors',
            MetricStat: {
              Metric: {
                Namespace: 'AWS/Lambda',
                MetricName: 'Errors',
                Dimensions: [
                  {
                    Name: 'FunctionName',
                    Value: 'nasun-cumulative-score-calculator-v2'
                  }
                ]
              },
              Period: 300,
              Stat: 'Sum'
            }
          },
          {
            Id: 'invocations',
            MetricStat: {
              Metric: {
                Namespace: 'AWS/Lambda',
                MetricName: 'Invocations',
                Dimensions: [
                  {
                    Name: 'FunctionName',
                    Value: 'nasun-cumulative-score-calculator-v2'
                  }
                ]
              },
              Period: 300,
              Stat: 'Sum'
            }
          }
        ],
        StartTime: startTime,
        EndTime: endTime
      });
      
      const response = await this.cloudwatch.send(command);
      
      // 메트릭 데이터 파싱
      const durationData = response.MetricDataResults?.find(r => r.Id === 'duration');
      const errorsData = response.MetricDataResults?.find(r => r.Id === 'errors');
      const invocationsData = response.MetricDataResults?.find(r => r.Id === 'invocations');
      
      const avgResponseTime = durationData?.Values?.[0] || 0;
      const totalErrors = errorsData?.Values?.reduce((sum, val) => sum + val, 0) || 0;
      const totalInvocations = invocationsData?.Values?.reduce((sum, val) => sum + val, 0) || 0;
      const errorRate = totalInvocations > 0 ? totalErrors / totalInvocations : 0;
      const throughput = totalInvocations / 5; // 5분 동안의 평균 처리량
      
      // 상태 결정
      let status: 'good' | 'degraded' | 'poor' = 'good';
      if (avgResponseTime > this.config.alertThresholds.responseTime || 
          errorRate > this.config.alertThresholds.errorRate) {
        status = 'poor';
      } else if (avgResponseTime > this.config.alertThresholds.responseTime * 0.7 || 
                 errorRate > this.config.alertThresholds.errorRate * 0.7) {
        status = 'degraded';
      }
      
      return {
        avgResponseTime,
        errorRate,
        throughput,
        status
      };
      
    } catch (error) {
      console.warn('⚠️ 성능 지표 수집 실패, 기본값 사용');
      return {
        avgResponseTime: 0,
        errorRate: 0,
        throughput: 0,
        status: 'good'
      };
    }
  }
  
  /**
   * 리소스 사용량 수집
   */
  private async collectResourceMetrics(): Promise<{
    lambdaMemory: number;
    dynamodbRCU: number;
    dynamodbWCU: number;
    status: 'normal' | 'high' | 'critical';
  }> {
    // 실제 구현에서는 CloudWatch API를 통해 수집
    // 여기서는 예시 데이터 반환
    return {
      lambdaMemory: 75, // 사용률 %
      dynamodbRCU: 120, // 초당 읽기 용량 단위
      dynamodbWCU: 85,  // 초당 쓰기 용량 단위
      status: 'normal'
    };
  }
  
  /**
   * 전체 시스템 상태 결정
   */
  private determineOverallStatus(
    qualityScore: number,
    errorRate: number,
    criticalAnomalies: number,
    resourceStatus: string
  ): 'healthy' | 'warning' | 'critical' {
    
    if (criticalAnomalies > 0 || 
        qualityScore < 70 || 
        errorRate > this.config.alertThresholds.errorRate ||
        resourceStatus === 'critical') {
      return 'critical';
    }
    
    if (qualityScore < 85 || 
        errorRate > this.config.alertThresholds.errorRate * 0.5 ||
        resourceStatus === 'high') {
      return 'warning';
    }
    
    return 'healthy';
  }
  
  /**
   * 상태 화면 표시
   */
  private displayStatus(status: SystemStatus): void {
    console.clear();
    this.printHeader();
    
    // 전체 상태
    const statusIcon = this.getStatusIcon(status.overall);
    const statusColor = this.getStatusColor(status.overall);
    console.log(`${statusIcon} 전체 시스템 상태: ${statusColor}${status.overall.toUpperCase()}\u001b[0m`);
    console.log(`🕐 마지막 업데이트: ${new Date(status.timestamp).toLocaleString()}\n`);
    
    // 데이터 품질
    console.log('📊 데이터 품질');
    console.log(`   점수: ${this.getQualityColor(status.dataQuality.score)}${status.dataQuality.score.toFixed(1)}/100\u001b[0m (${status.dataQuality.status})`);
    if (status.dataQuality.issues.length > 0) {
      console.log('   주요 이슈:');
      status.dataQuality.issues.forEach(issue => {
        console.log(`     • ${issue}`);
      });
    }
    console.log();
    
    // 성능 지표
    console.log('⚡ 성능 지표');
    console.log(`   평균 응답시간: ${status.performance.avgResponseTime.toFixed(0)}ms`);
    console.log(`   에러율: ${(status.performance.errorRate * 100).toFixed(2)}%`);
    console.log(`   처리량: ${status.performance.throughput.toFixed(1)} req/min`);
    console.log(`   상태: ${this.getPerformanceColor(status.performance.status)}${status.performance.status}\u001b[0m`);
    console.log();
    
    // 이상 패턴
    console.log('🚨 이상 패턴 감지');
    console.log(`   🔴 치명적: ${status.anomalies.critical}개`);
    console.log(`   🟡 높음: ${status.anomalies.high}개`);
    console.log(`   🟠 보통: ${status.anomalies.medium}개`);
    console.log(`   🟢 낮음: ${status.anomalies.low}개`);
    if (status.anomalies.recentAlerts.length > 0) {
      console.log('   최근 알림:');
      status.anomalies.recentAlerts.forEach(alert => {
        console.log(`     • ${alert}`);
      });
    }
    console.log();
    
    // 리소스 사용량
    console.log('💻 리소스 사용량');
    console.log(`   Lambda 메모리: ${status.resources.lambdaMemory}%`);
    console.log(`   DynamoDB RCU: ${status.resources.dynamodbRCU}/초`);
    console.log(`   DynamoDB WCU: ${status.resources.dynamodbWCU}/초`);
    console.log(`   상태: ${this.getResourceColor(status.resources.status)}${status.resources.status}\u001b[0m`);
    console.log();
    
    // 컨트롤 안내
    console.log('⌨️  컨트롤: [r]새로고침 [q]종료 [h]도움말');
  }
  
  /**
   * 알림 임계값 확인
   */
  private async checkAlerts(status: SystemStatus): Promise<void> {
    const alerts: string[] = [];
    
    // 품질 점수 확인
    if (status.dataQuality.score < this.config.alertThresholds.qualityScore) {
      alerts.push(`데이터 품질 점수 저하: ${status.dataQuality.score.toFixed(1)}/100`);
    }
    
    // 에러율 확인
    if (status.performance.errorRate > this.config.alertThresholds.errorRate) {
      alerts.push(`에러율 초과: ${(status.performance.errorRate * 100).toFixed(2)}%`);
    }
    
    // 응답시간 확인
    if (status.performance.avgResponseTime > this.config.alertThresholds.responseTime) {
      alerts.push(`응답시간 초과: ${status.performance.avgResponseTime.toFixed(0)}ms`);
    }
    
    // 치명적 이상 패턴 확인
    if (status.anomalies.critical > this.config.alertThresholds.criticalAnomalies) {
      alerts.push(`치명적 이상 패턴 감지: ${status.anomalies.critical}개`);
    }
    
    // 알림 출력
    if (alerts.length > 0) {
      console.log('\n🚨 알림:');
      alerts.forEach(alert => {
        console.log(`   ⚠️  ${alert}`);
      });
      
      // 사운드 알림 (설정된 경우)
      if (this.config.enableSound) {
        process.stdout.write('\u0007'); // 벨 소리
      }
    }
  }
  
  /**
   * 키보드 입력 처리
   */
  private handleKeyInput(key: Buffer): void {
    const keyStr = key.toString();
    
    switch (keyStr.toLowerCase()) {
      case 'r':
        this.checkSystemStatus();
        break;
      case 'q':
        this.stopMonitoring();
        break;
      case 'h':
        this.showHelp();
        break;
      case 'c':
        if (key[0] === 3) { // Ctrl+C
          this.stopMonitoring();
        }
        break;
    }
  }
  
  /**
   * 도움말 표시
   */
  private showHelp(): void {
    console.clear();
    this.printHeader();
    
    console.log('📖 실시간 모니터링 도움말\n');
    console.log('키보드 단축키:');
    console.log('  r - 수동 새로고침');
    console.log('  q - 모니터링 종료');
    console.log('  h - 이 도움말 표시');
    console.log('  Ctrl+C - 강제 종료\n');
    
    console.log('상태 색상:');
    console.log('  \u001b[32m녹색\u001b[0m - 정상');
    console.log('  \u001b[33m노란색\u001b[0m - 주의');
    console.log('  \u001b[31m빨간색\u001b[0m - 위험\n');
    
    console.log('임계값 설정:');
    console.log(`  데이터 품질 점수: ${this.config.alertThresholds.qualityScore}/100`);
    console.log(`  에러율: ${(this.config.alertThresholds.errorRate * 100).toFixed(1)}%`);
    console.log(`  응답시간: ${this.config.alertThresholds.responseTime}ms`);
    console.log(`  치명적 이상 패턴: ${this.config.alertThresholds.criticalAnomalies}개\n`);
    
    console.log('계속하려면 아무 키나 누르세요...');
    
    // 키 입력 대기
    process.stdin.once('data', () => {
      this.checkSystemStatus();
    });
  }
  
  /**
   * 헤더 출력
   */
  private printHeader(): void {
    console.log('=' .repeat(60));
    console.log('🏆 NASUN 리더보드 실시간 모니터링');
    console.log('=' .repeat(60));
  }
  
  // 색상 유틸리티 메서드들
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'healthy': return '✅';
      case 'warning': return '⚠️ ';
      case 'critical': return '🔴';
      default: return '❓';
    }
  }
  
  private getStatusColor(status: string): string {
    switch (status) {
      case 'healthy': return '\u001b[32m'; // 녹색
      case 'warning': return '\u001b[33m'; // 노란색
      case 'critical': return '\u001b[31m'; // 빨간색
      default: return '\u001b[0m'; // 기본색
    }
  }
  
  private getQualityColor(score: number): string {
    if (score >= 90) return '\u001b[32m'; // 녹색
    if (score >= 70) return '\u001b[33m'; // 노란색
    return '\u001b[31m'; // 빨간색
  }
  
  private getPerformanceColor(status: string): string {
    switch (status) {
      case 'good': return '\u001b[32m'; // 녹색
      case 'degraded': return '\u001b[33m'; // 노란색
      case 'poor': return '\u001b[31m'; // 빨간색
      default: return '\u001b[0m'; // 기본색
    }
  }
  
  private getResourceColor(status: string): string {
    switch (status) {
      case 'normal': return '\u001b[32m'; // 녹색
      case 'high': return '\u001b[33m'; // 노란색
      case 'critical': return '\u001b[31m'; // 빨간색
      default: return '\u001b[0m'; // 기본색
    }
  }
}

/**
 * 메인 실행 함수
 */
async function runRealTimeMonitoring(): Promise<void> {
  const args = process.argv.slice(2);
  
  // 설정 파싱
  const config: Partial<MonitoringConfig> = {};
  
  if (args.includes('--fast')) {
    config.refreshInterval = 10; // 10초
  }
  
  if (args.includes('--slow')) {
    config.refreshInterval = 60; // 1분
  }
  
  if (args.includes('--sound')) {
    config.enableSound = true;
  }
  
  if (args.includes('--help')) {
    console.log('📖 실시간 모니터링 사용법\n');
    console.log('사용법: pnpm run monitor:live [options]\n');
    console.log('옵션:');
    console.log('  --fast     빠른 갱신 (10초)');
    console.log('  --slow     느린 갱신 (60초)');
    console.log('  --sound    알림 사운드 활성화');
    console.log('  --help     이 도움말 표시\n');
    console.log('예시:');
    console.log('  pnpm run monitor:live');
    console.log('  pnpm run monitor:live -- --fast --sound');
    return;
  }
  
  const monitor = new RealTimeMonitoringCLI(config);
  await monitor.startMonitoring();
}

// 메인 실행
if (require.main === module) {
  runRealTimeMonitoring().catch(error => {
    console.error('💥 모니터링 실행 실패:', error);
    process.exit(1);
  });
}

export { runRealTimeMonitoring };