// Phase 3.4: 최적화된 스케줄 시뮬레이션 서비스
// 실제 배포 전 24시간 스케줄링 동작을 시뮬레이션하여 안전성 검증

import { RateLimitMonitor } from '../utils/rate-limit-monitor';
import { rateLimitDashboard } from './rate-limit-dashboard';
import { automatedRecovery } from './automated-recovery';

interface ScheduleEntry {
  time: string; // "HH:MM" 형태
  utcHour: number;
  utcMinute: number;
  function: string;
  batchNumber?: number;
  estimatedApiCalls: number;
  description: string;
}

interface SimulationTimeSlot {
  timeSlot: string;
  scheduledJobs: ScheduleEntry[];
  totalApiCalls: number;
  rateLimitUsage: number;
  conflicts: string[];
  recommendations: string[];
}

interface ScheduleSimulationResult {
  simulationDate: Date;
  totalDuration: number;
  totalApiCalls: number;
  peakRateLimitUsage: number;
  conflictCount: number;
  safetyScore: number; // 0-100점
  hourlyBreakdown: SimulationTimeSlot[];
  criticalIssues: string[];
  optimizationSuggestions: string[];
  overallAssessment: 'SAFE' | 'RISKY' | 'DANGEROUS';
}

export class ScheduleSimulator {
  private rateLimitMonitor: RateLimitMonitor;
  
  // Phase 3에서 설계된 최적화된 스케줄 (분석 문서 기반)
  private optimizedSchedule: ScheduleEntry[] = [
    // V1 데이터 수집
    {
      time: "00:00",
      utcHour: 0,
      utcMinute: 0,
      function: "nasun-dailydatacollection",
      estimatedApiCalls: 46,
      description: "V1 Legacy system daily collection"
    },
    
    // V2 누적 데이터 수집
    {
      time: "02:00",
      utcHour: 2,
      utcMinute: 0,
      function: "nasun-cumulative-data-collector-v2",
      estimatedApiCalls: 50,
      description: "V2 Cumulative data collection"
    },
    
    // 리트윗 보너스 배치 1-4 (06:00-06:45)
    {
      time: "06:00",
      utcHour: 6,
      utcMinute: 0,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 1,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 1/13"
    },
    {
      time: "06:15",
      utcHour: 6,
      utcMinute: 15,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 2,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 2/13"
    },
    {
      time: "06:30",
      utcHour: 6,
      utcMinute: 30,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 3,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 3/13"
    },
    {
      time: "06:45",
      utcHour: 6,
      utcMinute: 45,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 4,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 4/13"
    },
    
    // 리트윗 보너스 배치 5-8 (07:00-07:45)
    {
      time: "07:00",
      utcHour: 7,
      utcMinute: 0,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 5,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 5/13"
    },
    {
      time: "07:15",
      utcHour: 7,
      utcMinute: 15,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 6,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 6/13"
    },
    {
      time: "07:30",
      utcHour: 7,
      utcMinute: 30,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 7,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 7/13"
    },
    {
      time: "07:45",
      utcHour: 7,
      utcMinute: 45,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 8,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 8/13"
    },
    
    // 리트윗 보너스 배치 9-12 (08:00-08:45)
    {
      time: "08:00",
      utcHour: 8,
      utcMinute: 0,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 9,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 9/13"
    },
    {
      time: "08:15",
      utcHour: 8,
      utcMinute: 15,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 10,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 10/13"
    },
    {
      time: "08:30",
      utcHour: 8,
      utcMinute: 30,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 11,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 11/13"
    },
    {
      time: "08:45",
      utcHour: 8,
      utcMinute: 45,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 12,
      estimatedApiCalls: 8,
      description: "Retweet bonus batch 12/13"
    },
    
    // 리트윗 보너스 마지막 배치 (09:00)
    {
      time: "09:00",
      utcHour: 9,
      utcMinute: 0,
      function: "nasun-retweet-bonus-batch",
      batchNumber: 13,
      estimatedApiCalls: 4,
      description: "Retweet bonus batch 13/13 (final)"
    }
  ];

  constructor() {
    this.rateLimitMonitor = RateLimitMonitor.getInstance();
  }

