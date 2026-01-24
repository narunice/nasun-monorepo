/**
 * 데이터 품질 대시보드 CLI 유틸리티
 * 
 * 개발자가 터미널에서 직접 데이터 품질을 확인할 수 있는
 * 명령줄 인터페이스를 제공합니다.
 */

import { DataQualityMonitor } from "../services/data-quality-monitor";

/**
 * CLI 명령어 인터페이스
 */
interface CliCommand {
  command: string;
  description: string;
  handler: (args: string[]) => Promise<void>;
}

/**
 * 데이터 품질 대시보드 CLI
 */
export class DashboardCLI {
  private monitor: DataQualityMonitor;
  private commands: CliCommand[];

  constructor() {
    this.monitor = new DataQualityMonitor();
    this.commands = [
      {
        command: 'status',
        description: '현재 데이터 품질 상태 확인',
        handler: this.handleStatus.bind(this)
      },
      {
        command: 'report',
        description: '상세 품질 리포트 생성',
        handler: this.handleReport.bind(this)
      },
      {
        command: 'anomalies',
        description: '이상 패턴 감지 및 분석',
        handler: this.handleAnomalies.bind(this)
      },
      {
        command: 'metrics',
        description: '핵심 메트릭 요약',
        handler: this.handleMetrics.bind(this)
      },
      {
        command: 'help',
        description: '사용 가능한 명령어 목록',
        handler: this.handleHelp.bind(this)
      }
    ];
  }

