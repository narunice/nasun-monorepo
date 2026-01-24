// Phase 3: X API Rate Limit 모니터링 시스템
// 실시간 Rate Limit 추적 및 안전 장치

interface RateLimitWindow {
  startTime: number;
  endTime: number;
  callCount: number;
  maxCalls: number;
}

export interface RateLimitMetrics {
  currentUsage: number;
  maxUsage: number;
  usagePercentage: number;
  remainingCalls: number;
  windowReset: Date;
  isSafe: boolean;
}

/**
 * X API Rate Limit 모니터링 클래스
 * 15분 윈도우 기반 API 호출 추적 및 안전성 관리
 */
export class RateLimitMonitor {
  private static instance: RateLimitMonitor;
  private currentWindow: RateLimitWindow;
  private readonly windowDuration: number = 15 * 60 * 1000; // 15분 (밀리초)
  private readonly maxCallsPer15Minutes: number = 8; // 안전 제한 (실제 15개 중 53%)
  private apiCallLog: { timestamp: number; endpoint: string; }[] = [];

  private constructor() {
    this.resetWindow();
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  public static getInstance(): RateLimitMonitor {
    if (!RateLimitMonitor.instance) {
      RateLimitMonitor.instance = new RateLimitMonitor();
    }
    return RateLimitMonitor.instance;
  }

  /**
   * API 호출 전 안전성 확인
   * @param endpoint 호출할 엔드포인트
   * @returns 안전한지 여부
   */
  public canMakeCall(endpoint: string): boolean {
    this.updateWindow();
    
    if (this.currentWindow.callCount >= this.maxCallsPer15Minutes) {
      console.warn(`🚫 Rate Limit 안전 제한 도달: ${this.currentWindow.callCount}/${this.maxCallsPer15Minutes}`);
      return false;
    }

    return true;
  }

  /**
   * API 호출 기록 (호출 후 반드시 실행)
   * @param endpoint 호출한 엔드포인트
   * @param successful 호출 성공 여부
   */
  public recordCall(endpoint: string, successful: boolean = true): void {
    const now = Date.now();
    
    if (successful) {
      this.updateWindow();
      this.currentWindow.callCount++;
      this.apiCallLog.push({ timestamp: now, endpoint });
      
      console.log(`📊 API 호출 기록: ${endpoint} (${this.currentWindow.callCount}/${this.maxCallsPer15Minutes})`);
      
      // 로그 정리 (15분 이전 데이터 제거)
      this.apiCallLog = this.apiCallLog.filter(
        log => now - log.timestamp < this.windowDuration
      );
    } else {
      console.error(`❌ API 호출 실패: ${endpoint}`);
    }
  }

  /**
   * 현재 Rate Limit 메트릭 조회
   */
  public getMetrics(): RateLimitMetrics {
    this.updateWindow();
    
    return {
      currentUsage: this.currentWindow.callCount,
      maxUsage: this.maxCallsPer15Minutes,
      usagePercentage: (this.currentWindow.callCount / this.maxCallsPer15Minutes) * 100,
      remainingCalls: this.maxCallsPer15Minutes - this.currentWindow.callCount,
      windowReset: new Date(this.currentWindow.endTime),
      isSafe: this.currentWindow.callCount < this.maxCallsPer15Minutes
    };
  }

  /**
   * Rate Limit Hit 시 권장 대기 시간 계산
   */
  public getRecommendedWaitTime(): number {
    this.updateWindow();
    
    if (this.currentWindow.callCount < this.maxCallsPer15Minutes) {
      return 0; // 즉시 호출 가능
    }
    
    // 현재 윈도우가 끝날 때까지 대기 + 안전 여유 시간
    const waitTime = this.currentWindow.endTime - Date.now() + 30000; // 30초 여유
    return Math.max(waitTime, 0);
  }

  /**
   * 15분 윈도우 업데이트
   */
  private updateWindow(): void {
    const now = Date.now();
    
    if (now > this.currentWindow.endTime) {
      this.resetWindow();
      console.log(`🔄 Rate Limit 윈도우 리셋 - ${new Date(this.currentWindow.startTime).toISOString()}`);
    }
  }

  /**
   * 새로운 15분 윈도우 시작
   */
  private resetWindow(): void {
    const now = Date.now();
    
    this.currentWindow = {
      startTime: now,
      endTime: now + this.windowDuration,
      callCount: 0,
      maxCalls: this.maxCallsPer15Minutes
    };
    
    // 이전 윈도우의 로그 정리
    this.apiCallLog = this.apiCallLog.filter(
      log => now - log.timestamp < this.windowDuration
    );
  }

  /**
   * Rate Limit 상태를 CloudWatch 메트릭으로 전송
   */
  public async sendMetricsToCloudWatch(): Promise<void> {
    const metrics = this.getMetrics();
    
    try {
      // CloudWatch SDK가 필요한 경우 동적 import
      const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
      
      const cloudWatchClient = new CloudWatchClient({ 
        region: process.env.AWS_REGION || 'ap-northeast-2' 
      });
      
      const metricData = [
        {
          MetricName: 'RateLimitUsage',
          Value: metrics.currentUsage,
          Unit: 'Count' as const,
          Timestamp: new Date()
        },
        {
          MetricName: 'RateLimitUsagePercentage',
          Value: metrics.usagePercentage,
          Unit: 'Percent' as const,
          Timestamp: new Date()
        },
        {
          MetricName: 'RemainingRateLimitCalls',
          Value: metrics.remainingCalls,
          Unit: 'Count' as const,
          Timestamp: new Date()
        }
      ];
      
      const command = new PutMetricDataCommand({
        Namespace: 'NASUN/RateLimit',
        MetricData: metricData
      });
      
      await cloudWatchClient.send(command);
      console.log(`📈 CloudWatch 메트릭 전송 완료: ${metrics.usagePercentage.toFixed(1)}% 사용률`);
      
    } catch (error: any) {
      console.error(`❌ CloudWatch 메트릭 전송 실패:`, error.message);
    }
  }

  /**
   * Rate Limit 위험도 평가
   */
  public getRiskLevel(): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const metrics = this.getMetrics();
    
    if (metrics.usagePercentage >= 100) {
      return 'CRITICAL';
    } else if (metrics.usagePercentage >= 80) {
      return 'HIGH';
    } else if (metrics.usagePercentage >= 60) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * 최근 API 호출 패턴 분석
   */
  public getCallPattern(): { endpoint: string; count: number; }[] {
    const endpointCounts: { [key: string]: number } = {};
    
    this.apiCallLog.forEach(log => {
      endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + 1;
    });
    
    return Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 배치 처리를 위한 안전한 대기 시간 계산
   * @param plannedCalls 계획된 호출 수
   * @returns 밀리초 단위 대기 시간
   */
  public calculateBatchWaitTime(plannedCalls: number): number {
    const metrics = this.getMetrics();
    
    if (metrics.remainingCalls >= plannedCalls) {
      return 0; // 즉시 실행 가능
    }
    
    // 현재 윈도우 리셋까지 대기
    const resetWaitTime = this.getRecommendedWaitTime();
    
    // 추가로 안전 여유 시간 (배치 크기에 따라 조정)
    const safetyBuffer = plannedCalls * 1000; // 호출 1개당 1초 여유
    
    return resetWaitTime + safetyBuffer;
  }

  /**
   * 긴급 상황 감지 (연속적인 Rate Limit Hit)
   */
  public isEmergencyState(): boolean {
    const recentFailureWindow = 5 * 60 * 1000; // 5분
    const now = Date.now();
    
    // 최근 5분간 연속으로 제한에 걸렸는지 확인
    const recentCalls = this.apiCallLog.filter(
      log => now - log.timestamp < recentFailureWindow
    );
    
    // 5분 내에 15개 이상 호출이 있었다면 긴급 상황
    return recentCalls.length >= 15;
  }

  /**
   * 시스템 상태 요약 로그 출력
   */
  public logStatus(): void {
    const metrics = this.getMetrics();
    const riskLevel = this.getRiskLevel();
    const callPattern = this.getCallPattern();
    
    console.log(`📊 Rate Limit 상태 요약:`);
    console.log(`   현재 사용: ${metrics.currentUsage}/${metrics.maxUsage} (${metrics.usagePercentage.toFixed(1)}%)`);
    console.log(`   위험도: ${riskLevel}`);
    console.log(`   윈도우 리셋: ${metrics.windowReset.toISOString()}`);
    console.log(`   최근 호출 패턴:`, callPattern.slice(0, 3)); // 상위 3개만 표시
    
    if (this.isEmergencyState()) {
      console.error(`🚨 긴급 상황: 연속적인 Rate Limit Hit 감지`);
    }
  }
}

/**
 * Rate Limit 데코레이터 함수
 * API 호출 메서드에 자동으로 Rate Limit 체크 및 기록 추가
 */
export function rateLimitProtected(endpoint: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const monitor = RateLimitMonitor.getInstance();
      
      // 호출 전 안전성 확인
      if (!monitor.canMakeCall(endpoint)) {
        const waitTime = monitor.getRecommendedWaitTime();
        throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
      }
      
      try {
        // 원래 메서드 실행
        const result = await method.apply(this, args);
        
        // 성공 시 호출 기록
        monitor.recordCall(endpoint, true);
        
        return result;
      } catch (error: any) {
        // 실패 시에도 호출 기록 (Rate Limit 에러인 경우)
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          monitor.recordCall(endpoint, false);
        }
        
        throw error;
      }
    };
  };
}

// 전역 Rate Limit 모니터 인스턴스 접근용 함수
export function getRateLimitMonitor(): RateLimitMonitor {
  return RateLimitMonitor.getInstance();
}