  /**
   * 24시간 스케줄 시뮬레이션 실행
   */
  public async simulateFullSchedule(): Promise<ScheduleSimulationResult> {
    console.log(`🎬 [SCHEDULE_SIM] 24시간 최적화 스케줄 시뮬레이션 시작`);
    console.log(`📊 [SCHEDULE_SIM] 총 ${this.optimizedSchedule.length}개 작업 시뮬레이션 예정`);

    const simulationStart = Date.now();
    let totalApiCalls = 0;
    let peakRateLimitUsage = 0;
    let conflictCount = 0;
    const criticalIssues: string[] = [];
    const hourlyBreakdown: SimulationTimeSlot[] = [];

    // 시간별로 그룹핑하여 분석
    const hourlyGroups = this.groupScheduleByHour();

    for (const [hour, jobs] of hourlyGroups.entries()) {
      console.log(`\n🕐 [HOUR_${hour}] ${hour}:00 시간대 시뮬레이션 (${jobs.length}개 작업)`);
      
      const timeSlot = await this.simulateHourlySlot(hour, jobs);
      hourlyBreakdown.push(timeSlot);

      totalApiCalls += timeSlot.totalApiCalls;
      peakRateLimitUsage = Math.max(peakRateLimitUsage, timeSlot.rateLimitUsage);
      conflictCount += timeSlot.conflicts.length;

      // 크리티컬 이슈 수집
      if (timeSlot.rateLimitUsage > 80) {
        criticalIssues.push(`Hour ${hour}: Rate Limit usage ${timeSlot.rateLimitUsage.toFixed(1)}% exceeds safe threshold`);
      }

      if (timeSlot.conflicts.length > 0) {
        criticalIssues.push(`Hour ${hour}: ${timeSlot.conflicts.length} scheduling conflicts detected`);
      }
    }

    const simulationDuration = Date.now() - simulationStart;
    const safetyScore = this.calculateSafetyScore(peakRateLimitUsage, conflictCount, criticalIssues.length);
    const overallAssessment = this.assessOverallSafety(safetyScore, peakRateLimitUsage, criticalIssues.length);
    const optimizationSuggestions = this.generateOptimizationSuggestions(hourlyBreakdown, peakRateLimitUsage, totalApiCalls);

    const result: ScheduleSimulationResult = {
      simulationDate: new Date(),
      totalDuration: simulationDuration,
      totalApiCalls,
      peakRateLimitUsage,
      conflictCount,
      safetyScore,
      hourlyBreakdown,
      criticalIssues,
      optimizationSuggestions,
      overallAssessment
    };

    console.log(`🎉 [SCHEDULE_SIM] 시뮬레이션 완료 (${simulationDuration}ms)`);
    this.printSimulationReport(result);

    return result;
  }

  /**
   * 시간별 스케줄 그룹핑
   */
  private groupScheduleByHour(): Map<number, ScheduleEntry[]> {
    const hourlyGroups = new Map<number, ScheduleEntry[]>();

    for (const entry of this.optimizedSchedule) {
      const hour = entry.utcHour;
      
      if (!hourlyGroups.has(hour)) {
        hourlyGroups.set(hour, []);
      }
      
      hourlyGroups.get(hour)!.push(entry);
    }

    return hourlyGroups;
  }

  /**
   * 시간대별 슬롯 시뮬레이션
   */
  private async simulateHourlySlot(hour: number, jobs: ScheduleEntry[]): Promise<SimulationTimeSlot> {
    const timeSlot = `${hour.toString().padStart(2, '0')}:00-${hour.toString().padStart(2, '0')}:59`;
    const totalApiCalls = jobs.reduce((sum, job) => sum + job.estimatedApiCalls, 0);
    const conflicts: string[] = [];
    const recommendations: string[] = [];

    // Rate Limit 사용률 계산 (15분 윈도우 기준)
    let rateLimitUsage = 0;
    
    // 15분 간격으로 나누어 계산
    const quarterHours = [0, 15, 30, 45];
    let maxQuarterUsage = 0;

    for (const quarter of quarterHours) {
      const quarterJobs = jobs.filter(job => 
        job.utcMinute >= quarter && job.utcMinute < quarter + 15
      );
      
      if (quarterJobs.length > 0) {
        const quarterApiCalls = quarterJobs.reduce((sum, job) => sum + job.estimatedApiCalls, 0);
        const quarterUsage = (quarterApiCalls / 15) * 100; // 15개 호출 기준
        maxQuarterUsage = Math.max(maxQuarterUsage, quarterUsage);

        // 동시 실행 충돌 체크
        if (quarterJobs.length > 1) {
          const conflictingJobs = quarterJobs.map(j => j.function).join(', ');
          conflicts.push(`${hour}:${quarter.toString().padStart(2, '0')} - Multiple jobs: ${conflictingJobs}`);
        }
      }
    }

    rateLimitUsage = maxQuarterUsage;

    // 권장사항 생성
    if (rateLimitUsage > 80) {
      recommendations.push('Rate Limit 사용률이 높습니다. 작업을 다른 시간대로 이동을 고려하세요.');
    }

    if (totalApiCalls > 50) {
      recommendations.push('시간당 API 호출이 많습니다. 배치 크기를 줄이는 것을 권장합니다.');
    }

    if (conflicts.length === 0 && rateLimitUsage < 60) {
      recommendations.push('이 시간대는 안전하게 구성되어 있습니다.');
    }

    console.log(`  📊 ${timeSlot}: ${totalApiCalls}개 API 호출, ${rateLimitUsage.toFixed(1)}% 사용률, ${conflicts.length}개 충돌`);

    return {
      timeSlot,
      scheduledJobs: jobs,
      totalApiCalls,
      rateLimitUsage,
      conflicts,
      recommendations
    };
  }

