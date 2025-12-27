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

// src/handlers/api/get-top-climbers.ts
var get_top_climbers_exports = {};
__export(get_top_climbers_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(get_top_climbers_exports);
var import_client_dynamodb2 = require("@aws-sdk/client-dynamodb");

// src/utils/env.ts
function getEnvVar(key, defaultValue) {
  const value = process.env[key];
  if (!value && defaultValue === void 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue;
}
function getOptionalEnvVar(key, defaultValue) {
  const value = process.env[key];
  return value || defaultValue;
}
function getEnvConfigV2() {
  return {
    // DynamoDB
    awsRegion: getEnvVar("AWS_REGION", "ap-northeast-2"),
    cumulativeTableName: getEnvVar("CUMULATIVE_TABLE_NAME", "nasun-leaderboard-data"),
    userIdentityMapTable: getOptionalEnvVar("USER_IDENTITY_MAP_TABLE"),
    // 🆕 추가
    // Twitter API (선택적)
    twitterBearerToken: getEnvVar("TWITTER_BEARER_TOKEN", ""),
    // 기본값으로 빈 문자열
    targetUsername: getEnvVar("TARGET_USERNAME", "Naru010110"),
    targetUserId: getEnvVar("TARGET_USER_ID", "1863020068785004544"),
    adminUsernames: getEnvVar("ADMIN_USERNAMES", "Naru010110,overclocksalmon").split(",").map((username) => username.trim()),
    // OAuth 1.0a credentials
    twitterApiKey: getEnvVar("TWITTER_API_KEY", ""),
    twitterApiSecret: getEnvVar("TWITTER_API_SECRET", ""),
    twitterAccessToken: getEnvVar("TWITTER_ACCESS_TOKEN", ""),
    twitterAccessTokenSecret: getEnvVar("TWITTER_ACCESS_TOKEN_SECRET", ""),
    // OAuth 2.0 credentials (북마크 API용)
    oauth2ClientId: getEnvVar("OAUTH2_CLIENT_ID", ""),
    oauth2ClientSecret: getEnvVar("OAUTH2_CLIENT_SECRET", ""),
    oauth2UserAccessToken: getOptionalEnvVar("OAUTH2_USER_ACCESS_TOKEN"),
    oauth2RefreshToken: getOptionalEnvVar("OAUTH2_REFRESH_TOKEN"),
    oauth2RedirectUri: getEnvVar("OAUTH2_REDIRECT_URI", "http://localhost:3000/auth/callback"),
    // 인증 전략
    enableOAuthAuthentication: getEnvVar("ENABLE_OAUTH_AUTHENTICATION", "true") === "true",
    fallbackToBearerToken: getEnvVar("FALLBACK_TO_BEARER_TOKEN", "true") === "true",
    enableOAuth2Authentication: getEnvVar("ENABLE_OAUTH2_AUTHENTICATION", "false") === "true",
    // 북마크 기능 설정
    enableBookmarkScoring: getEnvVar("ENABLE_BOOKMARK_SCORING", "false") === "true",
    bookmarkScoreValue: parseFloat(getEnvVar("BOOKMARK_SCORE_VALUE", "3.5")),
    // 시스템 설정
    // 이벤트 기간 설정
    event1StartDate: getEnvVar("EVENT1_START_DATE", "2025-10-19"),
    event1EndDate: getEnvVar("EVENT1_END_DATE", "2025-10-21"),
    event2StartDate: getEnvVar("EVENT2_START_DATE", "2025-10-21"),
    event2EndDate: getEnvVar("EVENT2_END_DATE", "2025-10-23"),
    event3StartDate: getEnvVar("EVENT3_START_DATE", "2025-12-11"),
    event3EndDate: getEnvVar("EVENT3_END_DATE", "2025-12-30"),
    // TTL 설정 (일 단위)
    leaderboardDataTtlDays: parseInt(getEnvVar("LEADERBOARD_DATA_TTL_DAYS", "365")),
    mentionTtlDays: parseInt(getEnvVar("MENTION_TTL_DAYS", "365")),
    replyCounterTtlDays: parseInt(getEnvVar("REPLY_COUNTER_TTL_DAYS", "365")),
    recentActivityTtlDays: parseInt(getEnvVar("RECENT_ACTIVITY_TTL_DAYS", "365")),
    dailySnapshotTtlDays: parseInt(getEnvVar("DAILY_SNAPSHOT_TTL_DAYS", "365")),
    profileCacheTtlDays: parseInt(getEnvVar("PROFILE_CACHE_TTL_DAYS", "7")),
    // V2 전용
    systemVersion: "v2",
    enableCumulativeScoring: getEnvVar("ENABLE_CUMULATIVE_SCORING", "true") === "true",
    // 동점자 처리 - 누적 활동 일수 설정
    activeDaysPeriod: parseInt(getEnvVar("ACTIVE_DAYS_PERIOD", "60")),
    activeDaysWeight: parseFloat(getEnvVar("ACTIVE_DAYS_WEIGHT", "0.1")),
    activeDaysMinActivities: parseInt(getEnvVar("ACTIVE_DAYS_MIN_ACTIVITIES", "1")),
    enableActiveDaysTieBreaker: getEnvVar("ENABLE_ACTIVE_DAYS_TIE_BREAKER", "true") === "true",
    // 🆕 Activity Bonus/Penalty System (2025-10-27)
    enableActivityBonus: getEnvVar("ACTIVITY_BONUS_ENABLED", "true") === "true",
    activityBonusWeightPerDay: parseFloat(getEnvVar("ACTIVITY_BONUS_WEIGHT_PER_DAY", "0.28")),
    activityBonusThresholdDays: parseInt(getEnvVar("ACTIVITY_BONUS_THRESHOLD_DAYS", "3")),
    activityBonusPeriodDays: parseInt(getEnvVar("ACTIVITY_BONUS_PERIOD_DAYS", "7")),
    enableInactivityPenalty: getEnvVar("INACTIVITY_PENALTY_ENABLED", "true") === "true",
    inactivityPenaltyThreshold: parseInt(getEnvVar("INACTIVITY_PENALTY_THRESHOLD", "3")),
    inactivityPenaltyPerDay: parseFloat(getEnvVar("INACTIVITY_PENALTY_PER_DAY", "0.3")),
    inactivityPenaltyMax: parseFloat(getEnvVar("INACTIVITY_PENALTY_MAX", "5.0")),
    // 점수 가중치 설정
    scoreWeightLikes: parseFloat(getEnvVar("SCORE_WEIGHT_LIKES", "0.2")),
    scoreWeightReplies: parseFloat(getEnvVar("SCORE_WEIGHT_REPLIES", "0.4")),
    scoreWeightReposts: parseFloat(getEnvVar("SCORE_WEIGHT_REPOSTS", "0.4")),
    scoreWeightQuotes: parseFloat(getEnvVar("SCORE_WEIGHT_QUOTES", "0.6")),
    scoreWeightMentions: parseFloat(getEnvVar("SCORE_WEIGHT_MENTIONS", "0.5")),
    // 🆕 X API 데이터 수집 제한 (2025-10-28)
    maxMentionsPerDay: parseInt(getEnvVar("MAX_MENTIONS_PER_DAY", "1000")),
    maxLikesPerTweet: parseInt(getEnvVar("MAX_LIKES_PER_TWEET", "500")),
    maxRepostsPerTweet: parseInt(getEnvVar("MAX_REPOSTS_PER_TWEET", "500")),
    visibleLeaderboards: getEnvVar("VISIBLE_LEADERBOARDS", "CUMULATIVE,EVENT1,EVENT2,EVENT3").split(",").map((id) => id.trim())
  };
}

// src/services/leaderboard-service.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_util_dynamodb = require("@aws-sdk/util-dynamodb");

// src/types/leaderboard.ts
function getEventPeriodConfigs() {
  const config = getEnvConfigV2();
  return {
    ["CUMULATIVE" /* CUMULATIVE */]: null,
    // 누적은 전체 기간
    ["EVENT1" /* EVENT1 */]: {
      period: "EVENT1" /* EVENT1 */,
      name: "1\uCC28 \uC774\uBCA4\uD2B8",
      description: "1\uCC28 \uC774\uBCA4\uD2B8 \uAE30\uAC04 (\uD658\uACBD\uBCC0\uC218 \uAE30\uBC18)",
      startDate: config.event1StartDate,
      endDate: config.event1EndDate
    },
    ["EVENT2" /* EVENT2 */]: {
      period: "EVENT2" /* EVENT2 */,
      name: "2\uCC28 \uC774\uBCA4\uD2B8",
      description: "2\uCC28 \uC774\uBCA4\uD2B8 \uAE30\uAC04 (\uD658\uACBD\uBCC0\uC218 \uAE30\uBC18)",
      startDate: config.event2StartDate,
      endDate: config.event2EndDate
    },
    ["EVENT3" /* EVENT3 */]: {
      period: "EVENT3" /* EVENT3 */,
      name: "3\uCC28 \uC774\uBCA4\uD2B8",
      description: "3\uCC28 \uC774\uBCA4\uD2B8 \uAE30\uAC04 (\uD658\uACBD\uBCC0\uC218 \uAE30\uBC18)",
      startDate: config.event3StartDate,
      endDate: config.event3EndDate
    }
  };
}
var EVENT_PERIOD_CONFIGS = getEventPeriodConfigs();

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

// src/services/leaderboard-service.ts
var LeaderboardService = class {
  constructor(ddbClient2, config) {
    this.ddbClient = ddbClient2;
    this.config = config;
    this.accountFilterService = new AccountFilterService();
  }
  async getLeaderboard(period, page = 1, limit = 50, date) {
    console.log("\uB9AC\uB354\uBCF4\uB4DC \uB370\uC774\uD130 \uC870\uD68C \uC2DC\uC791", { period, page, limit, date });
    try {
      let pk;
      if (date) {
        pk = `LEADERBOARD#${period}#${date}`;
      } else if (this.isEventEnded(period)) {
        const snapshotDate = await this.getLatestSnapshotDate(period);
        if (snapshotDate) {
          console.log(`\u{1F4F8} [getLeaderboard] \uC774\uBCA4\uD2B8 \uC885\uB8CC\uB428, \uC2A4\uB0C5\uC0F7 \uC0AC\uC6A9: ${snapshotDate}`);
          pk = `LEADERBOARD#${period}#${snapshotDate}`;
        } else {
          console.log("\u26A0\uFE0F [getLeaderboard] \uC2A4\uB0C5\uC0F7\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C, \uD604\uC7AC \uB9AC\uB354\uBCF4\uB4DC \uC0AC\uC6A9");
          pk = `LEADERBOARD#${period}`;
        }
      } else {
        pk = `LEADERBOARD#${period}`;
      }
      const metadataResult = await this.ddbClient.send(new import_client_dynamodb.GetItemCommand({
        TableName: this.config.cumulativeTableName,
        Key: {
          pk: { S: pk },
          sk: { S: "METADATA" }
        }
      }));
      if (!metadataResult.Item) {
        console.warn("\uBA54\uD0C0\uB370\uC774\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD658\uACBD\uBCC0\uC218 \uAE30\uBC18 \uBE48 \uBA54\uD0C0\uB370\uC774\uD130 \uC0DD\uC131", { pk, period });
        const eventPeriodConfigs2 = getEventPeriodConfigs();
        const periodConfig2 = eventPeriodConfigs2[period];
        return { success: true, data: this.getEmptyLeaderboardDataWithDates(period, periodConfig2) };
      }
      const metadata = (0, import_util_dynamodb.unmarshall)(metadataResult.Item);
      console.log("\u{1F50D} [DEBUG] Unmarshalled metadata:", JSON.stringify(metadata, null, 2));
      const totalEntries = metadata.totalEntries || 0;
      const totalPages = Math.ceil(totalEntries / limit);
      const entries = await this.getLeaderboardEntries(pk, page, limit);
      const enrichedEntries = await this.enrichLeaderboardEntries(entries);
      const { filteredEntries, stats } = this.accountFilterService.filterV1LeaderboardEntries(enrichedEntries);
      console.log(`\uACC4\uC815 \uD544\uD130\uB9C1 \uACB0\uACFC: ${stats.excludedAccountsCount}\uAC1C \uACC4\uC815 \uC81C\uC678`);
      const eventPeriodConfigs = getEventPeriodConfigs();
      const periodConfig = eventPeriodConfigs[period];
      const responseData = {
        entries: filteredEntries,
        pagination: {
          page,
          limit,
          total: totalEntries,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        metadata: {
          totalUsers: totalEntries,
          totalEntries,
          // 🆕 totalEntries 필드 추가 (프론트엔드 호환성)
          systemVersion: "v2",
          dataStartDate: (/* @__PURE__ */ new Date()).toISOString(),
          lastUpdated: metadata.lastUpdated || (/* @__PURE__ */ new Date()).toISOString(),
          description: periodConfig?.description || metadata.description || "",
          period: metadata.period,
          // 🚨 [BUGFIX] 항상 최신 환경 변수 값을 사용하도록 날짜를 덮어씁니다.
          periodStartDate: periodConfig?.startDate,
          periodEndDate: periodConfig?.endDate
        }
      };
      return { success: true, data: responseData };
    } catch (error) {
      console.error("\uB9AC\uB354\uBCF4\uB4DC \uC870\uD68C \uC2E4\uD328:", error);
      return { success: false, error: "\uB9AC\uB354\uBCF4\uB4DC \uB370\uC774\uD130\uB97C \uAC00\uC838\uC624\uB294 \uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." };
    }
  }
  async getLeaderboardEntries(pk, page, limit) {
    const command = new import_client_dynamodb.QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
      ExpressionAttributeValues: {
        ":pk": { S: pk },
        ":sk_prefix": { S: "RANK#" }
      },
      Limit: page * limit,
      // 페이지의 끝까지 모든 항목을 가져옴
      ScanIndexForward: true
      // 랭킹 순으로 정렬
    });
    const result = await this.ddbClient.send(command);
    const items = result.Items ? result.Items.map((item) => (0, import_util_dynamodb.unmarshall)(item)) : [];
    const startIndex = (page - 1) * limit;
    const pageItems = items.slice(startIndex, startIndex + limit);
    if (pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      const lastScore = lastItem.totalScore;
      for (let i = startIndex + limit; i < items.length; i++) {
        if (items[i].totalScore === lastScore) {
          pageItems.push(items[i]);
        } else {
          break;
        }
      }
    }
    return pageItems;
  }
  async enrichLeaderboardEntries(entries) {
    return entries.map((entry) => {
      return {
        ...entry,
        language: entry.dominantLanguage || "unknown",
        totalScore: entry.totalScore || 0,
        totalActivities: (entry.totalLikes || 0) + (entry.totalReplies || 0) + (entry.totalReposts || 0) + (entry.totalQuotes || 0) + (entry.totalMentions || 0),
        breakdown: {
          totalLikes: entry.totalLikes || 0,
          totalReplies: entry.totalReplies || 0,
          totalReposts: entry.totalReposts || 0,
          totalQuotes: entry.totalQuotes || 0,
          totalMentions: entry.totalMentions || 0
        },
        xUrl: `https://twitter.com/${entry.username}`
      };
    });
  }
  getEmptyLeaderboardData(period) {
    return {
      entries: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      metadata: {
        totalUsers: 0,
        systemVersion: "v2",
        dataStartDate: (/* @__PURE__ */ new Date()).toISOString(),
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        description: "",
        period,
        periodStartDate: "",
        periodEndDate: ""
      }
    };
  }
  /**
   * 🆕 [BUGFIX 2025-10-16] DB 메타데이터가 없을 때 환경변수 기반으로 날짜 정보를 포함한 빈 리더보드 데이터 생성
   * 이벤트가 시작하지 않아 리더보드가 아직 생성되지 않았어도, 프론트엔드에서 이벤트 기간 날짜를 표시할 수 있도록 함
   *
   * @param period - 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2)
   * @param periodConfig - 환경변수에서 가져온 이벤트 기간 설정 (null이면 CUMULATIVE)
   * @returns 날짜 정보가 포함된 빈 리더보드 데이터
   */
  getEmptyLeaderboardDataWithDates(period, periodConfig) {
    return {
      entries: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      metadata: {
        totalUsers: 0,
        systemVersion: "v2",
        dataStartDate: (/* @__PURE__ */ new Date()).toISOString(),
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        description: periodConfig?.description || "\uB204\uC801 \uB9AC\uB354\uBCF4\uB4DC",
        period,
        // 🎯 핵심: 환경변수 기반 날짜 정보 주입
        periodStartDate: periodConfig?.startDate || "",
        periodEndDate: periodConfig?.endDate || ""
      }
    };
  }
  async getUserActivityDates(userId) {
    const result = await this.ddbClient.send(new import_client_dynamodb.QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `USER#${userId}` },
        ":sk_prefix": { S: "RECENT#" }
      },
      ProjectionExpression: "sk, tweet_created_at"
    }));
    if (!result.Items) {
      return [];
    }
    const dates = result.Items.map((item) => {
      const activity = (0, import_util_dynamodb.unmarshall)(item);
      return new Date(activity.tweet_created_at).toISOString().split("T")[0];
    });
    return [...new Set(dates)];
  }
  async getUnprocessedEngagements(userId) {
    const result = await this.ddbClient.send(new import_client_dynamodb.QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      FilterExpression: "attribute_not_exists(is_processed) OR is_processed = :false",
      ExpressionAttributeValues: {
        ":pk": { S: `USER#${userId}` },
        ":skPrefix": { S: "RECENT#" },
        ":false": { BOOL: false }
      },
      ProjectionExpression: "sk, tweet_id, engagement_type, engaging_user_id, engaging_username, tweet_created_at, added_at"
    }));
    return result.Items ? result.Items.map((item) => (0, import_util_dynamodb.unmarshall)(item)) : [];
  }
  // 누락된 메서드들 추가
  async getEventPeriodLeaderboard(period, page = 1, limit = 50) {
    return await this.getLeaderboard(period, page, limit);
  }
  async getLeaderboardSnapshot(period, date, page = 1, limit = 50) {
    return await this.getLeaderboard(period, page, limit, date);
  }
  /**
   * 이벤트가 종료되었는지 확인
   * @param period 리더보드 기간
   * @returns 이벤트 종료 여부
   */
  isEventEnded(period) {
    if (period === "CUMULATIVE" /* CUMULATIVE */) {
      return false;
    }
    const endDate = this.getEventEndDate(period);
    if (!endDate) {
      return false;
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    return today > endDate;
  }
  /**
   * 이벤트 종료일 조회
   * @param period 리더보드 기간
   * @returns 이벤트 종료일 (YYYY-MM-DD) 또는 null
   */
  getEventEndDate(period) {
    if (period === "EVENT1" /* EVENT1 */) {
      return this.config.event1EndDate;
    }
    if (period === "EVENT2" /* EVENT2 */) {
      return this.config.event2EndDate;
    }
    return null;
  }
  /**
   * 🆕 Phase 1 BUG FIX: 특정 기간의 최신 스냅샷 날짜 조회
   *
   * @description
   * 이벤트가 종료되어 현재 리더보드가 비어있을 때 최신 스냅샷 날짜를 찾습니다.
   * 스냅샷은 pk가 "LEADERBOARD#{PERIOD}#{DATE}" 형식으로 저장됩니다.
   *
   * @param period - 리더보드 기간
   * @returns 최신 스냅샷 날짜 (YYYY-MM-DD) 또는 null
   */
  async getLatestSnapshotDate(period) {
    try {
      const eventEndDate = this.getEventEndDate(period);
      if (eventEndDate) {
        console.log(`\u{1F50D} [getLatestSnapshotDate] \uD658\uACBD \uBCC0\uC218\uC5D0\uC11C \uC774\uBCA4\uD2B8 \uC885\uB8CC \uB0A0\uC9DC \uBC1C\uACAC: ${eventEndDate}, DynamoDB \uAC80\uC99D \uC911...`);
        const pk = `LEADERBOARD#${period}#${eventEndDate}`;
        const validationCommand = new import_client_dynamodb.GetItemCommand({
          TableName: this.config.cumulativeTableName,
          Key: {
            pk: { S: pk },
            sk: { S: "METADATA" }
          }
        });
        const validationResult = await this.ddbClient.send(validationCommand);
        if (validationResult.Item) {
          console.log(`\u2705 [getLatestSnapshotDate] \uD658\uACBD \uBCC0\uC218 \uB0A0\uC9DC\uC758 \uC2A4\uB0C5\uC0F7 \uC874\uC7AC \uD655\uC778: ${eventEndDate}`);
          return eventEndDate;
        } else {
          console.log(`\u26A0\uFE0F [getLatestSnapshotDate] \uD658\uACBD \uBCC0\uC218 \uB0A0\uC9DC(${eventEndDate})\uC758 \uC2A4\uB0C5\uC0F7\uC774 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC74C, fallback\uC73C\uB85C \uC804\uD658`);
        }
      }
      const today = /* @__PURE__ */ new Date();
      let startDate;
      if (period === "EVENT1" /* EVENT1 */ && this.config.event1StartDate) {
        startDate = new Date(this.config.event1StartDate);
      } else if (period === "EVENT2" /* EVENT2 */ && this.config.event2StartDate) {
        startDate = new Date(this.config.event2StartDate);
      } else {
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
      }
      const daysDiff = Math.ceil((today.getTime() - startDate.getTime()) / (1e3 * 60 * 60 * 24));
      const maxDays = Math.min(daysDiff + 1, 90);
      console.log(`\u{1F50D} [getLatestSnapshotDate] \uC2A4\uCE94 \uBC94\uC704: ${startDate.toISOString().split("T")[0]} ~ ${today.toISOString().split("T")[0]} (${maxDays}\uC77C)`);
      for (let i = 0; i < maxDays; i++) {
        const testDate = new Date(today);
        testDate.setDate(testDate.getDate() - i);
        const dateStr = testDate.toISOString().split("T")[0];
        if (testDate < startDate) {
          console.log(`\u26A0\uFE0F [getLatestSnapshotDate] \uC2DC\uC791\uC77C(${startDate.toISOString().split("T")[0]}) \uB3C4\uB2EC, \uC2A4\uCE94 \uC911\uB2E8`);
          break;
        }
        const pk = `LEADERBOARD#${period}#${dateStr}`;
        const command = new import_client_dynamodb.GetItemCommand({
          TableName: this.config.cumulativeTableName,
          Key: {
            pk: { S: pk },
            sk: { S: "METADATA" }
          }
        });
        const result = await this.ddbClient.send(command);
        if (result.Item) {
          console.log(`\u2705 [getLatestSnapshotDate] \uC2A4\uB0C5\uC0F7 \uBC1C\uACAC: ${dateStr}`);
          return dateStr;
        }
      }
      console.log("\u26A0\uFE0F [getLatestSnapshotDate] \uCD5C\uC2E0 \uC2A4\uB0C5\uC0F7\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C");
      return null;
    } catch (error) {
      console.error("\u274C [getLatestSnapshotDate] \uC5D0\uB7EC:", error);
      return null;
    }
  }
  /**
   * 🆕 Phase 1: 특정 사용자의 랭킹 정보 조회
   *
   * @param period - 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2)
   * @param username - 검색할 트위터 핸들 (대소문자 무관, @ 기호 자동 제거)
   * @param date - 옵션: 특정 날짜의 스냅샷 조회 (YYYY-MM-DD)
   * @param limit - 페이지당 항목 수 (기본값: 50)
   * @returns UserRankData 또는 null (사용자를 찾을 수 없는 경우)
   */
  async getUserRank(period, username, date, limit = 50) {
    console.log("\u{1F50D} [getUserRank] \uC0AC\uC6A9\uC790 \uB7AD\uD0B9 \uC870\uD68C \uC2DC\uC791", { period, username, date });
    try {
      const normalizedUsername = username.replace(/^@/, "");
      const command = new import_client_dynamodb.QueryCommand({
        TableName: this.config.cumulativeTableName,
        IndexName: "username-period-index",
        KeyConditionExpression: "username = :username AND period = :period",
        ExpressionAttributeValues: {
          ":username": { S: normalizedUsername },
          ":period": { S: period }
          // 날짜 관계없이 항상 period만 사용
        }
      });
      const result = await this.ddbClient.send(command);
      if (!result.Items || result.Items.length === 0) {
        console.log("\u{1F6AB} [getUserRank] \uC0AC\uC6A9\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC74C", { normalizedUsername, period });
        return null;
      }
      let targetPk;
      if (date) {
        targetPk = `LEADERBOARD#${period}#${date}`;
      } else if (this.isEventEnded(period)) {
        const snapshotDate = await this.getLatestSnapshotDate(period);
        if (snapshotDate) {
          console.log(`\u{1F4F8} [getUserRank] \uC774\uBCA4\uD2B8 \uC885\uB8CC\uB428, \uC2A4\uB0C5\uC0F7 \uC0AC\uC6A9: ${snapshotDate}`);
          targetPk = `LEADERBOARD#${period}#${snapshotDate}`;
        } else {
          console.log("\u26A0\uFE0F [getUserRank] \uC2A4\uB0C5\uC0F7\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C, \uD604\uC7AC \uB9AC\uB354\uBCF4\uB4DC \uC0AC\uC6A9");
          targetPk = `LEADERBOARD#${period}`;
        }
      } else {
        targetPk = `LEADERBOARD#${period}`;
      }
      const validItems = result.Items.filter((item) => {
        const pk = item.pk?.S || "";
        return pk === targetPk;
      });
      if (validItems.length === 0) {
        console.log("\u{1F6AB} [getUserRank] \uC720\uD6A8\uD55C \uD56D\uBAA9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C", { normalizedUsername, period, itemsCount: result.Items.length });
        return null;
      }
      const userEntry = (0, import_util_dynamodb.unmarshall)(validItems[0]);
      console.log("\u2705 [getUserRank] \uC720\uD6A8\uD55C \uD56D\uBAA9 \uBC1C\uACAC", { username: userEntry.username, rank: userEntry.rank, pk: validItems[0].pk?.S, sk: validItems[0].sk?.S });
      const metadataResult = await this.ddbClient.send(new import_client_dynamodb.GetItemCommand({
        TableName: this.config.cumulativeTableName,
        Key: {
          pk: { S: targetPk },
          sk: { S: "METADATA" }
        }
      }));
      const metadata = metadataResult.Item ? (0, import_util_dynamodb.unmarshall)(metadataResult.Item) : null;
      const totalUsers = metadata?.totalEntries || 0;
      const page = Math.ceil(userEntry.rank / limit);
      const userRankData = {
        username: userEntry.username,
        rank: userEntry.rank,
        totalScore: userEntry.totalScore,
        totalUsers,
        page,
        entry: userEntry
      };
      console.log("\u2705 [getUserRank] \uC0AC\uC6A9\uC790 \uB7AD\uD0B9 \uC870\uD68C \uC131\uACF5", userRankData);
      return userRankData;
    } catch (error) {
      console.error("\u274C [getUserRank] \uC0AC\uC6A9\uC790 \uB7AD\uD0B9 \uC870\uD68C \uC2E4\uD328:", error);
      throw error;
    }
  }
  /**
   * 🆕 Phase 1: 사용자 검색 (하이브리드 검색: 정확히 일치 우선 → 부분 일치 폴백)
   *
   * @param period - 리더보드 기간
   * @param query - 검색 쿼리 (@ 기호 자동 제거, 대소문자 무관)
   * @param date - 옵션: 특정 날짜의 스냅샷 검색
   * @param maxResults - 최대 결과 수 (기본값: 10)
   * @returns SearchResultData (정확히 일치하는 항목 + 부분 일치 항목들)
   */
  async searchUsers(period, query, date, maxResults = 10) {
    console.log("\u{1F50D} [searchUsers] \uC0AC\uC6A9\uC790 \uAC80\uC0C9 \uC2DC\uC791", { period, query, date, maxResults });
    try {
      const normalizedQuery = query.replace(/^@/, "").toLowerCase().trim();
      if (normalizedQuery.length === 0) {
        return { matches: [], exactMatch: null, total: 0 };
      }
      let pk = date ? `LEADERBOARD#${period}#${date}` : `LEADERBOARD#${period}`;
      const command = new import_client_dynamodb.QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
        ExpressionAttributeValues: {
          ":pk": { S: pk },
          ":sk_prefix": { S: "RANK#" }
        },
        ScanIndexForward: true
        // 랭킹 순으로 정렬
      });
      let result = await this.ddbClient.send(command);
      let allEntries = result.Items ? result.Items.map((item) => (0, import_util_dynamodb.unmarshall)(item)) : [];
      if (allEntries.length === 0 && !date) {
        console.log("\u26A0\uFE0F [searchUsers] \uD604\uC7AC \uB9AC\uB354\uBCF4\uB4DC\uAC00 \uBE44\uC5B4\uC788\uC74C - \uCD5C\uC2E0 \uC2A4\uB0C5\uC0F7 \uAC80\uC0C9 \uC2DC\uB3C4");
        const latestSnapshot = await this.getLatestSnapshotDate(period);
        if (latestSnapshot) {
          console.log(`\u2705 [searchUsers] \uCD5C\uC2E0 \uC2A4\uB0C5\uC0F7 \uBC1C\uACAC: ${latestSnapshot}`);
          pk = `LEADERBOARD#${period}#${latestSnapshot}`;
          const snapshotCommand = new import_client_dynamodb.QueryCommand({
            TableName: this.config.cumulativeTableName,
            KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
            ExpressionAttributeValues: {
              ":pk": { S: pk },
              ":sk_prefix": { S: "RANK#" }
            },
            ScanIndexForward: true
          });
          result = await this.ddbClient.send(snapshotCommand);
          allEntries = result.Items ? result.Items.map((item) => (0, import_util_dynamodb.unmarshall)(item)) : [];
        }
      }
      const exactMatch = allEntries.find(
        (entry) => entry.username.toLowerCase() === normalizedQuery
      );
      const partialMatches = allEntries.filter((entry) => {
        const username = entry.username.toLowerCase();
        return username !== normalizedQuery && username.includes(normalizedQuery);
      });
      const toSearchMatch = (entry) => ({
        username: entry.username,
        rank: entry.rank,
        totalScore: entry.totalScore,
        displayName: entry.displayName,
        profileImageUrl: entry.profileImageUrl
      });
      const matches = [];
      if (exactMatch) {
        matches.push(toSearchMatch(exactMatch));
      }
      const remainingSlots = maxResults - matches.length;
      partialMatches.slice(0, remainingSlots).forEach((entry) => {
        matches.push(toSearchMatch(entry));
      });
      const searchResult = {
        matches,
        exactMatch: exactMatch ? toSearchMatch(exactMatch) : null,
        total: matches.length
      };
      console.log("\u2705 [searchUsers] \uAC80\uC0C9 \uC644\uB8CC", {
        query: normalizedQuery,
        exactMatch: !!exactMatch,
        partialMatches: partialMatches.length,
        totalResults: matches.length
      });
      return searchResult;
    } catch (error) {
      console.error("\u274C [searchUsers] \uAC80\uC0C9 \uC2E4\uD328:", error);
      throw error;
    }
  }
  /**
   * 🆕 My Account Rank History: 특정 사용자의 랭킹 히스토리 조회
   *
   * @param userId - 사용자 ID
   * @param period - 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2)
   * @param startDate - 시작 날짜 (YYYY-MM-DD)
   * @param endDate - 종료 날짜 (YYYY-MM-DD)
   * @returns RankHistoryEntry[] (날짜 오름차순 정렬)
   */
  async getUserRankHistory(userId, period, startDate, endDate) {
    console.log("\u{1F4CA} [getUserRankHistory] \uB7AD\uD0B9 \uD788\uC2A4\uD1A0\uB9AC \uC870\uD68C \uC2DC\uC791", { userId, period, startDate, endDate });
    try {
      const command = new import_client_dynamodb.QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: "pk = :pk AND sk BETWEEN :startSk AND :endSk",
        ExpressionAttributeValues: {
          ":pk": { S: `USER#${userId}` },
          ":startSk": { S: `RANK_HISTORY#${period}#${startDate}` },
          ":endSk": { S: `RANK_HISTORY#${period}#${endDate}` }
        },
        ScanIndexForward: true
        // 날짜 오름차순 정렬
      });
      const result = await this.ddbClient.send(command);
      if (!result.Items || result.Items.length === 0) {
        console.log("\u{1F4ED} [getUserRankHistory] \uD788\uC2A4\uD1A0\uB9AC \uB370\uC774\uD130 \uC5C6\uC74C", { userId, period });
        return [];
      }
      const history = result.Items.map((item) => (0, import_util_dynamodb.unmarshall)(item));
      console.log("\u2705 [getUserRankHistory] \uD788\uC2A4\uD1A0\uB9AC \uC870\uD68C \uC644\uB8CC", {
        userId,
        period,
        count: history.length,
        dateRange: `${history[0]?.date} ~ ${history[history.length - 1]?.date}`
      });
      return history;
    } catch (error) {
      console.error("\u274C [getUserRankHistory] \uD788\uC2A4\uD1A0\uB9AC \uC870\uD68C \uC2E4\uD328:", error);
      throw error;
    }
  }
};

