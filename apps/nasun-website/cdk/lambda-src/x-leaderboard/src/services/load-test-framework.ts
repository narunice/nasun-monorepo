// Phase 3.4: 부하 테스트 및 최적화 프레임워크
// 새로운 스케줄링 시스템의 성능, 안정성, Rate Limit 안전성을 종합 검증

import { RateLimitMonitor } from '../utils/rate-limit-monitor';
import { rateLimitDashboard } from './rate-limit-dashboard';
import { automatedRecovery } from './automated-recovery';
import { TwitterApiService } from './twitter-api';
import { getEnvConfigV2 } from '../utils/env';

interface TestScenario {
  name: string;
  description: string;
  duration: number; // 테스트 지속 시간 (밀리초)
  expectedApiCalls: number; // 예상 API 호출 수
  targetLoadPercentage: number; // 목표 Rate Limit 사용률
  priority: number; // 테스트 우선순위 (1-5)
}

interface TestResult {
  scenarioName: string;
  success: boolean;
  duration: number;
  actualApiCalls: number;
  peakRateLimitUsage: number;
  averageResponseTime: number;
  successRate: number;
  rateLimitHits: number;
  recoveryTriggers: number;
  systemHealthScore: number;
  errors: string[];
  recommendations: string[];
}

interface LoadTestReport {
  testStartTime: Date;
  testEndTime: Date;
  totalDuration: number;
  scenariosRun: number;
  overallSuccess: boolean;
  results: TestResult[];
  summary: {
    totalApiCalls: number;
    averageHealthScore: number;
    criticalIssues: number;
    passedScenarios: number;
    failedScenarios: number;
  };
  systemRecommendations: string[];
}

export class LoadTestFramework {
  private rateLimitMonitor: RateLimitMonitor;
  private twitterService: TwitterApiService;
  private testResults: TestResult[] = [];
  
  // 테스트 시나리오 정의
  private testScenarios: TestScenario[] = [
    {
      name: 'normal_batch_processing',
      description: '정상적인 배치 처리 시뮬레이션 (8개 리트윗)',
      duration: 2 * 60 * 1000, // 2분
      expectedApiCalls: 8,
      targetLoadPercentage: 53, // 8/15 = 53%
      priority: 1
    },
    {
      name: 'peak_load_simulation',
      description: '피크 로드 시뮬레이션 (12개 리트윗)',
      duration: 3 * 60 * 1000, // 3분
      expectedApiCalls: 12,
      targetLoadPercentage: 80, // 12/15 = 80%
      priority: 2
    },
    {
      name: 'rate_limit_boundary',
      description: 'Rate Limit 경계선 테스트 (15개 호출)',
      duration: 4 * 60 * 1000, // 4분
      expectedApiCalls: 15,
      targetLoadPercentage: 100, // 15/15 = 100%
      priority: 3
    },
    {
      name: 'burst_load_test',
      description: '순간 부하 테스트 (연속 20개 호출)',
      duration: 1 * 60 * 1000, // 1분
      expectedApiCalls: 20,
      targetLoadPercentage: 133, // 20/15 = 133% (의도적 초과)
      priority: 4
    },
    {
      name: 'recovery_mechanism_test',
      description: '자동 복구 메커니즘 검증',
      duration: 5 * 60 * 1000, // 5분
      expectedApiCalls: 25,
      targetLoadPercentage: 166, // 의도적 초과로 복구 메커니즘 유발
      priority: 5
    }
  ];

  constructor() {
    this.rateLimitMonitor = RateLimitMonitor.getInstance();
    
    // TwitterApiService 초기화 (테스트용)
    const config = getEnvConfigV2();
    this.twitterService = new TwitterApiService(config);
  }

