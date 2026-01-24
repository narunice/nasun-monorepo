// Phase 2: 제외 계정 필터링 서비스
// 소프트 제외 방식으로 리더보드 데이터 필터링

import { 
  ExcludedAccountsConfig, 
  ExclusionFilterStats,
  ExclusionScope 
} from '../types/excluded-accounts-types';
import { 
  loadExcludedAccountsConfig, 
  isAccountExcluded,
  isAdminUser,
  validateExcludedAccountsConfig 
} from '../utils/excluded-accounts-utils';

// V1 리더보드 타입 (기존 구조 참조)
interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  totalScore: number;
  totalReplies: number;
  totalLikes: number;
  totalReposts: number;
  totalQuotes: number;
  totalMentions: number;
  totalActivities: number;
  firstActivity: string;
  lastActivity: string;
  xUrl: string;
}

// V2 누적 리더보드 타입 (기존 구조 참조)
interface CumulativeLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  totalScore: number;
  totalActivities: number;
  firstActivity: string;
  lastActivity: string;
  breakdown: {
    totalLikes: number;
    totalReplies: number;
    totalReposts: number;
    totalQuotes: number;
    totalMentions: number;
    totalBookmarks: number;
    totalTargetRetweets: number;
  };
  xUrl: string;
}

/**
 * 제외 계정 필터링 서비스 클래스
 * 소프트 제외 방식으로 데이터 보존하며 필터링만 수행
 */
export class AccountFilterService {
  private config: ExcludedAccountsConfig | null = null;
  private lastConfigLoad: number = 0;
  private readonly CONFIG_CACHE_DURATION = 5 * 60 * 1000; // 5분 캐시

  constructor() {
    this.loadConfig();
  }

  /**
   * 제외 계정 설정 로드 (캐시 포함)
   */
  private loadConfig(): boolean {
    const now = Date.now();
    
    // 캐시된 설정이 유효한 경우 사용
    if (this.config && (now - this.lastConfigLoad) < this.CONFIG_CACHE_DURATION) {
      return true;
    }

    console.log('🔄 제외 계정 설정 새로고침...');
    
    try {
      const parseResult = loadExcludedAccountsConfig();
      
      if (!parseResult.success) {
        console.error('❌ 제외 계정 설정 로드 실패:', parseResult.error);
        return false;
      }

      if (!validateExcludedAccountsConfig(parseResult.config)) {
        console.error('❌ 제외 계정 설정 검증 실패');
        return false;
      }

      this.config = parseResult.config;
      this.lastConfigLoad = now;

      console.log('✅ 제외 계정 설정 로드 완료:', {
        excludedUsernamesCount: this.config.excludedUsernames.length,
        excludedUserIdsCount: this.config.excludedUserIds.length,
        adminUsernamesCount: this.config.adminUsernames.length
      });

      return true;
    } catch (error) {
      console.error('❌ 제외 계정 설정 로드 중 오류:', error);
      return false;
    }
  }

  /**
   * V1 리더보드 엔트리 필터링 (소프트 제외)
   * @param entries 원본 리더보드 엔트리 배열
   * @param scope 제외 적용 범위
   * @returns 필터링된 엔트리 배열과 통계
   */
  public filterV1LeaderboardEntries(
    entries: LeaderboardEntry[], 
    scope: ExclusionScope = ExclusionScope.DISPLAY
  ): { filteredEntries: LeaderboardEntry[]; stats: ExclusionFilterStats } {
    if (!this.loadConfig() || !this.config) {
      console.warn('⚠️ 제외 계정 설정을 로드할 수 없어 필터링하지 않음');
      return {
        filteredEntries: entries,
        stats: {
          totalAccountsBefore: entries.length,
          totalAccountsAfter: entries.length,
          excludedAccountsCount: 0,
          excludedAccounts: []
        }
      };
    }

    console.log(`🔍 V1 리더보드 제외 계정 필터링 시작 (${scope}):`, {
      totalEntries: entries.length,
      excludedUsernames: this.config.excludedUsernames,
      excludedUserIds: this.config.excludedUserIds
    });

    const excludedAccounts: ExclusionFilterStats['excludedAccounts'] = [];
    
    const filteredEntries = entries.filter(entry => {
      // 1. 블랙리스트 계정 체크 (EXCLUDED_USERNAMES, EXCLUDED_USER_IDS)
      const exclusionResult = isAccountExcluded(entry.username, entry.userId, this.config!);
      
      if (exclusionResult.isExcluded) {
        excludedAccounts.push({
          username: entry.username,
          userId: entry.userId,
          reason: exclusionResult.reason!
        });
        
        console.log(`🚫 V1 리더보드에서 계정 제외: @${entry.username} (${entry.userId}) - ${exclusionResult.reason}`);
        return false;
      }
      
      // 2. 관리자 계정 체크 (ADMIN_USERNAMES) - 리더보드에서 제외
      const adminResult = isAdminUser(entry.username, this.config!);
      
      if (adminResult.isAdmin) {
        excludedAccounts.push({
          username: entry.username,
          userId: entry.userId,
          reason: 'admin_account'
        });
        
        console.log(`🚫 V1 리더보드에서 관리자 계정 제외: @${entry.username} (${entry.userId})`);
        return false;
      }
      
      return true;
    });

    // ✅ [BUGFIX] 순위는 재계산하지 않고 DynamoDB에 저장된 원래 rank 유지
    // rank 재계산은 리더보드 생성 시(leaderboard-generator)에만 수행되어야 함
    // 페이지네이션된 데이터에서 rank를 재계산하면 각 페이지마다 1부터 시작하는 버그 발생
    const stats: ExclusionFilterStats = {
      totalAccountsBefore: entries.length,
      totalAccountsAfter: filteredEntries.length,
      excludedAccountsCount: excludedAccounts.length,
      excludedAccounts
    };

    console.log('✅ V1 리더보드 필터링 완료:', stats);

    return {
      filteredEntries: filteredEntries,
      stats
    };
  }