  /**
   * 안전성 점수 계산
   */
  private calculateSafetyScore(
    peakUsage: number,
    conflictCount: number,
    criticalIssueCount: number
  ): number {
    let score = 100;

    // Rate Limit 사용률에 따른 감점
    if (peakUsage > 90) score -= 40;
    else if (peakUsage > 80) score -= 25;
    else if (peakUsage > 70) score -= 15;
    else if (peakUsage > 60) score -= 5;

    // 충돌에 따른 감점
    score -= conflictCount * 10;

    // 크리티컬 이슈에 따른 감점
    score -= criticalIssueCount * 5;

    return Math.max(0, score);
  }

  /**
   * 전체 안전성 평가
   */
  private assessOverallSafety(
    safetyScore: number,
    peakUsage: number,
    criticalIssueCount: number
  ): 'SAFE' | 'RISKY' | 'DANGEROUS' {
    if (safetyScore >= 80 && peakUsage < 70 && criticalIssueCount === 0) {
      return 'SAFE';
    } else if (safetyScore >= 60 && peakUsage < 90) {
      return 'RISKY';
    } else {
      return 'DANGEROUS';
    }
  }

  /**
   * 최적화 제안 생성
   */
  private generateOptimizationSuggestions(
    hourlyBreakdown: SimulationTimeSlot[],
    peakUsage: number,
    totalApiCalls: number
  ): string[] {
    const suggestions: string[] = [];

    if (peakUsage > 80) {
      suggestions.push('⚠️ 피크 Rate Limit 사용률이 높습니다. 배치 크기를 8개에서 6개로 줄이는 것을 권장합니다.');
    }

    if (totalApiCalls > 250) {
      suggestions.push('📊 일일 총 API 호출이 많습니다. 일부 배치를 다른 날로 분산하는 것을 고려하세요.');
    }

    // 빈 시간대 찾기
    const busyHours = hourlyBreakdown.filter(slot => slot.totalApiCalls > 0).length;
    if (busyHours < 6) {
      suggestions.push('⏰ 사용하지 않는 시간대가 많습니다. 더 균등한 분산을 고려해보세요.');
    }

    // 충돌이 많은 시간대
    const conflictHours = hourlyBreakdown.filter(slot => slot.conflicts.length > 0);
    if (conflictHours.length > 0) {
      suggestions.push(`🚨 ${conflictHours.length}개 시간대에서 충돌이 발생합니다. 스케줄 조정이 필요합니다.`);
    }

    if (suggestions.length === 0) {
      suggestions.push('✅ 현재 스케줄이 최적화되어 있습니다. 안전한 배포가 가능합니다.');
    }

    return suggestions;
  }