// src/handlers/api/get-top-climbers.ts
var ddbClient = new import_client_dynamodb2.DynamoDBClient({});
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,x-api-key",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Content-Type": "application/json"
};
function calculateComparisonDate(timeRange) {
  const today = /* @__PURE__ */ new Date();
  let daysAgo;
  switch (timeRange) {
    case "today":
      daysAgo = 1;
      break;
    case "7d":
      daysAgo = 7;
      break;
    case "4w":
      daysAgo = 28;
      break;
    case "3m":
      daysAgo = 90;
      break;
    default:
      daysAgo = 1;
  }
  const comparisonDate = new Date(today);
  comparisonDate.setDate(comparisonDate.getDate() - daysAgo);
  return comparisonDate.toISOString().split("T")[0];
}
function calculateRankChanges(currentEntries, previousEntries, comparisonDate, limit) {
  const previousMap = /* @__PURE__ */ new Map();
  for (const entry of previousEntries) {
    previousMap.set(entry.username, {
      rank: entry.rank,
      score: entry.finalScore
      // ✅ finalScore 사용 (활동일수 점수, 보너스, 감점 포함)
    });
  }
  const climbers = [];
  for (const current of currentEntries) {
    const previous = previousMap.get(current.username);
    if (!previous) {
      continue;
    }
    const rankImprovement = previous.rank - current.rank;
    if (rankImprovement <= 0) {
      continue;
    }
    const scoreIncrease = current.finalScore - previous.score;
    const percentageIncrease = previous.score > 0 ? scoreIncrease / previous.score * 100 : 0;
    climbers.push({
      userId: current.userId,
      username: current.username,
      displayName: current.displayName,
      profileImageUrl: current.profileImageUrl,
      currentRank: current.rank,
      previousRank: previous.rank,
      rankImprovement,
      currentScore: current.finalScore,
      // ✅ finalScore 사용 (리더보드 "Points"와 일치)
      previousScore: previous.score,
      scoreIncrease,
      percentageIncrease: Math.round(percentageIncrease * 10) / 10,
      // 소수점 1자리
      comparisonDate,
      xUrl: `https://x.com/${current.username}`
    });
  }
  climbers.sort((a, b) => {
    if (a.rankImprovement !== b.rankImprovement) {
      return b.rankImprovement - a.rankImprovement;
    }
    return b.scoreIncrease - a.scoreIncrease;
  });
  return climbers.slice(0, limit);
}
var handler = async (event) => {
  const startTime = Date.now();
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ""
    };
  }
  try {
    const period = event.pathParameters?.period?.toUpperCase() || "CUMULATIVE";
    const timeRange = event.queryStringParameters?.timeRange || "today";
    const limit = parseInt(event.queryStringParameters?.limit || "5", 10);
    if (!["CUMULATIVE", "EVENT1", "EVENT2", "EVENT3"].includes(period)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: `Invalid period: ${period}. Must be one of: CUMULATIVE, EVENT1, EVENT2, EVENT3`,
          code: "INVALID_PERIOD",
          processingTimeMs: Date.now() - startTime,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        })
      };
    }
    if (!["today", "7d", "4w", "3m"].includes(timeRange)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: `Invalid timeRange: ${timeRange}. Must be one of: today, 7d, 4w, 3m`,
          code: "INVALID_TIME_RANGE",
          processingTimeMs: Date.now() - startTime,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        })
      };
    }
    if ((period === "EVENT1" || period === "EVENT2" || period === "EVENT3") && (timeRange === "4w" || timeRange === "3m")) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: `Event leaderboards only support timeRange: today, 7d`,
          code: "INVALID_TIME_RANGE_FOR_EVENT",
          processingTimeMs: Date.now() - startTime,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        })
      };
    }
    console.log(`\u{1F3C6} [getTopClimbers] Top Climbers \uC870\uD68C \uC2DC\uC791:`, {
      period,
      timeRange,
      limit
    });
    const config = getEnvConfigV2();
    const leaderboardService = new LeaderboardService(ddbClient, config);
    const currentResult = await leaderboardService.getLeaderboard(
      period,
      1,
      // page
      500
      // 전체 조회 (현재 사용자 수가 ~200명이므로 충분)
    );
    if (!currentResult.success || !currentResult.data) {
      console.error(`\u274C [getTopClimbers] \uD604\uC7AC \uB9AC\uB354\uBCF4\uB4DC \uC870\uD68C \uC2E4\uD328:`, currentResult.error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: "Failed to fetch current leaderboard",
          code: "CURRENT_FETCH_FAILED",
          processingTimeMs: Date.now() - startTime,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        })
      };
    }
    const comparisonDate = calculateComparisonDate(timeRange);
    console.log(`\u{1F4C5} [getTopClimbers] \uBE44\uAD50 \uB0A0\uC9DC: ${comparisonDate}`);
    const previousResult = await leaderboardService.getLeaderboardSnapshot(
      period,
      comparisonDate,
      1,
      500
    );
    const previousEntries = previousResult.success && previousResult.data ? previousResult.data.entries : [];
    console.log(`\u{1F4CA} [getTopClimbers] \uB370\uC774\uD130 \uC870\uD68C \uC644\uB8CC:`, {
      current: currentResult.data.entries.length,
      previous: previousEntries.length
    });
    if (previousEntries.length === 0) {
      console.warn(`\u26A0\uFE0F [getTopClimbers] \uC774\uC804 \uC2A4\uB0C5\uC0F7 \uC5C6\uC74C: ${comparisonDate}`);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          version: "v2",
          data: {
            period,
            timeRange,
            comparisonDate,
            climbers: [],
            metadata: {
              totalUsers: currentResult.data.entries.length,
              totalClimbers: 0,
              averageImprovement: 0
            }
          },
          processingTimeMs: Date.now() - startTime,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        })
      };
    }
    const topClimbers = calculateRankChanges(
      currentResult.data.entries,
      previousEntries,
      comparisonDate,
      limit
    );
    const totalClimbers = topClimbers.length;
    const averageImprovement = totalClimbers > 0 ? topClimbers.reduce((sum, c) => sum + c.rankImprovement, 0) / totalClimbers : 0;
    const duration = Date.now() - startTime;
    console.log(`\u2705 [getTopClimbers] Top Climbers \uACC4\uC0B0 \uC644\uB8CC:`, {
      period,
      timeRange,
      climbers: totalClimbers,
      averageImprovement: Math.round(averageImprovement * 10) / 10,
      duration: `${duration}ms`
    });
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        version: "v2",
        data: {
          period,
          timeRange,
          comparisonDate,
          climbers: topClimbers,
          metadata: {
            totalUsers: currentResult.data.entries.length,
            totalClimbers,
            averageImprovement: Math.round(averageImprovement * 10) / 10
          }
        },
        processingTimeMs: duration,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      })
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\u274C [getTopClimbers] \uC608\uC678 \uBC1C\uC0DD (${duration}ms):`, error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        processingTimeMs: duration,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=get-top-climbers.js.map
