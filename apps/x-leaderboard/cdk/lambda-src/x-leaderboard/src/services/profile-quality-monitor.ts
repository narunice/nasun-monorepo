// 🔥 Phase 2.2.2: 실시간 프로필 품질 모니터링 시스템
// CUMULATIVE_SCORE 업데이트 전후 프로필 품질 변화를 감지하고 자동 복구

import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { UserProfile, ProfileValidators, PROFILE_QUALITY_THRESHOLDS } from "../types/profile";
import { cloudWatchMetrics } from "./cloudwatch-metrics";

/**
 * 프로필 품질 변화 감지 결과
 */
export interface ProfileQualityChange {
  userId: string;
  username?: string;
  beforeQualityScore: number;
  afterQualityScore: number;
  currentQualityScore: number; // 🔧 추가: 현재 품질 점수
  qualityChange: number; // 양수: 개선, 음수: 저하
  needsRecovery: boolean;
  degradedFields: string[]; // 품질이 저하된 필드들
  severityLevel: 'INFO' | 'WARNING' | 'CRITICAL';
  isSignificantDegradation: boolean; // 🔧 추가: 중요한 품질 저하 여부
  requiresImmediateRecovery: boolean; // 🔧 추가: 즉각적인 복구 필요 여부
}

/**
 * 배치 품질 모니터링 결과
 */
export interface BatchQualityMonitoringResult {
  totalMonitored: number;
  qualityChanges: ProfileQualityChange[];
  improvementCount: number;
  degradationCount: number;
  criticalDegradationCount: number;
  averageQualityChange: number;
}

/**
 * 자동 복구 계획
 */
export interface AutoRecoveryPlan {
  userId: string;
  username?: string;
  currentQualityScore: number;
  targetQualityScore: number;
  recoveryMethod: 'API_REFRESH' | 'CACHE_FALLBACK' | 'MANUAL_INTERVENTION';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedSuccessRate: number;
  maxRetries: number;
}

/**
 * 🔍 실시간 프로필 품질 모니터링 서비스
 *
 * 기능:
 * - CUMULATIVE_SCORE 업데이트 전후 품질 비교
 * - 품질 저하 즉시 감지 및 알림
 * - 자동 복구 계획 생성 및 실행
 * - CloudWatch 메트릭 기록
 */
export class ProfileQualityMonitor {
  // 품질 임계값 설정
  private readonly QUALITY_THRESHOLDS = {
    SIGNIFICANT_DEGRADATION: -20, // 유의미한 저하
    CRITICAL_DEGRADATION: -30,    // 임계적 저하
    MINIMUM_ACCEPTABLE: PROFILE_QUALITY_THRESHOLDS.GOOD, // 50점
    RECOVERY_TRIGGER: PROFILE_QUALITY_THRESHOLDS.LOW,   // 30점
  };

  constructor(
    private cloudWatch: CloudWatchClient | null,
    private profileManager: any // CentralizedProfileManager (순환 참조 방지를 위해 any)
  ) {}