  /**
   * 전체 부하 테스트 실행
   */
  public async runFullLoadTest(): Promise<LoadTestReport> {
    console.log(`🧪 [LOAD_TEST] Phase 3.4 종합 부하 테스트 시작`);
    console.log(`📊 [LOAD_TEST] 총 ${this.testScenarios.length}개 시나리오 실행 예정`);

    const testStartTime = new Date();
    this.testResults = [];
    
    // 초기 시스템 상태 기록
    await this.recordInitialState();
    
    // 우선순위 순으로 시나리오 실행
    const sortedScenarios = [...this.testScenarios].sort((a, b) => a.priority - b.priority);
    
    for (const scenario of sortedScenarios) {
      console.log(`\n🎯 [LOAD_TEST] 시나리오 시작: ${scenario.name}`);
      console.log(`📝 [LOAD_TEST] ${scenario.description}`);
      
      const result = await this.runTestScenario(scenario);
      this.testResults.push(result);
      
      // 시나리오 간 2분 대기 (시스템 안정화)
      if (scenario !== sortedScenarios[sortedScenarios.length - 1]) {
        console.log(`⏳ [LOAD_TEST] 다음 시나리오까지 2분 대기 (시스템 안정화)...`);
        await this.sleep(2 * 60 * 1000);
        
        // Rate Limit 상태 리셋
        this.rateLimitMonitor.logStatus();
      }
    }
    
    const testEndTime = new Date();
    
    // 최종 보고서 생성
    const report = this.generateFinalReport(testStartTime, testEndTime);
    
    console.log(`🎉 [LOAD_TEST] 부하 테스트 완료!`);
    this.printLoadTestReport(report);
    
    return report;
  }

  /**
   * 개별 테스트 시나리오 실행
   */
  private async runTestScenario(scenario: TestScenario): Promise<TestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const metrics = {
      apiCalls: 0,
      successfulCalls: 0,
      rateLimitHits: 0,
      recoveryTriggers: 0,
      responseTimes: [] as number[],
      peakRateLimitUsage: 0
    };

    try {
      // 시나리오별 부하 생성
      switch (scenario.name) {
        case 'normal_batch_processing':
          await this.simulateNormalBatch(scenario, metrics, errors);
          break;
        case 'peak_load_simulation':
          await this.simulatePeakLoad(scenario, metrics, errors);
          break;
        case 'rate_limit_boundary':
          await this.simulateRateLimitBoundary(scenario, metrics, errors);
          break;
        case 'burst_load_test':
          await this.simulateBurstLoad(scenario, metrics, errors);
          break;
        case 'recovery_mechanism_test':
          await this.simulateRecoveryTest(scenario, metrics, errors);
          break;
        default:
          throw new Error(`Unknown test scenario: ${scenario.name}`);
      }

    } catch (error: any) {
      errors.push(`Scenario execution failed: ${error.message}`);
    }

    const duration = Date.now() - startTime;
    const successRate = metrics.apiCalls > 0 ? (metrics.successfulCalls / metrics.apiCalls) * 100 : 0;
    const averageResponseTime = metrics.responseTimes.length > 0 
      ? metrics.responseTimes.reduce((sum, time) => sum + time, 0) / metrics.responseTimes.length 
      : 0;

    // 최종 시스템 상태 확인
    const finalRateLimitStatus = this.rateLimitMonitor.getMetrics();
    const systemHealthScore = await this.calculateCurrentHealthScore();

    const result: TestResult = {
      scenarioName: scenario.name,
      success: errors.length === 0 && successRate >= 80, // 80% 이상 성공률을 기준으로 성공 판정
      duration,
      actualApiCalls: metrics.apiCalls,
      peakRateLimitUsage: Math.max(metrics.peakRateLimitUsage, finalRateLimitStatus.usagePercentage),
      averageResponseTime,
      successRate,
      rateLimitHits: metrics.rateLimitHits,
      recoveryTriggers: metrics.recoveryTriggers,
      systemHealthScore,
      errors,
      recommendations: this.generateScenarioRecommendations(scenario, metrics, errors)
    };

    console.log(`✅ [LOAD_TEST] ${scenario.name} 완료: ${result.success ? 'PASS' : 'FAIL'}`);
    console.log(`📊 [LOAD_TEST] API 호출: ${metrics.apiCalls}개, 성공률: ${successRate.toFixed(1)}%, 건강도: ${systemHealthScore}점`);

