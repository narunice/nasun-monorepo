// Phase 2: 제외 계정 환경변수 로딩 및 파싱 유틸리티
// 소프트 제외 방식의 핵심 로직

import { 
  ExcludedAccountsConfig, 
  ExclusionCheckResult, 
  ExcludedAccountsParsResult,
  AdminAuthResult,
  EXCLUDED_ACCOUNTS_CONFIG,
  EXCLUSION_VALIDATION_RULES
} from '../types/excluded-accounts-types';

/**
 * 환경변수에서 제외 계정 설정을 로드하고 파싱
 * @returns 파싱된 제외 계정 설정
 */
export function loadExcludedAccountsConfig(): ExcludedAccountsParsResult {
  try {
    // 환경변수에서 값 로드
    const excludedUsernamesRaw = process.env[EXCLUDED_ACCOUNTS_CONFIG.ENV_KEYS.EXCLUDED_USERNAMES] 
      || EXCLUDED_ACCOUNTS_CONFIG.DEFAULTS.EXCLUDED_USERNAMES;
    
    const excludedUserIdsRaw = process.env[EXCLUDED_ACCOUNTS_CONFIG.ENV_KEYS.EXCLUDED_USER_IDS] 
      || EXCLUDED_ACCOUNTS_CONFIG.DEFAULTS.EXCLUDED_USER_IDS;
    
    const adminUsernamesRaw = process.env[EXCLUDED_ACCOUNTS_CONFIG.ENV_KEYS.ADMIN_USERNAMES] 
      || EXCLUDED_ACCOUNTS_CONFIG.DEFAULTS.ADMIN_USERNAMES;

    // 파싱 및 정제
    const excludedUsernames = parseAndValidateUsernames(excludedUsernamesRaw);
    const excludedUserIds = parseAndValidateUserIds(excludedUserIdsRaw);
    const adminUsernames = parseAndValidateUsernames(adminUsernamesRaw);

    // 안전장치: 최대 제외 계정 수 확인
    const totalExcludedCount = excludedUsernames.length + excludedUserIds.length;
    if (totalExcludedCount > EXCLUDED_ACCOUNTS_CONFIG.MAX_EXCLUDED_ACCOUNTS) {
      throw new Error(`Too many excluded accounts: ${totalExcludedCount} (max: ${EXCLUDED_ACCOUNTS_CONFIG.MAX_EXCLUDED_ACCOUNTS})`);
    }

    const config: ExcludedAccountsConfig = {
      excludedUsernames,
      excludedUserIds,
      adminUsernames
    };

    console.log(`✅ 제외 계정 설정 로드 완료:`, {
      excludedUsernamesCount: excludedUsernames.length,
      excludedUserIdsCount: excludedUserIds.length,
      adminUsernamesCount: adminUsernames.length,
      totalExcludedCount
    });

    return {
      success: true,
      config,
      stats: {
        excludedUsernamesCount: excludedUsernames.length,
        excludedUserIdsCount: excludedUserIds.length,
        adminUsernamesCount: adminUsernames.length
      }
    };

  } catch (error) {
    console.error(`❌ 제외 계정 설정 로드 실패:`, error);
    
    // 실패 시 안전한 기본값 반환
    return {
      success: false,
      config: {
        excludedUsernames: [],
        excludedUserIds: [],
        adminUsernames: parseAndValidateUsernames(EXCLUDED_ACCOUNTS_CONFIG.DEFAULTS.ADMIN_USERNAMES)
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      stats: {
        excludedUsernamesCount: 0,
        excludedUserIdsCount: 0,
        adminUsernamesCount: 0
      }
    };
  }
}

/**
 * 계정이 제외 대상인지 확인
 * @param username 사용자명
 * @param userId 사용자 ID  
 * @param config 제외 계정 설정 (선택사항, 자동 로드)
 * @returns 제외 확인 결과
 */
export function isAccountExcluded(
  username: string, 
  userId: string, 
  config?: ExcludedAccountsConfig
): ExclusionCheckResult {
  // 설정이 제공되지 않으면 자동 로드
  if (!config) {
    const parseResult = loadExcludedAccountsConfig();
    if (!parseResult.success) {
      console.warn(`⚠️ 제외 계정 설정 로드 실패, 제외하지 않음:`, parseResult.error);
      return { isExcluded: false };
    }
    config = parseResult.config;
  }

  // 사용자명 기준 확인
  if (config.excludedUsernames.includes(username)) {
    return {
      isExcluded: true,
      reason: 'username_match',
      matchedValue: username
    };
  }

  // 사용자 ID 기준 확인
  if (config.excludedUserIds.includes(userId)) {
    return {
      isExcluded: true,
      reason: 'user_id_match', 
      matchedValue: userId
    };
  }

  return { isExcluded: false };
}

/**
 * 관리자 권한 확인
 * @param username 확인할 사용자명
 * @param config 제외 계정 설정 (선택사항)
 * @returns 관리자 권한 확인 결과
 */
export function isAdminUser(username: string, config?: ExcludedAccountsConfig): AdminAuthResult {
  if (!config) {
    const parseResult = loadExcludedAccountsConfig();
    if (!parseResult.success) {
      console.warn(`⚠️ 관리자 설정 로드 실패:`, parseResult.error);
      return { isAdmin: false };
    }
    config = parseResult.config;
  }

  const isAdmin = config.adminUsernames.includes(username);
  return {
    isAdmin,
    adminUsername: isAdmin ? username : undefined
  };
}

/**
 * 문자열을 파싱하여 사용자명 배열로 변환 및 검증
 * @param raw 원시 문자열 (쉼표 구분)
 * @returns 정제된 사용자명 배열
 */
function parseAndValidateUsernames(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(EXCLUDED_ACCOUNTS_CONFIG.DELIMITER)
    .map(username => username.trim())
    .filter(username => {
      if (!username) return false;
      
      // 길이 검증
      if (username.length < EXCLUSION_VALIDATION_RULES.MIN_USERNAME_LENGTH || 
          username.length > EXCLUSION_VALIDATION_RULES.MAX_USERNAME_LENGTH) {
        console.warn(`⚠️ 사용자명 길이 오류, 무시됨: ${username}`);
        return false;
      }
      
      // 패턴 검증
      if (!EXCLUSION_VALIDATION_RULES.USERNAME_PATTERN.test(username)) {
        console.warn(`⚠️ 사용자명 패턴 오류, 무시됨: ${username}`);
        return false;
      }
      
      return true;
    })
    // 중복 제거
    .filter((username, index, arr) => arr.indexOf(username) === index);
}

/**
 * 문자열을 파싱하여 사용자 ID 배열로 변환 및 검증  
 * @param raw 원시 문자열 (쉼표 구분)
 * @returns 정제된 사용자 ID 배열
 */
function parseAndValidateUserIds(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(EXCLUDED_ACCOUNTS_CONFIG.DELIMITER)
    .map(userId => userId.trim())
    .filter(userId => {
      if (!userId) return false;
      
      // 숫자 패턴 검증
      if (!EXCLUSION_VALIDATION_RULES.USER_ID_PATTERN.test(userId)) {
        console.warn(`⚠️ 사용자 ID 패턴 오류, 무시됨: ${userId}`);
        return false;
      }
      
      return true;
    })
    // 중복 제거
    .filter((userId, index, arr) => arr.indexOf(userId) === index);
}

/**
 * 제외 계정 설정의 유효성 검사
 * @param config 제외 계정 설정
 * @returns 검증 통과 여부
 */
export function validateExcludedAccountsConfig(config: ExcludedAccountsConfig): boolean {
  try {
    // 기본 구조 검증
    if (!config || typeof config !== 'object') {
      return false;
    }

    // 배열 타입 검증
    if (!Array.isArray(config.excludedUsernames) || 
        !Array.isArray(config.excludedUserIds) || 
        !Array.isArray(config.adminUsernames)) {
      return false;
    }

    // 최소한의 관리자는 있어야 함
    if (config.adminUsernames.length === 0) {
      console.warn(`⚠️ 관리자가 설정되지 않음`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ 제외 계정 설정 검증 실패:`, error);
    return false;
  }
}