  /**
   * 🔍 개별 사용자의 프로필 품질 변화 모니터링
   */
  async monitorProfileQualityChange(
    userId: string,
    beforeProfile: any,
    afterProfile: any
  ): Promise<ProfileQualityChange> {
    const beforeScore = this.calculateQualityScore(beforeProfile);
    const afterScore = this.calculateQualityScore(afterProfile);
    const qualityChange = afterScore - beforeScore;

    // 품질 저하된 필드 식별
    const degradedFields = this.identifyDegradedFields(beforeProfile, afterProfile);

    // 복구 필요 여부 판단
    const needsRecovery =
      qualityChange <= this.QUALITY_THRESHOLDS.SIGNIFICANT_DEGRADATION ||
      afterScore < this.QUALITY_THRESHOLDS.RECOVERY_TRIGGER;

    // 심각도 결정
    let severityLevel: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
    if (qualityChange <= this.QUALITY_THRESHOLDS.CRITICAL_DEGRADATION) {
      severityLevel = 'CRITICAL';
    } else if (qualityChange <= this.QUALITY_THRESHOLDS.SIGNIFICANT_DEGRADATION) {
      severityLevel = 'WARNING';
    }

    // 로깅
    if (needsRecovery) {
      console.warn(
        `🚨 [품질저하] ${userId} (${beforeProfile?.username || 'unknown'}): ` +
        `${beforeScore.toFixed(1)}점 → ${afterScore.toFixed(1)}점 (${qualityChange.toFixed(1)}점) ` +
        `| 저하 필드: [${degradedFields.join(', ')}]`
      );
    } else if (qualityChange > 5) {
      console.log(
        `✅ [품질개선] ${userId}: ${beforeScore.toFixed(1)}점 → ${afterScore.toFixed(1)}점 (+${qualityChange.toFixed(1)}점)`
      );
    }

    // CloudWatch 메트릭 기록
    if (this.cloudWatch) {
      await cloudWatchMetrics.putMetric('NASUN/ProfileQuality', 'QualityChange', qualityChange, 'Count');
      if (needsRecovery) {
        await cloudWatchMetrics.putMetric('NASUN/ProfileQuality', 'QualityDegradationEvent', 1, 'Count');
      }
    }

    // 🔧 추가 필드 계산
    const isSignificantDegradation = qualityChange < -10; // 10점 이상 저하
    const requiresImmediateRecovery = afterScore < PROFILE_QUALITY_THRESHOLDS.CRITICAL;

    return {
      userId,
      username: afterProfile?.username || beforeProfile?.username,
      beforeQualityScore: beforeScore,
      afterQualityScore: afterScore,
      currentQualityScore: afterScore,
      qualityChange,
      needsRecovery,
      degradedFields,
      severityLevel,
      isSignificantDegradation,
      requiresImmediateRecovery,
    };
  }

  /**
   * 🔍 배치 단위 품질 변화 모니터링
   */
  async batchMonitorQualityChanges(
    userIds: string[],
    beforeProfiles: Map<string, any>,
    afterProfiles: Map<string, any>
  ): Promise<BatchQualityMonitoringResult> {
    const qualityChanges: ProfileQualityChange[] = [];
    let totalQualityChange = 0;

    for (const userId of userIds) {
      const beforeProfile = beforeProfiles.get(userId);
      const afterProfile = afterProfiles.get(userId);

      if (!beforeProfile && !afterProfile) {
        continue; // 둘 다 없으면 스킵
      }

      const change = await this.monitorProfileQualityChange(userId, beforeProfile, afterProfile);
      qualityChanges.push(change);
      totalQualityChange += change.qualityChange;
    }

    // 통계 계산
    const improvementCount = qualityChanges.filter((c) => c.qualityChange > 0).length;
    const degradationCount = qualityChanges.filter((c) => c.qualityChange < 0).length;
    const criticalDegradationCount = qualityChanges.filter(
      (c) => c.severityLevel === 'CRITICAL'
    ).length;
    const averageQualityChange =
      qualityChanges.length > 0 ? totalQualityChange / qualityChanges.length : 0;

    console.log(
      `📊 [품질모니터링] 배치 결과: ` +
      `모니터링 ${qualityChanges.length}명, 개선 ${improvementCount}명, 저하 ${degradationCount}명 ` +
      `(임계 ${criticalDegradationCount}명), 평균 변화 ${averageQualityChange.toFixed(1)}점`
    );

    return {
      totalMonitored: qualityChanges.length,
      qualityChanges,
      improvementCount,
      degradationCount,
      criticalDegradationCount,
      averageQualityChange,
    };
  }

  /**
   * 📸 CUMULATIVE_SCORE 업데이트 전 프로필 상태 캡처
   */
  async capturePreUpdateProfiles(userIds: string[]): Promise<Map<string, any>> {
    console.log(`📸 [품질모니터링] ${userIds.length}명의 업데이트 전 프로필 상태 캡처 중...`);

    const profiles = new Map<string, any>();
    // 실제 구현에서는 DynamoDB에서 현재 프로필 조회
    // 여기서는 플레이스홀더로 빈 Map 반환
    return profiles;
  }