  /**
   * V2 누적 리더보드 엔트리 필터링 (소프트 제외)
   * @param entries 원본 누적 리더보드 엔트리 배열
   * @param scope 제외 적용 범위
   * @returns 필터링된 엔트리 배열과 통계
   */
  public filterV2CumulativeEntries(
    entries: CumulativeLeaderboardEntry[],
    scope: ExclusionScope = ExclusionScope.DISPLAY
  ): { filteredEntries: CumulativeLeaderboardEntry[]; stats: ExclusionFilterStats } {
    if (!this.loadConfig() || !this.config) {
      console.warn('⚠️ 제외 계정 설정을 로드할 수 없어 필터링하지 않음');
      return {
        filteredEntries: entries,
        stats: {
          totalAccountsBefore: entries.length,
          totalAccountsAfter: entries.length,
          excludedAccountsCount: 0,
          excludedAccounts: []
        }
      };
    }

    console.log(`🔍 V2 누적 리더보드 제외 계정 필터링 시작 (${scope}):`, {
      totalEntries: entries.length,
      excludedUsernames: this.config.excludedUsernames,
      excludedUserIds: this.config.excludedUserIds
    });

    const excludedAccounts: ExclusionFilterStats['excludedAccounts'] = [];
    
    const filteredEntries = entries.filter(entry => {
      // 1. 블랙리스트 계정 체크 (EXCLUDED_USERNAMES, EXCLUDED_USER_IDS)
      const exclusionResult = isAccountExcluded(entry.username, entry.userId, this.config!);
      
      if (exclusionResult.isExcluded) {
        excludedAccounts.push({
          username: entry.username,
          userId: entry.userId,
          reason: exclusionResult.reason!
        });
        
        console.log(`🚫 V2 누적 리더보드에서 계정 제외: @${entry.username} (${entry.userId}) - ${exclusionResult.reason}`);
        return false;
      }
      
      // 2. 관리자 계정 체크 (ADMIN_USERNAMES) - 리더보드에서 제외
      const adminResult = isAdminUser(entry.username, this.config!);
      
      if (adminResult.isAdmin) {
        excludedAccounts.push({
          username: entry.username,
          userId: entry.userId,
          reason: 'admin_account'
        });
        
        console.log(`🚫 V2 누적 리더보드에서 관리자 계정 제외: @${entry.username} (${entry.userId})`);
        return false;
      }
      
      return true;
    });

    // ✅ [BUGFIX] 순위는 재계산하지 않고 DynamoDB에 저장된 원래 rank 유지
    // rank 재계산은 리더보드 생성 시(leaderboard-generator)에만 수행되어야 함
    // 페이지네이션된 데이터에서 rank를 재계산하면 각 페이지마다 1부터 시작하는 버그 발생
    const stats: ExclusionFilterStats = {
      totalAccountsBefore: entries.length,
      totalAccountsAfter: filteredEntries.length,
      excludedAccountsCount: excludedAccounts.length,
      excludedAccounts
    };

    console.log('✅ V2 누적 리더보드 필터링 완료:', stats);

    return {
      filteredEntries: filteredEntries,
      stats
    };
  }

  /**
   * 단일 계정 제외 여부 확인
   * @param username 사용자명
   * @param userId 사용자 ID
   * @returns 제외 여부
   */
  public isAccountExcluded(username: string, userId: string): boolean {
    if (!this.loadConfig() || !this.config) {
      return false;
    }

    const result = isAccountExcluded(username, userId, this.config);
    return result.isExcluded;
  }

  /**
   * 현재 제외 계정 설정 조회
   * @returns 현재 설정 (읽기 전용)
   */
  public getExcludedAccountsConfig(): Readonly<ExcludedAccountsConfig> | null {
    if (!this.loadConfig()) {
      return null;
    }
    
    return this.config ? { ...this.config } : null;
  }

  /**
   * 제외 계정 통계 조회
   * @returns 제외 계정 통계
   */
  public getExclusionStats(): { 
    totalExcludedUsernames: number; 
    totalExcludedUserIds: number; 
    totalAdmins: number;
    lastConfigLoad: string;
  } | null {
    if (!this.config) {
      return null;
    }

    return {
      totalExcludedUsernames: this.config.excludedUsernames.length,
      totalExcludedUserIds: this.config.excludedUserIds.length,
      totalAdmins: this.config.adminUsernames.length,
      lastConfigLoad: new Date(this.lastConfigLoad).toISOString()
    };
  }

  /**
   * 설정 강제 새로고침
   */
  public forceRefreshConfig(): boolean {
    this.lastConfigLoad = 0; // 캐시 무효화
    return this.loadConfig();
  }
}

// 싱글톤 인스턴스 (메모리 효율성을 위해)
let accountFilterServiceInstance: AccountFilterService | null = null;

/**
 * AccountFilterService 싱글톤 인스턴스 반환
 * @returns AccountFilterService 인스턴스
 */
export function getAccountFilterService(): AccountFilterService {
  if (!accountFilterServiceInstance) {
    accountFilterServiceInstance = new AccountFilterService();
  }
  return accountFilterServiceInstance;
}