  /**
   * 시뮬레이션 보고서 출력
   */
  private printSimulationReport(result: ScheduleSimulationResult): void {
    console.log(`
🎬 ====== 스케줄 시뮬레이션 보고서 ======
📅 시뮬레이션 일시: ${result.simulationDate.toISOString()}
⏱️ 소요 시간: ${result.totalDuration}ms
🎯 전체 평가: ${result.overallAssessment} (${result.safetyScore}점/100점)

📊 === 요약 통계 ===
📞 총 API 호출: ${result.totalApiCalls}개/일
📈 최대 Rate Limit 사용률: ${result.peakRateLimitUsage.toFixed(1)}%
⚠️ 충돌 건수: ${result.conflictCount}개
🚨 크리티컬 이슈: ${result.criticalIssues.length}개

📋 === 시간대별 상세 ===
${result.hourlyBreakdown
  .filter(slot => slot.totalApiCalls > 0)
  .map(slot => `${slot.rateLimitUsage > 70 ? '🔴' : slot.rateLimitUsage > 50 ? '🟡' : '🟢'} ${slot.timeSlot}: ${slot.totalApiCalls}개 호출, ${slot.rateLimitUsage.toFixed(1)}% 사용률`)
  .join('\n')}

🚨 === 크리티컬 이슈 ===
${result.criticalIssues.length > 0 ? result.criticalIssues.map(issue => `  ❌ ${issue}`).join('\n') : '  ✅ 크리티컬 이슈 없음'}

💡 === 최적화 제안 ===
${result.optimizationSuggestions.map(suggestion => `  • ${suggestion}`).join('\n')}
=====================================
`);
  }

  /**
   * 특정 시나리오별 스케줄 검증
   */
  public async validateSpecificScenario(scenarioName: string): Promise<{
    scenarioName: string;
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    console.log(`🔍 [SCENARIO_VALIDATION] ${scenarioName} 시나리오 검증`);
    
    const issues: string[] = [];
    const recommendations: string[] = [];

    switch (scenarioName) {
      case 'peak_hours':
        // 06:00-09:00 시간대 집중 검증
        const peakHours = this.optimizedSchedule.filter(entry => 
          entry.utcHour >= 6 && entry.utcHour <= 9
        );
        
        const peakApiCalls = peakHours.reduce((sum, entry) => sum + entry.estimatedApiCalls, 0);
        
        if (peakApiCalls > 100) {
          issues.push(`피크 시간대 API 호출이 ${peakApiCalls}개로 과도합니다.`);
          recommendations.push('배치 크기를 줄이거나 일부 배치를 다른 시간대로 이동하세요.');
        }
        break;

      case 'rate_limit_safety':
        // 15분 윈도우 안전성 검증
        let maxWindowCalls = 0;
        
        for (let hour = 0; hour < 24; hour++) {
          for (let quarter = 0; quarter < 4; quarter++) {
            const windowStart = hour * 60 + quarter * 15;
            const windowEnd = windowStart + 15;
            
            let windowCalls = 0;
            for (const entry of this.optimizedSchedule) {
              const entryMinute = entry.utcHour * 60 + entry.utcMinute;
              if (entryMinute >= windowStart && entryMinute < windowEnd) {
                windowCalls += entry.estimatedApiCalls;
              }
            }
            
            maxWindowCalls = Math.max(maxWindowCalls, windowCalls);
          }
        }
        
        if (maxWindowCalls > 8) {
          issues.push(`15분 윈도우 최대 호출이 ${maxWindowCalls}개로 안전 제한(8개)를 초과합니다.`);
          recommendations.push('배치를 더 세분화하거나 시간 간격을 늘리세요.');
        }
        break;

      case 'schedule_distribution':
        // 24시간 분산 검증
        const hourlyDistribution = new Array(24).fill(0);
        
        for (const entry of this.optimizedSchedule) {
          hourlyDistribution[entry.utcHour] += entry.estimatedApiCalls;
        }
        
        const nonZeroHours = hourlyDistribution.filter(calls => calls > 0).length;
        const maxHourCalls = Math.max(...hourlyDistribution);
        
        if (nonZeroHours < 4) {
          issues.push('스케줄이 너무 집중되어 있습니다.');
          recommendations.push('더 많은 시간대에 걸쳐 작업을 분산하세요.');
        }
        
        if (maxHourCalls > 50) {
          issues.push(`특정 시간대(${maxHourCalls}개 호출)에 과부하가 집중됩니다.`);
          recommendations.push('부하가 높은 시간대의 작업을 분산하세요.');
        }
        break;
    }

    const valid = issues.length === 0;
    
    console.log(`${valid ? '✅' : '❌'} ${scenarioName} 검증 ${valid ? '통과' : '실패'} (${issues.length}개 이슈)`);

    return {
      scenarioName,
      valid,
      issues,
      recommendations
    };
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const scheduleSimulator = new ScheduleSimulator();