  /**
   * 📊 CUMULATIVE_SCORE 업데이트 후 품질 변화 모니터링 및 자동 복구
   */
  async monitorProfileQualityChanges(
    userIds: string[],
    preUpdateProfiles: Map<string, any>
  ): Promise<void> {
    console.log(`🔍 [품질모니터링] ${userIds.length}명의 프로필 품질 변화 분석 중...`);

    // 업데이트 후 프로필 상태 조회 (실제로는 DynamoDB 조회)
    const postUpdateProfiles = new Map<string, any>();

    // 배치 품질 모니터링
    const monitoringResult = await this.batchMonitorQualityChanges(
      userIds,
      preUpdateProfiles,
      postUpdateProfiles
    );

    // 임계적 저하가 발견된 경우 자동 복구
    const criticalCases = monitoringResult.qualityChanges.filter(
      (c) => c.severityLevel === 'CRITICAL' && c.needsRecovery
    );

    if (criticalCases.length > 0) {
      console.warn(
        `🆘 [즉시복구필요] ${criticalCases.length}명의 사용자가 임계적 품질 저하를 겪고 있습니다.`
      );

      for (const criticalCase of criticalCases) {
        const recoveryPlan = this.createRecoveryPlan(criticalCase);
        await this.executeAutoRecovery(recoveryPlan);
      }
    }

    // CloudWatch 통계 메트릭 기록
    if (this.cloudWatch) {
      await cloudWatchMetrics.putMetric('NASUN/ProfileQuality', 'TotalMonitored', monitoringResult.totalMonitored, 'Count');
      await cloudWatchMetrics.putMetric('NASUN/ProfileQuality', 'QualityDegradations', monitoringResult.degradationCount, 'Count');
      await cloudWatchMetrics.putMetric('NASUN/ProfileQuality', 'CriticalDegradations', monitoringResult.criticalDegradationCount, 'Count');
    }
  }

  /**
   * 🎯 프로필 품질 점수 계산 (0-100)
   *
   * 구성:
   * - 사용자명: 30점
   * - 표시명: 30점
   * - 프로필 이미지: 20점
   * - 팔로워 수: 20점
   * - 신선도 보너스: ±10점
   */
  calculateQualityScore(profile: any): number {
    if (!profile) return 0;

    let score = 0;

    // 1. 사용자명 (30점)
    if (profile.username && ProfileValidators.isValidUsername(profile.username)) {
      score += 30;
    } else if (profile.username && profile.username !== 'unknown' && profile.username !== profile.userId) {
      score += 15; // 부분 점수
    }

    // 2. 표시명 (30점)
    if (profile.displayName && ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += 30;
    } else if (profile.displayName && profile.displayName !== 'unknown') {
      score += 15; // 부분 점수
    }

    // 3. 프로필 이미지 (20점)
    if (profile.profileImageUrl && ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += 20;
    }

    // 4. 팔로워 수 (20점)
    if (profile.followersCount !== undefined && ProfileValidators.isValidFollowersCount(profile.followersCount)) {
      score += 20;
    }

    // 5. 신선도 보너스 (±10점)
    if (profile.lastUpdated) {
      const age = Date.now() - new Date(profile.lastUpdated).getTime();
      const ageInDays = age / (1000 * 60 * 60 * 24);

      if (ageInDays < 1) {
        score += 10; // 1일 이내: +10점
      } else if (ageInDays < 7) {
        score += 5; // 1주일 이내: +5점
      } else if (ageInDays > 30) {
        score -= 5; // 30일 초과: -5점
      }
    }

    return Math.max(0, Math.min(100, score)); // 0-100 범위로 제한
  }

  /**
   * 🔍 품질 저하된 필드 식별
   */
  private identifyDegradedFields(beforeProfile: any, afterProfile: any): string[] {
    const degradedFields: string[] = [];

    if (!beforeProfile || !afterProfile) return degradedFields;

    // username 저하 체크
    if (this.isFieldDegraded(beforeProfile.username, afterProfile.username)) {
      degradedFields.push('username');
    }

    // displayName 저하 체크
    if (this.isFieldDegraded(beforeProfile.displayName, afterProfile.displayName)) {
      degradedFields.push('displayName');
    }

    // profileImageUrl 저하 체크
    if (this.isFieldDegraded(beforeProfile.profileImageUrl, afterProfile.profileImageUrl)) {
      degradedFields.push('profileImageUrl');
    }

    // followersCount 저하 체크
    if (
      beforeProfile.followersCount !== undefined &&
      (afterProfile.followersCount === undefined || afterProfile.followersCount === null)
    ) {
      degradedFields.push('followersCount');
    }

    return degradedFields;
  }

