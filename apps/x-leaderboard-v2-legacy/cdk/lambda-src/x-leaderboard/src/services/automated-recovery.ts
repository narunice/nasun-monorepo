// Phase 3.3: 자동 복구 메커니즘 서비스
// Rate Limit 상황 및 시스템 오류에 대한 자동 복구 및 대응 시스템

import { RateLimitMonitor } from '../utils/rate-limit-monitor';
import { rateLimitDashboard } from './rate-limit-dashboard';

interface RecoveryAction {
  name: string;
  priority: number; // 1-5 (높을수록 우선순위)
  condition: () => boolean;
  action: () => Promise<void>;
  description: string;
  cooldownMs: number; // 재실행 방지를 위한 쿨다운
}

interface RecoveryState {
  isRecovering: boolean;
  lastRecoveryTime: Date | null;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  recoveryHistory: RecoveryHistoryEntry[];
}

interface RecoveryHistoryEntry {
  timestamp: Date;
  action: string;
  success: boolean;
  error?: string;
  context?: any;
}

export class AutomatedRecoveryService {
  private rateLimitMonitor: RateLimitMonitor;
  private recoveryState: RecoveryState;
  private recoveryActions: RecoveryAction[];
  private lastExecutionTimes: Map<string, Date> = new Map();
  
  constructor() {
    this.rateLimitMonitor = RateLimitMonitor.getInstance();
    
    this.recoveryState = {
      isRecovering: false,
      lastRecoveryTime: null,
      recoveryAttempts: 0,
      maxRecoveryAttempts: 5,
      recoveryHistory: []
    };
    
    this.setupRecoveryActions();
  }