  /**
   * CLI 실행
   */
  async run(args: string[]): Promise<void> {
    if (args.length === 0) {
      await this.handleHelp([]);
      return;
    }

    const commandName = args[0];
    const commandArgs = args.slice(1);
    
    const command = this.commands.find(cmd => cmd.command === commandName);
    
    if (!command) {
      console.log(`❌ 알 수 없는 명령어: ${commandName}`);
      console.log('사용 가능한 명령어를 보려면 "help"를 입력하세요.');
      return;
    }

    try {
      await command.handler(commandArgs);
    } catch (error) {
      console.error(`❌ 명령어 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 현재 상태 확인
   */
  private async handleStatus(args: string[]): Promise<void> {
    const targetDate = args[0] || new Date().toISOString().split('T')[0];
    
    console.log('🔍 데이터 품질 상태 확인 중...\n');
    
    const metrics = await this.monitor.collectQualityMetrics(targetDate);
    
    console.log(`📅 분석 일자: ${targetDate}`);
    console.log(`🚨 전체 경고 수준: ${this.getAlertIcon(metrics.alertLevel)} ${metrics.alertLevel}\n`);
    
    // 핵심 지표 요약
    console.log('📊 핵심 품질 지표:');
    console.log(`├─ Engagement Type 품질: ${this.getStatusIcon(metrics.validEngagementTypeRatio, 0.95)} ${(metrics.validEngagementTypeRatio * 100).toFixed(1)}%`);
    console.log(`├─ Followers Count 커버리지: ${this.getStatusIcon(metrics.followersCountCoverageRatio, 0.9)} ${(metrics.followersCountCoverageRatio * 100).toFixed(1)}%`);
    console.log(`├─ 가중치 계산 정확도: ${this.getStatusIcon(metrics.weightCalculationAccuracy, 0.95)} ${(metrics.weightCalculationAccuracy * 100).toFixed(1)}%`);
    console.log(`├─ 데이터 완성도: ${this.getStatusIcon(metrics.dataCompletenessRatio, 0.95)} ${(metrics.dataCompletenessRatio * 100).toFixed(1)}%`);
    console.log(`└─ 오류율: ${this.getErrorIcon(metrics.errorRate)} ${(metrics.errorRate * 100).toFixed(2)}%\n`);
    
    // 이상 패턴 요약
    if (metrics.suspiciousPatterns.length > 0) {
      console.log(`🚨 감지된 이상 패턴: ${metrics.suspiciousPatterns.length}개`);
      const highCount = metrics.suspiciousPatterns.filter(a => a.severity === 'HIGH').length;
      const mediumCount = metrics.suspiciousPatterns.filter(a => a.severity === 'MEDIUM').length;
      const lowCount = metrics.suspiciousPatterns.filter(a => a.severity === 'LOW').length;
      
      if (highCount > 0) console.log(`├─ 🔴 높음: ${highCount}개`);
      if (mediumCount > 0) console.log(`├─ 🟡 보통: ${mediumCount}개`);
      if (lowCount > 0) console.log(`└─ 🟢 낮음: ${lowCount}개`);
      console.log();
    } else {
      console.log('✅ 이상 패턴이 감지되지 않았습니다.\n');
    }
    
    console.log('💡 더 상세한 정보를 보려면 "report" 명령어를 사용하세요.');
  }

  /**
   * 상세 리포트 생성
   */
  private async handleReport(args: string[]): Promise<void> {
    const targetDate = args[0] || new Date().toISOString().split('T')[0];
    
    console.log('📋 상세 품질 리포트 생성 중...\n');
    
    const report = await this.monitor.generateQualityReport(targetDate);
    console.log(report);
  }

  /**
   * 이상 패턴 분석
   */
  private async handleAnomalies(args: string[]): Promise<void> {
    const targetDate = args[0] || new Date().toISOString().split('T')[0];
    const severityFilter = args[1] as 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
    
    console.log('🕵️ 이상 패턴 분석 중...\n');
    
    const metrics = await this.monitor.collectQualityMetrics(targetDate);
    
    let filteredAnomalies = metrics.suspiciousPatterns;
    if (severityFilter) {
      filteredAnomalies = metrics.suspiciousPatterns.filter(
        pattern => pattern.severity === severityFilter
      );
    }
    
    if (filteredAnomalies.length === 0) {
      console.log('✅ 이상 패턴이 감지되지 않았습니다.');
      return;
    }
    
    console.log(`📅 분석 일자: ${targetDate}`);
    if (severityFilter) {
      console.log(`🔍 필터: ${severityFilter} 심각도`);
    }
    console.log(`📊 감지된 패턴: ${filteredAnomalies.length}개\n`);
    
    // 심각도별 그룹화
    const groupedAnomalies = this.groupAnomaliesBySeverity(filteredAnomalies);
    
    ['HIGH', 'MEDIUM', 'LOW'].forEach(severity => {
      const anomalies = groupedAnomalies[severity as keyof typeof groupedAnomalies];
      if (anomalies.length > 0) {
        const severityIcon = severity === 'HIGH' ? '🔴' : severity === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`${severityIcon} ${severity} 심각도 (${anomalies.length}개):`);
        
        anomalies.forEach((anomaly, index) => {
          const prefix = index === anomalies.length - 1 ? '└─' : '├─';
          console.log(`${prefix} ${anomaly.type}: ${anomaly.description}`);
          
          if (anomaly.userId) {
            console.log(`   사용자: ${anomaly.userId}`);
          }
          
          if (Object.keys(anomaly.metadata).length > 0) {
            console.log(`   메타데이터: ${JSON.stringify(anomaly.metadata)}`);
          }
        });
        console.log();
      }
    });
  }

  /**
   * 핵심 메트릭 요약
   */
  private async handleMetrics(args: string[]): Promise<void> {
    const targetDate = args[0] || new Date().toISOString().split('T')[0];
    
    console.log('📊 핵심 메트릭 수집 중...\n');
    
    const metrics = await this.monitor.collectQualityMetrics(targetDate);
    
    console.log(`📅 분석 일자: ${targetDate}\n`);
    
    // Engagement Type 메트릭
    console.log('🎯 Engagement Type 품질:');
    console.log(`├─ 유효 비율: ${(metrics.validEngagementTypeRatio * 100).toFixed(2)}%`);
    console.log(`├─ 미분류 수: ${metrics.unknownEngagementTypeCount}개`);
    console.log('├─ 타입별 분포:');
    
    Array.from(metrics.engagementTypeDistribution.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count], index, array) => {
        const prefix = index === array.length - 1 ? '│  └─' : '│  ├─';
        console.log(`${prefix} ${type}: ${count}개`);
      });
    console.log();
    
    // Followers Count 메트릭
    console.log('👥 Followers Count 품질:');
    console.log(`├─ 커버리지: ${(metrics.followersCountCoverageRatio * 100).toFixed(2)}%`);
    console.log(`├─ 평균 팔로워: ${Math.round(metrics.averageFollowersCount).toLocaleString()}명`);
    console.log('├─ 범위별 분포:');
    
    Array.from(metrics.followersCountDistribution.entries())
      .sort((a, b) => {
        // 범위 순서대로 정렬
        const order = ['0', '1-100', '101-500', '501-1K', '1K-5K', '5K-10K', '10K-50K', '50K-100K', '100K-500K', '500K-1M', '1M+'];
        return order.indexOf(a[0]) - order.indexOf(b[0]);
      })
      .forEach(([range, count], index, array) => {
        const prefix = index === array.length - 1 ? '│  └─' : '│  ├─';
        console.log(`${prefix} ${range}: ${count}명`);
      });
    console.log();
    
    // Score Calculation 메트릭
    console.log('⚖️ 가중치 계산 품질:');
    console.log(`├─ 계산 정확도: ${(metrics.weightCalculationAccuracy * 100).toFixed(2)}%`);
    console.log(`├─ 한국 커뮤니티: ${(metrics.koreanCommunityRatio * 100).toFixed(1)}%`);
    console.log(`├─ 글로벌 커뮤니티: ${(metrics.globalCommunityRatio * 100).toFixed(1)}%`);
    console.log(`└─ 평균 가중치: ${metrics.averageWeightApplied.toFixed(2)}\n`);
    
    // Pipeline 메트릭
    console.log('🔄 데이터 파이프라인:');
    console.log(`├─ 처리 지연시간: ${metrics.dataProcessingLatency}분`);
    console.log(`├─ 오류율: ${(metrics.errorRate * 100).toFixed(2)}%`);
    console.log(`├─ 데이터 완성도: ${(metrics.dataCompletenessRatio * 100).toFixed(2)}%`);
    console.log(`└─ 일일 처리량: ${metrics.dailyProcessedCount.toLocaleString()}건\n`);
  }

  /**
   * 도움말 표시
   */
  private async handleHelp(_args: string[]): Promise<void> {
    console.log('📖 NASUN 데이터 품질 대시보드 CLI\n');
    console.log('사용법: npm run dashboard <command> [arguments]\n');
    console.log('사용 가능한 명령어:\n');
    
    this.commands.forEach(cmd => {
      console.log(`├─ ${cmd.command.padEnd(12)} : ${cmd.description}`);
    });
    
    console.log('\n예시:');
    console.log('├─ npm run dashboard status              # 현재 상태 확인');
    console.log('├─ npm run dashboard status 2023-12-01   # 특정 날짜 상태 확인');
    console.log('├─ npm run dashboard report              # 상세 리포트');
    console.log('├─ npm run dashboard anomalies           # 모든 이상 패턴');
    console.log('├─ npm run dashboard anomalies 2023-12-01 HIGH  # 특정 날짜 HIGH 심각도만');
    console.log('└─ npm run dashboard metrics             # 핵심 메트릭 요약\n');
  }

  /**
   * 상태 아이콘 반환
   */
  private getStatusIcon(value: number, threshold: number): string {
    if (value >= threshold) return '✅';
    if (value >= threshold * 0.9) return '⚠️';
    return '❌';
  }

  /**
   * 오류율 아이콘 반환
   */
  private getErrorIcon(errorRate: number): string {
    if (errorRate < 0.01) return '✅';
    if (errorRate < 0.05) return '⚠️';
    return '❌';
  }

  /**
   * 경고 수준 아이콘 반환
   */
  private getAlertIcon(level: 'GREEN' | 'YELLOW' | 'RED'): string {
    switch (level) {
      case 'GREEN': return '✅';
      case 'YELLOW': return '⚠️';
      case 'RED': return '🚨';
      default: return '❓';
    }
  }

  /**
   * 이상 패턴을 심각도별로 그룹화
   */
  private groupAnomaliesBySeverity(anomalies: any[]) {
    return {
      HIGH: anomalies.filter(a => a.severity === 'HIGH'),
      MEDIUM: anomalies.filter(a => a.severity === 'MEDIUM'),
      LOW: anomalies.filter(a => a.severity === 'LOW')
    };
  }
}

/**
 * CLI 진입점
 */
export async function runDashboardCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const cli = new DashboardCLI();
  await cli.run(args);
}

// CLI로 직접 실행된 경우
if (require.main === module) {
  runDashboardCLI().catch(error => {
    console.error('❌ CLI 실행 실패:', error);
    process.exit(1);
  });
}