  /**
   * 필드 저하 여부 판단
   */
  private isFieldDegraded(beforeValue: any, afterValue: any): boolean {
    // 이전 값이 유효하고, 이후 값이 무효화되었으면 저하
    const beforeValid =
      beforeValue !== undefined &&
      beforeValue !== null &&
      beforeValue !== 'unknown' &&
      beforeValue !== '';
    const afterValid =
      afterValue !== undefined &&
      afterValue !== null &&
      afterValue !== 'unknown' &&
      afterValue !== '';

    return beforeValid && !afterValid;
  }

  /**
   * 🔧 자동 복구 계획 생성
   */
  private createRecoveryPlan(qualityChange: ProfileQualityChange): AutoRecoveryPlan {
    let recoveryMethod: 'API_REFRESH' | 'CACHE_FALLBACK' | 'MANUAL_INTERVENTION' = 'API_REFRESH';
    let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    let estimatedSuccessRate = 0.85;
    let maxRetries = 1;

    // 심각도에 따라 복구 방법 결정
    if (qualityChange.severityLevel === 'CRITICAL') {
      recoveryMethod = 'API_REFRESH';
      priority = 'HIGH';
      estimatedSuccessRate = 0.95;
      maxRetries = 3;
    } else if (qualityChange.afterQualityScore < this.QUALITY_THRESHOLDS.MINIMUM_ACCEPTABLE) {
      recoveryMethod = 'CACHE_FALLBACK';
      priority = 'MEDIUM';
      estimatedSuccessRate = 0.75;
      maxRetries = 2;
    } else {
      recoveryMethod = 'MANUAL_INTERVENTION';
      priority = 'LOW';
      estimatedSuccessRate = 0.5;
      maxRetries = 1;
    }

    return {
      userId: qualityChange.userId,
      username: qualityChange.username,
      currentQualityScore: qualityChange.afterQualityScore,
      targetQualityScore: Math.max(
        this.QUALITY_THRESHOLDS.MINIMUM_ACCEPTABLE,
        qualityChange.beforeQualityScore
      ),
      recoveryMethod,
      priority,
      estimatedSuccessRate,
      maxRetries,
    };
  }

  /**
   * ⚡ 자동 복구 실행
   */
  private async executeAutoRecovery(plan: AutoRecoveryPlan): Promise<void> {
    console.log(
      `🔧 [자동복구] ${plan.userId} (${plan.username || 'unknown'}): ` +
      `${plan.recoveryMethod} 방식으로 복구 시도 (우선순위: ${plan.priority}, 성공률: ${(plan.estimatedSuccessRate * 100).toFixed(0)}%)`
    );

    try {
      switch (plan.recoveryMethod) {
        case 'API_REFRESH':
          // Twitter API를 통해 최신 프로필 정보 재수집
          console.log(`🔄 [자동복구] API 새로고침 시작...`);
          // 실제 구현: profileManager.refreshUserProfile(plan.userId)
          break;

        case 'CACHE_FALLBACK':
          // 캐시에서 이전 고품질 프로필 복원
          console.log(`💾 [자동복구] 캐시 폴백 시작...`);
          // 실제 구현: profileManager.restoreFromCache(plan.userId)
          break;

        case 'MANUAL_INTERVENTION':
          // 수동 개입 필요
          console.warn(`⚠️ [자동복구] 수동 개입 필요: ${plan.userId}`);
          // CloudWatch 알림 전송
          if (this.cloudWatch) {
            await cloudWatchMetrics.putMetric('NASUN/ProfileQuality', 'ManualInterventionRequired', 1, 'Count');
          }
          break;
      }

      // 복구 성공 메트릭
      if (this.cloudWatch) {
        await cloudWatchMetrics.putMetric('NASUN/ProfileQuality', 'AutoRecoveryAttempts', 1, 'Count');
      }
    } catch (error) {
      console.error(`❌ [자동복구] 실패:`, error);
      if (this.cloudWatch) {
        await cloudWatchMetrics.putMetric('NASUN/ProfileQuality', 'AutoRecoveryFailures', 1, 'Count');
      }
    }
  }
}

// 싱글톤 인스턴스 (프로필 매니저는 나중에 주입)
export const profileQualityMonitor = new ProfileQualityMonitor(new CloudWatchClient({}), null);