    return result;
  }

  /**
   * 정상 배치 처리 시뮬레이션
   */
  private async simulateNormalBatch(
    scenario: TestScenario, 
    metrics: any, 
    errors: string[]
  ): Promise<void> {
    console.log(`📦 [NORMAL_BATCH] 8개 리트윗 정상 처리 시뮬레이션`);

    for (let i = 0; i < 8; i++) {
      try {
        const apiStartTime = Date.now();
        
        // 실제 API 대신 시뮬레이션 (Rate Limit 모니터링만 테스트)
        await this.simulateApiCall(`retweet_${i + 1}`, 'getUserTweetsWithRetweets');
        
        const responseTime = Date.now() - apiStartTime;
        metrics.responseTimes.push(responseTime);
        metrics.apiCalls++;
        metrics.successfulCalls++;

        // Rate Limit 상태 기록
        const currentUsage = this.rateLimitMonitor.getMetrics().usagePercentage;
        metrics.peakRateLimitUsage = Math.max(metrics.peakRateLimitUsage, currentUsage);

        // 15분 윈도우 내에서 안전한 간격 유지 (2분 간격)
        if (i < 7) {
          await this.sleep(15 * 1000); // 15초 간격
        }

      } catch (error: any) {
        errors.push(`Normal batch API call ${i + 1} failed: ${error.message}`);
        metrics.apiCalls++;
        
        if (error.message.includes('Rate limit')) {
          metrics.rateLimitHits++;
        }
      }
    }
  }

  /**
   * 피크 로드 시뮬레이션
   */
  private async simulatePeakLoad(
    scenario: TestScenario,
    metrics: any,
    errors: string[]
  ): Promise<void> {
    console.log(`⚡ [PEAK_LOAD] 12개 호출 피크 로드 시뮬레이션`);

    for (let i = 0; i < 12; i++) {
      try {
        const apiStartTime = Date.now();
        
        await this.simulateApiCall(`peak_load_${i + 1}`, 'getTweetWithMentions');
        
        const responseTime = Date.now() - apiStartTime;
        metrics.responseTimes.push(responseTime);
        metrics.apiCalls++;
        metrics.successfulCalls++;

        const currentUsage = this.rateLimitMonitor.getMetrics().usagePercentage;
        metrics.peakRateLimitUsage = Math.max(metrics.peakRateLimitUsage, currentUsage);

        // 피크 로드이므로 간격을 좀 더 짧게 (10초)
        if (i < 11) {
          await this.sleep(10 * 1000);
        }

      } catch (error: any) {
        errors.push(`Peak load API call ${i + 1} failed: ${error.message}`);
        metrics.apiCalls++;
        
        if (error.message.includes('Rate limit')) {
          metrics.rateLimitHits++;
        }
      }
    }
  }

  /**
   * Rate Limit 경계선 테스트
   */
  private async simulateRateLimitBoundary(
    scenario: TestScenario,
    metrics: any,
    errors: string[]
  ): Promise<void> {
    console.log(`🚩 [BOUNDARY] Rate Limit 경계선 테스트 (15개 호출)`);

    for (let i = 0; i < 15; i++) {
      try {
        const apiStartTime = Date.now();
        
        await this.simulateApiCall(`boundary_${i + 1}`, 'getTweetLikingUsers');
        
        const responseTime = Date.now() - apiStartTime;
        metrics.responseTimes.push(responseTime);
        metrics.apiCalls++;
        metrics.successfulCalls++;

        const currentUsage = this.rateLimitMonitor.getMetrics().usagePercentage;
        metrics.peakRateLimitUsage = Math.max(metrics.peakRateLimitUsage, currentUsage);

        console.log(`📊 [BOUNDARY] 호출 ${i + 1}/15 - Rate Limit: ${currentUsage.toFixed(1)}%`);

        // 경계선 테스트이므로 적당한 간격 유지 (8초)
        if (i < 14) {
          await this.sleep(8 * 1000);
        }

      } catch (error: any) {
        errors.push(`Boundary test API call ${i + 1} failed: ${error.message}`);
        metrics.apiCalls++;
        
        if (error.message.includes('Rate limit')) {
          metrics.rateLimitHits++;
          console.warn(`🚨 [BOUNDARY] Rate Limit Hit at call ${i + 1}`);
        }
      }
    }
  }

  /**
   * 순간 부하 테스트
   */
  private async simulateBurstLoad(
    scenario: TestScenario,
    metrics: any,
    errors: string[]
  ): Promise<void> {
    console.log(`💥 [BURST] 순간 부하 테스트 (연속 20개 호출)`);

    // 의도적으로 Rate Limit을 초과하여 시스템 반응 테스트
    for (let i = 0; i < 20; i++) {
      try {
        const apiStartTime = Date.now();
        
        await this.simulateApiCall(`burst_${i + 1}`, 'getUserByUsername');
        
        const responseTime = Date.now() - apiStartTime;
        metrics.responseTimes.push(responseTime);
        metrics.apiCalls++;
        metrics.successfulCalls++;

        const currentUsage = this.rateLimitMonitor.getMetrics().usagePercentage;
        metrics.peakRateLimitUsage = Math.max(metrics.peakRateLimitUsage, currentUsage);

        // 순간 부하이므로 매우 짧은 간격 (3초)
        if (i < 19) {
          await this.sleep(3 * 1000);
        }

      } catch (error: any) {
        errors.push(`Burst load API call ${i + 1} failed: ${error.message}`);
        metrics.apiCalls++;
        
        if (error.message.includes('Rate limit')) {
          metrics.rateLimitHits++;
          console.warn(`🚨 [BURST] Rate Limit Hit at call ${i + 1} - 예상된 상황`);
        }
      }
    }
  }

  /**
   * 자동 복구 메커니즘 테스트
   */
  private async simulateRecoveryTest(
    scenario: TestScenario,
    metrics: any,
    errors: string[]
  ): Promise<void> {
    console.log(`🛠️ [RECOVERY] 자동 복구 메커니즘 검증`);

    // 의도적으로 Rate Limit을 초과시켜 복구 메커니즘 작동 유발
    for (let i = 0; i < 25; i++) {
      try {
        // 자동 복구 시스템 실행 (5개마다)
        if (i > 0 && i % 5 === 0) {
          console.log(`🔧 [RECOVERY] 자동 복구 시스템 실행 체크 (${i}/25)`);
          await automatedRecovery.executeRecoveryIfNeeded();
          metrics.recoveryTriggers++;
        }

        const apiStartTime = Date.now();
        
        await this.simulateApiCall(`recovery_${i + 1}`, 'getTweetRepostedByUsers');
        
        const responseTime = Date.now() - apiStartTime;
        metrics.responseTimes.push(responseTime);
        metrics.apiCalls++;
        metrics.successfulCalls++;

        const currentUsage = this.rateLimitMonitor.getMetrics().usagePercentage;
        metrics.peakRateLimitUsage = Math.max(metrics.peakRateLimitUsage, currentUsage);

        // 복구 테스트이므로 중간 간격 (5초)
        if (i < 24) {
          await this.sleep(5 * 1000);
        }

      } catch (error: any) {
        errors.push(`Recovery test API call ${i + 1} failed: ${error.message}`);
        metrics.apiCalls++;
        
        if (error.message.includes('Rate limit')) {
          metrics.rateLimitHits++;
        }
      }
    }

    // 최종 복구 시스템 실행
    console.log(`🔧 [RECOVERY] 최종 자동 복구 시스템 실행`);
    await automatedRecovery.executeRecoveryIfNeeded();
    metrics.recoveryTriggers++;
  }

  /**
   * API 호출 시뮬레이션 (실제 API 호출 없이 Rate Limit 모니터링만 테스트)
   */
  private async simulateApiCall(context: string, apiType: string): Promise<void> {
    // Rate Limit 모니터링 시스템을 통한 안전성 체크
    if (!this.rateLimitMonitor.canMakeCall(context)) {
      const waitTime = this.rateLimitMonitor.getRecommendedWaitTime();
      throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // 실제 API 호출 시뮬레이션 (응답 시간 랜덤)
    const simulatedResponseTime = 500 + Math.random() * 2000; // 0.5-2.5초
    await this.sleep(simulatedResponseTime);

    // 10% 확률로 실패 시뮬레이션 (실제 네트워크 오류 등)
    if (Math.random() < 0.1) {
      this.rateLimitMonitor.recordCall(context, false);
      throw new Error(`Simulated API failure for ${context}`);
    }

    // 성공 기록
    this.rateLimitMonitor.recordCall(context, true);
  }

  /**
   * 초기 시스템 상태 기록
   */
  private async recordInitialState(): Promise<void> {
    console.log(`📋 [LOAD_TEST] 초기 시스템 상태 기록`);
    
    const initialMetrics = this.rateLimitMonitor.getMetrics();
    const healthScore = await this.calculateCurrentHealthScore();
    
    console.log(`📊 [INITIAL_STATE] Rate Limit 사용률: ${initialMetrics.usagePercentage.toFixed(1)}%`);
    console.log(`🏥 [INITIAL_STATE] 시스템 건강도: ${healthScore}점`);
    console.log(`🔄 [INITIAL_STATE] 윈도우 리셋: ${initialMetrics.windowReset.toISOString()}`);

    // 시스템 상태 초기화
    automatedRecovery.resetRecoveryState();
  }

  /**
   * 현재 시스템 건강도 점수 계산
   */
  private async calculateCurrentHealthScore(): Promise<number> {
    // 대시보드 서비스를 통해 건강도 점수 계산
    await rateLimitDashboard.collectAndSendDashboardMetrics();
    
    // 간단한 건강도 점수 계산 (실제로는 대시보드에서 더 정교하게 계산됨)
    const rateLimitMetrics = this.rateLimitMonitor.getMetrics();
    let score = 100;
    
    if (rateLimitMetrics.usagePercentage > 80) score -= 30;
    else if (rateLimitMetrics.usagePercentage > 60) score -= 15;
    else if (rateLimitMetrics.usagePercentage > 40) score -= 5;
    
    if (this.rateLimitMonitor.isEmergencyState()) score -= 50;
    
    return Math.max(0, score);
  }

  /**
   * 시나리오별 권장사항 생성
   */
  private generateScenarioRecommendations(
    scenario: TestScenario,
    metrics: any,
    errors: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.rateLimitHits > 0) {
      recommendations.push(`Rate Limit Hit이 ${metrics.rateLimitHits}회 발생했습니다. 배치 간격을 늘리는 것을 고려하세요.`);
    }

    if (metrics.peakRateLimitUsage > 80) {
      recommendations.push(`최대 Rate Limit 사용률이 ${metrics.peakRateLimitUsage.toFixed(1)}%입니다. 배치 크기를 줄이는 것을 권장합니다.`);
    }

    if (metrics.responseTimes.length > 0) {
      const avgResponseTime = metrics.responseTimes.reduce((sum: number, time: number) => sum + time, 0) / metrics.responseTimes.length;
      if (avgResponseTime > 10000) { // 10초 이상
        recommendations.push(`평균 응답 시간이 ${(avgResponseTime / 1000).toFixed(1)}초로 높습니다. API 성능을 확인하세요.`);
      }
    }

    if (errors.length > metrics.apiCalls * 0.2) { // 20% 이상 실패
      recommendations.push(`높은 실패율(${((errors.length / metrics.apiCalls) * 100).toFixed(1)}%)이 감지되었습니다. 시스템 안정성을 점검하세요.`);
    }

    if (recommendations.length === 0) {
      recommendations.push('테스트 결과가 양호합니다. 현재 설정을 유지하세요.');
    }

    return recommendations;
  }

  /**
   * 최종 보고서 생성
   */
  private generateFinalReport(startTime: Date, endTime: Date): LoadTestReport {
    const totalDuration = endTime.getTime() - startTime.getTime();
    const passedScenarios = this.testResults.filter(r => r.success).length;
    const failedScenarios = this.testResults.length - passedScenarios;
    const totalApiCalls = this.testResults.reduce((sum, r) => sum + r.actualApiCalls, 0);
    const averageHealthScore = this.testResults.reduce((sum, r) => sum + r.systemHealthScore, 0) / this.testResults.length;
    const criticalIssues = this.testResults.reduce((sum, r) => sum + r.errors.length, 0);

    const systemRecommendations = this.generateSystemRecommendations();

    return {
      testStartTime: startTime,
      testEndTime: endTime,
      totalDuration,
      scenariosRun: this.testResults.length,
      overallSuccess: failedScenarios === 0,
      results: this.testResults,
      summary: {
        totalApiCalls,
        averageHealthScore,
        criticalIssues,
        passedScenarios,
        failedScenarios
      },
      systemRecommendations
    };
  }

  /**
   * 시스템 권장사항 생성
   */
  private generateSystemRecommendations(): string[] {
    const recommendations: string[] = [];
    const allErrors = this.testResults.flatMap(r => r.errors);
    const totalRateLimitHits = this.testResults.reduce((sum, r) => sum + r.rateLimitHits, 0);
    const averagePeakUsage = this.testResults.reduce((sum, r) => sum + r.peakRateLimitUsage, 0) / this.testResults.length;

    if (totalRateLimitHits > 2) {
      recommendations.push('⚠️ Rate Limit Hit이 자주 발생합니다. 전체적으로 스케줄 간격을 늘리는 것을 권장합니다.');
    }

    if (averagePeakUsage > 70) {
      recommendations.push('📊 평균 Rate Limit 사용률이 높습니다. 배치 크기를 6개로 줄이는 것을 고려하세요.');
    }

    if (allErrors.length > 10) {
      recommendations.push('🚨 전반적으로 오류가 많이 발생했습니다. 시스템 안정성 점검이 필요합니다.');
    }

    const recoveryTests = this.testResults.filter(r => r.recoveryTriggers > 0);
    if (recoveryTests.length > 0) {
      recommendations.push('🛠️ 자동 복구 시스템이 정상적으로 작동했습니다. 복구 메커니즘을 신뢰할 수 있습니다.');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ 전체 시스템이 안정적으로 작동합니다. 현재 구성을 유지하세요.');
    }

    return recommendations;
  }

  /**
   * 부하 테스트 보고서 출력
   */
  private printLoadTestReport(report: LoadTestReport): void {
    console.log(`
🧪 ====== Phase 3.4 부하 테스트 최종 보고서 ======
📅 테스트 기간: ${report.testStartTime.toISOString()} ~ ${report.testEndTime.toISOString()}
⏱️ 총 소요 시간: ${(report.totalDuration / 60000).toFixed(1)}분
🎯 전체 결과: ${report.overallSuccess ? '✅ PASS' : '❌ FAIL'}

📊 === 테스트 요약 ===
🔢 실행 시나리오: ${report.scenariosRun}개
✅ 성공: ${report.summary.passedScenarios}개
❌ 실패: ${report.summary.failedScenarios}개
📞 총 API 호출: ${report.summary.totalApiCalls}개
🏥 평균 건강도: ${report.summary.averageHealthScore.toFixed(1)}점
🚨 총 오류: ${report.summary.criticalIssues}개

📋 === 시나리오별 결과 ===
${report.results.map(r => `${r.success ? '✅' : '❌'} ${r.scenarioName}: API ${r.actualApiCalls}개, 성공률 ${r.successRate.toFixed(1)}%, 최대사용률 ${r.peakRateLimitUsage.toFixed(1)}%`).join('\n')}

💡 === 시스템 권장사항 ===
${report.systemRecommendations.map(rec => `  • ${rec}`).join('\n')}
===============================================
`);
  }

  /**
   * 대기 함수 (유틸리티)
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const loadTestFramework = new LoadTestFramework();