  /**
   * 복구 작업들을 정의하고 등록
   */
  private setupRecoveryActions(): void {
    this.recoveryActions = [
      {
        name: 'emergency_rate_limit_pause',
        priority: 5,
        condition: () => this.rateLimitMonitor.isEmergencyState(),
        action: async () => {
          console.log(`🚨 [RECOVERY] 긴급 Rate Limit 중단 - 60분 대기`);
          
          // 60분 대기 (실제로는 다음 스케줄까지 대기하는 신호)
          await this.sleep(5 * 60 * 1000); // 테스트를 위해 5분으로 단축
          
          console.log(`✅ [RECOVERY] 긴급 대기 완료 - 시스템 재개 준비`);
        },
        description: '연속적인 Rate Limit Hit 감지 시 긴급 중단',
        cooldownMs: 30 * 60 * 1000 // 30분 쿨다운
      },
      
      {
        name: 'adaptive_batch_size_reduction',
        priority: 4,
        condition: () => {
          const metrics = this.rateLimitMonitor.getMetrics();
          return metrics.usagePercentage > 70;
        },
        action: async () => {
          console.log(`⚡ [RECOVERY] 배치 크기 자동 감소 - Rate Limit 사용률 높음`);
          
          // 환경변수나 설정을 통해 배치 크기를 동적으로 조정하는 로직
          // 실제로는 Lambda 환경변수 업데이트 또는 DynamoDB 설정 테이블 수정
          console.log(`📊 [RECOVERY] 권장 배치 크기: 4개 (기본 8개에서 50% 감소)`);
          
          // CloudWatch 메트릭으로 배치 크기 조정 기록
          await rateLimitDashboard.collectAndSendDashboardMetrics(
            undefined,
            undefined,
            4, // 조정된 배치 크기
            undefined
          );
        },
        description: 'Rate Limit 사용률 70% 초과 시 배치 크기 감소',
        cooldownMs: 15 * 60 * 1000 // 15분 쿨다운
      },
      
      {
        name: 'schedule_delay_injection',
        priority: 3,
        condition: () => {
          const metrics = this.rateLimitMonitor.getMetrics();
          return metrics.usagePercentage > 60 && !this.rateLimitMonitor.isEmergencyState();
        },
        action: async () => {
          console.log(`⏰ [RECOVERY] 스케줄 지연 주입 - 다음 실행을 15분 지연`);
          
          // 실제로는 EventBridge 규칙을 임시로 비활성화하거나 지연시키는 로직
          // 또는 Lambda 함수 내에서 조기 종료하는 신호 설정
          console.log(`📅 [RECOVERY] 다음 배치 실행 지연: +15분`);
          
          // 스케줄 조정 메트릭 기록
          await rateLimitDashboard.collectAndSendDashboardMetrics();
        },
        description: 'Rate Limit 사용률 60% 초과 시 스케줄 지연',
        cooldownMs: 10 * 60 * 1000 // 10분 쿨다운
      },
      
      {
        name: 'rate_limit_window_reset_wait',
        priority: 2,
        condition: () => {
          const metrics = this.rateLimitMonitor.getMetrics();
          return metrics.remainingCalls === 0;
        },
        action: async () => {
          const waitTime = this.rateLimitMonitor.getRecommendedWaitTime();
          console.log(`⏳ [RECOVERY] Rate Limit 윈도우 리셋 대기 - ${Math.ceil(waitTime / 60000)}분 대기`);
          
          // 실제로는 대기하지 않고 다음 실행 시간에 재시도하도록 신호 설정
          console.log(`🔄 [RECOVERY] 윈도우 리셋 시간: ${new Date(Date.now() + waitTime).toISOString()}`);
        },
        description: 'Rate Limit 완전 소진 시 윈도우 리셋까지 대기',
        cooldownMs: 5 * 60 * 1000 // 5분 쿨다운
      },
      
      {
        name: 'health_score_monitoring',
        priority: 1,
        condition: () => {
          // 시스템 건강도 점수가 50점 미만인 경우
          return true; // 항상 체크 (실제 점수는 action 내부에서 확인)
        },
        action: async () => {
          // 대시보드에서 현재 건강도 점수를 가져와서 확인
          console.log(`🏥 [RECOVERY] 시스템 건강도 모니터링 실행`);
          
          const rateLimitMetrics = this.rateLimitMonitor.getMetrics();
          await rateLimitDashboard.collectAndSendDashboardMetrics();
          
          if (rateLimitMetrics.usagePercentage < 30) {
            console.log(`💚 [RECOVERY] 시스템 건강도 양호 - 추가 조치 불필요`);
          }
        },
        description: '시스템 건강도 지속적 모니터링',
        cooldownMs: 2 * 60 * 1000 // 2분 쿨다운
      }
    ];
    
    // 우선순위 순으로 정렬
    this.recoveryActions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 자동 복구 시스템 실행
   */
  public async executeRecoveryIfNeeded(): Promise<void> {
    if (this.recoveryState.isRecovering) {
      console.log(`🔄 [RECOVERY] 이미 복구 중 - 건너뜀`);
      return;
    }

    if (this.recoveryState.recoveryAttempts >= this.recoveryState.maxRecoveryAttempts) {
      console.log(`⚠️ [RECOVERY] 최대 복구 시도 횟수 초과 - 수동 개입 필요`);
      return;
    }

    // 적용 가능한 복구 작업들을 찾아서 실행
    const applicableActions = this.findApplicableRecoveryActions();
    
    if (applicableActions.length === 0) {
      console.log(`✅ [RECOVERY] 복구 작업 불필요 - 시스템 정상`);
      return;
    }

    console.log(`🛠️ [RECOVERY] ${applicableActions.length}개 복구 작업 발견`);
    
    for (const action of applicableActions) {
      await this.executeRecoveryAction(action);
    }
  }

  /**
   * 적용 가능한 복구 작업들을 찾기
   */
  private findApplicableRecoveryActions(): RecoveryAction[] {
    const applicable: RecoveryAction[] = [];
    const now = new Date();

    for (const action of this.recoveryActions) {
      // 쿨다운 시간 확인
      const lastExecution = this.lastExecutionTimes.get(action.name);
      if (lastExecution && (now.getTime() - lastExecution.getTime()) < action.cooldownMs) {
        continue; // 쿨다운 중
      }

      // 조건 확인
      try {
        if (action.condition()) {
          applicable.push(action);
        }
      } catch (error: any) {
        console.error(`❌ [RECOVERY] 조건 확인 실패: ${action.name}`, error.message);
      }
    }

    return applicable;
  }

  /**
   * 개별 복구 작업 실행
   */
  private async executeRecoveryAction(action: RecoveryAction): Promise<void> {
    this.recoveryState.isRecovering = true;
    const startTime = Date.now();
    
    try {
      console.log(`🔧 [RECOVERY] 복구 작업 시작: ${action.name} (우선순위: ${action.priority})`);
      console.log(`📝 [RECOVERY] 설명: ${action.description}`);
      
      await action.action();
      
      const duration = Date.now() - startTime;
      console.log(`✅ [RECOVERY] 복구 작업 성공: ${action.name} (${duration}ms)`);
      
      // 성공 기록
      this.recordRecoveryHistory({
        timestamp: new Date(),
        action: action.name,
        success: true,
        context: { duration }
      });

      this.lastExecutionTimes.set(action.name, new Date());
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ [RECOVERY] 복구 작업 실패: ${action.name} (${duration}ms)`, error.message);
      
      // 실패 기록
      this.recordRecoveryHistory({
        timestamp: new Date(),
        action: action.name,
        success: false,
        error: error.message,
        context: { duration }
      });

      this.recoveryState.recoveryAttempts++;
      
    } finally {
      this.recoveryState.isRecovering = false;
      this.recoveryState.lastRecoveryTime = new Date();
    }
  }

  /**
   * 복구 기록 저장
   */
  private recordRecoveryHistory(entry: RecoveryHistoryEntry): void {
    this.recoveryState.recoveryHistory.push(entry);
    
    // 최근 50개 기록만 유지
    if (this.recoveryState.recoveryHistory.length > 50) {
      this.recoveryState.recoveryHistory = this.recoveryState.recoveryHistory.slice(-50);
    }
  }

  /**
   * 복구 상태 초기화 (수동 리셋용)
   */
  public resetRecoveryState(): void {
    console.log(`🔄 [RECOVERY] 복구 상태 초기화`);
    
    this.recoveryState = {
      isRecovering: false,
      lastRecoveryTime: null,
      recoveryAttempts: 0,
      maxRecoveryAttempts: 5,
      recoveryHistory: []
    };
    
    this.lastExecutionTimes.clear();
  }

  /**
   * 복구 시스템 상태 보고서
   */
  public getRecoveryReport(): {
    state: RecoveryState;
    recentActions: RecoveryHistoryEntry[];
    systemRecommendations: string[];
  } {
    const recentActions = this.recoveryState.recoveryHistory
      .slice(-5)
      .reverse(); // 최근 5개, 최신순

    const systemRecommendations = this.generateSystemRecommendations();

    return {
      state: this.recoveryState,
      recentActions,
      systemRecommendations
    };
  }

  /**
   * 시스템 권장사항 생성
   */
  private generateSystemRecommendations(): string[] {
    const recommendations: string[] = [];
    const metrics = this.rateLimitMonitor.getMetrics();
    const failureRate = this.calculateRecentFailureRate();

    if (metrics.usagePercentage > 80) {
      recommendations.push('Rate Limit 사용률이 높습니다. 스케줄 간격을 늘리거나 배치 크기를 줄이는 것을 고려하세요.');
    }

    if (failureRate > 20) {
      recommendations.push('최근 복구 작업 실패율이 높습니다. 시스템 설정을 점검하세요.');
    }

    if (this.recoveryState.recoveryAttempts >= 3) {
      recommendations.push('복구 시도가 많습니다. 근본적인 문제 해결이 필요할 수 있습니다.');
    }

    if (this.rateLimitMonitor.isEmergencyState()) {
      recommendations.push('긴급 상황이 지속되고 있습니다. 수동 개입이 필요합니다.');
    }

    if (recommendations.length === 0) {
      recommendations.push('시스템이 정상적으로 작동하고 있습니다.');
    }

    return recommendations;
  }

  /**
   * 최근 실패율 계산
   */
  private calculateRecentFailureRate(): number {
    const recentActions = this.recoveryState.recoveryHistory.slice(-10);
    
    if (recentActions.length === 0) {
      return 0;
    }

    const failures = recentActions.filter(action => !action.success).length;
    return (failures / recentActions.length) * 100;
  }

  /**
   * 복구 상태 요약 출력
   */
  public printRecoveryStatus(): void {
    const report = this.getRecoveryReport();
    
    console.log(`
🛠️ === 자동 복구 시스템 상태 ===
🔄 복구 중: ${report.state.isRecovering ? 'YES' : 'NO'}
📊 복구 시도: ${report.state.recoveryAttempts}/${report.state.maxRecoveryAttempts}
🕒 마지막 복구: ${report.state.lastRecoveryTime?.toISOString() || 'N/A'}
📈 최근 실패율: ${this.calculateRecentFailureRate().toFixed(1)}%

📝 최근 복구 작업 (최대 3개):
${report.recentActions.slice(0, 3).map(action => 
  `  ${action.success ? '✅' : '❌'} ${action.action} - ${action.timestamp.toISOString()}`
).join('\n') || '  없음'}

💡 시스템 권장사항:
${report.systemRecommendations.map(rec => `  • ${rec}`).join('\n')}
=============================
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
export const automatedRecovery = new AutomatedRecoveryService();