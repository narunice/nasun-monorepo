"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/handlers/api/excluded-accounts-status.ts
var excluded_accounts_status_exports = {};
__export(excluded_accounts_status_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(excluded_accounts_status_exports);

// src/types/excluded-accounts-types.ts
var EXCLUDED_ACCOUNTS_CONFIG = {
  /** 환경변수 키 이름 */
  ENV_KEYS: {
    EXCLUDED_USERNAMES: "EXCLUDED_USERNAMES",
    EXCLUDED_USER_IDS: "EXCLUDED_USER_IDS",
    ADMIN_USERNAMES: "ADMIN_USERNAMES"
  },
  /** 기본값 */
  DEFAULTS: {
    EXCLUDED_USERNAMES: "",
    EXCLUDED_USER_IDS: "",
    ADMIN_USERNAMES: "Naru010110,overclocksalmon"
  },
  /** 구분자 */
  DELIMITER: ",",
  /** 최대 제외 계정 수 (안전장치) */
  MAX_EXCLUDED_ACCOUNTS: 1e3
};
var EXCLUSION_VALIDATION_RULES = {
  /** 사용자명 최소 길이 */
  MIN_USERNAME_LENGTH: 1,
  /** 사용자명 최대 길이 */
  MAX_USERNAME_LENGTH: 50,
  /** 사용자 ID 패턴 (숫자만) */
  USER_ID_PATTERN: /^\d+$/,
  /** 사용자명 패턴 (영문, 숫자, 언더스코어) */
  USERNAME_PATTERN: /^[a-zA-Z0-9_]+$/
};

// src/utils/excluded-accounts-utils.ts
function loadExcludedAccountsConfig() {
  try {
    const excludedUsernamesRaw = process.env[EXCLUDED_ACCOUNTS_CONFIG.ENV_KEYS.EXCLUDED_USERNAMES] || EXCLUDED_ACCOUNTS_CONFIG.DEFAULTS.EXCLUDED_USERNAMES;
    const excludedUserIdsRaw = process.env[EXCLUDED_ACCOUNTS_CONFIG.ENV_KEYS.EXCLUDED_USER_IDS] || EXCLUDED_ACCOUNTS_CONFIG.DEFAULTS.EXCLUDED_USER_IDS;
    const adminUsernamesRaw = process.env[EXCLUDED_ACCOUNTS_CONFIG.ENV_KEYS.ADMIN_USERNAMES] || EXCLUDED_ACCOUNTS_CONFIG.DEFAULTS.ADMIN_USERNAMES;
    const excludedUsernames = parseAndValidateUsernames(excludedUsernamesRaw);
    const excludedUserIds = parseAndValidateUserIds(excludedUserIdsRaw);
    const adminUsernames = parseAndValidateUsernames(adminUsernamesRaw);
    const totalExcludedCount = excludedUsernames.length + excludedUserIds.length;
    if (totalExcludedCount > EXCLUDED_ACCOUNTS_CONFIG.MAX_EXCLUDED_ACCOUNTS) {
      throw new Error(`Too many excluded accounts: ${totalExcludedCount} (max: ${EXCLUDED_ACCOUNTS_CONFIG.MAX_EXCLUDED_ACCOUNTS})`);
    }
    const config = {
      excludedUsernames,
      excludedUserIds,
      adminUsernames
    };
    console.log(`\u2705 \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uB85C\uB4DC \uC644\uB8CC:`, {
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
    console.error(`\u274C \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uB85C\uB4DC \uC2E4\uD328:`, error);
    return {
      success: false,
      config: {
        excludedUsernames: [],
        excludedUserIds: [],
        adminUsernames: parseAndValidateUsernames(EXCLUDED_ACCOUNTS_CONFIG.DEFAULTS.ADMIN_USERNAMES)
      },
      error: error instanceof Error ? error.message : "Unknown error",
      stats: {
        excludedUsernamesCount: 0,
        excludedUserIdsCount: 0,
        adminUsernamesCount: 0
      }
    };
  }
}
function isAccountExcluded(username, userId, config) {
  if (!config) {
    const parseResult = loadExcludedAccountsConfig();
    if (!parseResult.success) {
      console.warn(`\u26A0\uFE0F \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uB85C\uB4DC \uC2E4\uD328, \uC81C\uC678\uD558\uC9C0 \uC54A\uC74C:`, parseResult.error);
      return { isExcluded: false };
    }
    config = parseResult.config;
  }
  if (config.excludedUsernames.includes(username)) {
    return {
      isExcluded: true,
      reason: "username_match",
      matchedValue: username
    };
  }
  if (config.excludedUserIds.includes(userId)) {
    return {
      isExcluded: true,
      reason: "user_id_match",
      matchedValue: userId
    };
  }
  return { isExcluded: false };
}
function isAdminUser(username, config) {
  if (!config) {
    const parseResult = loadExcludedAccountsConfig();
    if (!parseResult.success) {
      console.warn(`\u26A0\uFE0F \uAD00\uB9AC\uC790 \uC124\uC815 \uB85C\uB4DC \uC2E4\uD328:`, parseResult.error);
      return { isAdmin: false };
    }
    config = parseResult.config;
  }
  const isAdmin = config.adminUsernames.includes(username);
  return {
    isAdmin,
    adminUsername: isAdmin ? username : void 0
  };
}
function parseAndValidateUsernames(raw) {
  if (!raw.trim()) {
    return [];
  }
  return raw.split(EXCLUDED_ACCOUNTS_CONFIG.DELIMITER).map((username) => username.trim()).filter((username) => {
    if (!username) return false;
    if (username.length < EXCLUSION_VALIDATION_RULES.MIN_USERNAME_LENGTH || username.length > EXCLUSION_VALIDATION_RULES.MAX_USERNAME_LENGTH) {
      console.warn(`\u26A0\uFE0F \uC0AC\uC6A9\uC790\uBA85 \uAE38\uC774 \uC624\uB958, \uBB34\uC2DC\uB428: ${username}`);
      return false;
    }
    if (!EXCLUSION_VALIDATION_RULES.USERNAME_PATTERN.test(username)) {
      console.warn(`\u26A0\uFE0F \uC0AC\uC6A9\uC790\uBA85 \uD328\uD134 \uC624\uB958, \uBB34\uC2DC\uB428: ${username}`);
      return false;
    }
    return true;
  }).filter((username, index, arr) => arr.indexOf(username) === index);
}
function parseAndValidateUserIds(raw) {
  if (!raw.trim()) {
    return [];
  }
  return raw.split(EXCLUDED_ACCOUNTS_CONFIG.DELIMITER).map((userId) => userId.trim()).filter((userId) => {
    if (!userId) return false;
    if (!EXCLUSION_VALIDATION_RULES.USER_ID_PATTERN.test(userId)) {
      console.warn(`\u26A0\uFE0F \uC0AC\uC6A9\uC790 ID \uD328\uD134 \uC624\uB958, \uBB34\uC2DC\uB428: ${userId}`);
      return false;
    }
    return true;
  }).filter((userId, index, arr) => arr.indexOf(userId) === index);
}
function validateExcludedAccountsConfig(config) {
  try {
    if (!config || typeof config !== "object") {
      return false;
    }
    if (!Array.isArray(config.excludedUsernames) || !Array.isArray(config.excludedUserIds) || !Array.isArray(config.adminUsernames)) {
      return false;
    }
    if (config.adminUsernames.length === 0) {
      console.warn(`\u26A0\uFE0F \uAD00\uB9AC\uC790\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC74C`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`\u274C \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uAC80\uC99D \uC2E4\uD328:`, error);
    return false;
  }
}

// src/services/account-filter-service.ts
var AccountFilterService = class {
  // 5분 캐시
  constructor() {
    this.config = null;
    this.lastConfigLoad = 0;
    this.CONFIG_CACHE_DURATION = 5 * 60 * 1e3;
    this.loadConfig();
  }
  /**
   * 제외 계정 설정 로드 (캐시 포함)
   */
  loadConfig() {
    const now = Date.now();
    if (this.config && now - this.lastConfigLoad < this.CONFIG_CACHE_DURATION) {
      return true;
    }
    console.log("\u{1F504} \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uC0C8\uB85C\uACE0\uCE68...");
    try {
      const parseResult = loadExcludedAccountsConfig();
      if (!parseResult.success) {
        console.error("\u274C \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uB85C\uB4DC \uC2E4\uD328:", parseResult.error);
        return false;
      }
      if (!validateExcludedAccountsConfig(parseResult.config)) {
        console.error("\u274C \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uAC80\uC99D \uC2E4\uD328");
        return false;
      }
      this.config = parseResult.config;
      this.lastConfigLoad = now;
      console.log("\u2705 \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uB85C\uB4DC \uC644\uB8CC:", {
        excludedUsernamesCount: this.config.excludedUsernames.length,
        excludedUserIdsCount: this.config.excludedUserIds.length,
        adminUsernamesCount: this.config.adminUsernames.length
      });
      return true;
    } catch (error) {
      console.error("\u274C \uC81C\uC678 \uACC4\uC815 \uC124\uC815 \uB85C\uB4DC \uC911 \uC624\uB958:", error);
      return false;
    }
  }
  /**
   * V1 리더보드 엔트리 필터링 (소프트 제외)
   * @param entries 원본 리더보드 엔트리 배열
   * @param scope 제외 적용 범위
   * @returns 필터링된 엔트리 배열과 통계
   */
  filterV1LeaderboardEntries(entries, scope = "display" /* DISPLAY */) {
    if (!this.loadConfig() || !this.config) {
      console.warn("\u26A0\uFE0F \uC81C\uC678 \uACC4\uC815 \uC124\uC815\uC744 \uB85C\uB4DC\uD560 \uC218 \uC5C6\uC5B4 \uD544\uD130\uB9C1\uD558\uC9C0 \uC54A\uC74C");
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
    console.log(`\u{1F50D} V1 \uB9AC\uB354\uBCF4\uB4DC \uC81C\uC678 \uACC4\uC815 \uD544\uD130\uB9C1 \uC2DC\uC791 (${scope}):`, {
      totalEntries: entries.length,
      excludedUsernames: this.config.excludedUsernames,
      excludedUserIds: this.config.excludedUserIds
    });
    const excludedAccounts = [];
    const filteredEntries = entries.filter((entry) => {
      const exclusionResult = isAccountExcluded(entry.username, entry.userId, this.config);
      if (exclusionResult.isExcluded) {
        excludedAccounts.push({
          username: entry.username,
          userId: entry.userId,
          reason: exclusionResult.reason
        });
        console.log(`\u{1F6AB} V1 \uB9AC\uB354\uBCF4\uB4DC\uC5D0\uC11C \uACC4\uC815 \uC81C\uC678: @${entry.username} (${entry.userId}) - ${exclusionResult.reason}`);
        return false;
      }
      const adminResult = isAdminUser(entry.username, this.config);
      if (adminResult.isAdmin) {
        excludedAccounts.push({
          username: entry.username,
          userId: entry.userId,
          reason: "admin_account"
        });
        console.log(`\u{1F6AB} V1 \uB9AC\uB354\uBCF4\uB4DC\uC5D0\uC11C \uAD00\uB9AC\uC790 \uACC4\uC815 \uC81C\uC678: @${entry.username} (${entry.userId})`);
        return false;
      }
      return true;
    });
    const stats = {
      totalAccountsBefore: entries.length,
      totalAccountsAfter: filteredEntries.length,
      excludedAccountsCount: excludedAccounts.length,
      excludedAccounts
    };
    console.log("\u2705 V1 \uB9AC\uB354\uBCF4\uB4DC \uD544\uD130\uB9C1 \uC644\uB8CC:", stats);
    return {
      filteredEntries,
      stats
    };
  }
  /**
   * V2 누적 리더보드 엔트리 필터링 (소프트 제외)
   * @param entries 원본 누적 리더보드 엔트리 배열
   * @param scope 제외 적용 범위
   * @returns 필터링된 엔트리 배열과 통계
   */
  filterV2CumulativeEntries(entries, scope = "display" /* DISPLAY */) {
    if (!this.loadConfig() || !this.config) {
      console.warn("\u26A0\uFE0F \uC81C\uC678 \uACC4\uC815 \uC124\uC815\uC744 \uB85C\uB4DC\uD560 \uC218 \uC5C6\uC5B4 \uD544\uD130\uB9C1\uD558\uC9C0 \uC54A\uC74C");
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
    console.log(`\u{1F50D} V2 \uB204\uC801 \uB9AC\uB354\uBCF4\uB4DC \uC81C\uC678 \uACC4\uC815 \uD544\uD130\uB9C1 \uC2DC\uC791 (${scope}):`, {
      totalEntries: entries.length,
      excludedUsernames: this.config.excludedUsernames,
      excludedUserIds: this.config.excludedUserIds
    });
    const excludedAccounts = [];
    const filteredEntries = entries.filter((entry) => {
      const exclusionResult = isAccountExcluded(entry.username, entry.userId, this.config);
      if (exclusionResult.isExcluded) {
        excludedAccounts.push({
          username: entry.username,
          userId: entry.userId,
          reason: exclusionResult.reason
        });
        console.log(`\u{1F6AB} V2 \uB204\uC801 \uB9AC\uB354\uBCF4\uB4DC\uC5D0\uC11C \uACC4\uC815 \uC81C\uC678: @${entry.username} (${entry.userId}) - ${exclusionResult.reason}`);
        return false;
      }
      const adminResult = isAdminUser(entry.username, this.config);
      if (adminResult.isAdmin) {
        excludedAccounts.push({
          username: entry.username,
          userId: entry.userId,
          reason: "admin_account"
        });
        console.log(`\u{1F6AB} V2 \uB204\uC801 \uB9AC\uB354\uBCF4\uB4DC\uC5D0\uC11C \uAD00\uB9AC\uC790 \uACC4\uC815 \uC81C\uC678: @${entry.username} (${entry.userId})`);
        return false;
      }
      return true;
    });
    const stats = {
      totalAccountsBefore: entries.length,
      totalAccountsAfter: filteredEntries.length,
      excludedAccountsCount: excludedAccounts.length,
      excludedAccounts
    };
    console.log("\u2705 V2 \uB204\uC801 \uB9AC\uB354\uBCF4\uB4DC \uD544\uD130\uB9C1 \uC644\uB8CC:", stats);
    return {
      filteredEntries,
      stats
    };
  }
  /**
   * 단일 계정 제외 여부 확인
   * @param username 사용자명
   * @param userId 사용자 ID
   * @returns 제외 여부
   */
  isAccountExcluded(username, userId) {
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
  getExcludedAccountsConfig() {
    if (!this.loadConfig()) {
      return null;
    }
    return this.config ? { ...this.config } : null;
  }
  /**
   * 제외 계정 통계 조회
   * @returns 제외 계정 통계
   */
  getExclusionStats() {
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
  forceRefreshConfig() {
    this.lastConfigLoad = 0;
    return this.loadConfig();
  }
};
var accountFilterServiceInstance = null;
function getAccountFilterService() {
  if (!accountFilterServiceInstance) {
    accountFilterServiceInstance = new AccountFilterService();
  }
  return accountFilterServiceInstance;
}

// src/handlers/api/excluded-accounts-status.ts
var handler = async (event) => {
  const startTime = Date.now();
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ""
    };
  }
  try {
    console.log("\u{1F50D} \uC81C\uC678 \uACC4\uC815 \uC0C1\uD0DC \uD655\uC778 API \uC694\uCCAD \uC2DC\uC791");
    const requestContext = event.requestContext;
    const sourceIp = requestContext.identity?.sourceIp;
    console.log("\u{1F4E1} \uC694\uCCAD \uC815\uBCF4:", {
      httpMethod: event.httpMethod,
      sourceIp,
      userAgent: requestContext.identity?.userAgent
    });
    const accountFilterService = getAccountFilterService();
    const config = accountFilterService.getExcludedAccountsConfig();
    if (!config) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Failed to load excluded accounts configuration",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          processingTimeMs: Date.now() - startTime
        })
      };
    }
    const stats = accountFilterService.getExclusionStats();
    if (!stats) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Failed to load exclusion statistics",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          processingTimeMs: Date.now() - startTime
        })
      };
    }
    const response = {
      success: true,
      data: {
        excludedUsernames: config.excludedUsernames,
        excludedUserIds: config.excludedUserIds,
        adminUsernames: config.adminUsernames,
        totalExcludedAccounts: config.excludedUsernames.length + config.excludedUserIds.length,
        lastConfigLoad: stats.lastConfigLoad,
        systemInfo: {
          configSource: "environment_variables",
          exclusionMethod: "soft_exclusion",
          dataPreservation: true,
          reversible: true
        }
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      processingTimeMs: Date.now() - startTime,
      message: `Currently ${config.excludedUsernames.length + config.excludedUserIds.length} accounts are excluded from leaderboards`
    };
    console.log("\u2705 \uC81C\uC678 \uACC4\uC815 \uC0C1\uD0DC \uC870\uD68C \uC644\uB8CC:", {
      excludedUsernamesCount: config.excludedUsernames.length,
      excludedUserIdsCount: config.excludedUserIds.length,
      totalExcluded: config.excludedUsernames.length + config.excludedUserIds.length,
      processingTimeMs: response.processingTimeMs
    });
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response, null, 2)
    };
  } catch (error) {
    console.error("\u274C \uC81C\uC678 \uACC4\uC815 \uC0C1\uD0DC \uD655\uC778 API \uC624\uB958:", error);
    const errorResponse = {
      success: false,
      error: error.message || "Internal server error",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      processingTimeMs: Date.now() - startTime
    };
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify(errorResponse)
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=excluded-accounts-status.js.map
