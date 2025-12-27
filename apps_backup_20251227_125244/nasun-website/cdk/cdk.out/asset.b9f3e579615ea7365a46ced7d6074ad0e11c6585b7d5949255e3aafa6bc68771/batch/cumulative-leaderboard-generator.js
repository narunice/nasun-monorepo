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

// src/handlers/batch/cumulative-leaderboard-generator.ts
var cumulative_leaderboard_generator_exports = {};
__export(cumulative_leaderboard_generator_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(cumulative_leaderboard_generator_exports);
var import_client_dynamodb3 = require("@aws-sdk/client-dynamodb");

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
function getScoreWeights(config) {
  return {
    likes: config.scoreWeightLikes,
    replies: config.scoreWeightReplies,
    reposts: config.scoreWeightReposts,
    quotes: config.scoreWeightQuotes,
    mentions: config.scoreWeightMentions
  };
}

// src/services/leaderboard-generator.ts
var import_client_dynamodb2 = require("@aws-sdk/client-dynamodb");
var import_util_dynamodb2 = require("@aws-sdk/util-dynamodb");
var import_client_api_gateway = require("@aws-sdk/client-api-gateway");

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

// src/utils/active-days-calculator.ts
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var ActiveDaysCalculator = class {
  constructor(ddbClient2, tableName) {
    this.ddbClient = ddbClient2;
    this.tableName = tableName;
    this.docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(ddbClient2);
  }
  /**
   * 사용자의 누적 활동 일수 계산
   * 
   * @param userId 사용자 ID
   * @param config 활동 일수 설정
   * @returns 활동 일수 분석 결과
   */
  async calculateActiveDays(userId, config) {
    const endDate = /* @__PURE__ */ new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - config.periodDays);
    console.log(`\u{1F4C5} \uC0AC\uC6A9\uC790 ${userId} \uD65C\uB3D9 \uC77C\uC218 \uBD84\uC11D \uC2DC\uC791`, {
      \uAE30\uAC04: `${startDate.toISOString().split("T")[0]} ~ ${endDate.toISOString().split("T")[0]}`,
      \uC9D1\uACC4\uC77C\uC218: config.periodDays,
      \uCD5C\uC18C\uD65C\uB3D9\uC784\uACC4\uAC12: config.minActivitiesPerDay
    });
    const activities = await this.getUserActivitiesInPeriod(userId, startDate, endDate);
    const dailyActivities = {};
    for (const activity of activities) {
      const activityDate = new Date(activity.addedAt || activity.tweet_created_at);
      const dateKey = activityDate.toISOString().split("T")[0];
      if (activityDate >= startDate && activityDate <= endDate) {
        dailyActivities[dateKey] = (dailyActivities[dateKey] || 0) + 1;
      }
    }
    let totalActiveDays = 0;
    let totalActivities = 0;
    for (const [date, count] of Object.entries(dailyActivities)) {
      totalActivities += count;
      if (count >= config.minActivitiesPerDay) {
        totalActiveDays++;
      }
    }
    console.log(`\u{1F4CA} \uD65C\uB3D9 \uC77C\uC218 \uBD84\uC11D \uC644\uB8CC: ${userId}`, {
      \uCD1D\uD65C\uB3D9\uC77C\uC218: totalActiveDays,
      \uCD1D\uD65C\uB3D9\uC218: totalActivities,
      \uD3C9\uADE0\uC77C\uC77C\uD65C\uB3D9: totalActivities > 0 ? Math.round(totalActivities / Object.keys(dailyActivities).length * 100) / 100 : 0
    });
    return {
      totalActiveDays,
      dailyActivities,
      analysisStartDate: startDate.toISOString().split("T")[0],
      analysisEndDate: endDate.toISOString().split("T")[0],
      totalActivities
    };
  }
  /**
   * 특정 기간 내 사용자 활동 데이터 조회
   */
  async getUserActivitiesInPeriod(userId, startDate, endDate) {
    const allActivities = [];
    let lastEvaluatedKey;
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    console.log(`\u{1F50D} \uD65C\uB3D9 \uB370\uC774\uD130 \uC870\uD68C: USER#${userId}`, {
      \uC2DC\uC791\uC77C: startDateStr,
      \uC885\uB8CC\uC77C: endDateStr
    });
    do {
      const command = new import_lib_dynamodb.QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
        FilterExpression: "#added_at BETWEEN :startDate AND :endDate",
        ExpressionAttributeNames: {
          "#added_at": "added_at"
        },
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk_prefix": "RECENT#",
          ":startDate": startDateStr,
          ":endDate": endDateStr
        },
        ExclusiveStartKey: lastEvaluatedKey
      });
      const result = await this.docClient.send(command);
      if (result.Items) {
        allActivities.push(...result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
      console.log(`\u{1F4CB} \uD65C\uB3D9 \uB370\uC774\uD130 \uC9C4\uD589 \uC0C1\uD669: ${allActivities.length}\uAC1C \uD65C\uB3D9 \uC218\uC9D1\uB428`);
    } while (lastEvaluatedKey);
    console.log(`\u2705 \uD65C\uB3D9 \uB370\uC774\uD130 \uC870\uD68C \uC644\uB8CC: ${allActivities.length}\uAC1C \uD65C\uB3D9 \uBC1C\uACAC`);
    return allActivities;
  }
  /**
   * 최근 7일간 활동 일수 계산
   *
   * @param userId - 사용자 ID
   * @returns 활동 일수 (0-7)
   */
  async getActiveDaysInLast7Days(userId) {
    const endDate = /* @__PURE__ */ new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);
    console.log(`\u{1F4C5} [7-Day Activity Check] User: ${userId}, Period: ${startDate.toISOString().split("T")[0]} ~ ${endDate.toISOString().split("T")[0]}`);
    const activities = await this.getUserActivitiesInPeriod(userId, startDate, endDate);
    const dailyActivities = {};
    for (const activity of activities) {
      const activityDate = new Date(activity.added_at || activity.addedAt || activity.tweet_created_at);
      const dateKey = activityDate.toISOString().split("T")[0];
      if (activityDate >= startDate && activityDate <= endDate) {
        dailyActivities[dateKey] = (dailyActivities[dateKey] || 0) + 1;
      }
    }
    const activeDays = Object.keys(dailyActivities).length;
    console.log(`\u2705 [7-Day Activity] User: ${userId}, Active Days: ${activeDays}/7`);
    return activeDays;
  }
  /**
   * 마지막 활동 이후 경과일 계산
   *
   * @param userId - 사용자 ID
   * @returns 마지막 활동 이후 경과일 (0-N)
   */
  async getDaysSinceLastActivity(userId) {
    const now = /* @__PURE__ */ new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    console.log(`\u{1F50D} [Last Activity Check] User: ${userId}`);
    const activities = await this.getUserActivitiesInPeriod(userId, startDate, now);
    if (activities.length === 0) {
      console.log(`\u26A0\uFE0F [No Recent Activity] User: ${userId} (30+ days)`);
      return 30;
    }
    const sortedActivities = activities.map((activity) => new Date(activity.added_at || activity.addedAt || activity.tweet_created_at)).sort((a, b) => b.getTime() - a.getTime());
    const lastActivityDate = sortedActivities[0];
    const daysSince = Math.floor((now.getTime() - lastActivityDate.getTime()) / (1e3 * 60 * 60 * 24));
    console.log(`\u2705 [Last Activity] User: ${userId}, Days Since: ${daysSince} (${lastActivityDate.toISOString().split("T")[0]})`);
    return daysSince;
  }
  /**
   * 여러 사용자의 활동 일수를 배치로 계산
   * (성능 최적화를 위한 배치 처리)
   */
  async calculateActiveDaysBatch(userIds, config) {
    console.log(`\u{1F504} \uBC30\uCE58 \uD65C\uB3D9 \uC77C\uC218 \uACC4\uC0B0 \uC2DC\uC791: ${userIds.length}\uBA85`);
    const results = {};
    const batchSize = 5;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const result = await this.calculateActiveDays(userId, config);
          return { userId, result };
        } catch (error) {
          console.error(`\u274C \uD65C\uB3D9 \uC77C\uC218 \uACC4\uC0B0 \uC2E4\uD328: ${userId}`, error);
          return {
            userId,
            result: {
              totalActiveDays: 0,
              dailyActivities: {},
              analysisStartDate: "",
              analysisEndDate: "",
              totalActivities: 0
            }
          };
        }
      });
      const batchResults = await Promise.all(batchPromises);
      for (const { userId, result } of batchResults) {
        results[userId] = result;
      }
      console.log(`\u{1F4CA} \uBC30\uCE58 \uC9C4\uD589 \uC0C1\uD669: ${Math.min(i + batchSize, userIds.length)}/${userIds.length}\uBA85 \uC644\uB8CC`);
    }
    console.log(`\u2705 \uBC30\uCE58 \uD65C\uB3D9 \uC77C\uC218 \uACC4\uC0B0 \uC644\uB8CC: ${userIds.length}\uBA85`);
    return results;
  }
  /**
   * 동점자 순위 결정을 위한 활동 일수 점수 계산
   */
  static calculateActiveDaysScore(activeDaysResult, config) {
    const score = activeDaysResult.totalActiveDays * config.activeDaysWeight;
    console.log(`\u{1F4C8} \uD65C\uB3D9 \uC77C\uC218 \uC810\uC218 \uACC4\uC0B0`, {
      \uD65C\uB3D9\uC77C\uC218: activeDaysResult.totalActiveDays,
      \uAC00\uC911\uCE58: config.activeDaysWeight,
      \uCD5C\uC885\uC810\uC218: score
    });
    return Math.round(score * 100) / 100;
  }
  /**
   * 7-Day Activity Bonus 계산 (Threshold=3)
   *
   * @param activeDaysLast7 - 최근 7일 중 활동 일수 (0-7)
   * @param config - 설정 (weightPerDay, threshold)
   * @returns 보너스 점수 (0-1.4점)
   */
  static calculateActivityBonus(activeDaysLast7, config) {
    if (activeDaysLast7 < config.threshold) {
      return 0;
    }
    const eligibleDays = activeDaysLast7 - config.threshold + 1;
    const bonus = eligibleDays * config.weightPerDay;
    console.log(`\u{1F4C8} [Activity Bonus]`, {
      activeDaysLast7,
      threshold: config.threshold,
      weightPerDay: config.weightPerDay,
      eligibleDays,
      bonus: Math.round(bonus * 10) / 10
      // 소수점 첫째자리
    });
    return Math.round(bonus * 10) / 10;
  }
  /**
   * Inactivity Penalty 계산
   *
   * @param daysSinceLastActivity - 마지막 활동 이후 경과일
   * @param config - 설정 (threshold, penaltyPerDay, maxPenalty)
   * @returns 감점 (음수, 0 to -maxPenalty)
   */
  static calculateInactivityPenalty(daysSinceLastActivity, config) {
    if (daysSinceLastActivity < config.threshold) {
      return 0;
    }
    const excessDays = daysSinceLastActivity - (config.threshold - 1);
    const penalty = excessDays * config.penaltyPerDay;
    const finalPenalty = -Math.min(penalty, config.maxPenalty);
    console.log(`\u{1F4C9} [Inactivity Penalty]`, {
      daysSinceLastActivity,
      threshold: config.threshold,
      penaltyPerDay: config.penaltyPerDay,
      maxPenalty: config.maxPenalty,
      excessDays,
      rawPenalty: -penalty,
      finalPenalty
    });
    return Math.round(finalPenalty * 10) / 10;
  }
};

// src/services/delta-calculator.ts
var import_lib_dynamodb2 = require("@aws-sdk/lib-dynamodb");
var DeltaCalculator = class _DeltaCalculator {
  // 유효성 검증 통계
  constructor(dynamoClient, tableName, communityService, scoreWeights) {
    this.dynamoClient = dynamoClient;
    this.tableName = tableName;
    this.communityService = communityService;
    this.scoreWeights = scoreWeights;
    this.unknownEngagementTypes = /* @__PURE__ */ new Map();
    this.validationStats = {
      totalProcessed: 0,
      validTypes: 0,
      invalidTypes: 0,
      correctedTypes: 0
    };
    this.enableCommunityWeights = process.env.COMMUNITY_WEIGHT_ENABLED === "true";
    console.log(`\u{1F3D7}\uFE0F [DELTA_CALCULATOR] \uCD08\uAE30\uD654 \uC644\uB8CC`);
    console.log(`   - \uCEE4\uBBA4\uB2C8\uD2F0 \uAC00\uC911\uCE58: ${this.enableCommunityWeights ? "\uD65C\uC131\uD654" : "\uBE44\uD65C\uC131\uD654"}`);
    console.log(`   - \uC810\uC218 \uAC00\uC911\uCE58:`, this.scoreWeights);
  }
  /**
   * engagement_type 유효성 검증 및 자동 수정
   * @param engagement 검증할 인게이지먼트 데이터
   * @returns 검증/수정된 인게이지먼트 데이터
   */
  validateAndCorrectEngagementType(engagement) {
    this.validationStats.totalProcessed++;
    const validTypes = ["like", "reply", "repost", "quote", "mention"];
    const originalType = engagement.engagement_type;
    if (validTypes.includes(originalType)) {
      this.validationStats.validTypes++;
      return engagement;
    }
    this.validationStats.invalidTypes++;
    console.warn(`\u26A0\uFE0F [VALIDATION] \uBB34\uD6A8\uD55C engagement_type \uAC10\uC9C0: "${originalType}" (\uC0AC\uC6A9\uC790: ${engagement.engaging_user_id}, \uD2B8\uC717: ${engagement.tweet_id})`);
    const correctedType = this.inferEngagementType(engagement);
    if (correctedType !== originalType) {
      this.validationStats.correctedTypes++;
      console.log(`\u{1F527} [VALIDATION] engagement_type \uC790\uB3D9 \uC218\uC815: "${originalType}" \u2192 "${correctedType}"`);
      return {
        ...engagement,
        engagement_type: correctedType
      };
    }
    console.error(`\u274C [VALIDATION] engagement_type \uC790\uB3D9 \uC218\uC815 \uC2E4\uD328, \uAE30\uBCF8\uAC12 'mention' \uC0AC\uC6A9: "${originalType}"`);
    return {
      ...engagement,
      engagement_type: "mention"
      // 기본값으로 mention 사용
    };
  }
  /**
   * 인게이지먼트 데이터의 패턴을 분석하여 올바른 타입 추론
   * @param engagement 분석할 인게이지먼트 데이터
   * @returns 추론된 engagement_type
   */
  inferEngagementType(engagement) {
    const type = engagement.engagement_type?.toLowerCase() || "";
    const tweetId = engagement.tweet_id || "";
    const engagingUserId = engagement.engaging_user_id || "";
    const typeMapping = {
      "likes": "like",
      "liked": "like",
      "favorite": "like",
      "favourited": "like",
      "replies": "reply",
      "replied": "reply",
      "response": "reply",
      "reposts": "repost",
      "reposted": "repost",
      "retweet": "repost",
      "retweeted": "repost",
      "quotes": "quote",
      "quoted": "quote",
      "quote_tweet": "quote",
      "mentions": "mention",
      "mentioned": "mention",
      "mention_tweet": "mention"
    };
    if (typeMapping[type]) {
      return typeMapping[type];
    }
    if (type.includes("like") || type.includes("favorite")) return "like";
    if (type.includes("reply") || type.includes("response")) return "reply";
    if (type.includes("repost") || type.includes("retweet")) return "repost";
    if (type.includes("quote")) return "quote";
    if (type.includes("mention")) return "mention";
    return "mention";
  }
  /**
   * 유효성 검증 통계 출력
   */
  printValidationStats() {
    if (this.validationStats.totalProcessed === 0) return;
    const validPercentage = (this.validationStats.validTypes / this.validationStats.totalProcessed * 100).toFixed(1);
    const invalidPercentage = (this.validationStats.invalidTypes / this.validationStats.totalProcessed * 100).toFixed(1);
    const correctedPercentage = this.validationStats.invalidTypes > 0 ? (this.validationStats.correctedTypes / this.validationStats.invalidTypes * 100).toFixed(1) : "0.0";
    console.log(`\u{1F4CA} [VALIDATION] engagement_type \uC720\uD6A8\uC131 \uAC80\uC99D \uD1B5\uACC4:`);
    console.log(`   \u{1F4C8} \uCD1D \uCC98\uB9AC: ${this.validationStats.totalProcessed}\uAC1C`);
    console.log(`   \u2705 \uC720\uD6A8\uD55C \uD0C0\uC785: ${this.validationStats.validTypes}\uAC1C (${validPercentage}%)`);
    console.log(`   \u274C \uBB34\uD6A8\uD55C \uD0C0\uC785: ${this.validationStats.invalidTypes}\uAC1C (${invalidPercentage}%)`);
    if (this.validationStats.invalidTypes > 0) {
      console.log(`   \u{1F527} \uC790\uB3D9 \uC218\uC815: ${this.validationStats.correctedTypes}\uAC1C (${correctedPercentage}%)`);
    }
  }
  /**
   * 미분류 engagement_type 통계 출력
   */
  printUnknownEngagementStats() {
    if (this.unknownEngagementTypes.size === 0) {
      console.log(`\u{1F4CA} [UNKNOWN_TYPES] \uBBF8\uBD84\uB958 engagement_type \uC5C6\uC74C \u2705`);
      return;
    }
    console.log(`\u{1F4CA} [UNKNOWN_TYPES] \uBBF8\uBD84\uB958 engagement_type \uD1B5\uACC4:`);
    Array.from(this.unknownEngagementTypes.entries()).forEach(([type, count]) => {
      console.log(`   \u{1F50D} "${type}": ${count}\uAC1C`);
    });
  }
  /**
   * 🆕 스냅샷 기반 점수 계산 (Delta 비교 없이 직접 계산)
   *
   * 스냅샷 수집 방식에서는 모든 인게이지먼트가 이미 "신규"이므로
   * 이전 데이터와 비교할 필요 없이 바로 점수 계산
   *
   * 🔒 멱등성 보장: 오늘 이미 처리된 활동은 필터링하여 중복 계산 방지
   *
   * @param snapshotEngagements 스냅샷으로 수집된 인게이지먼트 (모두 신규)
   * @param collectionDate 수집 날짜 (YYYY-MM-DD)
   * @returns 계산 결과
   */
  async calculateSnapshotScores(snapshotEngagements, collectionDate) {
    console.log(`\u{1F4F8} [SNAPSHOT_MODE] \uC2A4\uB0C5\uC0F7 \uC810\uC218 \uACC4\uC0B0 \uC2DC\uC791 - \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8: ${snapshotEngagements.length}\uAC1C`);
    console.log(`   \u2139\uFE0F \uC2A4\uB0C5\uC0F7 \uBAA8\uB4DC: \uC774\uC804 \uB370\uC774\uD130 \uBE44\uAD50 \uC5C6\uC774 \uC9C1\uC811 \uC810\uC218 \uACC4\uC0B0`);
    if (snapshotEngagements.length === 0) {
      console.log("\u26A0\uFE0F \uC2A4\uB0C5\uC0F7 \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8 \uC5C6\uC74C - \uC810\uC218 \uBCC0\uACBD \uC5C6\uC74C");
      return {
        totalChangedUsers: 0,
        totalScoreChanges: 0,
        userDeltas: [],
        summary: {
          added: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 },
          removed: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 }
        }
      };
    }
    console.log(`\u{1F50D} [IDEMPOTENCY] \uC624\uB298(${collectionDate}) \uC774\uBBF8 \uCC98\uB9AC\uB41C \uD65C\uB3D9 \uC870\uD68C \uC911...`);
    const processedToday = await this.getProcessedEngagementsForDate(collectionDate);
    console.log(`   \u2139\uFE0F [IDEMPOTENCY] \uC624\uB298 \uC774\uBBF8 \uCC98\uB9AC\uB41C \uD65C\uB3D9: ${processedToday.size}\uAC1C`);
    const newEngagements = snapshotEngagements.filter((engagement) => {
      const key = this.makeEngagementKey(engagement);
      return !processedToday.has(key);
    });
    const duplicateCount = snapshotEngagements.length - newEngagements.length;
    if (duplicateCount > 0) {
      console.log(`\u{1F50D} [IDEMPOTENCY] \uC911\uBCF5 \uD544\uD130\uB9C1: ${snapshotEngagements.length} \u2192 ${newEngagements.length} (${duplicateCount}\uAC1C \uC774\uBBF8 \uCC98\uB9AC\uB428)`);
    } else {
      console.log(`\u2705 [IDEMPOTENCY] \uBAA8\uB4E0 \uD65C\uB3D9\uC774 \uC2E0\uADDC\uC785\uB2C8\uB2E4 (${newEngagements.length}\uAC1C)`);
    }
    if (newEngagements.length === 0) {
      console.log("\u23E9 [IDEMPOTENCY] \uC2E0\uADDC \uD65C\uB3D9 \uC5C6\uC74C - \uC810\uC218 \uBCC0\uACBD \uC5C6\uC74C (\uBA71\uB4F1\uC131 \uBCF4\uC7A5)");
      return {
        totalChangedUsers: 0,
        totalScoreChanges: 0,
        userDeltas: [],
        summary: {
          added: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 },
          removed: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 }
        }
      };
    }
    console.log(`\u{1F50D} engagement_type \uC720\uD6A8\uC131 \uAC80\uC99D \uC2DC\uC791...`);
    const validatedEngagements = newEngagements.map(
      (engagement) => this.validateAndCorrectEngagementType(engagement)
    );
    this.printValidationStats();
    const userDeltas = await this.calculateUserDeltas(validatedEngagements, []);
    const summary = this.generateSummary(validatedEngagements, []);
    const result = {
      totalChangedUsers: userDeltas.length,
      totalScoreChanges: userDeltas.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
      userDeltas,
      summary
    };
    console.log(`\u2705 [SNAPSHOT_MODE] \uC2A4\uB0C5\uC0F7 \uC810\uC218 \uACC4\uC0B0 \uC644\uB8CC:`);
    console.log(`  - \uC0AC\uC6A9\uC790: ${result.totalChangedUsers}\uBA85`);
    console.log(`  - \uCD1D \uC810\uC218: ${result.totalScoreChanges}`);
    console.log(`  - \uCC98\uB9AC\uB41C \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8: ${summary.added.total}\uAC1C`);
    this.printUnknownEngagementStats();
    return result;
  }
  /**
   * ⚠️ 레거시: 현재 수집된 인게이지먼트와 이전 데이터를 비교하여 Delta 계산
   *
   * 🔴 주의: 이 메서드는 6일 룩백 방식에서 사용되던 레거시 로직입니다.
   * 스냅샷 방식에서는 calculateSnapshotScores()를 사용하세요.
   *
   * @param currentEngagements 현재 수집된 인게이지먼트
   * @param collectionDate 수집 날짜 (YYYY-MM-DD)
   * @returns Delta 계산 결과
   * @deprecated 스냅샷 수집 방식에서는 calculateSnapshotScores() 사용 권장
   */
  async calculateDelta(currentEngagements, collectionDate) {
    console.log(`\u{1F9EE} Delta \uACC4\uC0B0 \uC2DC\uC791 - \uD604\uC7AC \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8: ${currentEngagements.length}\uAC1C`);
    if (currentEngagements.length === 0) {
      console.log("\u26A0\uFE0F [SAFETY_PATCH] \uC2E0\uADDC \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8 \uC5C6\uC74C - \uC7AC\uACC4\uC0B0 \uBAA8\uB4DC \uC9C4\uC785 \uCC28\uB2E8");
      console.log("\u{1F4CB} Delta \uBCC0\uACBD\uC0AC\uD56D \uC5C6\uC74C\uC73C\uB85C \uCC98\uB9AC (\uC810\uC218 \uC911\uBCF5 \uB204\uC801 \uBC29\uC9C0)");
      console.log("\u{1F512} \uC774 \uD328\uCE58\uB294 \uC758\uB3C4\uD558\uC9C0 \uC54A\uC740 \uC810\uC218 2\uBC30 \uC911\uBCF5 \uBC0F \uBCF4\uB108\uC2A4 \uCD08\uAE30\uD654\uB97C \uBC29\uC9C0\uD569\uB2C8\uB2E4.");
      return {
        totalChangedUsers: 0,
        totalScoreChanges: 0,
        userDeltas: [],
        summary: {
          added: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 },
          removed: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 }
        }
      };
    }
    console.log(`\u{1F50D} engagement_type \uC720\uD6A8\uC131 \uAC80\uC99D \uC2DC\uC791...`);
    const validatedCurrentEngagements = currentEngagements.map(
      (engagement) => this.validateAndCorrectEngagementType(engagement)
    );
    this.printValidationStats();
    console.log(`\u{1F4C2} \uC774\uC804 \uC218\uC9D1 \uB370\uC774\uD130 \uB85C\uB4DC \uC911...`);
    const previousEngagements = await this.loadPreviousEngagements();
    console.log(`\u{1F4C2} \uC774\uC804 \uB370\uC774\uD130: ${previousEngagements.length}\uAC1C`);
    if (validatedCurrentEngagements.length === 0 && previousEngagements.length > 0) {
      console.log(`\u{1F504} \uC7AC\uACC4\uC0B0 \uBAA8\uB4DC \uAC10\uC9C0: DB\uC5D0 \uC788\uB294 ${previousEngagements.length}\uAC1C\uC758 \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8\uB97C \uC2E0\uADDC\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4.`);
      const userDeltas2 = await this.calculateUserDeltas(previousEngagements, []);
      const summary2 = this.generateSummary(previousEngagements, []);
      const result2 = {
        totalChangedUsers: userDeltas2.length,
        totalScoreChanges: userDeltas2.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
        userDeltas: userDeltas2,
        summary: summary2
      };
      console.log(`\u{1F389} \uC7AC\uACC4\uC0B0 \uBAA8\uB4DC \uC644\uB8CC:`);
      console.log(`  - \uC2E0\uADDC \uC0AC\uC6A9\uC790: ${result2.totalChangedUsers}\uBA85`);
      console.log(`  - \uCD1D \uC810\uC218: ${result2.totalScoreChanges}`);
      console.log(`  - \uCC98\uB9AC\uB41C \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8: ${summary2.added.total}\uAC1C`);
      this.printUnknownEngagementStats();
      return result2;
    }
    if (previousEngagements.length === 0) {
      console.log(`\u{1F195} \uCCAB \uBC88\uC9F8 \uC2E4\uD589 \uAC10\uC9C0 - \uBAA8\uB4E0 \uD604\uC7AC \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8\uB97C \uC0C8\uB85C\uC6B4 \uAC83\uC73C\uB85C \uCC98\uB9AC`);
      const userDeltas2 = await this.calculateUserDeltas(validatedCurrentEngagements, []);
      const summary2 = this.generateSummary(validatedCurrentEngagements, []);
      const result2 = {
        totalChangedUsers: userDeltas2.length,
        totalScoreChanges: userDeltas2.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
        userDeltas: userDeltas2,
        summary: summary2
      };
      console.log(`\u{1F389} \uCCAB \uC2E4\uD589 Delta \uACC4\uC0B0 \uC644\uB8CC:`);
      console.log(`  - \uC2E0\uADDC \uC0AC\uC6A9\uC790: ${result2.totalChangedUsers}\uBA85`);
      console.log(`  - \uCD1D \uC810\uC218: ${result2.totalScoreChanges}`);
      console.log(`  - \uCC98\uB9AC\uB41C \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8: ${summary2.added.total}\uAC1C`);
      this.printUnknownEngagementStats();
      return result2;
    }
    console.log(`\u{1F50D} \uBCC0\uD654 \uBD84\uC11D \uC2DC\uC791...`);
    const { addedEngagements, removedEngagements } = this.identifyChanges(validatedCurrentEngagements, previousEngagements);
    console.log(`\u2705 \uC0C8\uB85C \uCD94\uAC00: ${addedEngagements.length}\uAC1C`);
    console.log(`\u274C \uC0AD\uC81C\uB428: ${removedEngagements.length}\uAC1C`);
    if (addedEngagements.length === 0 && removedEngagements.length > 0) {
      console.log(`\u26A0\uFE0F \uC0C8\uB85C\uC6B4 \uCD94\uAC00 \uC5C6\uC774 \uAE30\uC874 \uB370\uC774\uD130\uB9CC \uC0AD\uC81C - \uC74C\uC218 \uC810\uC218 \uBC29\uC9C0\uB97C \uC704\uD574 \uC810\uC218 \uBCC0\uD654 \uC5C6\uC74C\uC73C\uB85C \uCC98\uB9AC`);
      console.log(`\u{1F4CB} \uC810\uC218 \uBCC0\uACBD\uC0AC\uD56D\uC774 \uC5C6\uC73C\uBBC0\uB85C \uACC4\uC0B0 \uC885\uB8CC`);
      return {
        totalChangedUsers: 0,
        totalScoreChanges: 0,
        userDeltas: [],
        summary: {
          added: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 },
          removed: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 }
        }
      };
    }
    const recentRemovedEngagements = this.filterRecentRemovedEngagements(removedEngagements);
    console.log(`\u23F0 \uCD5C\uADFC 7\uC77C \uB0B4 \uC0AD\uC81C (\uC810\uC218 \uBC18\uC601): ${recentRemovedEngagements.length}\uAC1C`);
    console.log(`\u{1F5C2}\uFE0F 7\uC77C \uC774\uD6C4 \uC0AD\uC81C (\uC810\uC218 \uBBF8\uBC18\uC601): ${removedEngagements.length - recentRemovedEngagements.length}\uAC1C`);
    const userDeltas = await this.calculateUserDeltas(addedEngagements, recentRemovedEngagements);
    console.log(`\u2705 \uC0AC\uC6A9\uC790 Delta \uACC4\uC0B0 \uC644\uB8CC: ${userDeltas.length}\uBA85`);
    const summary = this.generateSummary(addedEngagements, recentRemovedEngagements);
    const result = {
      totalChangedUsers: userDeltas.length,
      totalScoreChanges: userDeltas.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
      userDeltas,
      summary
    };
    console.log(`\u{1F389} Delta \uACC4\uC0B0 \uC644\uB8CC:`);
    console.log(`  - \uBCC0\uACBD\uB41C \uC0AC\uC6A9\uC790: ${result.totalChangedUsers}\uBA85`);
    console.log(`  - \uCD1D \uC810\uC218 \uBCC0\uD654\uB7C9: ${result.totalScoreChanges}`);
    console.log(`  - \uCD94\uAC00\uB41C \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8: ${summary.added.total}\uAC1C`);
    console.log(`  - \uC0AD\uC81C\uB41C \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8: ${summary.removed.total}\uAC1C`);
    this.printUnknownEngagementStats();
    return result;
  }
  /**
   * ✅ 기존 인게이지먼트 데이터로부터 점수 재계산 (가중치 적용 포함)
   * recalculateExistingUserScores에서 호출되어 가중치를 적용합니다.
   */
  async recalculateFromEngagements(engagements, collectionDate) {
    console.log(`\u{1F504} \uAE30\uC874 \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8\uB85C\uBD80\uD130 \uC810\uC218 \uC7AC\uACC4\uC0B0 \uC2DC\uC791: ${engagements.length}\uAC1C`);
    const validatedEngagements = engagements.map(
      (engagement) => this.validateAndCorrectEngagementType(engagement)
    );
    this.printValidationStats();
    const userDeltas = await this.calculateUserDeltas(validatedEngagements, []);
    const summary = this.generateSummary(validatedEngagements, []);
    const result = {
      totalChangedUsers: userDeltas.length,
      totalScoreChanges: userDeltas.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
      userDeltas,
      summary
    };
    console.log(`\u2705 \uC7AC\uACC4\uC0B0 \uC644\uB8CC: ${result.totalChangedUsers}\uBA85, \uCD1D \uC810\uC218: ${result.totalScoreChanges}`);
    this.printUnknownEngagementStats();
    return result;
  }
  /**
   * DynamoDB에서 이전에 저장된 RECENT# 및 REPLY# 인게이지먼트 로드
   * 하이브리드 시스템: 레거시 RECENT# 데이터와 새로운 REPLY# 데이터 모두 지원
   */
  async loadPreviousEngagements() {
    const previousEngagements = [];
    try {
      console.log(`\u{1F4C2} [DELTA] \uD558\uC774\uBE0C\uB9AC\uB4DC \uC2DC\uC2A4\uD15C - \uB808\uAC70\uC2DC \uBC0F \uC2E0\uADDC \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8 \uB370\uC774\uD130 \uB85C\uB4DC \uC911...`);
      const recentEngagements = await this.loadLegacyRecentEngagements();
      console.log(`\u{1F4C2} [DELTA] \uB808\uAC70\uC2DC RECENT# \uB370\uC774\uD130: ${recentEngagements.length}\uAC1C`);
      const replyEngagements = await this.loadNewReplyEngagements();
      console.log(`\u{1F4C2} [DELTA] \uC2E0\uADDC REPLY# \uB370\uC774\uD130: ${replyEngagements.length}\uAC1C`);
      previousEngagements.push(...recentEngagements);
      previousEngagements.push(...replyEngagements);
      const uniqueEngagements = this.deduplicateEngagements(previousEngagements);
      console.log(`\u{1F4C2} [DELTA] \uC911\uBCF5 \uC81C\uAC70 \uD6C4 \uCD5C\uC885 \uB370\uC774\uD130: ${uniqueEngagements.length}\uAC1C (\uC81C\uAC70\uB41C \uC911\uBCF5: ${previousEngagements.length - uniqueEngagements.length}\uAC1C)`);
      return uniqueEngagements;
    } catch (error) {
      console.error("\u274C \uC774\uC804 \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8 \uB85C\uB4DC \uC2E4\uD328:", error);
      return [];
    }
  }
  /**
   * 레거시 RECENT# 인게이지먼트 로드
   */
  async loadLegacyRecentEngagements() {
    const engagements = [];
    let lastEvaluatedKey = void 0;
    try {
      do {
        const scanParams = {
          TableName: this.tableName,
          FilterExpression: "begins_with(sk, :sk_prefix)",
          ExpressionAttributeValues: {
            ":sk_prefix": "RECENT#"
          },
          ExclusiveStartKey: lastEvaluatedKey
        };
        const result = await this.dynamoClient.send(new import_lib_dynamodb2.ScanCommand(scanParams));
        if (result.Items) {
          engagements.push(...result.Items.map((item) => ({
            tweet_id: item.tweetId || item.tweet_id,
            engagement_type: item.engagementType || item.engagement_type,
            engaging_user_id: item.engaging_user_id || item.userId || item.user_id,
            engaging_username: item.engaging_username || item.username,
            engaging_display_name: item.engaging_display_name || item.displayName || item.display_name,
            engaging_profile_image_url: item.engaging_profile_image_url || item.profileImageUrl || item.profile_image_url,
            engaging_followers_count: item.engaging_followers_count || item.followersCount || item.followers_count,
            tweet_created_at: item.tweetCreatedAt || item.tweet_created_at,
            added_at: item.addedAt || item.added_at
          })));
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      return engagements;
    } catch (error) {
      console.error("\u274C RECENT# \uB370\uC774\uD130 \uB85C\uB4DC \uC2E4\uD328:", error);
      return [];
    }
  }
  /**
   * 새로운 REPLY# 인게이지먼트 로드 (3회 제한 시스템)
   */
  async loadNewReplyEngagements() {
    const engagements = [];
    let lastEvaluatedKey = void 0;
    try {
      do {
        const scanParams = {
          TableName: this.tableName,
          FilterExpression: "begins_with(sk, :sk_prefix) AND shouldCount = :should_count",
          ExpressionAttributeValues: {
            ":sk_prefix": "REPLY#",
            ":should_count": true
          },
          ExclusiveStartKey: lastEvaluatedKey
        };
        const result = await this.dynamoClient.send(new import_lib_dynamodb2.ScanCommand(scanParams));
        if (result.Items) {
          engagements.push(...result.Items.map((item) => ({
            tweet_id: item.targetTweetId,
            engagement_type: "reply",
            engaging_user_id: item.userId,
            engaging_username: item.username,
            tweet_created_at: item.addedAt,
            // 답글 추가 시간 사용
            added_at: item.addedAt
          })));
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      return engagements;
    } catch (error) {
      console.error("\u274C \uC2E0\uADDC REPLY# \uB370\uC774\uD130 \uB85C\uB4DC \uC2E4\uD328:", error);
      return [];
    }
  }
  /**
   * 인게이지먼트 데이터 중복 제거
   * 동일한 tweet_id + user_id + engagement_type 조합은 하나만 유지
   */
  deduplicateEngagements(engagements) {
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const engagement of engagements) {
      const key = `${engagement.tweet_id}#${engagement.engaging_user_id}#${engagement.engagement_type}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(engagement);
      }
    }
    return unique;
  }
  /**
   * 현재와 이전 인게이지먼트를 비교하여 추가/삭제 항목 식별
   */
  identifyChanges(current, previous) {
    const createKey = (engagement) => `${engagement.tweet_id}#${engagement.engaging_user_id}#${engagement.engagement_type}`;
    const previousSet = new Set(previous.map(createKey));
    const previousMap = new Map(previous.map((e) => [createKey(e), e]));
    const currentSet = new Set(current.map(createKey));
    const currentMap = new Map(current.map((e) => [createKey(e), e]));
    const addedEngagements = [];
    for (const engagement of current) {
      const key = createKey(engagement);
      if (!previousSet.has(key)) {
        addedEngagements.push(engagement);
      }
    }
    const removedEngagements = [];
    for (const engagement of previous) {
      const key = createKey(engagement);
      if (!currentSet.has(key)) {
        removedEngagements.push(engagement);
      }
    }
    return { addedEngagements, removedEngagements };
  }
  /**
   * 삭제된 인게이지먼트 중 최근 7일 이내 트윗만 필터링
   */
  filterRecentRemovedEngagements(removedEngagements) {
    const sevenDaysAgo = /* @__PURE__ */ new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return removedEngagements.filter((engagement) => {
      try {
        const tweetDate = new Date(engagement.tweet_created_at);
        return tweetDate > sevenDaysAgo;
      } catch (error) {
        console.warn(`\u26A0\uFE0F \uB0A0\uC9DC \uD30C\uC2F1 \uC2E4\uD328: ${engagement.tweet_created_at}`);
        return false;
      }
    });
  }
  /**
   * 인용 인게이지먼트의 실제 계산된 점수를 조회
   * QuoteCounterService에서 저장한 finalScore 사용
   */
  async getQuoteScore(userId, tweetId, targetDate) {
    try {
      const queryResult = await this.dynamoClient.send(new import_lib_dynamodb2.QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk_prefix": `QUOTE#${tweetId}#`
        },
        ScanIndexForward: false,
        // 최신 순서로 정렬
        Limit: 1
        // 가장 최근 인용만 조회
      }));
      if (queryResult.Items && queryResult.Items.length > 0) {
        const quoteItem = queryResult.Items[0];
        const finalScore = quoteItem.finalScore;
        if (typeof finalScore === "number" && finalScore > 0) {
          console.log(`\u{1F4DD} [QUOTE_SCORE] \uC0AC\uC6A9\uC790 ${userId}\uC758 \uC778\uC6A9 ${tweetId}: ${finalScore}\uC810 (\uD488\uC9C8\uD3C9\uAC00 \uC801\uC6A9)`);
          return finalScore;
        }
      }
      console.log(`\u{1F4DD} [QUOTE_SCORE] \uC0AC\uC6A9\uC790 ${userId}\uC758 \uC778\uC6A9 ${tweetId}: \uAE30\uBCF8 \uC810\uC218 ${this.scoreWeights.quotes}\uC810 \uC0AC\uC6A9`);
      return this.scoreWeights.quotes;
    } catch (error) {
      console.error(`\u274C \uC778\uC6A9 \uC810\uC218 \uC870\uD68C \uC2E4\uD328 (${userId}, ${tweetId}):`, error);
      return this.scoreWeights.quotes;
    }
  }
  /**
   * 사용자별로 점수 변화 계산 (커뮤니티 가중치 적용)
   */
  async calculateUserDeltas(addedEngagements, removedEngagements) {
    const userDeltaMap = /* @__PURE__ */ new Map();
    const userProfileCache = /* @__PURE__ */ new Map();
    for (const engagement of addedEngagements) {
      const userId = engagement.engaging_user_id;
      if (!userDeltaMap.has(userId)) {
        let existingDominantLanguage = void 0;
        if (!userProfileCache.has(userId)) {
          try {
            const existingProfile = await this.getUserProfile(userId);
            if (existingProfile && existingProfile.dominantLanguage && existingProfile.dominantLanguage !== "unknown") {
              existingDominantLanguage = existingProfile.dominantLanguage;
              userProfileCache.set(userId, { dominantLanguage: existingDominantLanguage });
              console.log(`\u{1F504} [LANGUAGE_PRESERVATION] ${userId}\uC758 \uAE30\uC874 \uC5B8\uC5B4 \uBCF4\uC874: ${existingDominantLanguage}`);
            } else {
              userProfileCache.set(userId, {});
            }
          } catch (error) {
            console.warn(`\u26A0\uFE0F [LANGUAGE_PRESERVATION] \uAE30\uC874 \uC5B8\uC5B4 \uC815\uBCF4 \uC870\uD68C \uC2E4\uD328: ${userId}`, error);
            userProfileCache.set(userId, {});
          }
        } else {
          const cached = userProfileCache.get(userId);
          existingDominantLanguage = cached?.dominantLanguage;
        }
        userDeltaMap.set(userId, {
          userId,
          username: engagement.engaging_username || void 0,
          displayName: engagement.engaging_display_name,
          profileImageUrl: engagement.engaging_profile_image_url || engagement.profile_image_url,
          followersCount: engagement.engaging_followers_count || engagement.followers_count,
          dominantLanguage: existingDominantLanguage,
          // ✅ 기존 언어 값 보존
          scoreChange: 0,
          likesChange: 0,
          repliesChange: 0,
          repostsChange: 0,
          quotesChange: 0,
          mentionsChange: 0,
          addedEngagements: [],
          removedEngagements: []
        });
      }
      const delta = userDeltaMap.get(userId);
      let scoreWeight;
      if (engagement.engagement_type === "quote") {
        const targetDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        scoreWeight = await this.getQuoteScore(userId, engagement.tweet_id, targetDate);
      } else {
        const engagementKey = engagement.engagement_type === "like" ? "likes" : engagement.engagement_type === "reply" ? "replies" : engagement.engagement_type === "repost" ? "reposts" : engagement.engagement_type === "mention" ? "mentions" : null;
        if (engagementKey === null) {
          console.warn(`\u26A0\uFE0F [DELTA_CALC] Unknown engagement_type for scoring: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          scoreWeight = 0;
        } else {
          scoreWeight = this.scoreWeights[engagementKey];
        }
      }
      delta.scoreChange += scoreWeight;
      delta.addedEngagements.push(engagement);
      switch (engagement.engagement_type) {
        case "like":
          delta.likesChange++;
          break;
        case "reply":
          delta.repliesChange++;
          break;
        case "repost":
          delta.repostsChange++;
          break;
        case "quote":
          delta.quotesChange++;
          break;
        case "mention":
          delta.mentionsChange++;
          break;
        default:
          console.warn(`\u26A0\uFE0F [DELTA_CALC] Unknown engagement_type: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          const currentCount = this.unknownEngagementTypes.get(engagement.engagement_type) || 0;
          this.unknownEngagementTypes.set(engagement.engagement_type, currentCount + 1);
          break;
      }
    }
    for (const engagement of removedEngagements) {
      const userId = engagement.engaging_user_id;
      if (!userDeltaMap.has(userId)) {
        let existingDominantLanguage = void 0;
        if (!userProfileCache.has(userId)) {
          try {
            const existingProfile = await this.getUserProfile(userId);
            if (existingProfile && existingProfile.dominantLanguage && existingProfile.dominantLanguage !== "unknown") {
              existingDominantLanguage = existingProfile.dominantLanguage;
              userProfileCache.set(userId, { dominantLanguage: existingDominantLanguage });
              console.log(`\u{1F504} [LANGUAGE_PRESERVATION] ${userId}\uC758 \uAE30\uC874 \uC5B8\uC5B4 \uBCF4\uC874: ${existingDominantLanguage}`);
            } else {
              userProfileCache.set(userId, {});
            }
          } catch (error) {
            console.warn(`\u26A0\uFE0F [LANGUAGE_PRESERVATION] \uAE30\uC874 \uC5B8\uC5B4 \uC815\uBCF4 \uC870\uD68C \uC2E4\uD328: ${userId}`, error);
            userProfileCache.set(userId, {});
          }
        } else {
          const cached = userProfileCache.get(userId);
          existingDominantLanguage = cached?.dominantLanguage;
        }
        userDeltaMap.set(userId, {
          userId,
          username: engagement.engaging_username || void 0,
          displayName: engagement.engaging_display_name,
          profileImageUrl: engagement.engaging_profile_image_url || engagement.profile_image_url,
          followersCount: engagement.engaging_followers_count || engagement.followers_count,
          dominantLanguage: existingDominantLanguage,
          // ✅ 기존 언어 값 보존
          scoreChange: 0,
          likesChange: 0,
          repliesChange: 0,
          repostsChange: 0,
          quotesChange: 0,
          mentionsChange: 0,
          addedEngagements: [],
          removedEngagements: []
        });
      }
      const delta = userDeltaMap.get(userId);
      let scoreWeight;
      if (engagement.engagement_type === "quote") {
        const targetDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        scoreWeight = await this.getQuoteScore(userId, engagement.tweet_id, targetDate);
      } else {
        const engagementKey = engagement.engagement_type === "like" ? "likes" : engagement.engagement_type === "reply" ? "replies" : engagement.engagement_type === "repost" ? "reposts" : engagement.engagement_type === "mention" ? "mentions" : null;
        if (engagementKey === null) {
          console.warn(`\u26A0\uFE0F [DELTA_CALC] Unknown engagement_type for scoring: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          scoreWeight = 0;
        } else {
          scoreWeight = this.scoreWeights[engagementKey];
        }
      }
      delta.scoreChange -= scoreWeight;
      delta.removedEngagements.push(engagement);
      switch (engagement.engagement_type) {
        case "like":
          delta.likesChange--;
          break;
        case "reply":
          delta.repliesChange--;
          break;
        case "repost":
          delta.repostsChange--;
          break;
        case "quote":
          delta.quotesChange--;
          break;
        case "mention":
          delta.mentionsChange--;
          break;
        default:
          console.warn(`\u26A0\uFE0F [DELTA_CALC] Unknown engagement_type: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          const currentCount = this.unknownEngagementTypes.get(engagement.engagement_type) || 0;
          this.unknownEngagementTypes.set(engagement.engagement_type, currentCount + 1);
          break;
      }
    }
    const userDeltas = Array.from(userDeltaMap.values()).filter((delta) => delta.scoreChange !== 0);
    console.log(`\u{1F50D} [PROFILE_RECOVERY] \uD504\uB85C\uD544 \uAC80\uC99D \uC2DC\uC791: ${userDeltas.length}\uBA85`);
    let recoveredCount = 0;
    for (const delta of userDeltas) {
      const needsRecovery = !delta.username || delta.username === delta.userId || delta.username === "unknown";
      if (needsRecovery) {
        console.log(`\u26A0\uFE0F [PROFILE_RECOVERY] \uBD88\uC644\uC804\uD55C \uD504\uB85C\uD544 \uAC10\uC9C0: ${delta.userId} (username: ${delta.username})`);
        const existingProfile = await this.getUserProfile(delta.userId);
        if (existingProfile) {
          let recovered = false;
          if (existingProfile.username && existingProfile.username !== delta.userId) {
            delta.username = existingProfile.username;
            recovered = true;
          }
          if (existingProfile.displayName && !delta.displayName) {
            delta.displayName = existingProfile.displayName;
            recovered = true;
          }
          if (existingProfile.profileImageUrl && !delta.profileImageUrl) {
            delta.profileImageUrl = existingProfile.profileImageUrl;
            recovered = true;
          }
          if (existingProfile.followersCount && (!delta.followersCount || delta.followersCount === 0)) {
            delta.followersCount = existingProfile.followersCount;
            recovered = true;
          }
          if (recovered) {
            recoveredCount++;
            console.log(`\u2705 [PROFILE_RECOVERY] \uD504\uB85C\uD544 \uBCF5\uAD6C \uC131\uACF5: ${delta.userId} \u2192 ${delta.username}`);
          } else {
            console.log(`\u26A0\uFE0F [PROFILE_RECOVERY] \uAE30\uC874 \uB370\uC774\uD130\uB3C4 \uBD88\uC644\uC804: ${delta.userId}`);
          }
        }
      }
    }
    if (recoveredCount > 0) {
      console.log(`\u2705 [PROFILE_RECOVERY] \uCD1D ${recoveredCount}\uBA85 \uD504\uB85C\uD544 \uBCF5\uAD6C \uC644\uB8CC`);
    }
    if (this.enableCommunityWeights) {
      if (this.communityService) {
        console.log(`\u2696\uFE0F [DELTA_CALCULATOR] \uCEE4\uBBA4\uB2C8\uD2F0 \uAC00\uC911\uCE58 \uC801\uC6A9 \uC2DC\uC791: ${userDeltas.length}\uBA85`);
        for (const delta of userDeltas) {
          try {
            delta.originalScore = delta.scoreChange;
            let followersCount = delta.followersCount || 0;
            if (followersCount === 0) {
              const userProfile = await this.getUserProfile(delta.userId);
              followersCount = userProfile?.followersCount || 0;
              if (followersCount === 0) {
                console.warn(`\u26A0\uFE0F [DELTA_CALCULATOR] \uD314\uB85C\uC6CC \uC218 \uC815\uBCF4 \uC5C6\uC74C: ${delta.userId} (${delta.username})`);
              }
            }
            let engagementLangs = delta.addedEngagements.filter((e) => (e.engagement_type === "reply" || e.engagement_type === "quote" || e.engagement_type === "mention") && e.engaging_tweet_lang).map((e) => e.engaging_tweet_lang);
            if (engagementLangs.length === 0) {
              try {
                const recentActivities = await this.dynamoClient.send(new import_lib_dynamodb2.QueryCommand({
                  TableName: this.tableName,
                  KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
                  ExpressionAttributeValues: {
                    ":pk": `USER#${delta.userId}`,
                    ":sk": "RECENT#"
                  },
                  ProjectionExpression: "engagement_type, engaging_tweet_lang"
                }));
                if (recentActivities.Items && recentActivities.Items.length > 0) {
                  engagementLangs = recentActivities.Items.filter(
                    (item) => (item.engagement_type === "reply" || item.engagement_type === "quote" || item.engagement_type === "mention") && item.engaging_tweet_lang
                  ).map((item) => item.engaging_tweet_lang);
                  if (engagementLangs.length > 0) {
                    console.log(`\u{1F504} [DELTA_CALCULATOR] ${delta.userId}: RECENT \uD65C\uB3D9\uC5D0\uC11C ${engagementLangs.length}\uAC1C \uC5B8\uC5B4 \uC218\uC9D1 (${engagementLangs.join(", ")})`);
                  }
                }
              } catch (error) {
                console.warn(`\u26A0\uFE0F [DELTA_CALCULATOR] RECENT \uD65C\uB3D9 \uC870\uD68C \uC2E4\uD328 (${delta.userId}):`, error);
              }
            }
            const weightResult = await this.communityService.calculateCommunityWeight(
              delta.userId,
              followersCount,
              1,
              // 기본점수
              delta.username,
              // 언어 추론을 위한 username 전달
              delta.displayName,
              // displayName에 한글/일본어/중국어 포함
              engagementLangs
              // X API lang 필드 배열 (최우선 언어 감지)
            );
            if (delta.userId === "701404304683339776") {
              console.log("[\uC871\uC801-qpzmzm] 4. delta-calculator: \uAC00\uC911\uCE58 \uACC4\uC0B0 \uC9C1\uC804 engagementLangs:", JSON.stringify(engagementLangs, null, 2));
            }
            delta.scoreChange = Math.round(delta.scoreChange * weightResult.finalWeight * 100) / 100;
            delta.communityWeight = weightResult.finalWeight;
            if (weightResult.dominantLanguage === "unknown" && delta.dominantLanguage && delta.dominantLanguage !== "unknown") {
              console.log(`\u{1F512} [LANGUAGE_PRESERVATION] ${delta.userId}\uC758 \uAE30\uC874 \uC5B8\uC5B4 \uC720\uC9C0: ${delta.dominantLanguage} (\uC0C8 \uC5B8\uC5B4 'unknown' \uBB34\uC2DC)`);
            } else if (weightResult.dominantLanguage !== "unknown") {
              delta.dominantLanguage = weightResult.dominantLanguage;
            }
            delta.logBase = weightResult.logBase;
            delta.languageMultiplier = weightResult.languageMultiplier;
            delta.followerWeight = weightResult.followerWeight;
            delta.cappedAtMax = weightResult.cappedAtMax;
            this.recordCommunityWeightMetrics(weightResult);
          } catch (error) {
            console.error(`\u274C [DELTA_CALCULATOR] \uCEE4\uBBA4\uB2C8\uD2F0 \uAC00\uC911\uCE58 \uC801\uC6A9 \uC2E4\uD328 (${delta.userId}):`, error);
            delta.communityWeight = 1;
            delta.dominantLanguage = void 0;
            delta.logBase = 30;
            delta.languageMultiplier = 1;
            delta.followerWeight = 1;
            delta.cappedAtMax = false;
            this.recordErrorMetrics("COMMUNITY_WEIGHT_ERROR");
          }
        }
        console.log(`\u2705 [DELTA_CALCULATOR] \uCEE4\uBBA4\uB2C8\uD2F0 \uAC00\uC911\uCE58 \uC801\uC6A9 \uC644\uB8CC`);
      } else {
        console.log(`\u26A0\uFE0F [DELTA_CALCULATOR] CommunityService \uC5C6\uC74C - Fallback \uC5B8\uC5B4 \uBD84\uB958 \uC218\uD589: ${userDeltas.length}\uBA85`);
        for (const delta of userDeltas) {
          delta.originalScore = delta.scoreChange;
          delta.communityWeight = 1;
          delta.logBase = 30;
          delta.languageMultiplier = 1;
          delta.followerWeight = 1;
          delta.cappedAtMax = false;
          const inferredLanguage = _DeltaCalculator.inferDominantLanguageFromUsername(delta.username, delta.userId);
          delta.dominantLanguage = inferredLanguage;
          console.log(`  \u{1F464} ${delta.username} (${delta.userId}): ${inferredLanguage}`);
        }
        console.log(`\u2705 [DELTA_CALCULATOR] Fallback \uC5B8\uC5B4 \uBD84\uB958 \uC644\uB8CC`);
      }
    } else {
      console.log(`\u23ED\uFE0F [DELTA_CALCULATOR] \uCEE4\uBBA4\uB2C8\uD2F0 \uAC00\uC911\uCE58 \uBE44\uD65C\uC131\uD654 - \uAE30\uBCF8 \uC810\uC218 \uC0AC\uC6A9`);
    }
    if (this.unknownEngagementTypes.size > 0) {
      console.warn(`\u26A0\uFE0F [DELTA_CALC] \uBBF8\uBD84\uB958 engagement_type \uD1B5\uACC4:`);
      Array.from(this.unknownEngagementTypes.entries()).forEach(([type, count]) => {
        console.warn(`  - "${type}": ${count}\uAC1C`);
      });
      this.unknownEngagementTypes.clear();
    }
    return userDeltas;
  }
  /**
   * 사용자 프로필 조회 (팔로워 수 포함)
   * @param userId 사용자 ID
   * @returns 사용자 프로필 정보
   */
  /**
   * 🆕 Phase 1.2: 사용자 프로필 정보 조회 (확장)
   * CUMULATIVE_SCORE에서 모든 프로필 정보 반환
   */
  async getUserProfile(userId) {
    try {
      const result = await this.dynamoClient.send(new import_lib_dynamodb2.QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND sk = :sk",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":sk": "CUMULATIVE_SCORE"
        }
      }));
      if (result.Items && result.Items.length > 0) {
        const item = result.Items[0];
        return {
          username: item.username || void 0,
          displayName: item.displayName || void 0,
          profileImageUrl: item.profileImageUrl || void 0,
          followersCount: item.followersCount || 0,
          dominantLanguage: item.dominantLanguage || void 0
          // ✅ dominantLanguage 반환
        };
      }
      return { followersCount: 0 };
    } catch (error) {
      console.error(`\u274C [DELTA_CALCULATOR] \uC0AC\uC6A9\uC790 \uD504\uB85C\uD544 \uC870\uD68C \uC2E4\uD328 (${userId}):`, error);
      return { followersCount: 0 };
    }
  }
  /**
   * CloudWatch 커뮤니티 가중치 메트릭 기록
   * @param weightResult 가중치 계산 결과
   */
  recordCommunityWeightMetrics(weightResult) {
    try {
      console.log(`\u{1F4CA} [METRIC] NASUN/Community/WeightApplied: ${weightResult.finalWeight} (${weightResult.dominantLanguage})`);
      if (weightResult.dominantLanguage === "ko") {
        console.log(`\u{1F4CA} [METRIC] NASUN/Community/KoreanWeightCount: 1`);
      } else {
        console.log(`\u{1F4CA} [METRIC] NASUN/Community/GlobalWeightCount: 1`);
      }
      if (weightResult.cappedAtMax) {
        console.log(`\u{1F4CA} [METRIC] NASUN/Community/CappedCount: 1`);
      }
    } catch (error) {
      console.error(`\u274C [DELTA_CALCULATOR] \uBA54\uD2B8\uB9AD \uAE30\uB85D \uC2E4\uD328:`, error);
    }
  }
  /**
   * 오류 메트릭 기록
   * @param errorType 오류 타입
   */
  recordErrorMetrics(errorType) {
    try {
      console.log(`\u{1F4CA} [METRIC] NASUN/Community/Error: 1 (${errorType})`);
    } catch (error) {
      console.error(`\u274C [DELTA_CALCULATOR] \uC624\uB958 \uBA54\uD2B8\uB9AD \uAE30\uB85D \uC2E4\uD328:`, error);
    }
  }
  /**
   * 커뮤니티 분류 서비스 설정
   * @param communityService 커뮤니티 분류 서비스 인스턴스
   */
  setCommunityService(communityService) {
    this.communityService = communityService;
    console.log(`\u{1F527} [DELTA_CALCULATOR] \uCEE4\uBBA4\uB2C8\uD2F0 \uC11C\uBE44\uC2A4 \uC124\uC815 \uC644\uB8CC`);
  }
  /**
   * 커뮤니티 가중치 활성화/비활성화 설정
   * @param enabled 활성화 여부
   */
  setCommunityWeightsEnabled(enabled) {
    this.enableCommunityWeights = enabled;
    console.log(`\u{1F527} [DELTA_CALCULATOR] \uCEE4\uBBA4\uB2C8\uD2F0 \uAC00\uC911\uCE58: ${enabled ? "\uD65C\uC131\uD654" : "\uBE44\uD65C\uC131\uD654"}`);
  }
  /**
   * 🆕 Fallback 언어 분류: username 패턴 기반 휴리스틱
   * CommunityService 없을 때 사용하는 간단한 언어 추론 로직
   *
   * ⚠️ PUBLIC STATIC: recalculateExistingUserScores()에서도 사용 가능하도록 공개
   *
   * @param username 사용자명
   * @param userId 사용자 ID
   * @returns 추론된 dominantLanguage (ISO 639-1 코드: ko, en, ja, zh, unknown)
   */
  static inferDominantLanguageFromUsername(username, userId, displayName) {
    if (displayName && displayName !== userId && displayName !== "unknown") {
      const koreanPattern2 = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
      if (koreanPattern2.test(displayName)) {
        return "ko";
      }
      const japanesePattern2 = /[\u3040-\u309F\u30A0-\u30FF]/;
      if (japanesePattern2.test(displayName)) {
        return "ja";
      }
      const chinesePattern2 = /[\u4E00-\u9FFF]/;
      if (chinesePattern2.test(displayName)) {
        return "zh";
      }
    }
    if (!username || username === userId || /^\d+$/.test(username)) {
      return "unknown";
    }
    const lowerUsername = username.toLowerCase();
    const koreanPattern = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
    if (koreanPattern.test(username)) {
      return "ko";
    }
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
    if (japanesePattern.test(username)) {
      return "ja";
    }
    const chinesePattern = /[\u4E00-\u9FFF]/;
    if (chinesePattern.test(username)) {
      return "zh";
    }
    const koreanKeywords = ["korea", "korean", "seoul", "busan", "kr", "hangul"];
    if (koreanKeywords.some((keyword) => lowerUsername.includes(keyword))) {
      return "ko";
    }
    const japaneseKeywords = ["japan", "japanese", "tokyo", "osaka", "jp"];
    if (japaneseKeywords.some((keyword) => lowerUsername.includes(keyword))) {
      return "ja";
    }
    const chineseKeywords = ["china", "chinese", "beijing", "shanghai", "cn"];
    if (chineseKeywords.some((keyword) => lowerUsername.includes(keyword))) {
      return "zh";
    }
    return "unknown";
  }
  /**
   * engagement 데이터의 tweet_lang 필드를 우선 사용하여 언어 감지
   *
   * 우선순위:
   * 1. engagement의 engaging_tweet_lang 또는 tweet_lang 필드 (X API 제공)
   * 2. 무효한 언어 코드 필터링 (qme, und, zxx 등)
   * 3. Fallback: inferDominantLanguageFromUsername() 사용
   *
   * @param engagements 사용자의 engagement 데이터 배열
   * @param username 사용자명
   * @param displayName 표시 이름 (선택)
   * @param userId 사용자 ID (선택)
   * @returns 감지된 언어 코드
   */
  static inferLanguageFromEngagements(engagements, username, displayName, userId) {
    const INVALID_CODES = [
      "qme",
      // Quote Me (텍스트 없는 인용)
      "und",
      // Undefined
      "zxx",
      // No linguistic content
      "qht",
      // Hyperlink Only Tweet
      "qst",
      // Retweet
      "art"
      // Artificial (bot-generated)
    ];
    console.log(`  \u{1F50D} [LANG] ${username}: ${engagements.length}\uAC1C engagement \uC5B8\uC5B4 \uBD84\uC11D \uC2DC\uC791`);
    for (const eng of engagements) {
      const lang = eng.engaging_tweet_lang || eng.tweet_lang;
      if (lang && !INVALID_CODES.includes(lang.toLowerCase())) {
        console.log(`  \u{1F3AF} [LANG] ${username}: tweet_lang \uC0AC\uC6A9 = ${lang} (\uD2B8\uC717: ${eng.tweet_id})`);
        return lang;
      }
    }
    console.log(`  \u26A0\uFE0F [LANG] ${username}: \uC720\uD6A8\uD55C tweet_lang \uC5C6\uC74C, fallback \uC0AC\uC6A9`);
    return _DeltaCalculator.inferDominantLanguageFromUsername(
      username,
      userId || "",
      displayName
    );
  }
  /**
   * 🆕 멱등성: 인게이지먼트의 고유 키 생성
   * @param engagement 인게이지먼트 데이터
   * @returns 고유 키 문자열
   */
  makeEngagementKey(engagement) {
    return `${engagement.tweet_id}#${engagement.engaging_user_id}#${engagement.engagement_type}`;
  }
  /**
   * 🆕 멱등성: 특정 날짜에 이미 처리된 인게이지먼트 조회
   * @param collectionDate 조회할 날짜 (YYYY-MM-DD)
   * @returns 처리된 인게이지먼트 키 Set
   */
  async getProcessedEngagementsForDate(collectionDate) {
    console.log(`\u{1F50D} [IDEMPOTENCY_CHECK] ${collectionDate}\uC5D0 \uCC98\uB9AC\uB41C RECENT# \uB808\uCF54\uB4DC \uC870\uD68C \uC911...`);
    const processed = /* @__PURE__ */ new Set();
    try {
      const scanCommand = new import_lib_dynamodb2.ScanCommand({
        TableName: this.tableName,
        FilterExpression: "begins_with(sk, :recent) AND lastProcessedDate = :date",
        ExpressionAttributeValues: {
          ":recent": "RECENT#",
          ":date": collectionDate
        },
        ProjectionExpression: "tweet_id, engaging_user_id, engagement_type"
      });
      const result = await this.dynamoClient.send(scanCommand);
      if (result.Items && result.Items.length > 0) {
        for (const item of result.Items) {
          const key = `${item.tweet_id}#${item.engaging_user_id}#${item.engagement_type}`;
          processed.add(key);
        }
        console.log(`\u2705 [IDEMPOTENCY_CHECK] ${result.Items.length}\uAC1C \uCC98\uB9AC \uC644\uB8CC\uB41C \uD65C\uB3D9 \uBC1C\uACAC`);
      } else {
        console.log(`\u2139\uFE0F [IDEMPOTENCY_CHECK] ${collectionDate}\uC5D0 \uCC98\uB9AC\uB41C \uD65C\uB3D9 \uC5C6\uC74C (\uCCAB \uC2E4\uD589)`);
      }
      return processed;
    } catch (error) {
      console.error(`\u274C [IDEMPOTENCY_CHECK] \uCC98\uB9AC \uC774\uB825 \uC870\uD68C \uC2E4\uD328:`, error);
      console.warn(`\u26A0\uFE0F [IDEMPOTENCY_CHECK] \uC548\uC804\uC744 \uC704\uD574 \uBE48 Set \uBC18\uD658 (\uBAA8\uB4E0 \uD65C\uB3D9\uC744 \uC2E0\uADDC\uB85C \uCC98\uB9AC)`);
      return /* @__PURE__ */ new Set();
    }
  }
  /**
   * 특정 날짜의 타겟 북마크 보너스 데이터 조회
   * @param collectionDate YYYY-MM-DD 형식
   * @returns 북마크 보너스 레코드 배열
   */
  generateSummary(addedEngagements, removedEngagements) {
    const countByType = (engagements) => {
      const counts = { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 };
      for (const engagement of engagements) {
        counts.total++;
        switch (engagement.engagement_type) {
          case "like":
            counts.likes++;
            break;
          case "reply":
            counts.replies++;
            break;
          case "repost":
            counts.reposts++;
            break;
          case "quote":
            counts.quotes++;
            break;
          case "mention":
            counts.mentions++;
            break;
        }
      }
      return counts;
    };
    return {
      added: countByType(addedEngagements),
      removed: countByType(removedEngagements)
    };
  }
};

// src/services/community-classification-service.ts
var import_lib_dynamodb3 = require("@aws-sdk/lib-dynamodb");

// src/types/community.ts
var KOREAN_KEYWORDS = {
  // 지역 관련
  location: [
    "\uD55C\uAD6D",
    "\uB300\uD55C\uBBFC\uAD6D",
    "korea",
    "seoul",
    "\uC11C\uC6B8",
    "busan",
    "\uBD80\uC0B0",
    "incheon",
    "\uC778\uCC9C",
    "daegu",
    "\uB300\uAD6C",
    "daejeon",
    "\uB300\uC804",
    "gwangju",
    "\uAD11\uC8FC",
    "ulsan",
    "\uC6B8\uC0B0",
    "kr",
    ".kr",
    "south korea"
  ],
  // 문화 관련
  culture: [
    "kpop",
    "\uCF00\uC774\uD31D",
    "k-pop",
    "kdrama",
    "\uB4DC\uB77C\uB9C8",
    "kimchi",
    "\uAE40\uCE58",
    "bibimbap",
    "\uBE44\uBE54\uBC25",
    "bulgogi",
    "\uBD88\uACE0\uAE30",
    "hanbok",
    "\uD55C\uBCF5",
    "taekwondo",
    "\uD0DC\uAD8C\uB3C4",
    "hallyu",
    "\uD55C\uB958"
  ],
  // 언어 관련
  language: [
    "korean",
    "\uD55C\uAD6D\uC5B4",
    "hangul",
    "\uD55C\uAE00",
    "\uD55C\uAD6D\uB9D0",
    "\uC548\uB155\uD558\uC138\uC694",
    "\uAC10\uC0AC\uD569\uB2C8\uB2E4",
    "\uC0AC\uB791\uD574"
  ],
  // 이모지
  emoji: [
    "\u{1F1F0}\u{1F1F7}",
    "\u{1F962}",
    "\u{1F35A}",
    "\u{1F35C}",
    "\u{1F95F}"
  ]
};
var DEFAULT_CONFIG = {
  sampleTweetCount: 100,
  // 20 → 100 (Twitter 표준)
  koreanThreshold: 0.6,
  minimumTweets: 20,
  // 5 → 20 (신뢰도 향상)
  confidenceBoost: 0.8,
  cacheTtlDays: 30
};
var DEFAULT_WEIGHT_CONFIG = {
  korean: {
    logBase: 8,
    languageMultiplier: 1.02,
    maxCap: 5
  },
  global: {
    logBase: 30,
    languageMultiplier: 1,
    maxCap: 4
  }
};
var DEFAULT_LANGUAGE_WEIGHT_CONFIG = {
  KR: {
    logBase: 8,
    languageMultiplier: 1.2,
    maxCap: 5
  },
  EN: {
    logBase: 30,
    languageMultiplier: 1,
    maxCap: 4
  },
  JP: {
    // 🆕 일본 커뮤니티 기본값
    logBase: 25,
    // 한국과 영어의 중간값
    languageMultiplier: 1.1,
    // 약간의 보너스
    maxCap: 4.5
  },
  CN: {
    // 🆕 중국 커뮤니티 기본값
    logBase: 25,
    // 한국과 영어의 중간값
    languageMultiplier: 1.1,
    // 약간의 보너스
    maxCap: 4.5
  },
  default: {
    // 🆕 분류되지 않은 커뮤니티 기본값
    logBase: 30,
    // 영어와 동일
    languageMultiplier: 1,
    maxCap: 4
  }
};

// src/utils/korean-text-detector.ts
var KOREAN_UNICODE_RANGES = [
  [44032, 55215],
  // 한글 음절 (가-힣)
  [4352, 4607],
  // 한글 자모
  [12592, 12687]
  // 한글 호환 자모
];
var KOREAN_WORDS = [
  // 기본 인사말
  "\uC548\uB155",
  "\uAC10\uC0AC",
  "\uACE0\uB9C8\uC6CC",
  "\uBBF8\uC548",
  "\uC8C4\uC1A1",
  "\uBC18\uAC00\uC6CC",
  // 일상 표현
  "\uC815\uB9D0",
  "\uC9C4\uC9DC",
  "\uC644\uC804",
  "\uB108\uBB34",
  "\uC880",
  "\uB9CE\uC774",
  "\uC870\uAE08",
  // 시간 표현
  "\uC624\uB298",
  "\uC5B4\uC81C",
  "\uB0B4\uC77C",
  "\uC9C0\uAE08",
  "\uB098\uC911",
  "\uC774\uC81C",
  // 감정 표현
  "\uC88B\uC544",
  "\uC2EB\uC5B4",
  "\uAE30\uBED0",
  "\uC2AC\uD37C",
  "\uD654\uB098",
  "\uB180\uB77C",
  // 의문사/대명사
  "\uBB50\uC57C",
  "\uC65C",
  "\uC5B4\uB514",
  "\uC5B8\uC81C",
  "\uB204\uAD6C",
  "\uC5B4\uB5BB\uAC8C",
  // 존댓말 어미
  "\uC2B5\uB2C8\uB2E4",
  "\uC785\uB2C8\uB2E4",
  "\uD574\uC694",
  "\uC608\uC694",
  "\uC774\uC5D0\uC694"
];
function calculateKoreanCharacterRatio(text) {
  if (!text || text.length === 0) {
    return 0;
  }
  let koreanCharCount = 0;
  let totalCharCount = 0;
  for (const char of text) {
    const charCode = char.charCodeAt(0);
    if (char.match(/[a-zA-Z가-힣]/)) {
      totalCharCount++;
      if (isKoreanCharacter(charCode)) {
        koreanCharCount++;
      }
    }
  }
  return totalCharCount === 0 ? 0 : koreanCharCount / totalCharCount;
}
function isKoreanCharacter(charCode) {
  return KOREAN_UNICODE_RANGES.some(
    ([start, end]) => charCode >= start && charCode <= end
  );
}
function calculateKoreanWordScore(text) {
  if (!text) {
    return 0;
  }
  const normalizedText = text.toLowerCase();
  let matchedWords = 0;
  for (const word of KOREAN_WORDS) {
    if (normalizedText.includes(word)) {
      matchedWords++;
    }
  }
  const wordScore = Math.min(matchedWords / KOREAN_WORDS.length, 0.5);
  return wordScore * 2;
}
function mapTwitterLangToCode(twitterLang) {
  const langMap = {
    "ko": "ko",
    // 한국어
    "en": "en",
    // 영어
    "ja": "ja",
    // 일본어
    "zh": "zh",
    // 중국어 (일반)
    "zh-CN": "zh",
    // 중국어 간체
    "zh-TW": "zh"
    // 중국어 번체
  };
  return langMap[twitterLang] || "unknown";
}
function detectLanguage(text, twitterLang) {
  if (!text || text.trim().length === 0) {
    return { language: "unknown", confidence: 0 };
  }
  if (twitterLang && twitterLang !== "und") {
    const mappedLang = mapTwitterLangToCode(twitterLang);
    if (mappedLang !== "unknown") {
      return { language: mappedLang, confidence: 0.95 };
    }
  }
  const koreanCharRatio = calculateKoreanCharacterRatio(text);
  if (koreanCharRatio >= 0.3) {
    return { language: "ko", confidence: 0.7 };
  }
  if (text.match(/^[a-zA-Z\s.,!?]+$/)) {
    return { language: "en", confidence: 0.6 };
  }
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return { language: "ja", confidence: 0.7 };
  }
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return { language: "zh", confidence: 0.6 };
  }
  return { language: "unknown", confidence: 0.3 };
}
function analyzeMultipleTweets(tweets) {
  if (!tweets || tweets.length === 0) {
    return {
      koreanRatio: 0,
      totalTweets: 0,
      confidence: 0,
      languageDistribution: {
        ko: 0,
        en: 0,
        ja: 0,
        zh: 0,
        unknown: 0
      },
      dominantLanguage: "unknown"
    };
  }
  const langFrequency = /* @__PURE__ */ new Map();
  let undefinedCount = 0;
  for (const tweet of tweets) {
    const twitterLang = tweet.lang || "und";
    if (twitterLang === "und") {
      undefinedCount++;
      continue;
    }
    langFrequency.set(twitterLang, (langFrequency.get(twitterLang) || 0) + 1);
  }
  const validLangs = Array.from(langFrequency.entries()).sort((a, b) => b[1] - a[1]);
  const totalTweets = tweets.length;
  const validTweetCount = totalTweets - undefinedCount;
  let dominantLanguage = "unknown";
  let dominantCount = 0;
  let confidence = 0;
  const languageDistribution = {
    ko: 0,
    en: 0,
    ja: 0,
    zh: 0,
    unknown: 0
  };
  if (validLangs.length > 0) {
    const [topLang, topCount] = validLangs[0];
    dominantLanguage = mapTwitterLangToCode(topLang);
    dominantCount = topCount;
    confidence = topCount / validTweetCount;
  }
  if (dominantLanguage === "unknown" && undefinedCount === totalTweets && totalTweets > 0) {
    console.log(
      `\u26A0\uFE0F [LANGUAGE_ANALYSIS] \uBAA8\uB4E0 \uD2B8\uC717\uC774 'und' - \uD14D\uC2A4\uD2B8 \uBD84\uC11D \uD3F4\uBC31 (${totalTweets}\uAC1C \uD2B8\uC717)`
    );
    let koCount = 0;
    let enCount = 0;
    let jaCount = 0;
    let zhCount = 0;
    for (const tweet of tweets) {
      const { language } = detectLanguage(tweet.text);
      switch (language) {
        case "ko":
          koCount++;
          break;
        case "en":
          enCount++;
          break;
        case "ja":
          jaCount++;
          break;
        case "zh":
          zhCount++;
          break;
      }
    }
    const textLangCounts = [
      { lang: "ko", count: koCount },
      { lang: "en", count: enCount },
      { lang: "ja", count: jaCount },
      { lang: "zh", count: zhCount }
    ].sort((a, b) => b.count - a.count);
    if (textLangCounts[0].count > 0) {
      dominantLanguage = textLangCounts[0].lang;
      dominantCount = textLangCounts[0].count;
      confidence = dominantCount / totalTweets;
      for (const { lang, count } of textLangCounts) {
        if (count > 0) {
          languageDistribution[lang] = count / totalTweets;
        }
      }
      console.log(
        `\u2705 [LANGUAGE_ANALYSIS] \uD14D\uC2A4\uD2B8 \uBD84\uC11D \uC644\uB8CC: ${dominantLanguage} (${(confidence * 100).toFixed(1)}%)`
      );
    }
  }
  const MULTILINGUAL_THRESHOLD = 0.5;
  if (validLangs.length > 1 && confidence < MULTILINGUAL_THRESHOLD) {
    console.log(
      `\u26A0\uFE0F [LANGUAGE_ANALYSIS] \uBA40\uD2F0\uB9C1\uAD6C\uC5BC \uAC10\uC9C0: ${dominantLanguage}=${(confidence * 100).toFixed(1)}% < ${MULTILINGUAL_THRESHOLD * 100}%`
    );
  }
  if (!(dominantLanguage !== "unknown" && undefinedCount === totalTweets)) {
    for (const [lang, count] of langFrequency.entries()) {
      const mappedLang = mapTwitterLangToCode(lang);
      languageDistribution[mappedLang] += count / totalTweets;
    }
    languageDistribution.unknown += undefinedCount / totalTweets;
  }
  const koreanRatio = languageDistribution.ko;
  console.log(
    `\u{1F4CA} [LANGUAGE_ANALYSIS] ${totalTweets}\uAC1C \uD2B8\uC717 \uBD84\uC11D \uC644\uB8CC: \uC8FC \uC5B8\uC5B4=${dominantLanguage} (${(confidence * 100).toFixed(1)}%), \uC720\uD6A8=${validTweetCount}, und=${undefinedCount}`
  );
  return {
    koreanRatio,
    totalTweets,
    confidence,
    languageDistribution,
    dominantLanguage
  };
}
function calculateFinalConfidence(languageAnalysis, profileScore) {
  let baseConfidence = languageAnalysis.confidence;
  if (languageAnalysis.totalTweets < 5) {
    baseConfidence *= 0.8;
  } else if (languageAnalysis.totalTweets < 10) {
    baseConfidence *= 0.9;
  }
  if (languageAnalysis.koreanRatio >= 0.8) {
    baseConfidence = Math.min(baseConfidence * 1.1, 1);
  } else if (languageAnalysis.koreanRatio >= 0.6) {
    baseConfidence = Math.min(baseConfidence * 1.05, 1);
  }
  if (profileScore !== void 0) {
    const profileBonus = profileScore * 0.1;
    baseConfidence = Math.min(baseConfidence + profileBonus, 1);
  }
  return Math.round(baseConfidence * 100) / 100;
}
function isKoreanText(text) {
  if (!text || text.length < 2) {
    return false;
  }
  const koreanRatio = calculateKoreanCharacterRatio(text);
  return koreanRatio >= 0.3;
}
function analyzeTextDetailed(text, twitterLang) {
  const koreanCharRatio = calculateKoreanCharacterRatio(text);
  const koreanWordScore = calculateKoreanWordScore(text);
  const detection = detectLanguage(text, twitterLang);
  return {
    text: text.substring(0, 100),
    // 처음 100자만
    koreanCharRatio,
    koreanWordScore,
    twitterLang,
    detectedLanguage: detection.language,
    confidence: detection.confidence,
    isKorean: isKoreanText(text)
  };
}

// src/services/language-analyzer.ts
var LanguageAnalyzer = class {
  constructor(twitterApi, config = {}) {
    this.twitterApi = twitterApi;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * 사용자의 언어 패턴을 분석
   * @param userId 분석할 사용자 ID
   * @returns 언어 분석 결과
   */
  async analyzeUserLanguage(userId) {
    const startTime = Date.now();
    try {
      console.log(`\u{1F50D} [LANGUAGE_ANALYZER] \uC0AC\uC6A9\uC790 ${userId} \uC5B8\uC5B4 \uBD84\uC11D \uC2DC\uC791`);
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile) {
        throw new Error(`\uC0AC\uC6A9\uC790 \uD504\uB85C\uD544\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${userId}`);
      }
      const tweets = await this.getUserRecentTweets(userId);
      if (tweets.length < this.config.minimumTweets) {
        console.log(`\u26A0\uFE0F [LANGUAGE_ANALYZER] \uD2B8\uC717 \uC218 \uBD80\uC871 (${tweets.length}/${this.config.minimumTweets})`);
        return this.createMinimalAnalysis(userId, userProfile, tweets, startTime);
      }
      const tweetAnalysisData = tweets.map((tweet) => ({
        text: tweet.text,
        lang: tweet.lang
      }));
      const languageAnalysis = analyzeMultipleTweets(tweetAnalysisData);
      const tweetSamples = tweets.map((tweet) => {
        const detailed = analyzeTextDetailed(tweet.text, tweet.lang);
        return {
          id: tweet.id,
          text: tweet.text.substring(0, 200),
          // 처음 200자만
          detectedLanguage: detailed.detectedLanguage,
          confidence: detailed.confidence,
          twitterLang: tweet.lang
        };
      });
      const processingTime = Date.now() - startTime;
      console.log(`\u2705 [LANGUAGE_ANALYZER] \uC0AC\uC6A9\uC790 ${userId} \uBD84\uC11D \uC644\uB8CC: \uD55C\uAD6D\uC5B4 \uBE44\uC728 ${(languageAnalysis.koreanRatio * 100).toFixed(1)}%, \uC2E0\uB8B0\uB3C4 ${(languageAnalysis.confidence * 100).toFixed(1)}%`);
      return {
        ...languageAnalysis,
        tweetSamples,
        userProfile,
        analysisMetadata: {
          totalTweetsRequested: this.config.sampleTweetCount,
          actualTweetsAnalyzed: tweets.length,
          analysisDate: (/* @__PURE__ */ new Date()).toISOString(),
          processingTimeMs: processingTime
        }
      };
    } catch (error) {
      console.error(`\u274C [LANGUAGE_ANALYZER] \uC0AC\uC6A9\uC790 ${userId} \uBD84\uC11D \uC2E4\uD328:`, error);
      throw new Error(`\uC5B8\uC5B4 \uBD84\uC11D \uC2E4\uD328: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /**
   * 사용자 프로필 정보 가져오기
   * @param userId 사용자 ID
   * @returns 사용자 프로필
   */
  async getUserProfile(userId) {
    try {
      const userResponseArray = await this.twitterApi.getUsersByIds([userId]);
      const userResponse = userResponseArray.length > 0 ? userResponseArray[0] : null;
      if (!userResponse) {
        return null;
      }
      return {
        id: userResponse.id,
        username: userResponse.username,
        name: userResponse.name,
        description: userResponse.description,
        location: userResponse.location,
        public_metrics: userResponse.public_metrics ? {
          followers_count: userResponse.public_metrics.followers_count || 0,
          following_count: userResponse.public_metrics.following_count || 0,
          tweet_count: userResponse.public_metrics.tweet_count || 0
        } : void 0
      };
    } catch (error) {
      console.error(`\u274C [LANGUAGE_ANALYZER] \uC0AC\uC6A9\uC790 \uD504\uB85C\uD544 \uC870\uD68C \uC2E4\uD328 (${userId}):`, error);
      return null;
    }
  }
  /**
   * 사용자의 최근 트윗 수집
   * @param userId 사용자 ID
   * @returns 트윗 배열
   */
  async getUserRecentTweets(userId) {
    try {
      console.log(`\u{1F4E1} [LANGUAGE_ANALYZER] \uC0AC\uC6A9\uC790 ${userId}\uC758 \uCD5C\uADFC \uD2B8\uC717 ${this.config.sampleTweetCount}\uAC1C \uC218\uC9D1 \uC911`);
      const endTime = (/* @__PURE__ */ new Date()).toISOString();
      const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString();
      const tweetsResponse = await this.twitterApi.getUserTweets(
        userId,
        startTime,
        endTime,
        this.config.sampleTweetCount
      );
      if (!tweetsResponse || tweetsResponse.length === 0) {
        console.log(`\u{1F4ED} [LANGUAGE_ANALYZER] \uC0AC\uC6A9\uC790 ${userId}\uC758 \uD2B8\uC717\uC774 \uC5C6\uC2B5\uB2C8\uB2E4`);
        return [];
      }
      const tweets = tweetsResponse.map((tweet) => ({
        id: tweet.id,
        text: tweet.text,
        lang: tweet.lang,
        created_at: tweet.created_at,
        public_metrics: tweet.public_metrics
      }));
      const filteredTweets = tweets.filter((tweet) => {
        const cleanText = tweet.text.replace(/https?:\/\/\S+/g, "").trim();
        return cleanText.length >= 10;
      });
      console.log(`\u{1F4CA} [LANGUAGE_ANALYZER] ${tweets.length}\uAC1C \uD2B8\uC717 \uC218\uC9D1, ${filteredTweets.length}\uAC1C \uD544\uD130\uB9C1 \uC644\uB8CC`);
      return filteredTweets;
    } catch (error) {
      console.error(`\u274C [LANGUAGE_ANALYZER] \uD2B8\uC717 \uC218\uC9D1 \uC2E4\uD328 (${userId}):`, error);
      return [];
    }
  }
  /**
   * 트윗 수가 부족한 경우 최소 분석 결과 생성
   * @param userId 사용자 ID
   * @param userProfile 사용자 프로필
   * @param tweets 수집된 트윗
   * @param startTime 시작 시간
   * @returns 최소 분석 결과
   */
  createMinimalAnalysis(userId, userProfile, tweets, startTime) {
    console.log(`\u26A0\uFE0F [LANGUAGE_ANALYZER] \uD2B8\uC717 \uBD80\uC871\uC73C\uB85C \uCD5C\uC18C \uBD84\uC11D \uC218\uD589 (${userId})`);
    return {
      koreanRatio: 0,
      totalTweets: tweets.length,
      confidence: 0.1,
      // 매우 낮은 신뢰도
      languageDistribution: {
        ko: 0,
        en: 0.5,
        ja: 0,
        zh: 0,
        unknown: 0.5
      },
      dominantLanguage: "unknown",
      tweetSamples: tweets.map((tweet) => ({
        id: tweet.id,
        text: tweet.text.substring(0, 200),
        detectedLanguage: "unknown",
        confidence: 0.1,
        twitterLang: tweet.lang
      })),
      userProfile,
      analysisMetadata: {
        totalTweetsRequested: this.config.sampleTweetCount,
        actualTweetsAnalyzed: tweets.length,
        analysisDate: (/* @__PURE__ */ new Date()).toISOString(),
        processingTimeMs: Date.now() - startTime
      }
    };
  }
  /**
   * 언어 분석 결과를 바탕으로 커뮤니티 타입 추천
   * @param analysis 언어 분석 결과
   * @param profileScore 프로필 키워드 점수 (선택사항)
   * @returns 커뮤니티 타입과 신뢰도
   */
  static recommendCommunityType(analysis, profileScore) {
    const finalConfidence = calculateFinalConfidence(analysis, profileScore);
    if (analysis.koreanRatio >= 0.6 && finalConfidence >= 0.7) {
      return {
        type: "korean",
        confidence: finalConfidence,
        reason: `\uD55C\uAD6D\uC5B4 \uD2B8\uC717 \uBE44\uC728 ${(analysis.koreanRatio * 100).toFixed(1)}%, \uB192\uC740 \uC2E0\uB8B0\uB3C4`
      };
    } else if (analysis.koreanRatio >= 0.4 && finalConfidence >= 0.6) {
      return {
        type: "korean",
        confidence: finalConfidence,
        reason: `\uD55C\uAD6D\uC5B4 \uD2B8\uC717 \uBE44\uC728 ${(analysis.koreanRatio * 100).toFixed(1)}%, \uC911\uAC04 \uC2E0\uB8B0\uB3C4`
      };
    } else if (analysis.koreanRatio >= 0.3 && profileScore && profileScore >= 0.5) {
      return {
        type: "korean",
        confidence: finalConfidence,
        reason: "\uC5B8\uC5B4 + \uD504\uB85C\uD544 \uD0A4\uC6CC\uB4DC \uC870\uD569\uC73C\uB85C \uD55C\uAD6D \uCEE4\uBBA4\uB2C8\uD2F0 \uD310\uC815"
      };
    } else {
      return {
        type: "global",
        confidence: Math.max(1 - finalConfidence, 0.5),
        reason: `\uD55C\uAD6D\uC5B4 \uC2E0\uD638 \uBD80\uC871 (\uBE44\uC728: ${(analysis.koreanRatio * 100).toFixed(1)}%)`
      };
    }
  }
  /**
   * 배치 언어 분석 (여러 사용자 동시 처리)
   * @param userIds 사용자 ID 배열
   * @returns 분석 결과 배열
   */
  async analyzeBatchUsers(userIds) {
    console.log(`\u{1F504} [LANGUAGE_ANALYZER] \uBC30\uCE58 \uBD84\uC11D \uC2DC\uC791: ${userIds.length}\uBA85`);
    const results = [];
    const batchSize = 5;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const analysis = await this.analyzeUserLanguage(userId);
          return { userId, analysis };
        } catch (error) {
          console.error(`\u274C [LANGUAGE_ANALYZER] \uBC30\uCE58 \uBD84\uC11D \uC2E4\uD328 (${userId}):`, error);
          return {
            userId,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      });
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      if (i + batchSize < userIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 1e3));
      }
    }
    console.log(`\u2705 [LANGUAGE_ANALYZER] \uBC30\uCE58 \uBD84\uC11D \uC644\uB8CC: ${results.length}\uAC1C \uACB0\uACFC`);
    return results;
  }
  /**
   * 설정 업데이트
   * @param newConfig 새로운 설정
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log(`\u{1F527} [LANGUAGE_ANALYZER] \uC124\uC815 \uC5C5\uB370\uC774\uD2B8:`, newConfig);
  }
  /**
   * 현재 설정 조회
   * @returns 현재 설정
   */
  getConfig() {
    return { ...this.config };
  }
};

// src/utils/profile-keyword-matcher.ts
var KEYWORD_WEIGHTS = {
  location: 1,
  // 지역 키워드 가중치
  culture: 0.8,
  // 문화 키워드 가중치
  language: 0.9,
  // 언어 키워드 가중치
  emoji: 0.7
  // 이모지 가중치
};
var FIELD_WEIGHTS = {
  location: 1.5,
  // location 필드에서 발견된 경우 높은 가중치
  description: 1,
  // bio/description 필드
  name: 0.8,
  // display name 필드
  username: 0.6
  // username 필드 (상대적으로 낮은 가중치)
};
function findKeywordsInText(text, fieldType) {
  if (!text) {
    return {
      keywords: [],
      score: 0,
      categoryMatches: { location: [], culture: [], language: [], emoji: [] }
    };
  }
  const normalizedText = text.toLowerCase().trim();
  const foundKeywords = [];
  const categoryMatches = {
    location: [],
    culture: [],
    language: [],
    emoji: []
  };
  let totalScore = 0;
  Object.entries(KOREAN_KEYWORDS).forEach(([category, keywords]) => {
    const categoryKey = category;
    const categoryWeight = KEYWORD_WEIGHTS[categoryKey];
    const fieldWeight = FIELD_WEIGHTS[fieldType];
    keywords.forEach((keyword) => {
      if (normalizedText.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
        categoryMatches[categoryKey].push(keyword);
        const lengthBonus = Math.min(keyword.length / 10, 1.5);
        const keywordScore = categoryWeight * fieldWeight * lengthBonus;
        totalScore += keywordScore;
      }
    });
  });
  return { keywords: foundKeywords, score: totalScore, categoryMatches };
}
function analyzeProfileKeywords(profile) {
  const allKeywords = [];
  const allCategoryMatches = {
    location: [],
    culture: [],
    language: [],
    emoji: []
  };
  let totalScore = 0;
  let hasLocationMatch = false;
  const fields = [
    { text: profile.location || "", type: "location" },
    { text: profile.description || "", type: "description" },
    { text: profile.name || "", type: "name" },
    { text: profile.username || "", type: "username" }
  ];
  fields.forEach(({ text, type }) => {
    if (text) {
      const analysis = findKeywordsInText(text, type);
      analysis.keywords.forEach((keyword) => {
        if (!allKeywords.includes(keyword)) {
          allKeywords.push(keyword);
        }
      });
      Object.entries(analysis.categoryMatches).forEach(([category, matches]) => {
        const categoryKey = category;
        matches.forEach((match) => {
          if (!allCategoryMatches[categoryKey].includes(match)) {
            allCategoryMatches[categoryKey].push(match);
          }
        });
      });
      totalScore += analysis.score;
      if (type === "location" && analysis.categoryMatches.location.length > 0) {
        hasLocationMatch = true;
      }
    }
  });
  const maxExpectedScore = 10;
  const normalizedScore = Math.min(totalScore / maxExpectedScore, 1);
  let finalScore = normalizedScore;
  const categoriesWithMatches = Object.values(allCategoryMatches).filter((matches) => matches.length > 0).length;
  if (categoriesWithMatches >= 3) {
    finalScore = Math.min(finalScore * 1.2, 1);
  } else if (categoriesWithMatches >= 2) {
    finalScore = Math.min(finalScore * 1.1, 1);
  }
  if (hasLocationMatch) {
    finalScore = Math.min(finalScore + 0.1, 1);
  }
  return {
    foundKeywords: allKeywords,
    score: Math.round(finalScore * 100) / 100,
    // 소수점 둘째자리
    hasLocationMatch,
    categoryMatches: allCategoryMatches
  };
}
function recommendCommunityType(keywordAnalysis, languageScore) {
  const reasoning = [];
  let baseScore = keywordAnalysis.score;
  if (languageScore !== void 0) {
    baseScore = languageScore * 0.6 + keywordAnalysis.score * 0.4;
    reasoning.push(`\uC5B8\uC5B4 \uBD84\uC11D: ${languageScore.toFixed(2)}, \uD0A4\uC6CC\uB4DC \uBD84\uC11D: ${keywordAnalysis.score.toFixed(2)}`);
  }
  if (keywordAnalysis.hasLocationMatch) {
    baseScore += 0.15;
    reasoning.push("\uD504\uB85C\uD544 \uC704\uCE58\uC5D0\uC11C \uD55C\uAD6D \uAD00\uB828 \uD0A4\uC6CC\uB4DC \uBC1C\uACAC");
  }
  const categoriesCount = Object.values(keywordAnalysis.categoryMatches).filter((matches) => matches.length > 0).length;
  if (categoriesCount >= 2) {
    baseScore += 0.1;
    reasoning.push(`${categoriesCount}\uAC1C \uCE74\uD14C\uACE0\uB9AC\uC5D0\uC11C \uD0A4\uC6CC\uB4DC \uBC1C\uACAC`);
  }
  const finalScore = Math.min(baseScore, 1);
  if (finalScore >= 0.7) {
    reasoning.push("\uB192\uC740 \uC2E0\uB8B0\uB3C4\uB85C \uD55C\uAD6D \uCEE4\uBBA4\uB2C8\uD2F0 \uBD84\uB958");
    return { recommendedType: "korean", confidence: finalScore, reasoning };
  } else if (finalScore >= 0.4) {
    reasoning.push("\uC911\uAC04 \uC2E0\uB8B0\uB3C4\uB85C \uD55C\uAD6D \uCEE4\uBBA4\uB2C8\uD2F0 \uBD84\uB958");
    return { recommendedType: "korean", confidence: finalScore, reasoning };
  } else {
    reasoning.push("\uD55C\uAD6D \uAD00\uB828 \uC2E0\uD638 \uBD80\uC871\uC73C\uB85C \uAE00\uB85C\uBC8C \uCEE4\uBBA4\uB2C8\uD2F0 \uBD84\uB958");
    return { recommendedType: "global", confidence: 1 - finalScore, reasoning };
  }
}

// src/services/community-classification-service.ts
var CommunityClassificationService = class {
  constructor(dynamoClient, twitterApi, config = {}) {
    // 🆕 [Phase 3.3] 분류 통계 추적
    this.classificationStats = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      cacheHits: 0,
      heuristicFallbacks: 0,
      errorFallbacks: 0,
      lowConfidenceCount: 0,
      resetTime: Date.now()
    };
    this.dynamoClient = import_lib_dynamodb3.DynamoDBDocumentClient.from(dynamoClient);
    this.languageAnalyzer = new LanguageAnalyzer(twitterApi, config);
    const envWeightConfig = {
      korean: {
        logBase: parseInt(process.env.KOREAN_LOG_BASE || "8"),
        languageMultiplier: parseFloat(process.env.KOREAN_LANGUAGE_MULTIPLIER || "1.2"),
        maxCap: parseFloat(process.env.KOREAN_MAX_CAP || "5.0")
      },
      global: {
        logBase: parseInt(process.env.GLOBAL_LOG_BASE || "30"),
        languageMultiplier: parseFloat(process.env.GLOBAL_LANGUAGE_MULTIPLIER || "1.0"),
        maxCap: parseFloat(process.env.GLOBAL_MAX_CAP || "4.0")
      }
    };
    this.config = {
      ...DEFAULT_CONFIG,
      tableName: process.env.CUMULATIVE_TABLE_NAME || "nasun-leaderboard-data",
      ttlDays: 60,
      // API 호출 최적화: 60일마다 재분류 (월 1회)
      enableCaching: true,
      weightConfig: {
        korean: {
          ...DEFAULT_WEIGHT_CONFIG.korean,
          // 기본값
          ...envWeightConfig.korean,
          // 환경변수
          ...config.weightConfig?.korean
          // 사용자 설정 (최우선)
        },
        global: {
          ...DEFAULT_WEIGHT_CONFIG.global,
          // 기본값
          ...envWeightConfig.global,
          // 환경변수
          ...config.weightConfig?.global
          // 사용자 설정 (최우선)
        }
      },
      // 🆕 Phase 3.1.3: 새로운 언어 코드 기반 가중치 설정 초기화
      languageWeightConfig: {
        ...DEFAULT_LANGUAGE_WEIGHT_CONFIG,
        ...config.languageWeightConfig
      },
      ...config
    };
    console.log(`\u{1F680} [COMMUNITY_CLASSIFIER] \uC11C\uBE44\uC2A4 \uCD08\uAE30\uD654 \uC644\uB8CC: ${this.config.tableName}`);
    console.log(`\u2699\uFE0F [COMMUNITY_CLASSIFIER] \uAC00\uC911\uCE58 \uC124\uC815:`);
    console.log(`   \u{1F1F0}\u{1F1F7} \uD55C\uAD6D: logBase=${this.config.weightConfig.korean.logBase}, multiplier=${this.config.weightConfig.korean.languageMultiplier}, maxCap=${this.config.weightConfig.korean.maxCap}`);
    console.log(`   \u{1F30D} \uAE00\uB85C\uBC8C: logBase=${this.config.weightConfig.global.logBase}, multiplier=${this.config.weightConfig.global.languageMultiplier}, maxCap=${this.config.weightConfig.global.maxCap}`);
  }
  /**
   * 사용자 커뮤니티 프로필 조회 (캐시 우선)
   * @param userId 사용자 ID
   * @returns 커뮤니티 프로필 또는 null
   */
  async getUserCommunityProfile(userId) {
    if (!this.config.enableCaching) {
      return null;
    }
    try {
      const result = await this.dynamoClient.send(new import_lib_dynamodb3.GetCommand({
        TableName: this.config.tableName,
        Key: {
          pk: `USER_COMMUNITY#${userId}`,
          sk: "PROFILE"
        }
      }));
      if (!result.Item) {
        return null;
      }
      const profile = result.Item;
      if (profile.ttl && profile.ttl < Math.floor(Date.now() / 1e3)) {
        console.log(`\u23F0 [COMMUNITY_CLASSIFIER] \uCE90\uC2DC \uB9CC\uB8CC\uB428 (${userId})`);
        return null;
      }
      console.log(`\u{1F4CB} [COMMUNITY_CLASSIFIER] \uCE90\uC2DC\uC5D0\uC11C \uD504\uB85C\uD544 \uC870\uD68C (${userId}): ${profile.communityType}`);
      return profile;
    } catch (error) {
      console.error(`\u274C [COMMUNITY_CLASSIFIER] \uD504\uB85C\uD544 \uC870\uD68C \uC2E4\uD328 (${userId}):`, error);
      return null;
    }
  }
  /**
   * 사용자 커뮤니티 분류 수행
   * @param userId 사용자 ID
   * @param forceRefresh 강제 재분석 여부
   * @returns 분류 결과
   */
  async classifyUser(userId, forceRefresh = false) {
    const startTime = Date.now();
    this.classificationStats.totalAttempts++;
    try {
      console.log(`\u{1F50D} [COMMUNITY_CLASSIFIER] \uC0AC\uC6A9\uC790 ${userId} \uBD84\uB958 \uC2DC\uC791 (\uAC15\uC81C\uC0C8\uB85C\uACE0\uCE68: ${forceRefresh})`);
      if (!forceRefresh) {
        const cachedProfile = await this.getUserCommunityProfile(userId);
        if (cachedProfile) {
          this.classificationStats.cacheHits++;
          this.classificationStats.successCount++;
          console.log(`\u{1F4CB} [COMMUNITY_CLASSIFIER] \uCE90\uC2DC \uD788\uD2B8: ${userId} \u2192 ${cachedProfile.communityType} (dominantLanguage: ${cachedProfile.dominantLanguage || "N/A"})`);
          return {
            success: true,
            userId,
            communityType: cachedProfile.communityType,
            dominantLanguage: cachedProfile.dominantLanguage,
            confidence: cachedProfile.confidence,
            fromCache: true,
            processingTime: Date.now() - startTime
          };
        }
      }
      console.log(`\u{1F4DD} [COMMUNITY_CLASSIFIER] \uC5B8\uC5B4 \uBD84\uC11D \uC218\uD589 \uC911 (${userId})`);
      const languageAnalysis = await this.languageAnalyzer.analyzeUserLanguage(userId);
      console.log(`\u{1F50E} [COMMUNITY_CLASSIFIER] \uD504\uB85C\uD544 \uD0A4\uC6CC\uB4DC \uBD84\uC11D \uC911 (${userId})`);
      const profileAnalysis = analyzeProfileKeywords({
        description: languageAnalysis.userProfile.description,
        location: languageAnalysis.userProfile.location,
        name: languageAnalysis.userProfile.name,
        username: languageAnalysis.userProfile.username
      });
      const languageRecommendation = LanguageAnalyzer.recommendCommunityType(
        languageAnalysis,
        profileAnalysis.score
      );
      const profileRecommendation = recommendCommunityType(
        profileAnalysis,
        languageAnalysis.confidence
      );
      const finalResult = this.makeFinalDecision(
        languageRecommendation,
        profileRecommendation,
        languageAnalysis,
        profileAnalysis
      );
      if (this.config.enableCaching) {
        await this.saveCommunityProfile({
          pk: `USER_COMMUNITY#${userId}`,
          sk: "PROFILE",
          userId,
          username: languageAnalysis.userProfile.username,
          communityType: finalResult.type,
          confidence: finalResult.confidence,
          dominantLanguage: languageAnalysis.dominantLanguage,
          // 실제 감지된 언어 저장
          analysis: {
            koreanTweetRatio: languageAnalysis.koreanRatio,
            profileKeywords: profileAnalysis.foundKeywords,
            manualOverride: false,
            totalTweetsAnalyzed: languageAnalysis.totalTweets
          },
          lastAnalyzed: (/* @__PURE__ */ new Date()).toISOString(),
          analyzedTweetCount: languageAnalysis.totalTweets,
          ttl: Math.floor(Date.now() / 1e3) + this.config.ttlDays * 24 * 60 * 60,
          version: "v2"
        });
      }
      const processingTime = Date.now() - startTime;
      this.classificationStats.successCount++;
      if (finalResult.confidence < 0.6) {
        this.classificationStats.lowConfidenceCount++;
        console.log(`\u26A0\uFE0F [COMMUNITY_CLASSIFIER] \uB0AE\uC740 \uC2E0\uB8B0\uB3C4 \uBD84\uB958: ${userId} (${(finalResult.confidence * 100).toFixed(1)}%)`);
      }
      console.log(`\u2705 [COMMUNITY_CLASSIFIER] \uC0AC\uC6A9\uC790 ${userId} \uBD84\uB958 \uC644\uB8CC: ${finalResult.type} (\uC2E0\uB8B0\uB3C4: ${(finalResult.confidence * 100).toFixed(1)}%, \uCC98\uB9AC\uC2DC\uAC04: ${processingTime}ms)`);
      console.log(`\u{1F310} [COMMUNITY_CLASSIFIER] \uAC10\uC9C0\uB41C \uC5B8\uC5B4: ${languageAnalysis.dominantLanguage}`);
      return {
        success: true,
        userId,
        communityType: finalResult.type,
        dominantLanguage: languageAnalysis.dominantLanguage,
        confidence: finalResult.confidence,
        fromCache: false,
        processingTime
      };
    } catch (error) {
      console.error(`\u274C [COMMUNITY_CLASSIFIER] \uC0AC\uC6A9\uC790 ${userId} \uBD84\uB958 \uC2E4\uD328:`, error);
      this.classificationStats.failureCount++;
      const fallbackResult = this.inferCommunityTypeFromUserId(userId);
      if (fallbackResult) {
        this.classificationStats.heuristicFallbacks++;
        console.log(`\u{1F504} [COMMUNITY_CLASSIFIER] \uD734\uB9AC\uC2A4\uD2F1 \uD3F4\uBC31 \uC131\uACF5: ${userId} \u2192 ${fallbackResult}`);
        const dominantLanguage = fallbackResult === "korean" ? "ko" : "unknown";
        return {
          success: true,
          userId,
          communityType: fallbackResult,
          dominantLanguage,
          confidence: 0.3,
          // 폴백의 경우 낮은 신뢰도
          fromCache: false,
          processingTime: Date.now() - startTime,
          fallbackReason: "heuristic_analysis"
        };
      } else {
        this.classificationStats.errorFallbacks++;
        console.log(`\u274C [COMMUNITY_CLASSIFIER] \uD734\uB9AC\uC2A4\uD2F1 \uD3F4\uBC31\uB3C4 \uC2E4\uD328: ${userId}`);
        return {
          success: false,
          userId,
          error: error instanceof Error ? error.message : String(error),
          fromCache: false,
          processingTime: Date.now() - startTime
        };
      }
    }
  }
  /**
   * 최종 커뮤니티 타입 결정
   * @param languageRec 언어 분석 추천
   * @param profileRec 프로필 분석 추천
   * @param languageAnalysis 언어 분석 상세 결과
   * @param profileAnalysis 프로필 분석 결과
   * @returns 최종 결정
   */
  makeFinalDecision(languageRec, profileRec, languageAnalysis, profileAnalysis) {
    const languageWeight = 0.7;
    const profileWeight = 0.3;
    const languageKoreanScore = languageRec.type === "korean" ? languageRec.confidence : 1 - languageRec.confidence;
    const profileKoreanScore = profileRec.recommendedType === "korean" ? profileRec.confidence : 1 - profileRec.confidence;
    const finalKoreanScore = languageKoreanScore * languageWeight + profileKoreanScore * profileWeight;
    let adjustedScore = finalKoreanScore;
    if (languageAnalysis.totalTweets < 5) {
      adjustedScore *= 0.8;
    }
    if (languageAnalysis.koreanRatio >= 0.8) {
      adjustedScore = Math.min(adjustedScore * 1.1, 1);
    }
    if (profileAnalysis.hasLocationMatch) {
      adjustedScore = Math.min(adjustedScore + 0.05, 1);
    }
    const threshold = this.config.koreanThreshold;
    if (adjustedScore >= threshold) {
      return {
        type: "korean",
        confidence: adjustedScore,
        reason: `\uC885\uD569 \uBD84\uC11D (\uC5B8\uC5B4: ${languageKoreanScore.toFixed(2)}, \uD504\uB85C\uD544: ${profileKoreanScore.toFixed(2)})`
      };
    } else {
      return {
        type: "global",
        confidence: 1 - adjustedScore,
        reason: `\uD55C\uAD6D \uC2E0\uD638 \uBD80\uC871 (\uC885\uD569 \uC810\uC218: ${adjustedScore.toFixed(2)} < ${threshold})`
      };
    }
  }
  /**
   * 커뮤니티 프로필을 DynamoDB에 저장
   * @param profile 저장할 프로필
   */
  async saveCommunityProfile(profile) {
    try {
      await this.dynamoClient.send(new import_lib_dynamodb3.PutCommand({
        TableName: this.config.tableName,
        Item: profile
      }));
      console.log(`\u{1F4BE} [COMMUNITY_CLASSIFIER] \uD504\uB85C\uD544 \uC800\uC7A5 \uC644\uB8CC (${profile.userId})`);
    } catch (error) {
      console.error(`\u274C [COMMUNITY_CLASSIFIER] \uD504\uB85C\uD544 \uC800\uC7A5 \uC2E4\uD328 (${profile.userId}):`, error);
      throw error;
    }
  }
  /**
   * 사용자 커뮤니티 타입 수동 설정 (관리자용)
   * @param userId 사용자 ID
   * @param communityType 설정할 커뮤니티 타입
   * @param reason 변경 사유
   * @returns 처리 결과
   */
  async setUserCommunityType(userId, communityType, reason = "\uAD00\uB9AC\uC790 \uC218\uB3D9 \uC124\uC815") {
    try {
      console.log(`\u{1F6E0}\uFE0F [COMMUNITY_CLASSIFIER] \uC218\uB3D9 \uC124\uC815: ${userId} -> ${communityType}`);
      const existingProfile = await this.getUserCommunityProfile(userId);
      const profile = {
        pk: `USER_COMMUNITY#${userId}`,
        sk: "PROFILE",
        userId,
        username: existingProfile?.username || "unknown",
        communityType,
        confidence: 1,
        // 수동 설정은 100% 신뢰도
        analysis: {
          koreanTweetRatio: existingProfile?.analysis.koreanTweetRatio || 0,
          profileKeywords: existingProfile?.analysis.profileKeywords || [],
          manualOverride: true,
          totalTweetsAnalyzed: existingProfile?.analysis.totalTweetsAnalyzed || 0
        },
        lastAnalyzed: (/* @__PURE__ */ new Date()).toISOString(),
        analyzedTweetCount: existingProfile?.analyzedTweetCount || 0,
        ttl: Math.floor(Date.now() / 1e3) + this.config.ttlDays * 24 * 60 * 60,
        version: "v2"
      };
      await this.saveCommunityProfile(profile);
      const dominantLanguage = existingProfile?.dominantLanguage || (communityType === "korean" ? "ko" : "unknown");
      return {
        success: true,
        userId,
        communityType,
        dominantLanguage,
        confidence: 1,
        fromCache: false,
        processingTime: 0
      };
    } catch (error) {
      console.error(`\u274C [COMMUNITY_CLASSIFIER] \uC218\uB3D9 \uC124\uC815 \uC2E4\uD328 (${userId}):`, error);
      return {
        success: false,
        userId,
        error: error instanceof Error ? error.message : String(error),
        fromCache: false,
        processingTime: 0
      };
    }
  }
  /**
   * 배치 사용자 분류
   * @param userIds 사용자 ID 배열
   * @param forceRefresh 강제 새로고침 여부
   * @returns 배치 처리 통계
   */
  async classifyBatchUsers(userIds, forceRefresh = false) {
    const startTime = Date.now();
    console.log(`\u{1F504} [COMMUNITY_CLASSIFIER] \uBC30\uCE58 \uBD84\uB958 \uC2DC\uC791: ${userIds.length}\uBA85`);
    const stats = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      cacheHitCount: 0,
      koreanCount: 0,
      globalCount: 0,
      averageConfidence: 0,
      processingTimeMs: 0
    };
    let totalConfidence = 0;
    const batchSize = 3;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          stats.totalProcessed++;
          const result = await this.classifyUser(userId, forceRefresh);
          if (result.success) {
            stats.successCount++;
            totalConfidence += result.confidence || 0;
            if (result.fromCache) {
              stats.cacheHitCount++;
            }
            if (result.communityType === "korean") {
              stats.koreanCount++;
            } else {
              stats.globalCount++;
            }
          } else {
            stats.errorCount++;
          }
          return result;
        } catch (error) {
          stats.totalProcessed++;
          stats.errorCount++;
          console.error(`\u274C [COMMUNITY_CLASSIFIER] \uBC30\uCE58 \uCC98\uB9AC \uC624\uB958 (${userId}):`, error);
          return null;
        }
      });
      await Promise.all(batchPromises);
      if (i + batchSize < userIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 2e3));
      }
    }
    stats.averageConfidence = stats.successCount > 0 ? totalConfidence / stats.successCount : 0;
    stats.processingTimeMs = Date.now() - startTime;
    console.log(`\u2705 [COMMUNITY_CLASSIFIER] \uBC30\uCE58 \uBD84\uB958 \uC644\uB8CC:`, {
      \uCC98\uB9AC\uC644\uB8CC: `${stats.successCount}/${stats.totalProcessed}`,
      \uD55C\uAD6D\uCEE4\uBBA4\uB2C8\uD2F0: stats.koreanCount,
      \uAE00\uB85C\uBC8C\uCEE4\uBBA4\uB2C8\uD2F0: stats.globalCount,
      \uD3C9\uADE0\uC2E0\uB8B0\uB3C4: `${(stats.averageConfidence * 100).toFixed(1)}%`,
      \uCC98\uB9AC\uC2DC\uAC04: `${(stats.processingTimeMs / 1e3).toFixed(1)}\uCD08`
    });
    return stats;
  }
  /**
   * 하이브리드 가중치 계산 (로그 밑 차별화 + 언어별 기본점수 조정)
   * @param userId 사용자 ID
   * @param followers 팔로워 수
   * @param baseScore 기본 점수
   * @returns 가중치 계산 결과
   */
  async calculateCommunityWeight(userId, followers, baseScore = 1, username, displayName, engagementLangs) {
    try {
      let dominantLanguage = "unknown";
      if (engagementLangs && engagementLangs.length > 0) {
        const validLangs = engagementLangs.filter((lang) => lang && lang !== "unknown" && lang !== "und");
        if (validLangs.length > 0) {
          const langCounts = validLangs.reduce((acc, lang) => {
            acc[lang] = (acc[lang] || 0) + 1;
            return acc;
          }, {});
          const mostCommonLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0][0];
          dominantLanguage = mostCommonLang;
          console.log(`\u{1F310} [LANG_X_API] ${userId}: X API lang \uAC10\uC9C0 \u2192 ${dominantLanguage} (\uC0D8\uD50C: ${validLangs.join(", ")})`);
        }
      }
      if (dominantLanguage === "unknown" && (username || displayName)) {
        dominantLanguage = DeltaCalculator.inferDominantLanguageFromUsername(username, userId, displayName);
        console.log(`\u{1F50D} [LANG_PATTERN] ${username} / ${displayName} (${userId}): ${dominantLanguage}`);
      }
      const config = dominantLanguage === "ko" ? this.config.weightConfig.korean : this.config.weightConfig.global;
      console.log(`\u{1F527} [WEIGHT_CALC] ${userId}: ${dominantLanguage} \uC5B8\uC5B4 \u2192 ${dominantLanguage === "ko" ? "Korean" : "Global"} config \uC0AC\uC6A9`);
      const followerWeight = Math.min(
        Math.log(followers + 1) / Math.log(config.logBase),
        config.maxCap
      );
      const finalWeight = baseScore * followerWeight * config.languageMultiplier;
      const cappedAtMax = followerWeight >= config.maxCap;
      console.log(`\u2696\uFE0F [WEIGHT_CALC] ${userId}: ${dominantLanguage} \uC5B8\uC5B4, \uD314\uB85C\uC6CC ${followers}\uBA85 \u2192 \uAC00\uC911\uCE58 ${finalWeight.toFixed(2)}`);
      return {
        finalWeight: Math.round(finalWeight * 100) / 100,
        dominantLanguage,
        followerWeight: Math.round(followerWeight * 100) / 100,
        languageMultiplier: config.languageMultiplier,
        logBase: config.logBase,
        maxCap: config.maxCap,
        cappedAtMax
      };
    } catch (error) {
      console.error(`\u274C [COMMUNITY_CLASSIFIER] \uAC00\uC911\uCE58 \uACC4\uC0B0 \uC2E4\uD328 (${userId}):`, error);
      const fallbackConfig = this.config.weightConfig.global;
      return {
        finalWeight: baseScore * fallbackConfig.languageMultiplier,
        dominantLanguage: void 0,
        // ✅ undefined로 설정하여 기존 값 보존
        followerWeight: 1,
        languageMultiplier: fallbackConfig.languageMultiplier,
        logBase: fallbackConfig.logBase,
        maxCap: fallbackConfig.maxCap,
        cappedAtMax: false
      };
    }
  }
  /**
   * 🔧 [Phase 3.1] 사용자 프로필 기반 스마트 기본값 시스템
   * 프로필 조회 실패 시 사용하는 다단계 휴리스틱 추론
   */
  inferCommunityTypeFromUserId(userId) {
    console.log(`\u{1F50D} [SMART_FALLBACK] \uC0AC\uC6A9\uC790 ${userId} \uC2A4\uB9C8\uD2B8 \uCD94\uB860 \uC2DC\uC791`);
    let confidence = 0;
    let reasoning = [];
    if (this.containsKoreanPattern(userId)) {
      confidence += 0.3;
      reasoning.push("\uC0AC\uC6A9\uC790 ID\uC5D0\uC11C \uD55C\uAD6D\uC5B4 \uD328\uD134 \uAC10\uC9C0");
    }
    if (this.hasKoreanStyleNaming(userId)) {
      confidence += 0.2;
      reasoning.push("\uD55C\uAD6D\uC2DD \uB124\uC774\uBC0D \uD328\uD134 \uAC10\uC9C0");
    }
    const finalType = confidence >= 0.4 ? "korean" : "global";
    console.log(`\u{1F3AF} [SMART_FALLBACK] \uACB0\uACFC: ${finalType} (\uC2E0\uB8B0\uB3C4: ${confidence.toFixed(2)}, \uADFC\uAC70: ${reasoning.join(", ") || "\uC5C6\uC74C"})`);
    return finalType;
  }
  /**
   * 🆕 [Phase 3.1] 사용자 ID에서 한국어 패턴 감지
   */
  containsKoreanPattern(userId) {
    const koreanRegex = /[가-힣]|korea|seoul|busan|kr$/i;
    return koreanRegex.test(userId);
  }
  /**
   * 🆕 [Phase 3.1] 한국식 네이밍 패턴 감지
   */
  hasKoreanStyleNaming(userId) {
    const koreanPatterns = [
      /\d{4}$/,
      // 연도로 끝나는 패턴 (예: kim2024)
      /_\d+$/,
      // 언더스코어 + 숫자 패턴
      /^[a-z]+\d{2,4}$/
      // 영문 + 2-4자리 숫자
    ];
    return koreanPatterns.some((pattern) => pattern.test(userId));
  }
  /**
   * 🆕 [Phase 3.2] 분류 신뢰도 기반 가중치 조정 계산
   * @param confidence 분류 신뢰도 (0.0 ~ 1.0)
   * @param source 분류 데이터 소스
   * @returns 조정된 가중치 배수
   */
  calculateConfidenceAdjustment(confidence, source) {
    let adjustment = 1;
    switch (source) {
      case "cache":
        adjustment = 0.8 + confidence * 0.2;
        break;
      case "heuristic":
        adjustment = 0.7 + confidence * 0.2;
        break;
      case "fallback":
        adjustment = 0.6 + confidence * 0.2;
        break;
      default:
        adjustment = confidence;
    }
    return Math.max(0.5, Math.min(1, adjustment));
  }
  /**
   * 캐시 초기화 (특정 사용자 또는 전체)
   * @param userId 특정 사용자 ID (선택사항)
   */
  async clearCache(userId) {
    try {
      if (userId) {
        await this.dynamoClient.send(new import_lib_dynamodb3.UpdateCommand({
          TableName: this.config.tableName,
          Key: {
            pk: `USER_COMMUNITY#${userId}`,
            sk: "PROFILE"
          },
          UpdateExpression: "SET #ttl = :ttl",
          ExpressionAttributeNames: {
            "#ttl": "ttl"
          },
          ExpressionAttributeValues: {
            ":ttl": Math.floor(Date.now() / 1e3) - 1
            // 과거 시간으로 설정하여 만료
          }
        }));
        console.log(`\u{1F5D1}\uFE0F [COMMUNITY_CLASSIFIER] \uC0AC\uC6A9\uC790 \uCE90\uC2DC \uCD08\uAE30\uD654 \uC644\uB8CC (${userId})`);
      } else {
        console.log(`\u{1F5D1}\uFE0F [COMMUNITY_CLASSIFIER] \uC804\uCCB4 \uCE90\uC2DC \uCD08\uAE30\uD654\uB294 \uC218\uB3D9\uC73C\uB85C TTL \uAD00\uB9AC\uB429\uB2C8\uB2E4`);
      }
    } catch (error) {
      console.error(`\u274C [COMMUNITY_CLASSIFIER] \uCE90\uC2DC \uCD08\uAE30\uD654 \uC2E4\uD328:`, error);
      throw error;
    }
  }
  /**
   * 서비스 통계 조회
   * @returns 서비스 통계 정보
   */
  async getServiceStats() {
    try {
      console.log(`\u{1F4CA} [COMMUNITY_CLASSIFIER] \uC11C\uBE44\uC2A4 \uD1B5\uACC4 \uC870\uD68C \uAE30\uB2A5\uC740 \uCD94\uD6C4 \uAD6C\uD604 \uC608\uC815`);
      return {
        totalProfiles: 0,
        koreanProfiles: 0,
        globalProfiles: 0,
        averageConfidence: 0
      };
    } catch (error) {
      console.error(`\u274C [COMMUNITY_CLASSIFIER] \uD1B5\uACC4 \uC870\uD68C \uC2E4\uD328:`, error);
      throw error;
    }
  }
  /**
   * 설정 업데이트
   * @param newConfig 새로운 설정
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.languageAnalyzer.updateConfig(newConfig);
    console.log(`\u{1F527} [COMMUNITY_CLASSIFIER] \uC124\uC815 \uC5C5\uB370\uC774\uD2B8:`, newConfig);
  }
  /**
   * 현재 설정 조회
   * @returns 현재 설정
   */
  getConfig() {
    return { ...this.config };
  }
  // 🆕 [Phase 3.3] 분류 통계 모니터링 및 알림 시스템
  /**
   * 현재 분류 통계 조회
   * @returns 분류 통계
   */
  getClassificationStats() {
    const runtime = Date.now() - this.classificationStats.resetTime;
    const runtimeHours = runtime / (1e3 * 60 * 60);
    const stats = {
      ...this.classificationStats,
      runtime,
      runtimeHours: parseFloat(runtimeHours.toFixed(2)),
      successRate: this.classificationStats.totalAttempts > 0 ? parseFloat((this.classificationStats.successCount / this.classificationStats.totalAttempts * 100).toFixed(2)) : 0,
      failureRate: this.classificationStats.totalAttempts > 0 ? parseFloat((this.classificationStats.failureCount / this.classificationStats.totalAttempts * 100).toFixed(2)) : 0,
      cacheHitRate: this.classificationStats.totalAttempts > 0 ? parseFloat((this.classificationStats.cacheHits / this.classificationStats.totalAttempts * 100).toFixed(2)) : 0,
      lowConfidenceRate: this.classificationStats.successCount > 0 ? parseFloat((this.classificationStats.lowConfidenceCount / this.classificationStats.successCount * 100).toFixed(2)) : 0
    };
    return stats;
  }
  /**
   * 분류 통계 리셋
   */
  resetClassificationStats() {
    this.classificationStats = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      cacheHits: 0,
      heuristicFallbacks: 0,
      errorFallbacks: 0,
      lowConfidenceCount: 0,
      resetTime: Date.now()
    };
    console.log(`\u{1F4CA} [COMMUNITY_CLASSIFIER] \uBD84\uB958 \uD1B5\uACC4 \uB9AC\uC14B\uB428`);
  }
  /**
   * 분류 품질 모니터링 및 알림
   * @param thresholds 알림 임계값
   * @returns 모니터링 결과
   */
  monitorClassificationQuality(thresholds = {
    maxFailureRate: 20,
    // 실패율 20% 초과 시 알림
    maxLowConfidenceRate: 40,
    // 낮은 신뢰도 40% 초과 시 알림
    minCacheHitRate: 30,
    // 캐시 히트율 30% 미만 시 알림
    minAttempts: 10
    // 최소 시도 횟수
  }) {
    const stats = this.getClassificationStats();
    const alerts = [];
    if (stats.totalAttempts < thresholds.minAttempts) {
      return {
        status: "insufficient_data",
        message: `\uBD84\uB958 \uC2DC\uB3C4 \uD69F\uC218 \uBD80\uC871 (${stats.totalAttempts}/${thresholds.minAttempts})`,
        stats,
        alerts: []
      };
    }
    if (stats.failureRate > thresholds.maxFailureRate) {
      alerts.push(`\u{1F6A8} \uB192\uC740 \uC2E4\uD328\uC728: ${stats.failureRate}% (\uC784\uACC4\uAC12: ${thresholds.maxFailureRate}%)`);
    }
    if (stats.lowConfidenceRate > thresholds.maxLowConfidenceRate) {
      alerts.push(`\u26A0\uFE0F \uB192\uC740 \uB0AE\uC740 \uC2E0\uB8B0\uB3C4 \uBE44\uC728: ${stats.lowConfidenceRate}% (\uC784\uACC4\uAC12: ${thresholds.maxLowConfidenceRate}%)`);
    }
    if (stats.cacheHitRate < thresholds.minCacheHitRate) {
      alerts.push(`\u{1F4C9} \uB0AE\uC740 \uCE90\uC2DC \uD788\uD2B8\uC728: ${stats.cacheHitRate}% (\uC784\uACC4\uAC12: ${thresholds.minCacheHitRate}%)`);
    }
    const heuristicFallbackRate = stats.totalAttempts > 0 ? stats.heuristicFallbacks / stats.totalAttempts * 100 : 0;
    if (heuristicFallbackRate > 15) {
      alerts.push(`\u{1F504} \uACFC\uB3C4\uD55C \uD734\uB9AC\uC2A4\uD2F1 \uD3F4\uBC31: ${heuristicFallbackRate.toFixed(1)}% (\uAD8C\uC7A5: <15%)`);
    }
    const status = alerts.length > 0 ? "alert" : "healthy";
    if (alerts.length > 0) {
      console.log(`\u{1F6A8} [COMMUNITY_CLASSIFIER] \uBD84\uB958 \uD488\uC9C8 \uC54C\uB9BC:`);
      alerts.forEach((alert) => console.log(`   ${alert}`));
      console.log(`\u{1F4CA} \uD1B5\uACC4 \uC694\uC57D:`, {
        \uCD1D\uC2DC\uB3C4: stats.totalAttempts,
        \uC131\uACF5\uB960: `${stats.successRate}%`,
        \uC2E4\uD328\uC728: `${stats.failureRate}%`,
        \uCE90\uC2DC\uD788\uD2B8\uC728: `${stats.cacheHitRate}%`,
        \uB0AE\uC740\uC2E0\uB8B0\uB3C4\uC728: `${stats.lowConfidenceRate}%`,
        \uD734\uB9AC\uC2A4\uD2F1\uD3F4\uBC31: stats.heuristicFallbacks,
        \uAC00\uB3D9\uC2DC\uAC04: `${stats.runtimeHours}\uC2DC\uAC04`
      });
    } else {
      console.log(`\u2705 [COMMUNITY_CLASSIFIER] \uBD84\uB958 \uD488\uC9C8 \uC591\uD638 (\uC131\uACF5\uB960: ${stats.successRate}%, \uC2E4\uD328\uC728: ${stats.failureRate}%)`);
    }
    return {
      status,
      message: status === "healthy" ? "\uBD84\uB958 \uC2DC\uC2A4\uD15C\uC774 \uC815\uC0C1\uC801\uC73C\uB85C \uC791\uB3D9 \uC911\uC785\uB2C8\uB2E4" : `${alerts.length}\uAC1C\uC758 \uD488\uC9C8 \uC774\uC288\uAC00 \uAC10\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4`,
      stats,
      alerts
    };
  }
  /**
   * 주기적 모니터링 실행 (예: 매 시간)
   * 실제 환경에서는 CloudWatch나 별도 모니터링 시스템과 연동
   */
  schedulePeriodicMonitoring() {
    console.log(`\u23F0 [COMMUNITY_CLASSIFIER] \uC8FC\uAE30\uC801 \uBAA8\uB2C8\uD130\uB9C1 \uC2A4\uCF00\uC904 \uC124\uC815 (\uB9E4 \uC2DC\uAC04 \uCCB4\uD06C)`);
    setInterval(() => {
      this.monitorClassificationQuality();
    }, 60 * 60 * 1e3);
  }
};

// src/services/leaderboard-generator.ts
var import_lib_dynamodb4 = require("@aws-sdk/lib-dynamodb");

// src/types/profile.ts
var PROFILE_QUALITY_THRESHOLDS = {
  HIGH_QUALITY: 80,
  // 80점 이상: 고품질
  CACHE_WORTHY: 70,
  // 70점 이상: 캐시 저장
  MEDIUM: 60,
  // 60점 이상: 중품질
  GOOD: 50,
  // 50점 이상: 양호 (ACCEPTABLE과 동일)
  ACCEPTABLE: 50,
  // 50점 이상: 사용 가능
  LOW: 40,
  // 40점 이상: 저품질 (개선 필요)
  NEEDS_UPDATE: 30,
  // 30점 미만: 업데이트 필요
  CRITICAL: 20
  // 20점 미만: 심각한 품질 저하
};
var FIELD_QUALITY_WEIGHTS = {
  username: 30,
  // 필수 필드
  displayName: 30,
  // 필수 필드  
  profileImageUrl: 20,
  // 중요 필드
  followersCount: 20
  // 중요 필드
};
var SOURCE_RELIABILITY_SCORES = {
  direct_api: 100,
  // 최고 신뢰도
  cache: 80,
  // 높은 신뢰도
  existing_score: 60,
  // 중간 신뢰도
  engagement: 40
  // 기본 신뢰도
};
var ProfileValidators = {
  /**
   * 사용자명 유효성 검증 - 강화된 버전
   */
  isValidUsername(username) {
    if (typeof username !== "string" || username === null || username === void 0) {
      return false;
    }
    const trimmed = username.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "n/a" || trimmed === "null") {
      return false;
    }
    if (trimmed.length < 1) {
      return false;
    }
    if (trimmed.length > 15) {
      return false;
    }
    if (/^\d+$/.test(trimmed)) {
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return false;
    }
    if (/^_+$/.test(trimmed) || /^(.)\1{4,}$/.test(trimmed)) {
      return false;
    }
    if (/^user_\d+$/.test(trimmed)) {
      return false;
    }
    if (/^(account|test|temp|demo|fake)_\d+$/i.test(trimmed)) {
      return false;
    }
    return true;
  },
  /**
   * 표시명 유효성 검증 - 강화된 버전
   */
  isValidDisplayName(displayName) {
    if (typeof displayName !== "string" || displayName === null || displayName === void 0) {
      return false;
    }
    const trimmed = displayName.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "n/a" || trimmed === "null" || trimmed.toLowerCase() === "undefined" || trimmed === "---") {
      return false;
    }
    if (trimmed.length < 1) {
      return false;
    }
    if (trimmed.length > 50) {
      return false;
    }
    if (/^[\d\s\-_\.@#$%^&*()]+$/.test(trimmed)) {
      return false;
    }
    if (/^(.)\1{6,}$/.test(trimmed) || /(\w+\s*){4,}\1/.test(trimmed)) {
      return false;
    }
    const specialCharCount = (trimmed.match(/[^\w\s가-힣]/g) || []).length;
    if (specialCharCount > trimmed.length * 0.5) {
      return false;
    }
    if (/^User \d+$/.test(trimmed)) {
      return false;
    }
    if (/^(Account|Test|Demo|Fake|Temp|Sample) \d+$/i.test(trimmed)) {
      return false;
    }
    return true;
  },
  /**
   * 프로필 이미지 URL 유효성 검증 - 강화된 버전
   */
  isValidProfileImageUrl(url) {
    if (typeof url !== "string" || url === null || url === void 0) {
      return false;
    }
    const trimmed = url.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "n/a" || trimmed === "null" || trimmed === "#" || trimmed === "undefined") {
      return false;
    }
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return false;
    }
    try {
      const urlObj = new URL(trimmed);
      const validImageHosts = [
        "pbs.twimg.com",
        // Twitter 공식 이미지
        "abs.twimg.com",
        // Twitter 공식 이미지
        "images.unsplash.com",
        // Unsplash
        "cdn.discordapp.com",
        // Discord CDN
        "i.imgur.com",
        // Imgur
        "media.giphy.com",
        // Giphy
        "avatars.githubusercontent.com",
        // GitHub 아바타
        "lh3.googleusercontent.com"
        // Google 이미지
      ];
      const hostname = urlObj.hostname.toLowerCase();
      const isKnownHost = validImageHosts.some((host) => hostname.includes(host));
      if (!isKnownHost) {
        const path = urlObj.pathname.toLowerCase();
        const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(path);
        if (!hasImageExtension && !path.includes("/avatar") && !path.includes("/profile")) {
          return false;
        }
      }
      if (trimmed.length > 2048) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },
  /**
   * 팔로워 수 유효성 검증 - 강화된 버전
   */
  isValidFollowersCount(count) {
    if (typeof count !== "number") {
      return false;
    }
    if (count === null || count === void 0 || Number.isNaN(count) || !Number.isFinite(count)) {
      return false;
    }
    if (count < 0 || Object.is(count, -0)) {
      return false;
    }
    if (!Number.isInteger(count)) {
      return false;
    }
    if (count > 1e9) {
      return false;
    }
    if (count > 1e7 && count % 1e6 === 0) {
      return false;
    }
    return true;
  },
  /**
   * 일반적인 필드 유효성 검증 - 강화된 버전
   */
  isValidField(value) {
    if (value === null || value === void 0) {
      return false;
    }
    if (typeof value === "string" && value.trim() === "") {
      return false;
    }
    if (typeof value === "string" && value.toLowerCase() === "unknown") {
      return false;
    }
    return true;
  }
};

// src/services/centralized-profile-manager.ts
var CentralizedProfileManager = class {
  constructor(dynamoClient, config, cacheService, apiOptimizer) {
    this.dynamoClient = dynamoClient;
    this.config = config;
    this.cacheService = cacheService;
    this.apiOptimizer = apiOptimizer;
  }
  /**
   * 🎯 핵심 메서드: 인게이지먼트 데이터에서 사용자 프로필 통합 처리
   * 
   * @param engagements 인게이지먼트 데이터 배열
   * @param existingProfiles 기존 프로필 데이터 (선택적)
   * @returns 통합된 사용자 프로필 맵
   */
  async processUserProfiles(engagements, existingProfiles) {
    const startTime = Date.now();
    const stats = {
      totalProcessed: 0,
      cacheHits: 0,
      apiCalls: 0,
      qualityImprovements: 0,
      averageQualityScore: 0
    };
    const timing = {
      cacheTime: 0,
      apiTime: 0,
      mergeTime: 0,
      totalTime: 0
    };
    try {
      const userIds = this.extractUniqueUsers(engagements);
      stats.totalProcessed = userIds.length;
      console.log(`\u{1F465} [PROFILE_MANAGER] \uCC98\uB9AC \uC2DC\uC791: ${userIds.length}\uBA85\uC758 \uC0AC\uC6A9\uC790`);
      const cacheStartTime = Date.now();
      let cachedProfiles = /* @__PURE__ */ new Map();
      if (this.cacheService) {
        cachedProfiles = await this.cacheService.batchGetProfiles(userIds);
        stats.cacheHits = cachedProfiles.size;
      }
      timing.cacheTime = Date.now() - cacheStartTime;
      const needsAPIUpdate = this.identifyAPINeeds(userIds, cachedProfiles);
      const apiStartTime = Date.now();
      let apiData = /* @__PURE__ */ new Map();
      if (this.apiOptimizer && needsAPIUpdate.length > 0) {
        apiData = await this.apiOptimizer.batchGetUsers(needsAPIUpdate);
        stats.apiCalls = apiData.size;
      }
      timing.apiTime = Date.now() - apiStartTime;
      const mergeStartTime = Date.now();
      const profiles = /* @__PURE__ */ new Map();
      let totalQualityScore = 0;
      for (const userId of userIds) {
        const engagementData = this.extractEngagementData(userId, engagements);
        const cachedData = cachedProfiles.get(userId);
        const existingData = existingProfiles?.get(userId);
        const apiData_user = apiData.get(userId);
        const mergeResult = this.mergeProfileData(
          engagementData,
          cachedData,
          existingData,
          apiData_user
        );
        profiles.set(userId, mergeResult.profile);
        totalQualityScore += mergeResult.profile.qualityScore;
        if (mergeResult.hasImprovement) {
          stats.qualityImprovements++;
          console.log(`\u{1F4C8} [PROFILE_MANAGER] \uD488\uC9C8 \uD5A5\uC0C1: ${userId} (+${mergeResult.qualityImprovement}\uC810, \uD544\uB4DC: ${mergeResult.improvedFields.join(", ")})`);
        }
        if (this.cacheService && mergeResult.profile.qualityScore >= PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
          await this.cacheService.setCachedProfile(mergeResult.profile);
        }
      }
      timing.mergeTime = Date.now() - mergeStartTime;
      timing.totalTime = Date.now() - startTime;
      stats.averageQualityScore = userIds.length > 0 ? totalQualityScore / userIds.length : 0;
      console.log(`\u2705 [PROFILE_MANAGER] \uCC98\uB9AC \uC644\uB8CC: ${userIds.length}\uBA85, \uD3C9\uADE0 \uD488\uC9C8 ${stats.averageQualityScore.toFixed(1)}\uC810, ${timing.totalTime}ms`);
      console.log(`\u{1F4CA} [PROFILE_MANAGER] \uD1B5\uACC4: \uCE90\uC2DC ${stats.cacheHits}\uAC1C, API ${stats.apiCalls}\uAC1C, \uAC1C\uC120 ${stats.qualityImprovements}\uAC1C`);
      return {
        profiles,
        stats,
        timing
      };
    } catch (error) {
      console.error(`\u274C [PROFILE_MANAGER] \uCC98\uB9AC \uC2E4\uD328:`, error);
      const fallbackProfiles = /* @__PURE__ */ new Map();
      const userIds = this.extractUniqueUsers(engagements);
      for (const userId of userIds) {
        const engagementData = this.extractEngagementData(userId, engagements);
        fallbackProfiles.set(userId, this.createFallbackProfile(engagementData));
      }
      return {
        profiles: fallbackProfiles,
        stats: { ...stats, totalProcessed: fallbackProfiles.size },
        timing: { ...timing, totalTime: Date.now() - startTime }
      };
    }
  }
  /**
   * 🔄 프로필 데이터 병합: 모든 소스의 데이터를 통합
   * 
   * @param engagement 인게이지먼트에서 추출한 프로필 데이터
   * @param cached 캐시된 프로필 데이터
   * @param existing 기존 스코어 데이터
   * @param apiData Twitter API 데이터
   * @returns 병합 결과
   */
  mergeProfileData(engagement, cached, existing, apiData) {
    const originalQuality = cached?.qualityScore || 0;
    const improvedFields = [];
    const profile = {
      userId: engagement?.userId || cached?.userId || existing?.userId || apiData?.id || "",
      username: "",
      displayName: "",
      profileImageUrl: void 0,
      followersCount: void 0,
      dominantLanguage: void 0,
      // ✅ dominantLanguage 필드 추가
      qualityScore: 0,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      lastAPIUpdate: apiData ? (/* @__PURE__ */ new Date()).toISOString() : cached?.lastAPIUpdate || existing?.followersCountUpdatedAt || "",
      sources: this.determineSources(engagement, cached, existing, apiData),
      completeness: {
        hasValidUsername: false,
        hasValidDisplayName: false,
        hasProfileImage: false,
        hasFollowersCount: false
      },
      ttl: Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60,
      // 7일
      version: "v2"
    };
    const usernameResult = this.selectBestField("username", engagement, cached, existing, apiData);
    if (usernameResult.improved) improvedFields.push("username");
    profile.username = usernameResult.value;
    const displayNameResult = this.selectBestField("displayName", engagement, cached, existing, apiData);
    if (displayNameResult.improved) improvedFields.push("displayName");
    profile.displayName = displayNameResult.value;
    const profileImageResult = this.selectBestField("profileImageUrl", engagement, cached, existing, apiData);
    if (profileImageResult.improved) improvedFields.push("profileImageUrl");
    profile.profileImageUrl = profileImageResult.value;
    const followersResult = this.selectBestField("followersCount", engagement, cached, existing, apiData);
    if (followersResult.improved) improvedFields.push("followersCount");
    profile.followersCount = followersResult.value;
    const dominantLanguageResult = this.selectBestField("dominantLanguage", engagement, cached, existing, apiData);
    if (dominantLanguageResult.improved) improvedFields.push("dominantLanguage");
    profile.dominantLanguage = dominantLanguageResult.value;
    profile.qualityScore = this.calculateQualityScore(profile);
    profile.completeness = this.calculateCompleteness(profile);
    const qualityImprovement = profile.qualityScore - originalQuality;
    const hasImprovement = improvedFields.length > 0 || qualityImprovement > 0;
    return {
      profile,
      hasImprovement,
      improvedFields,
      qualityImprovement
    };
  }
  /**
   * 🥇 최적 필드 값 선택: 품질과 신뢰도 기반 - 강화된 버전
   */
  selectBestField(fieldName, engagement, cached, existing, apiData) {
    const candidates = [];
    const originalValue = cached?.[fieldName] || this.getExistingFieldValue(existing, fieldName) || (engagement ? engagement[fieldName] : void 0);
    const apiValue = this.getAPIFieldValue(apiData, fieldName);
    if (apiValue !== null && apiValue !== void 0 && this.isValidFieldValue(fieldName, apiValue)) {
      candidates.push({
        value: apiValue,
        score: SOURCE_RELIABILITY_SCORES.direct_api,
        source: "direct_api"
      });
      console.log(`\u{1F4E1} [PROFILE_SELECT] ${fieldName}: API \uAC12 \uD6C4\uBCF4 \uCD94\uAC00 - ${apiValue} (\uC810\uC218: ${SOURCE_RELIABILITY_SCORES.direct_api})`);
    } else if (apiData && apiValue === null) {
      console.log(`\u26A0\uFE0F [PROFILE_SELECT] ${fieldName}: API \uC751\uB2F5\uC5D0\uC11C null \uAC12 \uAC10\uC9C0 - \uD6C4\uBCF4\uC5D0\uC11C \uC81C\uC678`);
    }
    if (cached && this.isValidFieldValue(fieldName, cached[fieldName])) {
      candidates.push({
        value: cached[fieldName],
        score: SOURCE_RELIABILITY_SCORES.cache,
        source: "cache"
      });
      console.log(`\u{1F4BE} [PROFILE_SELECT] ${fieldName}: \uCE90\uC2DC \uAC12 \uD6C4\uBCF4 \uCD94\uAC00 - ${cached[fieldName]} (\uC810\uC218: ${SOURCE_RELIABILITY_SCORES.cache})`);
    }
    const existingValue = this.getExistingFieldValue(existing, fieldName);
    if (this.isValidFieldValue(fieldName, existingValue)) {
      candidates.push({
        value: existingValue,
        score: SOURCE_RELIABILITY_SCORES.existing_score,
        source: "existing_score"
      });
      console.log(`\u{1F5C4}\uFE0F [PROFILE_SELECT] ${fieldName}: \uAE30\uC874 \uAC12 \uD6C4\uBCF4 \uCD94\uAC00 - ${existingValue} (\uC810\uC218: ${SOURCE_RELIABILITY_SCORES.existing_score})`);
    }
    if (engagement && this.isValidFieldValue(fieldName, engagement[fieldName])) {
      candidates.push({
        value: engagement[fieldName],
        score: SOURCE_RELIABILITY_SCORES.engagement,
        source: "engagement"
      });
      console.log(`\u{1F4CA} [PROFILE_SELECT] ${fieldName}: \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8 \uAC12 \uD6C4\uBCF4 \uCD94\uAC00 - ${engagement[fieldName]} (\uC810\uC218: ${SOURCE_RELIABILITY_SCORES.engagement})`);
    }
    if (candidates.length === 0) {
      if (originalValue && originalValue !== "Unknown" && originalValue !== "unknown" && originalValue !== null) {
        console.log(`\u{1F6E1}\uFE0F [SAFE_PRESERVE] ${fieldName}: \uAE30\uC874 \uB370\uC774\uD130 \uC808\uB300 \uBCF4\uC874: ${originalValue}`);
        return {
          value: originalValue,
          improved: false
        };
      }
      console.log(`\u26A0\uFE0F [SAFE_PRESERVE] ${fieldName}: \uAE30\uC874 \uB370\uC774\uD130 \uC5C6\uC74C - undefined \uBC18\uD658\uC73C\uB85C \uB370\uC774\uD130 \uC190\uC2E4 \uBC29\uC9C0`);
      return {
        value: void 0,
        improved: false
      };
    }
    const sortedCandidates = candidates.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      const aIsImprovement = this.isValueImprovement(originalValue, a.value);
      const bIsImprovement = this.isValueImprovement(originalValue, b.value);
      if (aIsImprovement && !bIsImprovement) return -1;
      if (!aIsImprovement && bIsImprovement) return 1;
      return 0;
    });
    const best = sortedCandidates[0];
    const improved = best.value !== originalValue && this.isValueImprovement(originalValue, best.value);
    console.log(`\u2705 [PROFILE_SELECT] ${fieldName}: \uCD5C\uC885 \uC120\uD0DD - ${best.value} (\uC18C\uC2A4: ${best.source}, \uAC1C\uC120: ${improved ? "Y" : "N"})`);
    return {
      value: best.value,
      improved
    };
  }
  /**
   * 📊 품질 점수 계산 (0-100)
   */
  calculateQualityScore(profile) {
    let score = 0;
    if (ProfileValidators.isValidUsername(profile.username)) {
      score += FIELD_QUALITY_WEIGHTS.username;
    }
    if (ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += FIELD_QUALITY_WEIGHTS.displayName;
    }
    if (ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += FIELD_QUALITY_WEIGHTS.profileImageUrl;
    }
    if (ProfileValidators.isValidFollowersCount(profile.followersCount)) {
      score += FIELD_QUALITY_WEIGHTS.followersCount;
    }
    return Math.min(100, score);
  }
  /**
   * 📈 완전성 지표 계산
   */
  calculateCompleteness(profile) {
    return {
      hasValidUsername: ProfileValidators.isValidUsername(profile.username),
      hasValidDisplayName: ProfileValidators.isValidDisplayName(profile.displayName),
      hasProfileImage: ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl),
      hasFollowersCount: ProfileValidators.isValidFollowersCount(profile.followersCount)
    };
  }
  /**
   * 👥 유니크 사용자 추출
   */
  extractUniqueUsers(engagements) {
    const userIds = /* @__PURE__ */ new Set();
    for (const engagement of engagements) {
      if (engagement.engaging_user_id) {
        userIds.add(engagement.engaging_user_id);
      }
    }
    return Array.from(userIds);
  }
  /**
   * 📝 인게이지먼트에서 프로필 데이터 추출
   */
  extractEngagementData(userId, engagements) {
    const userEngagement = engagements.find((e) => e.engaging_user_id === userId);
    if (!userEngagement) {
      return { userId };
    }
    return {
      userId,
      username: userEngagement.engaging_username,
      displayName: userEngagement.engaging_display_name,
      profileImageUrl: userEngagement.engaging_profile_image_url,
      followersCount: userEngagement.engaging_followers_count
    };
  }
  /**
   * 🔍 API 업데이트가 필요한 사용자 식별
   */
  identifyAPINeeds(userIds, cachedProfiles) {
    const needsUpdate = [];
    for (const userId of userIds) {
      const cached = cachedProfiles.get(userId);
      if (!cached || cached.qualityScore < PROFILE_QUALITY_THRESHOLDS.HIGH_QUALITY) {
        needsUpdate.push(userId);
      }
    }
    return needsUpdate;
  }
  /**
   * 🏷️ 데이터 소스 결정
   */
  determineSources(engagement, cached, existing, apiData) {
    const sources = [];
    if (apiData) sources.push("direct_api");
    if (cached) sources.push("cache");
    if (existing) sources.push("existing_score");
    if (engagement) sources.push("engagement");
    return sources;
  }
  /**
   * 🔧 유틸리티 메서드들
   */
  getAPIFieldValue(apiData, fieldName) {
    if (!apiData) return void 0;
    switch (fieldName) {
      case "username":
        return apiData.username;
      case "displayName":
        return apiData.name;
      case "profileImageUrl":
        return apiData.profile_image_url;
      case "followersCount":
        return apiData.public_metrics?.followers_count;
      default:
        return void 0;
    }
  }
  getExistingFieldValue(existing, fieldName) {
    if (!existing) return void 0;
    switch (fieldName) {
      case "username":
        return existing.username;
      case "displayName":
        return existing.displayName;
      case "profileImageUrl":
        return existing.profileImageUrl;
      case "followersCount":
        return existing.followersCount;
      case "dominantLanguage":
        return existing.dominantLanguage;
      // ✅ dominantLanguage case 추가
      default:
        return void 0;
    }
  }
  isValidFieldValue(fieldName, value) {
    if (value === null || value === void 0 || value === "") {
      return false;
    }
    if (typeof value === "string" && value.toLowerCase() === "unknown") {
      return false;
    }
    switch (fieldName) {
      case "username":
        return ProfileValidators.isValidUsername(value);
      case "displayName":
        return ProfileValidators.isValidDisplayName(value);
      case "profileImageUrl":
        return ProfileValidators.isValidProfileImageUrl(value);
      case "followersCount":
        return ProfileValidators.isValidFollowersCount(value);
      default:
        return ProfileValidators.isValidField(value);
    }
  }
  isValueImprovement(oldValue, newValue) {
    if (!oldValue || oldValue === "Unknown" || oldValue === "unknown") {
      return true;
    }
    if (typeof newValue === "string" && typeof oldValue === "string") {
      return newValue.length > oldValue.length;
    }
    if (typeof newValue === "number" && typeof oldValue === "number") {
      return newValue > oldValue;
    }
    return false;
  }
  getDefaultValue(fieldName) {
    console.log(`\u26A0\uFE0F [SAFE_DEFAULT] ${fieldName}: \uAE30\uBCF8\uAC12 \uC694\uCCAD - undefined \uBC18\uD658\uC73C\uB85C \uAE30\uC874 \uB370\uC774\uD130 \uBCF4\uC874`);
    return void 0;
  }
  /**
   * 🆘 폴백 프로필 생성
   */
  createFallbackProfile(engagement) {
    const safeDisplayName = engagement.displayName || engagement.username || engagement.userId;
    console.log(`\u{1F6E1}\uFE0F [SAFE_FALLBACK] \uC0AC\uC6A9\uC790 ${engagement.userId}: \uC548\uC804\uD55C Fallback \uD504\uB85C\uD544 \uC0DD\uC131, displayName=${safeDisplayName}`);
    return {
      userId: engagement.userId,
      username: engagement.username || engagement.userId,
      displayName: safeDisplayName,
      profileImageUrl: engagement.profileImageUrl,
      followersCount: engagement.followersCount,
      qualityScore: this.calculateQualityScore({
        username: engagement.username || engagement.userId,
        displayName: safeDisplayName,
        profileImageUrl: engagement.profileImageUrl,
        followersCount: engagement.followersCount
      }),
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      lastAPIUpdate: "",
      sources: ["engagement"],
      completeness: {
        hasValidUsername: ProfileValidators.isValidUsername(engagement.username),
        hasValidDisplayName: ProfileValidators.isValidDisplayName(engagement.displayName),
        hasProfileImage: ProfileValidators.isValidProfileImageUrl(engagement.profileImageUrl),
        hasFollowersCount: ProfileValidators.isValidFollowersCount(engagement.followersCount)
      },
      ttl: Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60,
      version: "v2"
    };
  }
  /**
   * 🔥 Phase 2.3.2: 품질 기반 프로필 후보자 조회
   * 
   * 정기적 프로필 보강을 위해 저품질 프로필 사용자들을 식별합니다.
   * @param criteria 선별 기준
   * @returns 품질 개선 후보자 목록
   */
  async getProfileQualityCandidates(criteria) {
    console.log(`\u{1F3AF} [PROFILE_CANDIDATES] \uD488\uC9C8 \uD6C4\uBCF4\uC790 \uC870\uD68C \uC2DC\uC791:`, criteria);
    try {
      const QueryCommand5 = require("@aws-sdk/lib-dynamodb").QueryCommand;
      const ScanCommand3 = require("@aws-sdk/lib-dynamodb").ScanCommand;
      const candidates = [];
      const scanCommand = new ScanCommand3({
        TableName: this.config.cumulativeTableName,
        FilterExpression: "sk = :sk",
        ExpressionAttributeValues: {
          ":sk": "CUMULATIVE_SCORE"
        },
        Limit: criteria.limit || 1e3
      });
      const result = await this.dynamoClient.send(scanCommand);
      for (const item of result.Items || []) {
        const qualityScore = this.calculateProfileQuality({
          username: item.username,
          displayName: item.displayName,
          profileImageUrl: item.profileImageUrl,
          followersCount: item.followersCount
        });
        const lastUpdated = item.lastUpdated || item.lastModified || (/* @__PURE__ */ new Date(0)).toISOString();
        if (criteria.maxQualityScore && qualityScore > criteria.maxQualityScore) {
          continue;
        }
        if (criteria.maxLastUpdated && lastUpdated > criteria.maxLastUpdated) {
          continue;
        }
        candidates.push({
          userId: item.pk.replace("USER#", ""),
          qualityScore,
          lastUpdated
        });
      }
      candidates.sort((a, b) => a.qualityScore - b.qualityScore);
      console.log(`\u2705 [PROFILE_CANDIDATES] ${candidates.length}\uBA85\uC758 \uD6C4\uBCF4\uC790 \uC120\uBCC4 \uC644\uB8CC`);
      return candidates.slice(0, criteria.limit || 1e3);
    } catch (error) {
      console.error(`\u274C [PROFILE_CANDIDATES] \uC870\uD68C \uC2E4\uD328:`, error);
      return [];
    }
  }
  /**
   * 🔄 Phase 2.3.2: 최근 활동 사용자 조회
   * 
   * 최근 활동한 사용자들의 프로필을 주기적으로 갱신하기 위해 조회합니다.
   * @param criteria 조회 기준
   * @returns 최근 활동 사용자 목록
   */
  async getRecentlyActiveUsers(criteria) {
    console.log(`\u{1F504} [ACTIVE_USERS] \uCD5C\uADFC \uD65C\uB3D9 \uC0AC\uC6A9\uC790 \uC870\uD68C \uC2DC\uC791:`, criteria);
    try {
      const ScanCommand3 = require("@aws-sdk/lib-dynamodb").ScanCommand;
      const sinceTimestamp = new Date(Date.now() - (criteria.sinceHours || 24) * 60 * 60 * 1e3).toISOString();
      const activeUsers = [];
      const scanCommand = new ScanCommand3({
        TableName: this.config.cumulativeTableName,
        FilterExpression: "sk = :sk AND lastModified >= :since",
        ExpressionAttributeValues: {
          ":sk": "CUMULATIVE_SCORE",
          ":since": sinceTimestamp
        },
        Limit: criteria.limit || 500
      });
      const result = await this.dynamoClient.send(scanCommand);
      for (const item of result.Items || []) {
        const qualityScore = this.calculateProfileQuality({
          username: item.username,
          displayName: item.displayName,
          profileImageUrl: item.profileImageUrl,
          followersCount: item.followersCount
        });
        if (criteria.minQualityScore && qualityScore < criteria.minQualityScore) {
          continue;
        }
        activeUsers.push({
          userId: item.pk.replace("USER#", ""),
          qualityScore,
          lastActivity: item.lastModified || item.lastUpdated || (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      activeUsers.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
      console.log(`\u2705 [ACTIVE_USERS] ${activeUsers.length}\uBA85\uC758 \uD65C\uB3D9 \uC0AC\uC6A9\uC790 \uC870\uD68C \uC644\uB8CC`);
      return activeUsers.slice(0, criteria.limit || 500);
    } catch (error) {
      console.error(`\u274C [ACTIVE_USERS] \uC870\uD68C \uC2E4\uD328:`, error);
      return [];
    }
  }
  /**
   * 🚀 Phase 2.3.2: 배치 프로필 보강 처리
   * 
   * 다수의 사용자 프로필을 한번에 보강 처리합니다.
   * @param userIds 대상 사용자 ID 목록
   * @param options 보강 옵션
   * @returns 보강 처리 결과
   */
  async enhanceProfilesBatch(userIds, options) {
    const stats = {
      processed: 0,
      improved: 0,
      totalQualityAfter: 0,
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      improvements: {
        username: 0,
        displayName: 0,
        profileImage: 0,
        followersCount: 0
      }
    };
    console.log(`\u{1F680} [BATCH_ENHANCE] ${userIds.length}\uBA85 \uBC30\uCE58 \uBCF4\uAC15 \uC2DC\uC791`);
    try {
      const QueryCommand5 = require("@aws-sdk/lib-dynamodb").QueryCommand;
      const UpdateCommand2 = require("@aws-sdk/lib-dynamodb").UpdateCommand;
      for (const userId of userIds) {
        try {
          const queryCommand = new QueryCommand5({
            TableName: this.config.cumulativeTableName,
            KeyConditionExpression: "pk = :pk AND sk = :sk",
            ExpressionAttributeValues: {
              ":pk": `USER#${userId}`,
              ":sk": "CUMULATIVE_SCORE"
            }
          });
          const result2 = await this.dynamoClient.send(queryCommand);
          const currentProfile = result2.Items?.[0];
          if (!currentProfile) {
            console.log(`\u26A0\uFE0F [BATCH_ENHANCE] ${userId} - \uD504\uB85C\uD544 \uC5C6\uC74C, \uAC74\uB108\uB6F0\uAE30`);
            continue;
          }
          const currentQuality = this.calculateProfileQuality({
            username: currentProfile.username,
            displayName: currentProfile.displayName,
            profileImageUrl: currentProfile.profileImageUrl,
            followersCount: currentProfile.followersCount
          });
          const qualityThreshold = options?.qualityThreshold || 50;
          if (!options?.forceRefresh && currentQuality >= qualityThreshold) {
            console.log(`\u2705 [BATCH_ENHANCE] ${userId} - \uD488\uC9C8 \uCDA9\uC871 (${currentQuality}\uC810), \uAC74\uB108\uB6F0\uAE30`);
            stats.processed++;
            stats.totalQualityAfter += currentQuality;
            continue;
          }
          console.log(`\u{1F6AB} [NO_FAKE] \uC0AC\uC6A9\uC790 ${userId}: \uAC00\uC9DC \uD504\uB85C\uD544 \uC0DD\uC131 \uBE44\uD65C\uC131\uD654, \uAE30\uC874 \uB370\uC774\uD130 \uC720\uC9C0`);
          const enhancedProfile = currentProfile;
          stats.cacheHits++;
          const enhancedQuality = this.calculateProfileQuality(enhancedProfile);
          if (enhancedQuality > currentQuality) {
            if (enhancedProfile.username !== currentProfile.username) stats.improvements.username++;
            if (enhancedProfile.displayName !== currentProfile.displayName) stats.improvements.displayName++;
            if (enhancedProfile.profileImageUrl !== currentProfile.profileImageUrl) stats.improvements.profileImage++;
            if (enhancedProfile.followersCount !== currentProfile.followersCount) stats.improvements.followersCount++;
            console.log(`\u{1F3AF} [BATCH_ENHANCE] ${userId} - \uD488\uC9C8 \uAC1C\uC120: ${currentQuality}\u2192${enhancedQuality}\uC810`);
            stats.improved++;
          }
          stats.processed++;
          stats.totalQualityAfter += enhancedQuality;
          await new Promise((resolve) => setTimeout(resolve, 10));
        } catch (error) {
          console.error(`\u274C [BATCH_ENHANCE] ${userId} \uCC98\uB9AC \uC2E4\uD328:`, error);
          stats.errors++;
        }
      }
      const result = {
        processed: stats.processed,
        improved: stats.improved,
        averageQualityAfter: stats.processed > 0 ? stats.totalQualityAfter / stats.processed : 0,
        apiCalls: stats.apiCalls,
        cacheHits: stats.cacheHits,
        errors: stats.errors,
        improvements: stats.improvements
      };
      console.log(`\u2705 [BATCH_ENHANCE] \uC644\uB8CC:`, result);
      return result;
    } catch (error) {
      console.error(`\u274C [BATCH_ENHANCE] \uBC30\uCE58 \uCC98\uB9AC \uC2E4\uD328:`, error);
      return {
        processed: stats.processed,
        improved: 0,
        averageQualityAfter: 0,
        apiCalls: 0,
        cacheHits: 0,
        errors: userIds.length,
        improvements: {}
      };
    }
  }
  /**
   * 🎭 프로필 보강 시뮬레이션 (테스트용)
   * 실제 API 호출 없이 프로필 개선 효과를 시뮬레이션합니다.
   */
  async simulateProfileEnhancement(currentProfile, userId) {
    console.log(`\u{1F6AB} [DEPRECATED] simulateProfileEnhancement \uBE44\uD65C\uC131\uD654\uB428 - \uC2E4\uC81C \uD504\uB85C\uD544 \uB370\uC774\uD130\uB9CC \uC0AC\uC6A9: ${userId}`);
    const enhanced = {
      userId,
      username: currentProfile.username,
      // 가짜 이름 생성 안 함
      displayName: currentProfile.displayName,
      // 가짜 이름 생성 안 함
      profileImageUrl: currentProfile.profileImageUrl,
      // 실제 이미지만 사용
      followersCount: currentProfile.followersCount,
      // 실제 팔로워 수만 사용
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      sources: ["preserved_data"],
      // 기존 데이터 보존
      qualityScore: 75,
      lastAPIUpdate: (/* @__PURE__ */ new Date()).toISOString(),
      completeness: 90,
      ttl: Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60,
      version: "v2"
    };
    return enhanced;
  }
  /**
   * 📊 프로필 품질 점수 계산
   */
  calculateProfileQuality(profile) {
    let score = 0;
    if (ProfileValidators.isValidUsername(profile.username)) {
      score += FIELD_QUALITY_WEIGHTS.username;
    }
    if (ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += FIELD_QUALITY_WEIGHTS.displayName;
    }
    if (ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += FIELD_QUALITY_WEIGHTS.profileImageUrl;
    }
    if (ProfileValidators.isValidFollowersCount(profile.followersCount)) {
      score += FIELD_QUALITY_WEIGHTS.followersCount;
    }
    return score;
  }
};

// src/services/profile-cache-service.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_util_dynamodb = require("@aws-sdk/util-dynamodb");
var ProfileCacheService = class {
  constructor(dynamodb, tableName = process.env.USER_PROFILE_TABLE_NAME || "nasun-user-profiles-v2") {
    this.dynamodb = dynamodb;
    this.tableName = tableName;
  }
  /**
   * 🔄 배치 프로필 조회
   * 
   * @param userIds 조회할 사용자 ID 배열
   * @returns 캐시된 프로필 맵
   */
  async batchGetProfiles(userIds) {
    const results = /* @__PURE__ */ new Map();
    if (userIds.length === 0) {
      return results;
    }
    try {
      const batches = this.chunkArray(userIds, 100);
      console.log(`\u{1F4E6} [CACHE] \uBC30\uCE58 \uC870\uD68C \uC2DC\uC791: ${userIds.length}\uAC1C \uC0AC\uC6A9\uC790, ${batches.length}\uAC1C \uBC30\uCE58`);
      for (const [batchIndex, batch] of batches.entries()) {
        const keys = batch.map((userId) => ({
          pk: `USER_PROFILE#${userId}`,
          sk: "LATEST"
        }));
        try {
          const response = await this.dynamodb.send(new import_client_dynamodb.BatchGetItemCommand({
            RequestItems: {
              [this.tableName]: {
                Keys: keys.map((key) => (0, import_util_dynamodb.marshall)(key))
              }
            }
          }));
          if (response.Responses && response.Responses[this.tableName]) {
            let validCount = 0;
            let expiredCount = 0;
            for (const item of response.Responses[this.tableName]) {
              const profile = (0, import_util_dynamodb.unmarshall)(item);
              if (!profile.qualityScore) profile.qualityScore = 50;
              if (!profile.completeness) {
                profile.completeness = {
                  hasValidUsername: !!profile.username,
                  hasValidDisplayName: !!profile.displayName,
                  hasProfileImage: !!profile.profileImageUrl,
                  hasFollowersCount: !!profile.followersCount
                };
              }
              if (!profile.sources) profile.sources = ["cache"];
              if (!profile.version) profile.version = "v2";
              if (this.isValidCache(profile)) {
                results.set(profile.userId, profile);
                validCount++;
              } else {
                expiredCount++;
                console.log(`\u23F0 [CACHE] \uB9CC\uB8CC\uB41C \uCE90\uC2DC: ${profile.userId} (TTL: ${profile.ttl})`);
              }
            }
            console.log(`\u{1F4E6} [CACHE] \uBC30\uCE58 ${batchIndex + 1}/${batches.length}: ${validCount}\uAC1C \uC720\uD6A8, ${expiredCount}\uAC1C \uB9CC\uB8CC`);
          }
        } catch (batchError) {
          console.error(`\u274C [CACHE] \uBC30\uCE58 ${batchIndex + 1} \uC870\uD68C \uC2E4\uD328:`, batchError);
        }
      }
      const hitRate = userIds.length > 0 ? (results.size / userIds.length * 100).toFixed(1) : "0";
      console.log(`\u{1F4CA} [CACHE] \uC870\uD68C \uC644\uB8CC: ${userIds.length}\uAC1C \uC694\uCCAD, ${results.size}\uAC1C \uD788\uD2B8 (${hitRate}%)`);
      return results;
    } catch (error) {
      console.error(`\u274C [CACHE] \uBC30\uCE58 \uC870\uD68C \uC804\uCCB4 \uC2E4\uD328:`, error);
      return results;
    }
  }
  /**
   * ✨ 고품질 프로필 캐시 저장
   * 
   * @param profile 저장할 프로필
   * @returns 저장 성공 여부
   */
  async setCachedProfile(profile) {
    try {
      if (profile.qualityScore < PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
        console.log(`\u{1F4C9} [CACHE] \uD488\uC9C8 \uBD80\uC871\uC73C\uB85C \uCE90\uC2DC \uAC74\uB108\uB6F0\uAE30: ${profile.userId} (\uC810\uC218: ${profile.qualityScore}/${PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY})`);
        return false;
      }
      const cached = {
        ...profile,
        pk: `USER_PROFILE#${profile.userId}`,
        sk: "LATEST"
      };
      await this.dynamodb.send(new import_client_dynamodb.PutItemCommand({
        TableName: this.tableName,
        Item: (0, import_util_dynamodb.marshall)(cached, { removeUndefinedValues: true })
      }));
      console.log(`\u{1F4BE} [CACHE] \uC800\uC7A5 \uC131\uACF5: ${profile.userId} (\uD488\uC9C8: ${profile.qualityScore}\uC810, TTL: ${new Date(profile.ttl * 1e3).toISOString()})`);
      return true;
    } catch (error) {
      console.error(`\u274C [CACHE] \uC800\uC7A5 \uC2E4\uD328: ${profile.userId}`, error);
      return false;
    }
  }
  /**
   * 🔄 배치 프로필 저장
   * 
   * @param profiles 저장할 프로필 배열
   * @returns 저장 결과 통계
   */
  async batchSetProfiles(profiles) {
    const stats = {
      totalAttempted: profiles.length,
      successCount: 0,
      failureCount: 0,
      skippedLowQuality: 0
    };
    console.log(`\u{1F4BE} [CACHE] \uBC30\uCE58 \uC800\uC7A5 \uC2DC\uC791: ${profiles.length}\uAC1C \uD504\uB85C\uD544`);
    for (const profile of profiles) {
      if (profile.qualityScore < PROFILE_QUALITY_THRESHOLDS.CACHE_WORTHY) {
        stats.skippedLowQuality++;
        continue;
      }
      const success = await this.setCachedProfile(profile);
      if (success) {
        stats.successCount++;
      } else {
        stats.failureCount++;
      }
    }
    console.log(`\u{1F4CA} [CACHE] \uBC30\uCE58 \uC800\uC7A5 \uC644\uB8CC: \uC131\uACF5 ${stats.successCount}\uAC1C, \uC2E4\uD328 ${stats.failureCount}\uAC1C, \uD488\uC9C8\uBD80\uC871 ${stats.skippedLowQuality}\uAC1C`);
    return stats;
  }
  /**
   * 📊 캐시 통계 조회
   */
  async getCacheStats(sampleUserIds = []) {
    if (sampleUserIds.length === 0) {
      return {
        totalSampled: 0,
        hitCount: 0,
        hitRate: 0,
        averageQuality: 0,
        expiredCount: 0
      };
    }
    const cached = await this.batchGetProfiles(sampleUserIds);
    const hitCount = cached.size;
    const hitRate = hitCount / sampleUserIds.length * 100;
    let totalQuality = 0;
    let expiredCount = 0;
    for (const profile of cached.values()) {
      totalQuality += profile.qualityScore;
      if (!this.isValidCache(profile)) {
        expiredCount++;
      }
    }
    const averageQuality = hitCount > 0 ? totalQuality / hitCount : 0;
    return {
      totalSampled: sampleUserIds.length,
      hitCount,
      hitRate: parseFloat(hitRate.toFixed(1)),
      averageQuality: parseFloat(averageQuality.toFixed(1)),
      expiredCount
    };
  }
  /**
   * 🕐 캐시 유효성 검증
   * 
   * @param profile 검증할 프로필
   * @returns 유효성 여부
   */
  isValidCache(profile) {
    const now = Math.floor(Date.now() / 1e3);
    if (profile.ttl <= now) {
      return false;
    }
    if (profile.version && !["1.0", "v2", "v3"].includes(profile.version)) {
      return false;
    }
    if (!profile.userId || !profile.username) {
      return false;
    }
    return true;
  }
  /**
   * 🔧 배열 청킹 유틸리티
   * 
   * @param array 청킹할 배열
   * @param size 청크 크기
   * @returns 청크 배열
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  /**
   * 🧹 만료된 캐시 정리 (관리용)
   * 
   * @param userIds 정리할 사용자 ID 배열 (선택적)
   */
  async cleanupExpiredCache(userIds) {
    console.log(`\u{1F9F9} [CACHE] \uB9CC\uB8CC \uCE90\uC2DC \uC815\uB9AC \uC2DC\uC791`);
    return {
      scanned: 0,
      deleted: 0
    };
  }
  /**
   * 🔍 캐시 품질 분석
   */
  async analyzeCacheQuality() {
    return {
      qualityDistribution: {
        "high (80+)": 0,
        "medium (50-79)": 0,
        "low (<50)": 0
      },
      completenessStats: {
        hasValidUsername: 0,
        hasValidDisplayName: 0,
        hasProfileImage: 0,
        hasFollowersCount: 0
      }
    };
  }
};

// src/services/twitter-api-optimizer.ts
var TwitterAPIOptimizer = class {
  // 1분 캐시
  constructor(twitterAPI, config = {
    batchSize: 100,
    // Twitter API 제한
    safetyMargin: 0.2,
    // 20% 안전 마진
    maxRetries: 3,
    // 최대 재시도
    retryDelay: 1e3,
    // 재시도 지연 (ms)
    // 🎯 Phase 2.3.1: 선별적 수집 설정
    priorityThreshold: 30,
    // 우선순위 점수 임계값 (낮춰서 더 많은 사용자 선택)
    qualityThreshold: PROFILE_QUALITY_THRESHOLDS.LOW,
    // 품질 개선 대상
    maxSelectiveBatch: 50
    // 선별적 수집 시 배치 크기
  }) {
    this.twitterAPI = twitterAPI;
    this.config = config;
    this.rateLimitCache = null;
    this.rateLimitCacheTime = 0;
    this.CACHE_DURATION = 60 * 1e3;
  }
  /**
   * 🎯 Phase 2.3.1: 선별적 프로필 수집 - 품질 점수 기반 우선순위 결정
   * 
   * @param userProfiles 사용자 프로필 정보 배열 (기존 품질 데이터 포함)
   * @returns 우선순위별로 정렬된 수집 대상 배열
   */
  async selectiveProfileCollection(userProfiles) {
    const startTime = Date.now();
    const priorities = [];
    console.log(`\u{1F3AF} [SELECTIVE] \uC120\uBCC4\uC801 \uD504\uB85C\uD544 \uC218\uC9D1 \uBD84\uC11D \uC2DC\uC791: ${userProfiles.length}\uBA85`);
    for (const profile of userProfiles) {
      const priority = this.calculateProfilePriority(profile);
      if (priority.priorityScore >= this.config.priorityThreshold) {
        priorities.push(priority);
      }
    }
    priorities.sort((a, b) => b.priorityScore - a.priorityScore);
    const duration = Date.now() - startTime;
    console.log(`\u{1F3AF} [SELECTIVE] \uBD84\uC11D \uC644\uB8CC: ${priorities.length}/${userProfiles.length}\uBA85 \uC120\uD0DD (${duration}ms)`);
    return priorities;
  }
  /**
   * 📊 프로필 우선순위 점수 계산
   * 
   * @param profile 사용자 프로필 정보
   * @returns 우선순위 정보
   */
  calculateProfilePriority(profile) {
    let priorityScore = 0;
    const reasons = [];
    let estimatedBenefit = 0;
    const currentQuality = profile.qualityScore || this.calculateBasicQualityScore(profile);
    if (currentQuality < this.config.qualityThreshold) {
      const qualityGap = this.config.qualityThreshold - currentQuality;
      priorityScore += Math.min(40, qualityGap * 0.8);
      reasons.push(`\uB0AE\uC740 \uD488\uC9C8 \uC810\uC218 (${currentQuality.toFixed(1)}\uC810)`);
      estimatedBenefit += qualityGap * 0.6;
    }
    let missingElements = 0;
    if (!profile.username || !ProfileValidators.isValidUsername(profile.username)) {
      missingElements++;
      priorityScore += 10;
      reasons.push("\uC0AC\uC6A9\uC790\uBA85 \uB204\uB77D/\uBB34\uD6A8");
      estimatedBenefit += 15;
    }
    if (!profile.displayName || !ProfileValidators.isValidDisplayName(profile.displayName)) {
      missingElements++;
      priorityScore += 8;
      reasons.push("\uD45C\uC2DC\uBA85 \uB204\uB77D/\uBB34\uD6A8");
      estimatedBenefit += 12;
    }
    if (!profile.profileImageUrl || !ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      missingElements++;
      priorityScore += 12;
      reasons.push("\uD504\uB85C\uD544 \uC774\uBBF8\uC9C0 \uB204\uB77D/\uBB34\uD6A8");
      estimatedBenefit += 18;
    }
    const followersCount = profile.followersCount || 0;
    if (followersCount > 1e4) {
      priorityScore += 20;
      reasons.push(`\uACE0\uD314\uB85C\uC6CC \uC0AC\uC6A9\uC790 (${followersCount.toLocaleString()}\uBA85)`);
      estimatedBenefit += 25;
    } else if (followersCount > 1e3) {
      priorityScore += 12;
      reasons.push(`\uC911\uD314\uB85C\uC6CC \uC0AC\uC6A9\uC790 (${followersCount.toLocaleString()}\uBA85)`);
      estimatedBenefit += 15;
    } else if (followersCount > 100) {
      priorityScore += 5;
      estimatedBenefit += 8;
    }
    if (profile.lastUpdated) {
      const daysSinceUpdate = (Date.now() - new Date(profile.lastUpdated).getTime()) / (24 * 60 * 60 * 1e3);
      if (daysSinceUpdate > 30) {
        priorityScore += 10;
        reasons.push(`\uC624\uB798\uB41C \uB370\uC774\uD130 (${Math.floor(daysSinceUpdate)}\uC77C \uC804)`);
        estimatedBenefit += 10;
      } else if (daysSinceUpdate > 7) {
        priorityScore += 5;
        estimatedBenefit += 5;
      }
    } else {
      priorityScore += 8;
      reasons.push("\uC5C5\uB370\uC774\uD2B8 \uAE30\uB85D \uC5C6\uC74C");
      estimatedBenefit += 12;
    }
    return {
      userId: profile.userId,
      priorityScore: Math.min(100, priorityScore),
      // 최대 100점
      reasons,
      estimatedBenefit,
      lastUpdated: profile.lastUpdated,
      currentQualityScore: currentQuality
    };
  }
  /**
   * 📈 API 비용 효과성 분석
   * 
   * @param priorities 우선순위 배열
   * @returns 비용 효과성 분석 결과
   */
  async analyzeCostEffectiveness(priorities) {
    const rateLimitStatus = await this.getRateLimitStatus();
    const availableAPICalls = Math.floor(rateLimitStatus.remaining * (1 - this.config.safetyMargin));
    const highPriorityUsers = priorities.filter((p) => p.priorityScore >= 80).length;
    const estimatedAPICalls = Math.ceil(priorities.length / this.config.maxSelectiveBatch);
    const expectedQualityImprovement = priorities.reduce((sum, p) => sum + p.estimatedBenefit, 0) / priorities.length;
    const costBenefitRatio = expectedQualityImprovement / Math.max(1, estimatedAPICalls);
    const recommendations = [];
    if (estimatedAPICalls > availableAPICalls) {
      recommendations.push(`API \uD560\uB2F9\uB7C9 \uBD80\uC871: ${estimatedAPICalls}\uD68C \uD544\uC694, ${availableAPICalls}\uD68C \uAC00\uB2A5`);
      recommendations.push(`\uC0C1\uC704 ${Math.floor(availableAPICalls * this.config.maxSelectiveBatch)}\uBA85\uB9CC \uCC98\uB9AC \uAD8C\uC7A5`);
    }
    if (costBenefitRatio > 15) {
      recommendations.push("\uB9E4\uC6B0 \uB192\uC740 \uD6A8\uACFC\uC131: \uC989\uC2DC \uCC98\uB9AC \uAD8C\uC7A5");
    } else if (costBenefitRatio > 10) {
      recommendations.push("\uB192\uC740 \uD6A8\uACFC\uC131: \uC6B0\uC120\uC21C\uC704 \uCC98\uB9AC \uAD8C\uC7A5");
    } else if (costBenefitRatio < 5) {
      recommendations.push("\uB0AE\uC740 \uD6A8\uACFC\uC131: \uCC98\uB9AC \uC5F0\uAE30 \uACE0\uB824");
    }
    if (highPriorityUsers > priorities.length * 0.3) {
      recommendations.push("\uACE0\uC6B0\uC120\uC21C\uC704 \uC0AC\uC6A9\uC790 \uB2E4\uC218: \uBC30\uCE58 \uD06C\uAE30 \uD655\uB300 \uACE0\uB824");
    }
    return {
      totalUsers: priorities.length,
      highPriorityUsers,
      estimatedAPICalls,
      expectedQualityImprovement,
      costBenefitRatio,
      recommendations
    };
  }
  /**
   * 🔧 Rate Limit 고려 배치 크기 조정
   * 
   * @param requestedUsers 요청된 사용자 수
   * @returns 조정된 배치 크기
   */
  async adjustBatchSizeForRateLimit(requestedUsers) {
    const rateLimitStatus = await this.getRateLimitStatus();
    const safeAPICalls = Math.floor(rateLimitStatus.remaining * (1 - this.config.safetyMargin));
    let recommendedBatchSize = this.config.maxSelectiveBatch;
    const estimatedBatches = Math.ceil(requestedUsers / recommendedBatchSize);
    const safetyRecommendations = [];
    if (rateLimitStatus.usagePercentage > 80) {
      recommendedBatchSize = Math.min(25, recommendedBatchSize);
      safetyRecommendations.push("Rate Limit 80% \uCD08\uACFC: \uC18C\uD615 \uBC30\uCE58 \uAD8C\uC7A5");
    } else if (rateLimitStatus.usagePercentage > 60) {
      recommendedBatchSize = Math.min(40, recommendedBatchSize);
      safetyRecommendations.push("Rate Limit 60% \uCD08\uACFC: \uC911\uD615 \uBC30\uCE58 \uAD8C\uC7A5");
    }
    if (estimatedBatches > safeAPICalls) {
      const maxProcessableUsers = safeAPICalls * recommendedBatchSize;
      safetyRecommendations.push(`API \uD560\uB2F9\uB7C9 \uCD08\uACFC: \uCD5C\uB300 ${maxProcessableUsers}\uBA85 \uCC98\uB9AC \uAC00\uB2A5`);
      return {
        recommendedBatchSize,
        maxProcessableUsers,
        estimatedBatches: safeAPICalls,
        safetyRecommendations
      };
    }
    return {
      recommendedBatchSize,
      maxProcessableUsers: requestedUsers,
      estimatedBatches,
      safetyRecommendations
    };
  }
  /**
   * 📊 기본 품질 점수 계산 (프로필 정보 기반)
   */
  calculateBasicQualityScore(profile) {
    let score = 0;
    if (profile.username && ProfileValidators.isValidUsername(profile.username)) {
      score += 25;
    }
    if (profile.displayName && ProfileValidators.isValidDisplayName(profile.displayName)) {
      score += 20;
    }
    if (profile.profileImageUrl && ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
      score += 30;
    }
    if (profile.followersCount !== void 0 && profile.followersCount >= 0) {
      score += 25;
    }
    return score;
  }
  /**
   * ⚡ 배치 사용자 조회 최적화
   * 
   * @param userIds 조회할 사용자 ID 배열
   * @returns 사용자 데이터 맵
   */
  async batchGetUsers(userIds) {
    const startTime = Date.now();
    const results = /* @__PURE__ */ new Map();
    if (userIds.length === 0) {
      return results;
    }
    try {
      const deduped = this.deduplicateUsers(userIds);
      const saved = userIds.length - deduped.length;
      console.log(`\u267B\uFE0F [API_OPT] \uC911\uBCF5 \uC81C\uAC70: ${userIds.length}\uAC1C \u2192 ${deduped.length}\uAC1C (${saved}\uAC1C \uC808\uC57D, ${(saved / userIds.length * 100).toFixed(1)}%)`);
      const plan = await this.planAPIUsage(deduped.length);
      if (!plan.canProceed) {
        console.warn(`\u26A0\uFE0F [API_OPT] Rate Limit \uBD80\uC871\uC73C\uB85C API \uD638\uCD9C \uAC74\uB108\uB6F0\uAE30: ${plan.reason}`);
        return results;
      }
      console.log(`\u{1F4CA} [API_OPT] \uC0AC\uC6A9 \uACC4\uD68D: ${deduped.length}\uAC1C \uC694\uCCAD, \uC608\uC0C1 \uBE44\uC6A9 ${plan.estimatedCost}\uD68C`);
      const batches = this.chunkArray(deduped, this.config.batchSize);
      let totalProcessed = 0;
      let totalErrors = 0;
      for (const [batchIndex, batch] of batches.entries()) {
        try {
          console.log(`\u{1F525} [API_OPT] \uBC30\uCE58 ${batchIndex + 1}/${batches.length}: ${batch.length}\uAC1C \uC0AC\uC6A9\uC790 \uC870\uD68C`);
          const batchResults = await this.processBatch(batch, batchIndex);
          for (const [userId, userData] of batchResults) {
            results.set(userId, userData);
          }
          totalProcessed += batchResults.size;
          if (batchIndex < batches.length - 1) {
            await this.delay(200);
          }
        } catch (batchError) {
          totalErrors++;
          console.error(`\u274C [API_OPT] \uBC30\uCE58 ${batchIndex + 1} \uC2E4\uD328:`, batchError);
          if (this.isRateLimitError(batchError)) {
            console.warn(`\u{1F6A8} [API_OPT] Rate Limit \uC5D0\uB7EC\uB85C \uC911\uB2E8: \uBC30\uCE58 ${batchIndex + 1}/${batches.length}`);
            break;
          }
        }
      }
      const duration = Date.now() - startTime;
      const efficiency = deduped.length > 0 ? (totalProcessed / deduped.length * 100).toFixed(1) : "0";
      console.log(`\u{1F3C1} [API_OPT] \uC644\uB8CC: ${totalProcessed}/${deduped.length}\uAC1C \uC131\uACF5 (${efficiency}%), ${totalErrors}\uAC1C \uBC30\uCE58 \uC2E4\uD328, ${duration}ms`);
      return results;
    } catch (error) {
      console.error(`\u274C [API_OPT] \uC804\uCCB4 \uC2E4\uD328:`, error);
      return results;
    }
  }
  /**
   * 📊 API 사용 계획 수립
   * 
   * @param estimatedUsers 예상 사용자 수
   * @returns API 사용 계획
   */
  async planAPIUsage(estimatedUsers) {
    try {
      const status = await this.getRateLimitStatus();
      const requiredBatches = Math.ceil(estimatedUsers / this.config.batchSize);
      const safeQuota = Math.floor(status.remaining * (1 - this.config.safetyMargin));
      const plan = {
        canProceed: safeQuota >= requiredBatches,
        estimatedCost: requiredBatches,
        remainingQuota: status.remaining,
        recommendedBatchSize: Math.min(this.config.batchSize, safeQuota * 50),
        // 50개씩 여유
        estimatedCompletionTime: requiredBatches * 300
        // 배치당 300ms 예상
      };
      if (!plan.canProceed) {
        plan.reason = `Rate Limit \uBD80\uC871: \uD544\uC694 ${requiredBatches}\uD68C, \uC548\uC804 \uC5EC\uC720\uBD84 ${safeQuota}\uD68C`;
      }
      console.log(`\u{1F4C8} [API_OPT] \uACC4\uD68D: ${plan.canProceed ? "\u2705 \uC9C4\uD589" : "\u274C \uC911\uB2E8"} - \uD544\uC694 ${requiredBatches}\uD68C, \uC5EC\uC720 ${safeQuota}\uD68C`);
      return plan;
    } catch (error) {
      console.error(`\u274C [API_OPT] \uACC4\uD68D \uC218\uB9BD \uC2E4\uD328:`, error);
      return {
        canProceed: false,
        estimatedCost: 0,
        remainingQuota: 0,
        recommendedBatchSize: 0,
        estimatedCompletionTime: 0,
        reason: "Rate Limit \uC0C1\uD0DC \uC870\uD68C \uC2E4\uD328"
      };
    }
  }
  /**
   * 🎯 사용자 중복 제거
   * 
   * @param userIds 사용자 ID 배열
   * @returns 중복 제거된 사용자 ID 배열
   */
  deduplicateUsers(userIds) {
    const unique = [...new Set(userIds.filter((id) => id && id.trim() !== ""))];
    return unique;
  }
  /**
   * 🔥 배치 처리
   * 
   * @param batch 처리할 사용자 ID 배치
   * @param batchIndex 배치 인덱스
   * @returns 배치 처리 결과
   */
  async processBatch(batch, batchIndex) {
    const results = /* @__PURE__ */ new Map();
    if (!this.twitterAPI) {
      console.log(`\u{1F527} [API_OPT] Twitter API \uC11C\uBE44\uC2A4 \uC5C6\uC74C, \uBE48 \uACB0\uACFC \uBC18\uD658 (\uC2E4\uC81C \uD504\uB85C\uD544 \uB370\uC774\uD130\uB9CC \uC0AC\uC6A9)`);
      return results;
    }
    try {
      const users = await this.twitterAPI.getUsersByIds(batch, {
        "user.fields": ["public_metrics", "profile_image_url", "name", "username"]
      });
      if (users.data) {
        for (const user of users.data) {
          const userData = {
            id: user.id,
            username: user.username,
            name: user.name || user.username,
            profile_image_url: user.profile_image_url,
            public_metrics: user.public_metrics
          };
          results.set(user.id, userData);
        }
      }
      const missing = batch.filter((id) => !results.has(id));
      if (missing.length > 0) {
        console.log(`\u26A0\uFE0F [API_OPT] \uBC30\uCE58 ${batchIndex + 1} \uB204\uB77D: ${missing.length}\uAC1C (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""})`);
      }
      return results;
    } catch (error) {
      console.error(`\u274C [API_OPT] \uBC30\uCE58 ${batchIndex + 1} API \uD638\uCD9C \uC2E4\uD328:`, error);
      throw error;
    }
  }
  /**
   * 📊 Rate Limit 상태 조회
   * 
   * @returns Rate Limit 상태
   */
  async getRateLimitStatus() {
    const now = Date.now();
    if (this.rateLimitCache && now - this.rateLimitCacheTime < this.CACHE_DURATION) {
      return this.rateLimitCache;
    }
    try {
      if (this.twitterAPI && this.twitterAPI.getRateLimitStatus) {
        const status = await this.twitterAPI.getRateLimitStatus();
        this.rateLimitCache = {
          remaining: status.remaining || 300,
          // 기본값
          total: status.limit || 300,
          resetTime: status.reset || now + 15 * 60 * 1e3,
          // 15분 후
          resetTimeISO: new Date(status.reset || now + 15 * 60 * 1e3).toISOString(),
          usagePercentage: status.remaining && status.limit ? (status.limit - status.remaining) / status.limit * 100 : 0
        };
        this.rateLimitCacheTime = now;
        console.log(`\u{1F4CA} [API_OPT] Rate Limit: ${this.rateLimitCache.remaining}/${this.rateLimitCache.total} (${this.rateLimitCache.usagePercentage.toFixed(1)}% \uC0AC\uC6A9)`);
        return this.rateLimitCache;
      }
    } catch (error) {
      console.warn(`\u26A0\uFE0F [API_OPT] Rate Limit \uC870\uD68C \uC2E4\uD328, \uAE30\uBCF8\uAC12 \uC0AC\uC6A9:`, error);
    }
    const defaultStatus = {
      remaining: 100,
      total: 300,
      resetTime: now + 15 * 60 * 1e3,
      resetTimeISO: new Date(now + 15 * 60 * 1e3).toISOString(),
      usagePercentage: 66.7
    };
    this.rateLimitCache = defaultStatus;
    this.rateLimitCacheTime = now;
    return defaultStatus;
  }
  /**
   * 🔧 유틸리티 메서드들
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  isRateLimitError(error) {
    return error?.status === 429 || error?.code === "RATE_LIMIT_EXCEEDED" || error?.message && error.message.toLowerCase().includes("rate limit");
  }
  createMockUserData(userId) {
    throw new Error(`[DEPRECATED] createMockUserData \uBE44\uD65C\uC131\uD654\uB428 - \uC2E4\uC81C \uD504\uB85C\uD544 \uB370\uC774\uD130\uB9CC \uC0AC\uC6A9\uD574\uC57C \uD568: ${userId}`);
  }
  /**
   * 🎯 Phase 2.3.1: 선별적 프로필 수집 및 최적화된 업데이트 수행
   * 
   * @param userProfiles 사용자 프로필 정보 배열
   * @returns 업데이트된 프로필 데이터 맵
   */
  async selectiveProfileUpdate(userProfiles) {
    const startTime = Date.now();
    console.log(`\u{1F3AF} [SELECTIVE_UPDATE] \uC120\uBCC4\uC801 \uD504\uB85C\uD544 \uC5C5\uB370\uC774\uD2B8 \uC2DC\uC791: ${userProfiles.length}\uBA85 \uBD84\uC11D`);
    const priorities = await this.selectiveProfileCollection(userProfiles);
    console.log(`\u{1F3AF} [SELECTIVE_UPDATE] \uC120\uBCC4 \uC644\uB8CC: ${priorities.length}\uBA85 \uC120\uD0DD\uB428`);
    const analysis = await this.analyzeCostEffectiveness(priorities);
    console.log(`\u{1F4C8} [SELECTIVE_UPDATE] \uBE44\uC6A9 \uD6A8\uACFC\uC131 \uBD84\uC11D: \uBE44\uC6A9 \uB300\uBE44 \uD6A8\uACFC ${analysis.costBenefitRatio.toFixed(1)}`);
    const batchAdjustment = await this.adjustBatchSizeForRateLimit(priorities.length);
    console.log(`\u{1F527} [SELECTIVE_UPDATE] \uBC30\uCE58 \uC870\uC815: ${batchAdjustment.recommendedBatchSize}\uAC1C\uC529, ${batchAdjustment.estimatedBatches}\uD68C \uCC98\uB9AC`);
    const processableUsers = priorities.slice(0, batchAdjustment.maxProcessableUsers);
    const skippedUsers = priorities.slice(batchAdjustment.maxProcessableUsers).map((p) => p.userId);
    if (skippedUsers.length > 0) {
      console.log(`\u26A0\uFE0F [SELECTIVE_UPDATE] Rate Limit \uCD08\uACFC\uB85C ${skippedUsers.length}\uBA85 \uAC74\uB108\uB700`);
    }
    const userIds = processableUsers.map((p) => p.userId);
    const updatedProfiles = await this.batchGetUsers(userIds);
    const processingTime = Date.now() - startTime;
    const processingSummary = {
      totalAnalyzed: userProfiles.length,
      selectedForUpdate: priorities.length,
      actuallyUpdated: updatedProfiles.size,
      apiCallsUsed: Math.ceil(userIds.length / batchAdjustment.recommendedBatchSize),
      processingTime
    };
    console.log(`\u{1F3C1} [SELECTIVE_UPDATE] \uC644\uB8CC: ${processingSummary.actuallyUpdated}/${processingSummary.totalAnalyzed}\uBA85 \uC5C5\uB370\uC774\uD2B8 (${processingTime}ms)`);
    return {
      updatedProfiles,
      analysis,
      skippedUsers,
      processingSummary
    };
  }
  /**
   * 📊 프로필 품질 개선 잠재력 분석
   * 
   * @param userProfiles 분석할 사용자 프로필 배열
   * @returns 개선 잠재력 분석 결과
   */
  async analyzeImprovementPotential(userProfiles) {
    let lowQuality = 0, mediumQuality = 0, highQuality = 0;
    const improvementCategories = {
      username: 0,
      displayName: 0,
      profileImage: 0,
      followers: 0,
      outdated: 0
    };
    let totalPotentialIncrease = 0;
    const recommendedActions = [];
    for (const profile of userProfiles) {
      const currentQuality = profile.qualityScore || this.calculateBasicQualityScore(profile);
      if (currentQuality < PROFILE_QUALITY_THRESHOLDS.LOW) {
        lowQuality++;
      } else if (currentQuality < PROFILE_QUALITY_THRESHOLDS.MEDIUM) {
        mediumQuality++;
      } else {
        highQuality++;
      }
      let potentialIncrease = 0;
      if (!profile.username || !ProfileValidators.isValidUsername(profile.username)) {
        improvementCategories.username++;
        potentialIncrease += 25;
      }
      if (!profile.displayName || !ProfileValidators.isValidDisplayName(profile.displayName)) {
        improvementCategories.displayName++;
        potentialIncrease += 20;
      }
      if (!profile.profileImageUrl || !ProfileValidators.isValidProfileImageUrl(profile.profileImageUrl)) {
        improvementCategories.profileImage++;
        potentialIncrease += 30;
      }
      if (profile.followersCount === void 0) {
        improvementCategories.followers++;
        potentialIncrease += 25;
      }
      if (profile.lastUpdated) {
        const daysSinceUpdate = (Date.now() - new Date(profile.lastUpdated).getTime()) / (24 * 60 * 60 * 1e3);
        if (daysSinceUpdate > 30) {
          improvementCategories.outdated++;
          potentialIncrease += 10;
        }
      }
      totalPotentialIncrease += potentialIncrease;
    }
    const averagePotentialIncrease = totalPotentialIncrease / userProfiles.length;
    if (improvementCategories.profileImage > userProfiles.length * 0.3) {
      recommendedActions.push("\uD504\uB85C\uD544 \uC774\uBBF8\uC9C0 \uBCF5\uAD6C \uC6B0\uC120 \uCC98\uB9AC \uAD8C\uC7A5");
    }
    if (improvementCategories.username > userProfiles.length * 0.2) {
      recommendedActions.push("\uC0AC\uC6A9\uC790\uBA85 \uBCF5\uAD6C \uC2DC\uAE09 \uCC98\uB9AC \uD544\uC694");
    }
    if (lowQuality > userProfiles.length * 0.4) {
      recommendedActions.push("\uB300\uADDC\uBAA8 \uD488\uC9C8 \uAC1C\uC120 \uC791\uC5C5 \uD544\uC694");
    }
    if (improvementCategories.outdated > userProfiles.length * 0.5) {
      recommendedActions.push("\uC815\uAE30\uC801 \uD504\uB85C\uD544 \uC5C5\uB370\uC774\uD2B8 \uC2DC\uC2A4\uD15C \uAD6C\uCD95 \uAD8C\uC7A5");
    }
    return {
      totalUsers: userProfiles.length,
      lowQualityUsers: lowQuality,
      mediumQualityUsers: mediumQuality,
      highQualityUsers: highQuality,
      improvementCategories,
      potentialScoreIncrease: averagePotentialIncrease,
      recommendedActions
    };
  }
  /**
   * 📈 최적화 통계 조회
   */
  getOptimizationStats() {
    return {
      totalRequests: 0,
      deduplicationSavings: 0,
      averageBatchSize: this.config.batchSize,
      successRate: 0
    };
  }
  /**
   * ⚙️ 설정 업데이트
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log(`\u2699\uFE0F [API_OPT] \uC124\uC815 \uC5C5\uB370\uC774\uD2B8:`, newConfig);
  }
  /**
   * 🧹 캐시 정리
   */
  clearCache() {
    this.rateLimitCache = null;
    this.rateLimitCacheTime = 0;
    console.log(`\u{1F9F9} [API_OPT] \uCE90\uC2DC \uC815\uB9AC \uC644\uB8CC`);
  }
};

// src/services/cloudwatch-metrics.ts
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var CloudWatchMetricsService = class {
  /**
   * 🔧 CloudWatch Dimension Value를 ASCII 안전 문자열로 변환
   * 비-ASCII 문자를 URL 인코딩하여 CloudWatch API 호환성 확보
   */
  sanitizeDimensionValue(value) {
    try {
      return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`).substring(0, 255);
    } catch (error) {
      console.warn(`\u26A0\uFE0F [CLOUDWATCH] Dimension \uAC12 \uC778\uCF54\uB529 \uC2E4\uD328: ${value}`, error);
      return "encoding_failed";
    }
  }
  constructor(region = "ap-northeast-2", namespace = "NASUN/BookmarkSystem") {
    this.client = new import_client_cloudwatch.CloudWatchClient({ region });
    this.namespace = namespace;
    this.defaultDimensions = [
      { Name: "System", Value: "NASUN-Leaderboard-V2" },
      { Name: "Environment", Value: "development" }
    ];
  }
  /**
   * 북마크 수집 메트릭 전송
   */
  async putBookmarkCollectionMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.bookmarkCollectionSuccess !== void 0) {
      metricData.push({
        MetricName: "BookmarkCollectionSuccess",
        Value: metrics.bookmarkCollectionSuccess,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkCollectionFailure !== void 0) {
      metricData.push({
        MetricName: "BookmarkCollectionFailure",
        Value: metrics.bookmarkCollectionFailure,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkCollectionLatency !== void 0) {
      metricData.push({
        MetricName: "BookmarkCollectionLatency",
        Value: metrics.bookmarkCollectionLatency,
        Unit: "Milliseconds",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkDataPoints !== void 0) {
      metricData.push({
        MetricName: "BookmarkDataPoints",
        Value: metrics.bookmarkDataPoints,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkRateLimitHits !== void 0) {
      metricData.push({
        MetricName: "BookmarkRateLimitHits",
        Value: metrics.bookmarkRateLimitHits,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkRateLimitRemaining !== void 0) {
      metricData.push({
        MetricName: "BookmarkRateLimitRemaining",
        Value: metrics.bookmarkRateLimitRemaining,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.oauth2TokenExpiration !== void 0) {
      metricData.push({
        MetricName: "OAuth2TokenExpiration",
        Value: metrics.oauth2TokenExpiration,
        Unit: "Seconds",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.oauth2TokenRefreshSuccess !== void 0) {
      metricData.push({
        MetricName: "OAuth2TokenRefreshSuccess",
        Value: metrics.oauth2TokenRefreshSuccess,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.oauth2TokenRefreshFailure !== void 0) {
      metricData.push({
        MetricName: "OAuth2TokenRefreshFailure",
        Value: metrics.oauth2TokenRefreshFailure,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkDataQualityScore !== void 0) {
      metricData.push({
        MetricName: "BookmarkDataQualityScore",
        Value: metrics.bookmarkDataQualityScore,
        Unit: "Percent",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.bookmarkDuplicateCount !== void 0) {
      metricData.push({
        MetricName: "BookmarkDuplicateCount",
        Value: metrics.bookmarkDuplicateCount,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 시스템 성능 메트릭 전송
   */
  async putSystemPerformanceMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.lambdaDuration !== void 0) {
      metricData.push({
        MetricName: "LambdaDuration",
        Value: metrics.lambdaDuration,
        Unit: "Milliseconds",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Performance" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.lambdaMemoryUsage !== void 0) {
      metricData.push({
        MetricName: "LambdaMemoryUsage",
        Value: metrics.lambdaMemoryUsage,
        Unit: "Megabytes",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Performance" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.lambdaColdStart !== void 0) {
      metricData.push({
        MetricName: "LambdaColdStart",
        Value: metrics.lambdaColdStart,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Performance" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.dynamodbReadLatency !== void 0) {
      metricData.push({
        MetricName: "DynamoDBReadLatency",
        Value: metrics.dynamodbReadLatency,
        Unit: "Milliseconds",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Database" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.dynamodbWriteLatency !== void 0) {
      metricData.push({
        MetricName: "DynamoDBWriteLatency",
        Value: metrics.dynamodbWriteLatency,
        Unit: "Milliseconds",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Database" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.dynamodbThrottles !== void 0) {
      metricData.push({
        MetricName: "DynamoDBThrottles",
        Value: metrics.dynamodbThrottles,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Database" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.apiCallFrequency !== void 0) {
      metricData.push({
        MetricName: "APICallFrequency",
        Value: metrics.apiCallFrequency,
        Unit: "Count/Second",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "API" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.apiErrorRate !== void 0) {
      metricData.push({
        MetricName: "APIErrorRate",
        Value: metrics.apiErrorRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "API" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.systemHealthScore !== void 0) {
      metricData.push({
        MetricName: "SystemHealthScore",
        Value: metrics.systemHealthScore,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "MetricType", Value: "Health" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 🔧 Phase 2.2.1: 프로필 정보 품질 모니터링 메트릭 전송
   */
  async putProfileQualityMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions, { Name: "MetricType", Value: "ProfileQuality" }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.profileCompletionRate !== void 0) {
      metricData.push({
        MetricName: "ProfileCompletionRate",
        Value: metrics.profileCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "Completion" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileImageCompletionRate !== void 0) {
      metricData.push({
        MetricName: "ProfileImageCompletionRate",
        Value: metrics.profileImageCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "ProfileImage" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.usernameCompletionRate !== void 0) {
      metricData.push({
        MetricName: "UsernameCompletionRate",
        Value: metrics.usernameCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "Username" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.displayNameCompletionRate !== void 0) {
      metricData.push({
        MetricName: "DisplayNameCompletionRate",
        Value: metrics.displayNameCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "DisplayName" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.followersCountCompletionRate !== void 0) {
      metricData.push({
        MetricName: "FollowersCountCompletionRate",
        Value: metrics.followersCountCompletionRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "FollowersCount" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.highQualityProfiles !== void 0) {
      metricData.push({
        MetricName: "HighQualityProfiles",
        Value: metrics.highQualityProfiles,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "QualityTier", Value: "High" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mediumQualityProfiles !== void 0) {
      metricData.push({
        MetricName: "MediumQualityProfiles",
        Value: metrics.mediumQualityProfiles,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "QualityTier", Value: "Medium" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.lowQualityProfiles !== void 0) {
      metricData.push({
        MetricName: "LowQualityProfiles",
        Value: metrics.lowQualityProfiles,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "QualityTier", Value: "Low" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.averageProfileQualityScore !== void 0) {
      metricData.push({
        MetricName: "AverageProfileQualityScore",
        Value: metrics.averageProfileQualityScore,
        Unit: "None",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "Average" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileDataLossEvents !== void 0) {
      metricData.push({
        MetricName: "ProfileDataLossEvents",
        Value: metrics.profileDataLossEvents,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "DataLossCategory", Value: "Events" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.nullValueDetectedCount !== void 0) {
      metricData.push({
        MetricName: "NullValueDetectedCount",
        Value: metrics.nullValueDetectedCount,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "DataLossCategory", Value: "NullValues" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.invalidValueDetectedCount !== void 0) {
      metricData.push({
        MetricName: "InvalidValueDetectedCount",
        Value: metrics.invalidValueDetectedCount,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "DataLossCategory", Value: "InvalidValues" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileRecoveryAttempts !== void 0) {
      metricData.push({
        MetricName: "ProfileRecoveryAttempts",
        Value: metrics.profileRecoveryAttempts,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "RecoveryCategory", Value: "Attempts" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileRecoverySuccess !== void 0) {
      metricData.push({
        MetricName: "ProfileRecoverySuccess",
        Value: metrics.profileRecoverySuccess,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "RecoveryCategory", Value: "Success" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.apiNullResponseCount !== void 0) {
      metricData.push({
        MetricName: "APINullResponseCount",
        Value: metrics.apiNullResponseCount,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "APIQualityCategory", Value: "NullResponse" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.apiValidResponseCount !== void 0) {
      metricData.push({
        MetricName: "APIValidResponseCount",
        Value: metrics.apiValidResponseCount,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "APIQualityCategory", Value: "ValidResponse" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.cacheHitRate !== void 0) {
      metricData.push({
        MetricName: "ProfileCacheHitRate",
        Value: metrics.cacheHitRate,
        Unit: "Percent",
        Dimensions: [...dimensions, { Name: "CacheCategory", Value: "HitRate" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.profileMergeOperations !== void 0) {
      metricData.push({
        MetricName: "ProfileMergeOperations",
        Value: metrics.profileMergeOperations,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "OperationCategory", Value: "ProfileMerge" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 보안 감사 메트릭 전송
   */
  async putSecurityAuditMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions, { Name: "MetricType", Value: "Security" }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.tokenAccessAttempts !== void 0) {
      metricData.push({
        MetricName: "TokenAccessAttempts",
        Value: metrics.tokenAccessAttempts,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "TokenSecurity" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.tokenValidationFailures !== void 0) {
      metricData.push({
        MetricName: "TokenValidationFailures",
        Value: metrics.tokenValidationFailures,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "TokenSecurity" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.suspiciousApiUsage !== void 0) {
      metricData.push({
        MetricName: "SuspiciousAPIUsage",
        Value: metrics.suspiciousApiUsage,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "APIUsage" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.unauthorizedAccess !== void 0) {
      metricData.push({
        MetricName: "UnauthorizedAccess",
        Value: metrics.unauthorizedAccess,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "AccessControl" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.failedAuthentication !== void 0) {
      metricData.push({
        MetricName: "FailedAuthentication",
        Value: metrics.failedAuthentication,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "AccessControl" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.dataEncryptionStatus !== void 0) {
      metricData.push({
        MetricName: "DataEncryptionStatus",
        Value: metrics.dataEncryptionStatus,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "DataProtection" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.secretsManagerAccess !== void 0) {
      metricData.push({
        MetricName: "SecretsManagerAccess",
        Value: metrics.secretsManagerAccess,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "SecurityCategory", Value: "DataProtection" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 멘션 카운터 메트릭 전송
   */
  async putMentionCounterMetrics(metrics, additionalDimensions) {
    const dimensions = [...this.defaultDimensions, { Name: "MetricType", Value: "MentionCounter" }];
    if (additionalDimensions) {
      dimensions.push(...additionalDimensions);
    }
    const metricData = [];
    if (metrics.mentionProcessingSuccess !== void 0) {
      metricData.push({
        MetricName: "MentionProcessingSuccess",
        Value: metrics.mentionProcessingSuccess,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "ProcessingCategory", Value: "Success" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionProcessingFailure !== void 0) {
      metricData.push({
        MetricName: "MentionProcessingFailure",
        Value: metrics.mentionProcessingFailure,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "ProcessingCategory", Value: "Failure" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionProcessingLatency !== void 0) {
      metricData.push({
        MetricName: "MentionProcessingLatency",
        Value: metrics.mentionProcessingLatency,
        Unit: "Milliseconds",
        Dimensions: [...dimensions, { Name: "ProcessingCategory", Value: "Performance" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionDailyLimitReached !== void 0) {
      metricData.push({
        MetricName: "MentionDailyLimitReached",
        Value: metrics.mentionDailyLimitReached,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "LimitCategory", Value: "DailyLimit" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionCooldownViolations !== void 0) {
      metricData.push({
        MetricName: "MentionCooldownViolations",
        Value: metrics.mentionCooldownViolations,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "LimitCategory", Value: "Cooldown" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionContentQualityFailures !== void 0) {
      metricData.push({
        MetricName: "MentionContentQualityFailures",
        Value: metrics.mentionContentQualityFailures,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "QualityCategory", Value: "ContentFilter" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionScoreCalculated !== void 0) {
      metricData.push({
        MetricName: "MentionScoreCalculated",
        Value: metrics.mentionScoreCalculated,
        Unit: "None",
        Dimensions: [...dimensions, { Name: "ScoreCategory", Value: "Final" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionQualityScore !== void 0) {
      metricData.push({
        MetricName: "MentionQualityScore",
        Value: metrics.mentionQualityScore,
        Unit: "None",
        Dimensions: [...dimensions, { Name: "ScoreCategory", Value: "Quality" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionCooldownBonus !== void 0) {
      metricData.push({
        MetricName: "MentionCooldownBonus",
        Value: metrics.mentionCooldownBonus,
        Unit: "None",
        Dimensions: [...dimensions, { Name: "ScoreCategory", Value: "Bonus" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionSpamDetected !== void 0) {
      metricData.push({
        MetricName: "MentionSpamDetected",
        Value: metrics.mentionSpamDetected,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "PatternCategory", Value: "Spam" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionValidTargetFound !== void 0) {
      metricData.push({
        MetricName: "MentionValidTargetFound",
        Value: metrics.mentionValidTargetFound,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "PatternCategory", Value: "TargetMention" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metrics.mentionContentLength !== void 0) {
      metricData.push({
        MetricName: "MentionContentLength",
        Value: metrics.mentionContentLength,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "PatternCategory", Value: "ContentLength" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    if (metricData.length > 0) {
      await this.sendMetrics(metricData);
    }
  }
  /**
   * 복합 메트릭 전송 (사용량 분석)
   */
  async putUsageAnalyticsMetrics(totalBookmarks, uniqueUsers, avgBookmarksPerUser, bookmarkTrends, timeRange) {
    const dimensions = [
      ...this.defaultDimensions,
      { Name: "MetricType", Value: "Analytics" },
      { Name: "TimeRange", Value: timeRange }
    ];
    const metricData = [
      {
        MetricName: "TotalBookmarks",
        Value: totalBookmarks,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "UniqueBookmarkUsers",
        Value: uniqueUsers,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "AvgBookmarksPerUser",
        Value: avgBookmarksPerUser,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      }
    ];
    if (bookmarkTrends.length > 0) {
      const trendAverage = bookmarkTrends.reduce((sum, val) => sum + val, 0) / bookmarkTrends.length;
      metricData.push({
        MetricName: "BookmarkTrendAverage",
        Value: trendAverage,
        Unit: "Count",
        Dimensions: [...dimensions, { Name: "AnalysisType", Value: "Trend" }],
        Timestamp: /* @__PURE__ */ new Date()
      });
    }
    await this.sendMetrics(metricData);
  }
  /**
   * 메트릭 데이터를 CloudWatch로 전송
   */
  async sendMetrics(metricData) {
    try {
      const batchSize = 20;
      for (let i = 0; i < metricData.length; i += batchSize) {
        const batch = metricData.slice(i, i + batchSize);
        const command = new import_client_cloudwatch.PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: batch
        });
        await this.client.send(command);
        console.log(`\u{1F4CA} [METRICS] CloudWatch \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC: ${batch.length}\uAC1C (\uBC30\uCE58 ${Math.floor(i / batchSize) + 1})`);
        if (i + batchSize < metricData.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error(`\u274C [METRICS] CloudWatch \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:`, error);
      throw error;
    }
  }
  /**
   * 간단한 메트릭 전송 함수
   */
  async putMetric(namespace, metricName, value, unit = "Count") {
    const metricData = [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: /* @__PURE__ */ new Date(),
      Dimensions: this.defaultDimensions
    }];
    const command = new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: namespace,
      MetricData: metricData
    });
    try {
      await this.client.send(command);
      console.log(`\u{1F4CA} [METRICS] \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC: ${metricName} = ${value}`);
    } catch (error) {
      console.error(`\u274C [METRICS] \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328: ${metricName}`, error);
      throw error;
    }
  }
  /**
   * 🔧 Phase 2.2.1: 편의 함수 - 프로필 데이터 손실 이벤트 기록
   */
  async recordProfileDataLossEvent(lossType, userId) {
    const additionalDimensions = [
      { Name: "DataLossType", Value: lossType }
    ];
    if (userId) {
      additionalDimensions.push({ Name: "UserId", Value: userId });
    }
    await this.putProfileQualityMetrics({
      profileDataLossEvents: 1,
      nullValueDetectedCount: lossType === "null" ? 1 : 0,
      invalidValueDetectedCount: lossType === "invalid" ? 1 : 0
    }, additionalDimensions);
  }
  /**
   * 편의 함수: 프로필 복구 시도 기록
   */
  async recordProfileRecoveryAttempt(recoveryType, success) {
    await this.putProfileQualityMetrics({
      profileRecoveryAttempts: 1,
      profileRecoverySuccess: success ? 1 : 0
    }, [{ Name: "RecoveryType", Value: recoveryType }]);
  }
  /**
   * 편의 함수: API 응답 품질 기록
   */
  async recordAPIResponseQuality(isValidResponse, responseType) {
    await this.putProfileQualityMetrics({
      apiValidResponseCount: isValidResponse ? 1 : 0,
      apiNullResponseCount: isValidResponse ? 0 : 1
    }, [{ Name: "ResponseType", Value: responseType }]);
  }
  /**
   * 편의 함수: 프로필 완성도 집계 기록
   */
  async recordProfileCompletionRates(options) {
    const profileCompletionRate = options.totalUsers > 0 ? options.usersWithValidProfiles / options.totalUsers * 100 : 0;
    const profileImageCompletionRate = options.totalUsers > 0 ? options.usersWithValidImages / options.totalUsers * 100 : 0;
    const usernameCompletionRate = options.totalUsers > 0 ? options.usersWithValidUsernames / options.totalUsers * 100 : 0;
    const displayNameCompletionRate = options.totalUsers > 0 ? options.usersWithValidDisplayNames / options.totalUsers * 100 : 0;
    const followersCountCompletionRate = options.totalUsers > 0 ? options.usersWithValidFollowersCounts / options.totalUsers * 100 : 0;
    await this.putProfileQualityMetrics({
      profileCompletionRate,
      profileImageCompletionRate,
      usernameCompletionRate,
      displayNameCompletionRate,
      followersCountCompletionRate,
      averageProfileQualityScore: options.averageQualityScore,
      highQualityProfiles: options.highQualityCount,
      mediumQualityProfiles: options.mediumQualityCount,
      lowQualityProfiles: options.lowQualityCount
    });
  }
  /**
   * 편의 함수: 캐시 적중률 및 프로필 병합 작업 기록
   */
  async recordCacheAndMergeOperations(cacheHitRate, mergeOperationsCount) {
    await this.putProfileQualityMetrics({
      cacheHitRate,
      profileMergeOperations: mergeOperationsCount
    });
  }
  /**
   * 편의 함수: 북마크 수집 성공 메트릭
   */
  async recordBookmarkCollectionSuccess(count, latency) {
    await this.putBookmarkCollectionMetrics({
      bookmarkCollectionSuccess: 1,
      bookmarkDataPoints: count,
      bookmarkCollectionLatency: latency
    });
  }
  /**
   * 편의 함수: 북마크 수집 실패 메트릭
   */
  async recordBookmarkCollectionFailure(errorType) {
    await this.putBookmarkCollectionMetrics({
      bookmarkCollectionFailure: 1
    }, [{ Name: "ErrorType", Value: errorType }]);
  }
  /**
   * 편의 함수: OAuth 토큰 갱신 성공
   */
  async recordOAuth2TokenRefreshSuccess() {
    await this.putBookmarkCollectionMetrics({
      oauth2TokenRefreshSuccess: 1
    });
  }
  /**
   * 편의 함수: OAuth 토큰 갱신 실패
   */
  async recordOAuth2TokenRefreshFailure(errorReason) {
    await this.putBookmarkCollectionMetrics({
      oauth2TokenRefreshFailure: 1
    }, [{ Name: "ErrorReason", Value: errorReason }]);
  }
  /**
   * 편의 함수: Rate Limit 히트 기록
   */
  async recordRateLimitHit(remaining) {
    await this.putBookmarkCollectionMetrics({
      bookmarkRateLimitHits: 1,
      bookmarkRateLimitRemaining: remaining
    });
  }
  /**
   * 다중 답글 집계 시스템 전용 메트릭
   */
  async putMultiReplyMetrics(options) {
    const metrics = [
      {
        MetricName: "MultiReply_TotalRepliesProcessed",
        Value: options.totalRepliesProcessed,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_ValidReplies",
        Value: options.validReplies,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_RejectedReplies",
        Value: options.rejectedReplies,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_MaxReachedUsers",
        Value: options.maxReachedUsers,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_AverageRepliesPerUser",
        Value: options.averageRepliesPerUser,
        Unit: "None",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_ProcessingTime",
        Value: options.processingTime,
        Unit: "Milliseconds",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MultiReply_ApprovalRate",
        Value: options.totalRepliesProcessed > 0 ? options.validReplies / options.totalRepliesProcessed * 100 : 0,
        Unit: "Percent",
        Timestamp: /* @__PURE__ */ new Date()
      }
    ];
    const command = new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: "NASUN/MultiReply",
      MetricData: metrics
    });
    try {
      await this.client.send(command);
      console.log(`\u{1F4CA} [METRICS] \uB2E4\uC911 \uB2F5\uAE00 \uC9D1\uACC4 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC: ${metrics.length}\uAC1C`);
    } catch (error) {
      console.error(`\u274C [METRICS] \uB2E4\uC911 \uB2F5\uAE00 \uC9D1\uACC4 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:`, error);
    }
  }
  /**
   * 편의 함수: 멘션 처리 성공 기록
   */
  async recordMentionProcessingSuccess(score, qualityScore, cooldownBonus, contentLength) {
    await this.putMentionCounterMetrics({
      mentionProcessingSuccess: 1,
      mentionScoreCalculated: score,
      mentionQualityScore: qualityScore,
      mentionCooldownBonus: cooldownBonus,
      mentionContentLength: contentLength
    });
  }
  /**
   * 편의 함수: 멘션 일일 제한 도달 기록
   */
  async recordMentionDailyLimitReached(userId) {
    await this.putMentionCounterMetrics({
      mentionDailyLimitReached: 1
    }, [{ Name: "UserId", Value: userId }]);
  }
  /**
   * 편의 함수: 멘션 쿨다운 위반 기록
   */
  async recordMentionCooldownViolation(intervalHours) {
    await this.putMentionCounterMetrics({
      mentionCooldownViolations: 1
    }, [{ Name: "IntervalHours", Value: intervalHours.toString() }]);
  }
  /**
   * 편의 함수: 멘션 콘텐츠 품질 실패 기록
   */
  async recordMentionContentQualityFailure(failureReason) {
    await this.putMentionCounterMetrics({
      mentionContentQualityFailures: 1
    }, [{ Name: "FailureReason", Value: this.sanitizeDimensionValue(failureReason) }]);
  }
  /**
   * 편의 함수: 멘션 스팸 탐지 기록
   */
  async recordMentionSpamDetected(spamType) {
    await this.putMentionCounterMetrics({
      mentionSpamDetected: 1
    }, [{ Name: "SpamType", Value: this.sanitizeDimensionValue(spamType) }]);
  }
  /**
   * 편의 함수: 멘션 처리 실패 기록
   */
  async recordMentionProcessingFailure(errorReason) {
    await this.putMentionCounterMetrics({
      mentionProcessingFailure: 1
    }, [{ Name: "ErrorReason", Value: this.sanitizeDimensionValue(errorReason) }]);
  }
  /**
   * 멘션 카운터 집계 시스템 전용 메트릭
   */
  async putMentionSummaryMetrics(options) {
    const metrics = [
      {
        MetricName: "MentionSummary_TotalProcessed",
        Value: options.totalMentionsProcessed,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_ValidMentions",
        Value: options.validMentions,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_RejectedMentions",
        Value: options.rejectedMentions,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_DailyLimitReached",
        Value: options.dailyLimitReached,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_CooldownViolations",
        Value: options.cooldownViolations,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_SpamDetected",
        Value: options.spamDetected,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_AvgQualityScore",
        Value: options.avgQualityScore,
        Unit: "None",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_AvgFinalScore",
        Value: options.avgFinalScore,
        Unit: "None",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_ProcessingTime",
        Value: options.processingTime,
        Unit: "Milliseconds",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "MentionSummary_ApprovalRate",
        Value: options.totalMentionsProcessed > 0 ? options.validMentions / options.totalMentionsProcessed * 100 : 0,
        Unit: "Percent",
        Timestamp: /* @__PURE__ */ new Date()
      }
    ];
    const command = new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: "NASUN/MentionCounter",
      MetricData: metrics
    });
    try {
      await this.client.send(command);
      console.log(`\u{1F4CA} [METRICS] \uBA58\uC158 \uCE74\uC6B4\uD130 \uC9D1\uACC4 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC644\uB8CC: ${metrics.length}\uAC1C`);
    } catch (error) {
      console.error(`\u274C [METRICS] \uBA58\uC158 \uCE74\uC6B4\uD130 \uC9D1\uACC4 \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:`, error);
    }
  }
};
var cloudWatchMetrics = new CloudWatchMetricsService();

// src/services/leaderboard-generator.ts
var LeaderboardGenerator = class {
  constructor(ddbClient2, config) {
    this.ddbClient = ddbClient2;
    this.config = config;
    this.communityMemberIds = /* @__PURE__ */ new Set();
    this.activeDaysCalculator = new ActiveDaysCalculator(ddbClient2, config.cumulativeTableName);
    this.scoreWeights = getScoreWeights(config);
    const dynamoDocClient = import_lib_dynamodb4.DynamoDBDocumentClient.from(ddbClient2);
    const communityService = new CommunityClassificationService(dynamoDocClient, config.cumulativeTableName);
    this.deltaCalculator = new DeltaCalculator(
      dynamoDocClient,
      config.cumulativeTableName,
      communityService,
      this.scoreWeights
    );
    const profileCacheService = new ProfileCacheService(new import_client_dynamodb2.DynamoDBClient({}));
    const twitterApiOptimizer = new TwitterAPIOptimizer();
    this.centralizedProfileManager = new CentralizedProfileManager(profileCacheService, twitterApiOptimizer);
    this.cloudWatch = new CloudWatchMetricsService();
    console.log("\u2705 [LEADERBOARD_GEN] CentralizedProfileManager \uCD08\uAE30\uD654 \uC644\uB8CC");
    this.apiGateway = new import_client_api_gateway.APIGatewayClient({ region: config.region || "ap-northeast-2" });
    console.log("\u2705 [LEADERBOARD_GEN] APIGatewayClient \uCD08\uAE30\uD654 \uC644\uB8CC");
  }
  /**
   * 주어진 날짜가 이벤트 기간 내에 있는지 확인
   * 종료일의 23:59:59.999까지 포함 (해당 날짜 전체 포함)
   *
   * @param today 확인할 날짜 (보통 현재 시각)
   * @param startDate 이벤트 시작일 (YYYY-MM-DD 형식)
   * @param endDate 이벤트 종료일 (YYYY-MM-DD 형식)
   * @param eventName 디버깅용 이벤트 이름
   * @returns 기간 내 여부
   */
  isWithinEventPeriod(today, startDate, endDate, eventName = "EVENT") {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const isWithin = today >= start && today <= end;
    if (!isWithin) {
      console.log(`\u23F0 [${eventName}] \uC774\uBCA4\uD2B8 \uAE30\uAC04 \uD655\uC778:`, {
        today: today.toISOString(),
        start: start.toISOString(),
        end: end.toISOString(),
        beforeStart: today < start,
        afterEnd: today > end
      });
    }
    return isWithin;
  }
  /**
   * 커뮤니티 멤버 목록을 DynamoDB에서 로드하여 Set에 저장
   */
  async loadCommunityMembers() {
    console.log("\u{1F504} [LEADERBOARD] \uCEE4\uBBA4\uB2C8\uD2F0 \uBA64\uBC84 \uBAA9\uB85D \uB85C\uB4DC \uC911...");
    try {
      const result = await this.ddbClient.send(new import_client_dynamodb2.QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: "COMMUNITY_MEMBERS" }
        }
      }));
      if (result.Items && result.Items.length > 0) {
        result.Items.forEach((item) => {
          const unmarshalled = (0, import_util_dynamodb2.unmarshall)(item);
          this.communityMemberIds.add(unmarshalled.twitterId);
        });
        console.log(`\u2705 [LEADERBOARD] ${this.communityMemberIds.size}\uBA85\uC758 \uCEE4\uBBA4\uB2C8\uD2F0 \uBA64\uBC84 \uB85C\uB4DC \uC644\uB8CC`);
        const first5 = Array.from(this.communityMemberIds).slice(0, 5);
        console.log(`   \uC0D8\uD50C: ${first5.join(", ")}`);
      } else {
        console.warn("\u26A0\uFE0F [LEADERBOARD] \uCEE4\uBBA4\uB2C8\uD2F0 \uBA64\uBC84\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
      }
    } catch (error) {
      console.error("\u274C [LEADERBOARD] \uCEE4\uBBA4\uB2C8\uD2F0 \uBA64\uBC84 \uB85C\uB4DC \uC2E4\uD328:", error);
    }
  }
  async generateAllLeaderboards(collectedEngagements) {
    const today = /* @__PURE__ */ new Date();
    const eventPeriodConfigs = getEventPeriodConfigs();
    console.log(`\u{1F4CA} [LEADERBOARD_GEN] generateAllLeaderboards \uC2DC\uC791`, {
      hasCollectedEngagements: !!collectedEngagements,
      engagementsCount: collectedEngagements?.length || 0
    });
    const results = {
      cumulative: await this.generateCumulativeLeaderboard(collectedEngagements)
    };
    const event1Config = eventPeriodConfigs["EVENT1" /* EVENT1 */];
    if (event1Config && this.isWithinEventPeriod(today, event1Config.startDate, event1Config.endDate, "EVENT1")) {
      console.log(`\u{1F4C5} 1\uCC28 \uC774\uBCA4\uD2B8 \uC9C4\uD589 \uC911 (${event1Config.startDate} ~ ${event1Config.endDate})`);
      results.event1 = await this.generateEvent1Leaderboard(collectedEngagements);
    } else {
      const endDate = new Date(event1Config?.endDate || "");
      endDate.setHours(23, 59, 59, 999);
      if (event1Config && today > endDate) {
        console.log(`\u23ED\uFE0F 1\uCC28 \uC774\uBCA4\uD2B8 \uC885\uB8CC\uB428 (\uC885\uB8CC\uC77C: ${event1Config.endDate})`);
      } else {
        console.log("\u{1F3C6} 1\uCC28 \uC774\uBCA4\uD2B8 \uAE30\uAC04\uC774 \uC544\uC9C1 \uC2DC\uC791\uB418\uC9C0 \uC54A\uC558\uC9C0\uB9CC \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uC0DD\uC131\uD569\uB2C8\uB2E4.");
      }
      await this.clearPeriodLeaderboard("EVENT1" /* EVENT1 */);
      if (event1Config) {
        await this.saveLeaderboardMetadata(
          "EVENT1" /* EVENT1 */,
          0,
          // 엔트리 없음
          event1Config.description,
          new Date(event1Config.startDate),
          new Date(event1Config.endDate)
        );
      }
      results.event1 = { period: "EVENT1", entriesGenerated: 0, topScore: 0, description: event1Config?.description || "1\uCC28 \uC774\uBCA4\uD2B8" };
    }
    const event2Config = eventPeriodConfigs["EVENT2" /* EVENT2 */];
    if (event2Config && this.isWithinEventPeriod(today, event2Config.startDate, event2Config.endDate, "EVENT2")) {
      console.log(`\u{1F4C5} 2\uCC28 \uC774\uBCA4\uD2B8 \uC9C4\uD589 \uC911 (${event2Config.startDate} ~ ${event2Config.endDate})`);
      results.event2 = await this.generateEvent2Leaderboard(collectedEngagements);
    } else {
      const endDate = new Date(event2Config?.endDate || "");
      endDate.setHours(23, 59, 59, 999);
      if (event2Config && today > endDate) {
        console.log(`\u23ED\uFE0F 2\uCC28 \uC774\uBCA4\uD2B8 \uC885\uB8CC\uB428 (\uC885\uB8CC\uC77C: ${event2Config.endDate})`);
      } else {
        console.log("\u{1F3C6} 2\uCC28 \uC774\uBCA4\uD2B8 \uAE30\uAC04\uC774 \uC544\uC9C1 \uC2DC\uC791\uB418\uC9C0 \uC54A\uC558\uC9C0\uB9CC \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uC0DD\uC131\uD569\uB2C8\uB2E4.");
      }
      await this.clearPeriodLeaderboard("EVENT2" /* EVENT2 */);
      if (event2Config) {
        await this.saveLeaderboardMetadata(
          "EVENT2" /* EVENT2 */,
          0,
          // 엔트리 없음
          event2Config.description,
          new Date(event2Config.startDate),
          new Date(event2Config.endDate)
        );
      }
      results.event2 = { period: "EVENT2", entriesGenerated: 0, topScore: 0, description: event2Config?.description || "2\uCC28 \uC774\uBCA4\uD2B8" };
    }
    const event3Config = eventPeriodConfigs["EVENT3" /* EVENT3 */];
    if (event3Config && this.isWithinEventPeriod(today, event3Config.startDate, event3Config.endDate, "EVENT3")) {
      console.log(`\u{1F4C5} 3\uCC28 \uC774\uBCA4\uD2B8 \uC9C4\uD589 \uC911 (${event3Config.startDate} ~ ${event3Config.endDate})`);
      results.event3 = await this.generateEvent3Leaderboard(collectedEngagements);
    } else {
      const endDate = new Date(event3Config?.endDate || "");
      endDate.setHours(23, 59, 59, 999);
      if (event3Config && today > endDate) {
        console.log(`\u23ED\uFE0F 3\uCC28 \uC774\uBCA4\uD2B8 \uC885\uB8CC\uB428 (\uC885\uB8CC\uC77C: ${event3Config.endDate})`);
      } else {
        console.log("\u{1F3C6} 3\uCC28 \uC774\uBCA4\uD2B8 \uAE30\uAC04\uC774 \uC544\uC9C1 \uC2DC\uC791\uB418\uC9C0 \uC54A\uC558\uC9C0\uB9CC \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uC0DD\uC131\uD569\uB2C8\uB2E4.");
      }
      await this.clearPeriodLeaderboard("EVENT3" /* EVENT3 */);
      if (event3Config) {
        await this.saveLeaderboardMetadata(
          "EVENT3" /* EVENT3 */,
          0,
          // 엔트리 없음
          event3Config.description,
          new Date(event3Config.startDate),
          new Date(event3Config.endDate)
        );
      }
      results.event3 = { period: "EVENT3", entriesGenerated: 0, topScore: 0, description: event3Config?.description || "3\uCC28 \uC774\uBCA4\uD2B8" };
    }
    console.log("\u{1F3C6} \uBAA8\uB4E0 \uB9AC\uB354\uBCF4\uB4DC \uC0DD\uC131 \uC644\uB8CC", {
      cumulative: results.cumulative.entriesGenerated,
      event1: results.event1.entriesGenerated,
      event2: results.event2.entriesGenerated,
      event3: results.event3.entriesGenerated
    });
    await this.flushAPIGatewayCache();
    return results;
  }
  async generateCumulativeLeaderboard(collectedEngagements) {
    const endDate = /* @__PURE__ */ new Date();
    const startDate = /* @__PURE__ */ new Date(0);
    return this.generatePeriodLeaderboard(
      "CUMULATIVE" /* CUMULATIVE */,
      startDate,
      endDate,
      "\uC804\uCCB4 \uB204\uC801 \uB9AC\uB354\uBCF4\uB4DC",
      null,
      collectedEngagements
    );
  }
  async generateEvent1Leaderboard(collectedEngagements) {
    const eventPeriodConfigs = getEventPeriodConfigs();
    const config = eventPeriodConfigs["EVENT1" /* EVENT1 */];
    if (!config) {
      throw new Error("Event1 configuration not found");
    }
    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const eventEndDate = config.endDate.split("T")[0];
    const isEventEnded = today > eventEndDate;
    console.log(`\u{1F4C5} [EVENT1] \uC774\uBCA4\uD2B8 \uC885\uB8CC \uC0C1\uD0DC \uD655\uC778`, {
      today,
      eventEndDate,
      isEventEnded,
      ttlPolicy: isEventEnded ? "\uC601\uAD6C \uBCF4\uAD00 (10\uB144)" : "\uC784\uC2DC \uBCF4\uAD00 (1\uB144)"
    });
    return this.generatePeriodLeaderboard(
      "EVENT1" /* EVENT1 */,
      startDate,
      endDate,
      config.description,
      config,
      collectedEngagements,
      isEventEnded
    );
  }
  async generateEvent2Leaderboard(collectedEngagements) {
    const eventPeriodConfigs = getEventPeriodConfigs();
    const config = eventPeriodConfigs["EVENT2" /* EVENT2 */];
    if (!config) {
      throw new Error("Event2 configuration not found");
    }
    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const eventEndDate = config.endDate.split("T")[0];
    const isEventEnded = today > eventEndDate;
    console.log(`\u{1F4C5} [EVENT2] \uC774\uBCA4\uD2B8 \uC885\uB8CC \uC0C1\uD0DC \uD655\uC778`, {
      today,
      eventEndDate,
      isEventEnded,
      ttlPolicy: isEventEnded ? "\uC601\uAD6C \uBCF4\uAD00 (10\uB144)" : "\uC784\uC2DC \uBCF4\uAD00 (1\uB144)"
    });
    return this.generatePeriodLeaderboard(
      "EVENT2" /* EVENT2 */,
      startDate,
      endDate,
      config.description,
      config,
      collectedEngagements,
      isEventEnded
    );
  }
  async generateEvent3Leaderboard(collectedEngagements) {
    const eventPeriodConfigs = getEventPeriodConfigs();
    const config = eventPeriodConfigs["EVENT3" /* EVENT3 */];
    if (!config) {
      throw new Error("Event3 configuration not found");
    }
    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const eventEndDate = config.endDate.split("T")[0];
    const isEventEnded = today > eventEndDate;
    console.log(`\u{1F4C5} [EVENT3] \uC774\uBCA4\uD2B8 \uC885\uB8CC \uC0C1\uD0DC \uD655\uC778`, {
      today,
      eventEndDate,
      isEventEnded,
      ttlPolicy: isEventEnded ? "\uC601\uAD6C \uBCF4\uAD00 (10\uB144)" : "\uC784\uC2DC \uBCF4\uAD00 (1\uB144)"
    });
    return this.generatePeriodLeaderboard(
      "EVENT3" /* EVENT3 */,
      startDate,
      endDate,
      config.description,
      config,
      collectedEngagements,
      isEventEnded
    );
  }
  /**
   * UserIdentityMap 테이블에서 X 계정 연동한 사용자 ID 목록을 가져옵니다.
   * twitter_{userId} 패턴으로 저장된 항목을 스캔하여 Set으로 반환합니다.
   */
  async getRegisteredTwitterUserIds() {
    if (!this.config.userIdentityMapTable) {
      console.log("\u26A0\uFE0F USER_IDENTITY_MAP_TABLE \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC544 \uD68C\uC6D0 \uBC43\uC9C0 \uAE30\uB2A5\uC774 \uBE44\uD65C\uC131\uD654\uB429\uB2C8\uB2E4.");
      return /* @__PURE__ */ new Set();
    }
    const registeredUserIds = /* @__PURE__ */ new Set();
    try {
      const scanResult = await this.ddbClient.send(new import_client_dynamodb2.ScanCommand({
        TableName: this.config.userIdentityMapTable,
        FilterExpression: "begins_with(userId, :prefix)",
        ExpressionAttributeValues: (0, import_util_dynamodb2.marshall)({ ":prefix": "twitter_" })
      }));
      scanResult.Items?.forEach((item) => {
        const unmarshalled = (0, import_util_dynamodb2.unmarshall)(item);
        const twitterUserId = unmarshalled.userId.replace("twitter_", "");
        registeredUserIds.add(twitterUserId);
      });
      console.log(`\u2705 UserIdentityMap \uC2A4\uCE94 \uC644\uB8CC: ${registeredUserIds.size}\uBA85\uC758 \uB4F1\uB85D \uD68C\uC6D0 \uD655\uC778`);
    } catch (error) {
      console.error("\u274C UserIdentityMap \uC2A4\uCE94 \uC2E4\uD328:", error);
    }
    return registeredUserIds;
  }
  async generatePeriodLeaderboard(period, startDate, endDate, description, eventConfig = null, collectedEngagements, isEventEnded = false) {
    console.log(`\u{1F3C6} ${description} \uC0DD\uC131 \uC2DC\uC791`, {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      hasCollectedEngagements: !!collectedEngagements,
      engagementsCount: collectedEngagements?.length || 0
    });
    await this.loadCommunityMembers();
    const registeredUserIds = await this.getRegisteredTwitterUserIds();
    console.log(`\u{1F4C5} \uC774\uBCA4\uD2B8 \uAE30\uAC04 \uC124\uC815 (\uC2A4\uB0C5\uC0F7 \uBC29\uC2DD):`, {
      period,
      pipelineStartDate: startDate.toISOString().split("T")[0],
      pipelineEndDate: endDate.toISOString().split("T")[0],
      note: "lastProcessedDate \uAE30\uC900\uC73C\uB85C \uD574\uB2F9 \uAE30\uAC04\uC5D0 \uC218\uC9D1\uB41C \uB370\uC774\uD130\uB9CC \uC9D1\uACC4"
    });
    const userScores = await this.calculatePeriodScores(startDate, endDate, period, collectedEngagements);
    console.log(`\u{1F6E1}\uFE0F ADMIN \uACC4\uC815 \uD544\uD130\uB9C1 \uC124\uC815:`, {
      adminUsernames: this.config.adminUsernames,
      totalUsersBeforeFilter: userScores.length
    });
    const sortedUsers = userScores.sort((a, b) => b.totalScore - a.totalScore).filter((user) => user.totalScore > 0).filter((user) => {
      const isAdmin = user.username && this.config.adminUsernames.includes(user.username);
      if (isAdmin) {
        console.log(`\u{1F6AB} ADMIN \uACC4\uC815 \uC81C\uC678: ${user.username || "unknown"} (${user.userId})`);
      }
      return !isAdmin;
    });
    console.log(`\u{1F4CA} \uD544\uD130\uB9C1 \uD6C4 \uC0AC\uC6A9\uC790 \uC218: ${sortedUsers.length}\uBA85`);
    let usersWithActiveDays = sortedUsers;
    if (this.config.enableActiveDaysTieBreaker) {
      console.log(`\u{1F4C5} \uB3D9\uC810\uC790 \uCC98\uB9AC\uC6A9 \uD65C\uB3D9 \uC77C\uC218 \uACC4\uC0B0 \uC2DC\uC791 (${sortedUsers.length}\uBA85)`);
      const activeDaysConfig = {
        periodDays: this.config.activeDaysPeriod,
        activeDaysWeight: this.config.activeDaysWeight,
        minActivitiesPerDay: this.config.activeDaysMinActivities
      };
      const userIds = sortedUsers.map((user) => user.userId);
      const activeDaysResults = await this.activeDaysCalculator.calculateActiveDaysBatch(userIds, activeDaysConfig);
      usersWithActiveDays = sortedUsers.map((user) => ({
        ...user,
        activeDays: activeDaysResults[user.userId]?.totalActiveDays || 0,
        activeDaysScore: activeDaysResults[user.userId] ? activeDaysResults[user.userId].totalActiveDays * activeDaysConfig.activeDaysWeight : 0
      }));
      console.log(`\u2705 \uD65C\uB3D9 \uC77C\uC218 \uACC4\uC0B0 \uC644\uB8CC. \uD3C9\uADE0 \uD65C\uB3D9\uC77C\uC218: ${Math.round(usersWithActiveDays.reduce((sum, u) => sum + u.activeDays, 0) / usersWithActiveDays.length * 100) / 100}\uC77C`);
      usersWithActiveDays.sort((a, b) => {
        const aTotal = a.totalScore + (a.activeDaysScore || 0);
        const bTotal = b.totalScore + (b.activeDaysScore || 0);
        if (Math.abs(aTotal - bTotal) < 1e-3) {
          return (b.activeDays || 0) - (a.activeDays || 0);
        }
        return bTotal - aTotal;
      });
      console.log(`\u{1F504} \uB3D9\uC810\uC790 \uCC98\uB9AC \uC644\uB8CC. \uC0C1\uC704 5\uBA85:`, usersWithActiveDays.slice(0, 5).map((u) => ({
        userId: u.userId,
        \uBA54\uC778\uC810\uC218: u.totalScore,
        \uD65C\uB3D9\uC77C\uC218: u.activeDays,
        \uD65C\uB3D9\uC77C\uC218\uC810\uC218: u.activeDaysScore,
        \uCD1D\uC810: u.totalScore + (u.activeDaysScore || 0)
      })));
    }
    let usersWithBonus = usersWithActiveDays;
    if (this.config.enableActivityBonus) {
      console.log(`\u{1F381} [Activity Bonus] Calculating for ${usersWithActiveDays.length} users...`);
      const bonusPromises = usersWithActiveDays.map(async (user) => {
        try {
          const activeDaysLast7 = await this.activeDaysCalculator.getActiveDaysInLast7Days(user.userId);
          const bonus = ActiveDaysCalculator.calculateActivityBonus(activeDaysLast7, {
            weightPerDay: this.config.activityBonusWeightPerDay,
            threshold: this.config.activityBonusThresholdDays
          });
          return { ...user, activityBonus: bonus, activeDaysLast7 };
        } catch (error) {
          console.error(`\u274C [Activity Bonus Error] User: ${user.userId}`, error);
          return { ...user, activityBonus: 0, activeDaysLast7: 0 };
        }
      });
      usersWithBonus = await Promise.all(bonusPromises);
      console.log(`\u2705 [Activity Bonus] Completed`);
    }
    let usersWithPenalty = usersWithBonus;
    if (this.config.enableInactivityPenalty) {
      console.log(`\u26A0\uFE0F [Inactivity Penalty] Calculating for ${usersWithBonus.length} users...`);
      const penaltyPromises = usersWithBonus.map(async (user) => {
        try {
          const daysSince = await this.activeDaysCalculator.getDaysSinceLastActivity(user.userId);
          const penalty = ActiveDaysCalculator.calculateInactivityPenalty(daysSince, {
            threshold: this.config.inactivityPenaltyThreshold,
            penaltyPerDay: this.config.inactivityPenaltyPerDay,
            maxPenalty: this.config.inactivityPenaltyMax
          });
          return { ...user, inactivityPenalty: penalty, daysSinceLastActivity: daysSince };
        } catch (error) {
          console.error(`\u274C [Inactivity Penalty Error] User: ${user.userId}`, error);
          return { ...user, inactivityPenalty: 0, daysSinceLastActivity: 0 };
        }
      });
      usersWithPenalty = await Promise.all(penaltyPromises);
      console.log(`\u2705 [Inactivity Penalty] Completed`);
    }
    const finalUsers = usersWithPenalty.map((user) => {
      const activityBonus = user.activityBonus || 0;
      const inactivityPenalty = user.inactivityPenalty || 0;
      const activeDaysScore = user.activeDaysScore || 0;
      const newFinalScore = (user.totalScore || 0) + activeDaysScore + activityBonus + inactivityPenalty;
      return {
        ...user,
        activityBonus,
        inactivityPenalty,
        finalScore: Math.max(0, Math.round(newFinalScore * 10) / 10)
      };
    });
    finalUsers.sort((a, b) => {
      const scoreDiff = b.finalScore - a.finalScore;
      if (Math.abs(scoreDiff) < 1e-3) {
        return (b.activeDays || 0) - (a.activeDays || 0);
      }
      return scoreDiff;
    });
    console.log(`\u{1F3AF} [Final Score] \uCD5C\uC885 \uC810\uC218 \uACC4\uC0B0 \uC644\uB8CC. \uC0C1\uC704 5\uBA85:`, finalUsers.slice(0, 5).map((u) => ({
      userId: u.userId,
      totalScore: u.totalScore,
      activeDaysScore: u.activeDaysScore,
      activityBonus: u.activityBonus,
      inactivityPenalty: u.inactivityPenalty,
      finalScore: u.finalScore
    })));
    usersWithActiveDays = finalUsers;
    const yesterdayLeaderboard = await this.getLeaderboardSnapshot(period, 1);
    const yesterdayRankMap = /* @__PURE__ */ new Map();
    if (yesterdayLeaderboard) {
      yesterdayLeaderboard.forEach((entry) => {
        yesterdayRankMap.set(entry.userId, { rank: entry.rank, totalScore: entry.totalScore });
      });
      console.log(`\u2705 [RANK_CHANGE] \uC5B4\uC81C \uB9AC\uB354\uBCF4\uB4DC \uB370\uC774\uD130 \uB85C\uB4DC \uC644\uB8CC: ${yesterdayRankMap.size}\uBA85`);
    }
    const entries = [];
    const entriesToSave = [];
    let currentRank = 1;
    for (let i = 0; i < usersWithActiveDays.length; i++) {
      const user = usersWithActiveDays[i];
      if (i > 0) {
        const currentTotal = user.finalScore;
        const prevTotal = usersWithActiveDays[i - 1].finalScore;
        if (currentTotal > 0) {
          currentRank = i + 1;
        } else if (Math.abs(currentTotal - prevTotal) > 1e-3) {
          currentRank = i + 1;
        }
      }
      const rank = currentRank;
      const isCommunityMember = this.communityMemberIds.has(user.userId);
      const yesterdayData = yesterdayRankMap.get(user.userId);
      let rankChange = null;
      if (yesterdayData) {
        const rankDiff = yesterdayData.rank - rank;
        rankChange = {
          direction: rankDiff > 0 ? "up" : rankDiff < 0 ? "down" : "same",
          amount: Math.abs(rankDiff),
          scoreChange: (user.totalScore || 0) - (yesterdayData.totalScore || 0)
        };
      } else {
        rankChange = { direction: "new", amount: 0, scoreChange: user.totalScore || 0 };
      }
      if (isCommunityMember) {
        console.log(`   \u2713 #${rank} @${user.username} (\uCEE4\uBBA4\uB2C8\uD2F0 \uBA64\uBC84)`);
      }
      if (i === 0) {
        console.log(`\u{1F50D} [DEBUG] Top user dominantLanguage check:`, {
          userId: user.userId,
          username: user.username,
          dominantLanguage: user.dominantLanguage,
          communityType: user.communityType,
          hasField: "dominantLanguage" in user
        });
      }
      const entry = {
        pk: `LEADERBOARD#${period}`,
        sk: `RANK#${rank.toString().padStart(4, "0")}#${user.userId}`,
        rank,
        userId: user.userId,
        username: user.username || user.userId,
        // username이 없으면 userId 사용
        ...user.displayName ? { displayName: user.displayName } : {},
        ...user.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {},
        ...typeof user.followersCount === "number" && user.followersCount >= 0 ? { followersCount: user.followersCount } : {},
        // 팔로워 수 추가 (0 이상의 숫자만)
        ...user.dominantLanguage ? { dominantLanguage: user.dominantLanguage } : {},
        // dominantLanguage 추가
        isCommunityMember,
        // 🆕 추가!
        ...rankChange && { rankChange },
        // 🆕 Phase 3: 순위 변동 정보 추가
        ...registeredUserIds.has(user.userId) ? { isRegisteredMember: true } : {},
        // 🆕 등록 회원 뱃지
        totalScore: user.totalScore,
        // ✅ Top Climbers를 위한 totalScore 필드 추가
        finalScore: user.finalScore ?? user.totalScore,
        // 🔧 ?? 연산자로 0도 유효한 값으로 처리 (|| 사용 시 0이 totalScore로 대체되는 버그 수정)
        totalLikes: user.totalLikes,
        totalReplies: user.totalReplies,
        totalReposts: user.totalReposts,
        totalQuotes: user.totalQuotes,
        totalMentions: user.totalMentions || 0,
        // 활동 일수 정보 추가 (동점자 처리용)
        ...this.config.enableActiveDaysTieBreaker ? {
          activeDays: user.activeDays || 0,
          activeDaysScore: user.activeDaysScore || 0
          // finalScore는 Line 580에서 이미 완벽하게 설정됨 (중복 제거로 NaN 방지)
        } : {},
        // 🆕 Activity Bonus 필드 추가
        ...this.config.enableActivityBonus ? {
          activityBonus: user.activityBonus || 0,
          activeDaysLast7: user.activeDaysLast7 || 0
        } : {},
        // 🆕 Inactivity Penalty 필드 추가
        ...this.config.enableInactivityPenalty ? {
          inactivityPenalty: user.inactivityPenalty || 0,
          daysSinceLastActivity: user.daysSinceLastActivity || 0
        } : {},
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        period,
        periodStartDate: startDate.toISOString(),
        periodEndDate: endDate.toISOString(),
        periodDescription: description
      };
      entries.push(entry);
      entriesToSave.push(entry);
    }
    if (entriesToSave.length > 0) {
      console.log(`\u{1F4BE} \uC0C8\uB85C\uC6B4 \uB9AC\uB354\uBCF4\uB4DC \uB370\uC774\uD130 ${entriesToSave.length}\uAC1C\uB97C \uC800\uC7A5\uD569\uB2C8\uB2E4.`);
      await this.clearPeriodLeaderboard(period);
      console.log(`\u{1F4E6} \uB9AC\uB354\uBCF4\uB4DC \uC800\uC7A5\uC744 \uC704\uD55C \uBC30\uCE58 \uAD6C\uC131 \uC2DC\uC791: ${entriesToSave.length}\uAC1C \uC5D4\uD2B8\uB9AC`);
      const batchSize = 25;
      for (let i = 0; i < entriesToSave.length; i += batchSize) {
        const batch = entriesToSave.slice(i, i + batchSize);
        const writeRequests = batch.map((entry) => ({
          PutRequest: {
            Item: (0, import_util_dynamodb2.marshall)(entry, { removeUndefinedValues: true })
          }
        }));
        try {
          const batchWriteResult = await this.ddbClient.send(new import_client_dynamodb2.BatchWriteItemCommand({
            RequestItems: {
              [this.config.cumulativeTableName]: writeRequests
            }
          }));
          if (batchWriteResult.UnprocessedItems && Object.keys(batchWriteResult.UnprocessedItems).length > 0) {
            console.warn(`\u26A0\uFE0F \uC77C\uBD80 \uB9AC\uB354\uBCF4\uB4DC \uD56D\uBAA9 \uCC98\uB9AC \uC2E4\uD328, \uC7AC\uC2DC\uB3C4 \uD544\uC694`);
          }
        } catch (error) {
          console.error(`\u274C \uB9AC\uB354\uBCF4\uB4DC \uBC30\uCE58 \uC800\uC7A5 \uC2E4\uD328 (\uBC30\uCE58 \uC778\uB371\uC2A4: ${i / batchSize})`, error);
        }
      }
      console.log(`\u2705 \uB9AC\uB354\uBCF4\uB4DC \uD56D\uBAA9 \uC800\uC7A5 \uC644\uB8CC: ${entriesToSave.length}\uAC1C`);
      await this.saveLeaderboardMetadata(period, entries.length, description, startDate, endDate);
      await this.saveLeaderboardSnapshot(period, entries, description, startDate, endDate, isEventEnded);
      await this.saveUserRankHistories(period, entries, isEventEnded);
    } else {
      console.log("\u{1F6E1}\uFE0F \uC0DD\uC131\uB41C \uB9AC\uB354\uBCF4\uB4DC \uD56D\uBAA9\uC774 \uC5C6\uC73C\uBBC0\uB85C, \uAE30\uC874 \uB9AC\uB354\uBCF4\uB4DC \uB370\uC774\uD130\uB97C \uC720\uC9C0\uD569\uB2C8\uB2E4.");
    }
    console.log(`\u2705 ${description} \uC0DD\uC131 \uC644\uB8CC`, {
      period,
      entriesGenerated: entries.length,
      topScore: entries[0]?.totalScore || 0,
      snapshotSaved: true
    });
    return {
      period,
      entriesGenerated: entries.length,
      topScore: entries[0]?.totalScore || 0,
      description
    };
  }
  async getActivitiesInPeriod(startDate, endDate) {
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];
    console.log(`[EventLeaderboard] \uD30C\uC774\uD504\uB77C\uC778 \uC2E4\uD589\uC77C \uBC94\uC704: ${startDateStr} ~ ${endDateStr}`);
    console.log(`[EventLeaderboard] lastProcessedDate \uAE30\uC900\uC73C\uB85C \uD574\uB2F9 \uAE30\uAC04\uC5D0 \uC218\uC9D1\uB41C \uB370\uC774\uD130 \uC870\uD68C \uC911...`);
    const allActivities = [];
    let lastEvaluatedKey = void 0;
    do {
      const scanParams = {
        TableName: this.config.cumulativeTableName,
        FilterExpression: "begins_with(sk, :sk_prefix) AND lastProcessedDate BETWEEN :start_date AND :end_date",
        ExpressionAttributeValues: (0, import_util_dynamodb2.marshall)({
          ":sk_prefix": "RECENT#",
          ":start_date": startDateStr,
          ":end_date": endDateStr
        }),
        ExclusiveStartKey: lastEvaluatedKey
      };
      try {
        const result = await this.ddbClient.send(new import_client_dynamodb2.ScanCommand(scanParams));
        if (result.Items) {
          allActivities.push(...result.Items.map((item) => (0, import_util_dynamodb2.unmarshall)(item)));
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } catch (error) {
        console.error("[EventLeaderboard] \uD65C\uB3D9 \uB370\uC774\uD130 \uC2A4\uCE94 \uC911 \uC624\uB958 \uBC1C\uC0DD:", error);
        break;
      }
    } while (lastEvaluatedKey);
    console.log(`[EventLeaderboard] \uCD1D ${allActivities.length}\uAC1C\uC758 \uD65C\uB3D9 \uB370\uC774\uD130\uB97C \uCC3E\uC558\uC2B5\uB2C8\uB2E4.`);
    console.log(`[EventLeaderboard] (\uC2A4\uB0C5\uC0F7 \uBC29\uC2DD: ${startDateStr}~${endDateStr} \uAE30\uAC04 \uC911 \uD30C\uC774\uD504\uB77C\uC778\uC774 \uC218\uC9D1\uD55C \uB370\uC774\uD130)`);
    return allActivities;
  }
  async calculatePeriodScores(startDate, endDate, period, collectedEngagements) {
    if (period === "CUMULATIVE" /* CUMULATIVE */) {
      console.log("\u{1F4CA} \uC804\uCCB4 \uAE30\uAC04 \uB204\uC801 \uC810\uC218 \uC0AC\uC6A9");
      const userScores2 = await this.getAllCumulativeScores();
      return userScores2.filter((score) => score.totalScore > 0).map((score) => ({
        userId: score.userId,
        username: score.username,
        displayName: score.displayName,
        profileImageUrl: score.profileImageUrl,
        followersCount: score.followersCount,
        dominantLanguage: score.dominantLanguage,
        communityType: score.communityType,
        totalScore: score.totalScore,
        totalLikes: score.totalLikes,
        totalReplies: score.totalReplies,
        totalReposts: score.totalReposts,
        totalQuotes: score.totalQuotes,
        totalMentions: score.totalMentions || 0
      }));
    }
    console.log(`\u{1F4CA} [EventLeaderboard] ${period} \uAE30\uAC04 \uC810\uC218\uB97C \uAC00\uC911\uCE58 \uC801\uC6A9\uD558\uC5EC \uACC4\uC0B0\uD569\uB2C8\uB2E4.`);
    console.log(`\u{1F4CA} [EventLeaderboard] RECENT# \uD14C\uC774\uBE14 \uC870\uD68C: ${startDate.toISOString().split("T")[0]} ~ ${endDate.toISOString().split("T")[0]}`);
    const activities = await this.getActivitiesInPeriod(startDate, endDate);
    console.log(`\u{1F4CA} [EventLeaderboard] RECENT# \uC870\uD68C \uC644\uB8CC: ${activities.length}\uAC1C \uD65C\uB3D9 \uB370\uC774\uD130`);
    if (activities.length === 0) {
      console.log(`\u26A0\uFE0F [EventLeaderboard] ${period} \uAE30\uAC04\uC5D0 \uD65C\uB3D9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      return [];
    }
    const enrichedActivities = await this.enrichActivitiesWithProfiles(
      activities,
      collectedEngagements
    );
    console.log(`\u{1F4CA} [EventLeaderboard] ${period}: ${enrichedActivities.length}\uAC1C \uD65C\uB3D9 \uB370\uC774\uD130 \uC870\uD68C \uC644\uB8CC`);
    const deltaResult = await this.deltaCalculator.recalculateFromEngagements(
      enrichedActivities,
      endDate.toISOString().split("T")[0]
    );
    console.log(`\u2705 [EventLeaderboard] ${period}: ${deltaResult.userDeltas.length}\uBA85 \uC810\uC218 \uACC4\uC0B0 \uC644\uB8CC`);
    const userScores = deltaResult.userDeltas.map((delta) => ({
      userId: delta.userId,
      username: delta.username || "unknown",
      displayName: delta.displayName || delta.username || "unknown",
      profileImageUrl: delta.profileImageUrl,
      followersCount: delta.followersCount || 0,
      dominantLanguage: delta.dominantLanguage,
      communityType: delta.dominantLanguage === "ko" ? "korean" : "global",
      totalScore: delta.scoreChange,
      // ✅ 이미 가중치 적용된 점수
      totalLikes: delta.likesChange,
      totalReplies: delta.repliesChange,
      totalReposts: delta.repostsChange,
      totalQuotes: delta.quotesChange,
      totalMentions: delta.mentionsChange,
      // 가중치 메타데이터도 포함
      communityWeight: delta.communityWeight,
      languageMultiplier: delta.languageMultiplier,
      followerWeight: delta.followerWeight,
      originalScore: delta.originalScore
    }));
    const cumulativeScores = await this.getAllCumulativeScores();
    const cumulativeMap = new Map(cumulativeScores.map((s) => [s.userId, s]));
    for (const userScore of userScores) {
      const cumulativeData = cumulativeMap.get(userScore.userId);
      if (cumulativeData) {
        if (!userScore.username || userScore.username === "unknown") {
          userScore.username = cumulativeData.username;
        }
        if (!userScore.displayName || userScore.displayName === "unknown") {
          userScore.displayName = cumulativeData.displayName;
        }
        if (!userScore.profileImageUrl) {
          userScore.profileImageUrl = cumulativeData.profileImageUrl;
        }
        if (!userScore.dominantLanguage || userScore.dominantLanguage === "unknown") {
          userScore.dominantLanguage = cumulativeData.dominantLanguage;
        }
      }
    }
    console.log(`\u{1F4CA} [EventLeaderboard] ${period}: \uCD5C\uC885 ${userScores.length}\uBA85 \uBC18\uD658`);
    console.log(
      `   \uC608\uC2DC \uC810\uC218 (\uC0C1\uC704 3\uBA85):`,
      userScores.sort((a, b) => b.totalScore - a.totalScore).slice(0, 3).map((u) => ({
        username: u.username,
        totalScore: u.totalScore,
        originalScore: u.originalScore,
        communityWeight: u.communityWeight,
        language: u.dominantLanguage
      }))
    );
    return userScores;
  }
  async getAllCumulativeScores() {
    console.log("\u{1F50D} GSI\uB97C \uC0AC\uC6A9\uD558\uC5EC \uC0C1\uC704 3000\uBA85 \uC810\uC218 \uB370\uC774\uD130 \uC870\uD68C \uC2DC\uC791 (total-score-index)");
    const result = await this.ddbClient.send(new import_client_dynamodb2.QueryCommand({
      TableName: this.config.cumulativeTableName,
      IndexName: "total-score-index",
      KeyConditionExpression: "leaderboardIdentifier = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: "SCORE_RECORD" }
      },
      ScanIndexForward: false,
      // 내림차순 정렬 (높은 점수부터)
      Limit: 3e3
      // 상위 3000명 조회 (프로필 이미지 보존을 위해 확장)
    }));
    const topScores = [];
    if (result.Items) {
      const scores = result.Items.map((item) => {
        const unmarshalled = (0, import_util_dynamodb2.unmarshall)(item);
        return unmarshalled;
      });
      topScores.push(...scores);
    }
    console.log(`\u2705 GSI \uCFFC\uB9AC \uC644\uB8CC: ${topScores.length}\uBA85 \uC870\uD68C`);
    console.log("\u{1F50D} [PROFILE_RECOVERY] \uD504\uB85C\uD544 \uB204\uB77D \uC0AC\uC6A9\uC790 \uD655\uC778 \uC2DC\uC791");
    await this.recoverMissingProfiles(topScores);
    console.log("\u2705 \uC0C1\uC704 500\uBA85 \uC810\uC218 \uB370\uC774\uD130 \uCC98\uB9AC \uC644\uB8CC:", { totalUsers: topScores.length });
    return topScores;
  }
  /**
   * 🔥 Phase 2.1.2: 누락된 프로필 정보들을 강화된 시스템으로 복구
   * 1단계: CentralizedProfileManager를 통한 고품질 프로필 복구
   * 2단계: UserProfiles 테이블에서 폴백 조회
   * 3단계: 관리자 계정 하드코딩 매핑
   * 4단계: displayName을 username으로 사용 (최후 fallback)
   */
  async recoverMissingProfiles(allScores) {
    const incompleteProfiles = this.identifyIncompleteProfiles(allScores);
    if (incompleteProfiles.length === 0) {
      console.log("\u{1F389} [PROFILE_RECOVERY] \uBAA8\uB4E0 \uC0AC\uC6A9\uC790\uC758 \uD504\uB85C\uD544 \uC815\uBCF4\uAC00 \uC644\uC804\uD569\uB2C8\uB2E4.");
      return;
    }
    console.log(`\u{1F527} [PROFILE_RECOVERY] \uD504\uB85C\uD544 \uBCF5\uAD6C \uB300\uC0C1: ${incompleteProfiles.length}\uBA85`);
    const recoveryStats = {
      totalTargets: incompleteProfiles.length,
      centralizedRecovered: 0,
      userProfilesRecovered: 0,
      hardcodedMapped: 0,
      fallbackApplied: 0,
      totalRecovered: 0,
      qualityImprovement: 0
    };
    console.log("\u{1F50D} [PROFILE_RECOVERY] 1\uB2E8\uACC4: CentralizedProfileManager\uB97C \uD1B5\uD55C \uD504\uB85C\uD544 \uBCF5\uAD6C");
    recoveryStats.centralizedRecovered = await this.recoverWithCentralizedManager(incompleteProfiles);
    console.log("\u{1F50D} [PROFILE_RECOVERY] 2\uB2E8\uACC4: UserProfiles \uD14C\uC774\uBE14\uC5D0\uC11C \uD3F4\uBC31 \uBCF5\uAD6C");
    recoveryStats.userProfilesRecovered = await this.recoverFromUserProfiles(incompleteProfiles);
    console.log("\u{1F50D} [PROFILE_RECOVERY] 3\uB2E8\uACC4: \uAD00\uB9AC\uC790 \uACC4\uC815 \uD558\uB4DC\uCF54\uB529 \uB9E4\uD551");
    recoveryStats.hardcodedMapped = this.applyHardcodedMappings(incompleteProfiles);
    console.log("\u{1F50D} [PROFILE_RECOVERY] 4\uB2E8\uACC4: displayName fallback");
    recoveryStats.fallbackApplied = this.applyDisplayNameFallback(incompleteProfiles);
    await this.analyzeAndReportRecoveryResults(incompleteProfiles, recoveryStats);
  }
  /**
   * 🔥 Phase 2.1.2: 프로필 정보가 불완전한 사용자들 식별
   */
  identifyIncompleteProfiles(allScores) {
    return allScores.filter((score) => {
      const hasValidUsername = ProfileValidators.isValidUsername(score.username);
      const hasValidDisplayName = ProfileValidators.isValidDisplayName(score.displayName);
      const hasProfileImage = ProfileValidators.isValidProfileImageUrl(score.profileImageUrl);
      const hasFollowersCount = ProfileValidators.isValidFollowersCount(score.followersCount);
      return !hasValidUsername || !hasValidDisplayName || !hasProfileImage || !hasFollowersCount;
    });
  }
  /**
   * 🔥 Phase 2.1.2: CentralizedProfileManager를 통한 고품질 프로필 복구
   */
  async recoverWithCentralizedManager(scores) {
    let recoveredCount = 0;
    const batchSize = 10;
    console.log(`\u{1F4CA} [CENTRALIZED_RECOVERY] ${scores.length}\uBA85\uC758 \uD504\uB85C\uD544 \uBCF5\uAD6C \uC2DC\uC791...`);
    for (let i = 0; i < scores.length; i += batchSize) {
      const batch = scores.slice(i, i + batchSize);
      const batchPromises = batch.map(async (score) => {
        try {
          let recoveredProfile = null;
          try {
            const profileResult = await this.centralizedProfileManager.processUserProfiles([{
              userId: score.userId,
              username: score.username,
              displayName: score.displayName,
              profileImageUrl: score.profileImageUrl,
              followersCount: score.followersCount
            }]);
            if (profileResult && profileResult.profiles && profileResult.profiles.size > 0) {
              const userProfile = profileResult.profiles.get(score.userId);
              if (userProfile) {
                recoveredProfile = userProfile;
                console.log(`\u2705 [SAFE_RECOVERY] \uC0AC\uC6A9\uC790 ${score.userId} \uD504\uB85C\uD544 \uBCF5\uAD6C \uC131\uACF5`);
              } else {
                console.log(`\u26A0\uFE0F [SAFE_RECOVERY] \uC0AC\uC6A9\uC790 ${score.userId} \uD504\uB85C\uD544 \uBCF5\uAD6C \uACB0\uACFC \uC5C6\uC74C`);
              }
            } else {
              console.log(`\u26A0\uFE0F [SAFE_RECOVERY] \uC0AC\uC6A9\uC790 ${score.userId} \uD504\uB85C\uD544 \uBCF5\uAD6C \uC2E4\uD328 - \uBE48 \uACB0\uACFC`);
            }
          } catch (profileError) {
            console.error(`\u274C [SAFE_RECOVERY] \uD504\uB85C\uD544 \uBCF5\uAD6C \uC608\uC678 - ${score.userId}:`, profileError);
            recoveredProfile = null;
          }
          let improved = false;
          if (recoveredProfile) {
            if (!ProfileValidators.isValidUsername(score.username) && ProfileValidators.isValidUsername(recoveredProfile.username)) {
              score.username = recoveredProfile.username;
              improved = true;
              console.log(`\u2705 [SAFE_RECOVERY] Username \uBCF5\uAD6C: ${score.userId} \u2192 ${score.username}`);
            }
            if (!ProfileValidators.isValidDisplayName(score.displayName) && ProfileValidators.isValidDisplayName(recoveredProfile.displayName)) {
              score.displayName = recoveredProfile.displayName;
              improved = true;
              console.log(`\u2705 [SAFE_RECOVERY] DisplayName \uBCF5\uAD6C: ${score.userId} \u2192 ${recoveredProfile.displayName}`);
            }
            if (!ProfileValidators.isValidProfileImageUrl(score.profileImageUrl) && recoveredProfile.profileImageUrl) {
              score.profileImageUrl = recoveredProfile.profileImageUrl;
              improved = true;
              console.log(`\u2705 [SAFE_RECOVERY] ProfileImage \uBCF5\uAD6C: ${score.userId}`);
            }
            if (!ProfileValidators.isValidFollowersCount(score.followersCount) && ProfileValidators.isValidFollowersCount(recoveredProfile.followersCount)) {
              score.followersCount = recoveredProfile.followersCount;
              improved = true;
              console.log(`\u2705 [SAFE_RECOVERY] FollowersCount \uBCF5\uAD6C: ${score.userId} \u2192 ${recoveredProfile.followersCount}`);
            }
          } else {
            console.log(`\u26A0\uFE0F [SAFE_RECOVERY] \uC0AC\uC6A9\uC790 ${score.userId} - \uD504\uB85C\uD544 \uBCF5\uAD6C \uACB0\uACFC\uAC00 null\uC774\uBBC0\uB85C \uAE30\uC874 \uB370\uC774\uD130 \uBCF4\uC874`);
          }
          if (improved) {
            recoveredCount++;
          }
        } catch (error) {
          console.error(`\u274C [CENTRALIZED_RECOVERY] \uD504\uB85C\uD544 \uBCF5\uAD6C \uC2E4\uD328 - ${score.userId}:`, error);
        }
      });
      await Promise.all(batchPromises);
      if (i + batchSize < scores.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    console.log(`\u{1F3AF} [CENTRALIZED_RECOVERY] ${recoveredCount}\uBA85\uC758 \uD504\uB85C\uD544 \uBCF5\uAD6C \uC644\uB8CC`);
    return recoveredCount;
  }
  /**
   * 🔥 Phase 2.1.2: UserProfiles 테이블에서 twitterId 기반으로 프로필 정보 복구 (폴백)
   */
  async recoverFromUserProfiles(scores) {
    try {
      const profilesResult = await this.ddbClient.send(new import_client_dynamodb2.ScanCommand({
        TableName: "UserProfiles",
        FilterExpression: "attribute_exists(twitterId) AND attribute_exists(twitterHandle)"
      }));
      if (!profilesResult.Items || profilesResult.Items.length === 0) {
        console.log("\u{1F4DD} UserProfiles \uD14C\uC774\uBE14\uC5D0 Twitter \uD504\uB85C\uD544 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
        return 0;
      }
      const twitterIdToHandle = {};
      for (const item of profilesResult.Items) {
        const profile = (0, import_util_dynamodb2.unmarshall)(item);
        if (profile.twitterId && profile.twitterHandle) {
          twitterIdToHandle[profile.twitterId] = profile.twitterHandle;
        }
      }
      console.log(`\u{1F4DA} UserProfiles\uC5D0\uC11C ${Object.keys(twitterIdToHandle).length}\uAC1C \uB9E4\uD551 \uBC1C\uACAC`);
      let recoveredCount = 0;
      for (const score of scores) {
        if (twitterIdToHandle[score.userId]) {
          score.username = twitterIdToHandle[score.userId];
          console.log(`\u2705 UserProfiles\uC5D0\uC11C \uBCF5\uAD6C: ${score.userId} \u2192 ${score.username}`);
          recoveredCount++;
        }
      }
      console.log(`\u{1F3AF} UserProfiles\uC5D0\uC11C ${recoveredCount}\uBA85\uC758 username \uBCF5\uAD6C \uC644\uB8CC`);
      return recoveredCount;
    } catch (error) {
      console.error("\u274C UserProfiles\uC5D0\uC11C username \uBCF5\uAD6C \uC2E4\uD328:", error);
      return 0;
    }
  }
  /**
   * 🔥 Phase 2.1.2: 관리자 계정 등 알려진 계정들의 하드코딩 매핑 (폴백)
   */
  applyHardcodedMappings(scores) {
    const knownMappings = {};
    const targetUserId = process.env.TARGET_USER_ID || "1863020068785004544";
    const targetUsername = process.env.TARGET_USERNAME || "Naru010110";
    knownMappings[targetUserId] = targetUsername;
    const adminUsernames = (process.env.ADMIN_USERNAMES || "Naru010110,overclocksalmon").split(",");
    knownMappings["1503536552164556804"] = "overclocksalmon";
    let mappedCount = 0;
    for (const score of scores) {
      if (knownMappings[score.userId] && (!score.username || score.username === score.userId || score.username === "unknown")) {
        score.username = knownMappings[score.userId];
        console.log(`\u{1F527} \uD558\uB4DC\uCF54\uB529 \uB9E4\uD551: ${score.userId} \u2192 ${score.username}`);
        mappedCount++;
      }
    }
    console.log(`\u{1F3AF} \uD558\uB4DC\uCF54\uB529 \uB9E4\uD551\uC5D0\uC11C ${mappedCount}\uBA85\uC758 username \uC124\uC815 \uC644\uB8CC`);
    return mappedCount;
  }
  /**
   * 🔥 Phase 2.1.2: displayName을 username으로 사용하는 최후 fallback 로직
   */
  applyDisplayNameFallback(scores) {
    let fallbackCount = 0;
    for (const score of scores) {
      if ((!score.username || score.username === score.userId || score.username === "unknown") && score.displayName && score.displayName !== score.userId) {
        score.username = score.displayName;
        console.log(`\u{1F504} displayName fallback: ${score.userId} \u2192 ${score.username}`);
        fallbackCount++;
      }
    }
    console.log(`\u{1F3AF} displayName fallback\uC5D0\uC11C ${fallbackCount}\uBA85\uC758 username \uC124\uC815 \uC644\uB8CC`);
    return fallbackCount;
  }
  /**
   * 🔥 Phase 2.1.2: 복구 결과 분석 및 CloudWatch 메트릭 보고
   */
  async analyzeAndReportRecoveryResults(incompleteProfiles, recoveryStats) {
    const afterRecovery = {
      totalProfiles: incompleteProfiles.length,
      completeProfiles: 0,
      validUsernames: 0,
      validDisplayNames: 0,
      validProfileImages: 0,
      validFollowersCounts: 0,
      averageQualityScore: 0
    };
    let totalQualityScore = 0;
    incompleteProfiles.forEach((score) => {
      const hasValidUsername = ProfileValidators.isValidUsername(score.username);
      const hasValidDisplayName = ProfileValidators.isValidDisplayName(score.displayName);
      const hasProfileImage = ProfileValidators.isValidProfileImageUrl(score.profileImageUrl);
      const hasFollowersCount = ProfileValidators.isValidFollowersCount(score.followersCount);
      if (hasValidUsername) afterRecovery.validUsernames++;
      if (hasValidDisplayName) afterRecovery.validDisplayNames++;
      if (hasProfileImage) afterRecovery.validProfileImages++;
      if (hasFollowersCount) afterRecovery.validFollowersCounts++;
      if (hasValidUsername && hasValidDisplayName && hasProfileImage && hasFollowersCount) {
        afterRecovery.completeProfiles++;
      }
      let qualityScore = 0;
      if (hasValidUsername) qualityScore += 30;
      if (hasValidDisplayName) qualityScore += 30;
      if (hasProfileImage) qualityScore += 20;
      if (hasFollowersCount) qualityScore += 20;
      totalQualityScore += qualityScore;
    });
    afterRecovery.averageQualityScore = afterRecovery.totalProfiles > 0 ? totalQualityScore / afterRecovery.totalProfiles : 0;
    recoveryStats.totalRecovered = recoveryStats.centralizedRecovered + recoveryStats.userProfilesRecovered + recoveryStats.hardcodedMapped + recoveryStats.fallbackApplied;
    const recoverySuccessRate = afterRecovery.totalProfiles > 0 ? afterRecovery.completeProfiles / afterRecovery.totalProfiles * 100 : 0;
    console.log(`\u{1F4CA} [PROFILE_RECOVERY] \uBCF5\uAD6C \uACB0\uACFC \uBD84\uC11D:`);
    console.log(`   \u{1F3AF} \uB300\uC0C1: ${recoveryStats.totalTargets}\uBA85`);
    console.log(`   \u2705 \uC911\uC559\uD654 \uC2DC\uC2A4\uD15C: ${recoveryStats.centralizedRecovered}\uBA85`);
    console.log(`   \u{1F4DA} UserProfiles \uD3F4\uBC31: ${recoveryStats.userProfilesRecovered}\uBA85`);
    console.log(`   \u{1F527} \uD558\uB4DC\uCF54\uB529 \uB9E4\uD551: ${recoveryStats.hardcodedMapped}\uBA85`);
    console.log(`   \u{1F504} DisplayName \uD3F4\uBC31: ${recoveryStats.fallbackApplied}\uBA85`);
    console.log(`   \u{1F4C8} \uC804\uCCB4 \uC644\uC804\uC131: ${afterRecovery.completeProfiles}/${afterRecovery.totalProfiles}\uBA85 (${recoverySuccessRate.toFixed(1)}%)`);
    console.log(`   \u{1F4CA} \uD3C9\uADE0 \uD488\uC9C8 \uC810\uC218: ${afterRecovery.averageQualityScore.toFixed(1)}\uC810`);
    console.log(`\u{1F4CB} [PROFILE_RECOVERY] \uD544\uB4DC\uBCC4 \uC644\uC131\uB3C4:`);
    console.log(`   \u{1F464} Username: ${afterRecovery.validUsernames}/${afterRecovery.totalProfiles}\uBA85 (${(afterRecovery.validUsernames / afterRecovery.totalProfiles * 100).toFixed(1)}%)`);
    console.log(`   \u{1F3F7}\uFE0F DisplayName: ${afterRecovery.validDisplayNames}/${afterRecovery.totalProfiles}\uBA85 (${(afterRecovery.validDisplayNames / afterRecovery.totalProfiles * 100).toFixed(1)}%)`);
    console.log(`   \u{1F5BC}\uFE0F ProfileImage: ${afterRecovery.validProfileImages}/${afterRecovery.totalProfiles}\uBA85 (${(afterRecovery.validProfileImages / afterRecovery.totalProfiles * 100).toFixed(1)}%)`);
    console.log(`   \u{1F465} FollowersCount: ${afterRecovery.validFollowersCounts}/${afterRecovery.totalProfiles}\uBA85 (${(afterRecovery.validFollowersCounts / afterRecovery.totalProfiles * 100).toFixed(1)}%)`);
    await this.recordRecoveryMetrics(recoveryStats, afterRecovery, recoverySuccessRate);
    if (recoverySuccessRate < 70) {
      console.warn(`\u26A0\uFE0F [PROFILE_RECOVERY] \uBCF5\uAD6C \uC131\uACF5\uB960\uC774 \uB0AE\uC2B5\uB2C8\uB2E4 (${recoverySuccessRate.toFixed(1)}%). \uC2DC\uC2A4\uD15C \uC810\uAC80\uC774 \uD544\uC694\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`);
    }
  }
  /**
   * 🔥 Phase 2.1.2: 프로필 복구 메트릭을 CloudWatch에 기록
   */
  async recordRecoveryMetrics(recoveryStats, afterRecovery, recoverySuccessRate) {
    try {
      console.log(`\u{1F4CA} \uD504\uB85C\uD544 \uBCF5\uAD6C \uBA54\uD2B8\uB9AD: ${recoverySuccessRate}% \uC131\uACF5\uB960, ${recoveryStats.totalTargets}\uAC1C \uB300\uC0C1`);
    } catch (error) {
      console.error("\u274C \uBA54\uD2B8\uB9AD \uAE30\uB85D \uC2E4\uD328:", error);
    }
  }
  async clearPeriodLeaderboard(period) {
    const result = await this.ddbClient.send(new import_client_dynamodb2.QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: `LEADERBOARD#${period}` },
        ":sk": { S: "RANK#" }
      }
    }));
    if (result.Items) {
      for (const item of result.Items) {
        await this.ddbClient.send(new import_client_dynamodb2.DeleteItemCommand({
          TableName: this.config.cumulativeTableName,
          Key: {
            pk: item.pk,
            sk: item.sk
          }
        }));
      }
    }
  }
  async saveLeaderboardMetadata(period, totalEntries, description, startDate, endDate) {
    const metadata = {
      pk: `LEADERBOARD#${period}`,
      sk: "METADATA",
      totalEntries,
      description,
      period,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      version: "1.0"
    };
    await this.ddbClient.send(new import_client_dynamodb2.PutItemCommand({
      TableName: this.config.cumulativeTableName,
      Item: (0, import_util_dynamodb2.marshall)(metadata, { removeUndefinedValues: true })
    }));
  }
  /**
   * 리더보드 스냅샷 저장 - 완전한 데이터 복사본을 날짜별로 저장
   * TTL 정책: 이벤트 최종 스냅샷(10년 영구 보관), 일일 스냅샷(1년 후 삭제)
   */
  async saveLeaderboardSnapshot(period, entries, description, startDate, endDate, isEventEnded = false) {
    const currentDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const snapshotPK = `LEADERBOARD#${period}#${currentDate}`;
    let ttl;
    if (isEventEnded) {
      ttl = Math.floor(Date.now() / 1e3) + 3650 * 24 * 60 * 60;
      console.log(`\u{1F4CC} [EVENT_SNAPSHOT] \uCD5C\uC885 \uC2A4\uB0C5\uC0F7 \uC601\uAD6C \uBCF4\uAD00 (TTL: 10\uB144)`);
    } else {
      ttl = Math.floor(Date.now() / 1e3) + 365 * 24 * 60 * 60;
      console.log(`\u{1F4C5} [DAILY_SNAPSHOT] \uC77C\uC77C \uC2A4\uB0C5\uC0F7 TTL: 1\uB144`);
    }
    console.log(`\u{1F4F8} \uC2A4\uB0C5\uC0F7 \uC800\uC7A5 \uC2DC\uC791: ${snapshotPK}`, {
      period,
      date: currentDate,
      entriesCount: entries.length,
      isEventEnded,
      ttlExpiration: new Date(ttl * 1e3).toISOString(),
      ttlDays: isEventEnded ? 3650 : 365
    });
    try {
      await this.deleteExistingSnapshot(snapshotPK);
      const snapshotMetadata = {
        pk: snapshotPK,
        sk: "METADATA",
        totalEntries: entries.length,
        description,
        period,
        periodStartDate: startDate.toISOString(),
        periodEndDate: endDate.toISOString(),
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
        version: "1.0",
        snapshotDate: currentDate,
        ttl
        // TTL 필드 추가
      };
      await this.ddbClient.send(new import_client_dynamodb2.PutItemCommand({
        TableName: this.config.cumulativeTableName,
        Item: (0, import_util_dynamodb2.marshall)(snapshotMetadata, { removeUndefinedValues: true })
      }));
      console.log(`\u{1F50D} [DEBUG] \uC2A4\uB0C5\uC0F7 \uC800\uC7A5 \uB300\uC0C1 \uBD84\uC11D:`, {
        totalEntries: entries.length,
        firstEntry: entries[0] ? { rank: entries[0].rank, userId: entries[0].userId } : "none",
        lastEntry: entries[entries.length - 1] ? { rank: entries[entries.length - 1].rank, userId: entries[entries.length - 1].userId } : "none"
      });
      const batchSize = 25;
      const batches = [];
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        batches.push(batch);
      }
      console.log(`\u{1F4E6} [DEBUG] \uBC30\uCE58 \uAD6C\uC131 \uC644\uB8CC: ${batches.length}\uAC1C \uBC30\uCE58, \uBC30\uCE58\uB2F9 \uCD5C\uB300 ${batchSize}\uAC1C \uC5D4\uD2B8\uB9AC`);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`\u{1F504} [DEBUG] \uBC30\uCE58 ${batchIndex + 1}/${batches.length} \uCC98\uB9AC \uC2DC\uC791 (${batch.length}\uAC1C \uC5D4\uD2B8\uB9AC)`);
        const writeRequests = batch.map((entry, entryIndex) => {
          const globalIndex = batchIndex * batchSize + entryIndex;
          const sk = `RANK#${entry.rank.toString().padStart(4, "0")}#${globalIndex.toString().padStart(3, "0")}`;
          console.log(`  \u{1F4DD} [DEBUG] \uC5D4\uD2B8\uB9AC ${globalIndex + 1}: rank=${entry.rank}, userId=${entry.userId}, SK=${sk}`);
          return {
            PutRequest: {
              Item: (0, import_util_dynamodb2.marshall)({
                ...entry,
                pk: snapshotPK,
                // 스냅샷 PK로 변경
                sk,
                // 고유 SK 생성 (rank + index)
                ttl
                // TTL 필드 추가
              }, { removeUndefinedValues: true })
            }
          };
        });
        const keys = writeRequests.map((req) => {
          const item = req.PutRequest.Item;
          return `${item.pk.S}#${item.sk.S}`;
        });
        const uniqueKeys = new Set(keys);
        if (keys.length !== uniqueKeys.size) {
          console.error(`\u274C [DEBUG] \uBC30\uCE58 ${batchIndex + 1}\uC5D0\uC11C \uC911\uBCF5 \uD0A4 \uBC1C\uACAC!`, {
            totalKeys: keys.length,
            uniqueKeys: uniqueKeys.size,
            duplicates: keys.filter((key, index) => keys.indexOf(key) !== index)
          });
        } else {
          console.log(`\u2705 [DEBUG] \uBC30\uCE58 ${batchIndex + 1} \uD0A4 \uC911\uBCF5 \uAC80\uC0AC \uD1B5\uACFC`);
        }
        try {
          let currentRequests = writeRequests;
          let retryCount = 0;
          const maxRetries = 3;
          while (retryCount <= maxRetries && currentRequests.length > 0) {
            console.log(`\u{1F504} \uBC30\uCE58 ${batchIndex + 1} \uCC98\uB9AC \uC2DC\uB3C4 ${retryCount + 1}/${maxRetries + 1} (${currentRequests.length}\uAC1C \uC544\uC774\uD15C)`);
            const batchWriteResult = await this.ddbClient.send(new import_client_dynamodb2.BatchWriteItemCommand({
              RequestItems: {
                [this.config.cumulativeTableName]: currentRequests
              }
            }));
            if (batchWriteResult.UnprocessedItems && Object.keys(batchWriteResult.UnprocessedItems).length > 0) {
              const unprocessedItems = batchWriteResult.UnprocessedItems[this.config.cumulativeTableName] || [];
              console.warn(`\u26A0\uFE0F \uBC30\uCE58 ${batchIndex + 1} \uC2DC\uB3C4 ${retryCount + 1}: \uC77C\uBD80 \uC544\uC774\uD15C \uCC98\uB9AC \uC2E4\uD328`, {
                processedCount: currentRequests.length - unprocessedItems.length,
                unprocessedCount: unprocessedItems.length,
                retryCount: retryCount + 1
              });
              if (retryCount < maxRetries) {
                currentRequests = unprocessedItems.filter((item) => item.PutRequest);
                retryCount++;
                const waitTime = Math.pow(2, retryCount) * 1e3;
                console.log(`\u23F3 ${waitTime / 1e3}\uCD08 \uB300\uAE30 \uD6C4 \uC7AC\uC2DC\uB3C4...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
              } else {
                console.error(`\u274C \uBC30\uCE58 ${batchIndex + 1} \uCD5C\uB300 \uC7AC\uC2DC\uB3C4 \uD69F\uC218 \uCD08\uACFC:`, {
                  unprocessedCount: unprocessedItems.length,
                  unprocessedItems: unprocessedItems.slice(0, 3)
                  // 첫 3개만 로깅
                });
                break;
              }
            } else {
              console.log(`\u{1F4F8} \uBC30\uCE58 ${batchIndex + 1}/${batches.length} \uC800\uC7A5 \uC644\uB8CC (${currentRequests.length}\uAC1C \uC5D4\uD2B8\uB9AC)`);
              break;
            }
          }
        } catch (batchError) {
          console.error(`\u274C \uBC30\uCE58 ${batchIndex + 1} \uC800\uC7A5 \uC2E4\uD328:`, {
            error: batchError,
            errorMessage: batchError instanceof Error ? batchError.message : "Unknown error",
            batchSize: writeRequests.length,
            firstItem: writeRequests[0]?.PutRequest?.Item?.pk?.S || "unknown",
            lastItem: writeRequests[writeRequests.length - 1]?.PutRequest?.Item?.pk?.S || "unknown"
          });
          console.warn(`\u26A0\uFE0F \uBC30\uCE58 ${batchIndex + 1} \uAC74\uB108\uB6F0\uACE0 \uB2E4\uC74C \uBC30\uCE58 \uACC4\uC18D \uCC98\uB9AC`);
        }
      }
      console.log(`\u2705 \uC2A4\uB0C5\uC0F7 \uC800\uC7A5 \uC644\uB8CC: ${snapshotPK}`, {
        totalEntries: entries.length,
        totalBatches: batches.length,
        ttlExpiration: new Date(ttl * 1e3).toISOString()
      });
    } catch (error) {
      console.error(`\u274C \uC2A4\uB0C5\uC0F7 \uC800\uC7A5 \uC2E4\uD328: ${snapshotPK}`, {
        error,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : void 0,
        totalEntries: entries.length
      });
    }
  }
  /**
   * 기존 스냅샷 삭제 (중복 방지)
   */
  async deleteExistingSnapshot(snapshotPK) {
    try {
      console.log(`\u{1F5D1}\uFE0F \uAE30\uC874 \uC2A4\uB0C5\uC0F7 \uC0AD\uC81C \uC2DC\uC791: ${snapshotPK}`);
      const queryResult = await this.ddbClient.send(new import_client_dynamodb2.QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: snapshotPK }
        }
      }));
      if (!queryResult.Items || queryResult.Items.length === 0) {
        console.log(`\u{1F4DD} \uAE30\uC874 \uC2A4\uB0C5\uC0F7 \uC5C6\uC74C: ${snapshotPK}`);
        return;
      }
      const batchSize = 25;
      const items = queryResult.Items;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const deleteRequests = batch.map((item) => ({
          DeleteRequest: {
            Key: {
              pk: item.pk,
              sk: item.sk
            }
          }
        }));
        await this.ddbClient.send(new import_client_dynamodb2.BatchWriteItemCommand({
          RequestItems: {
            [this.config.cumulativeTableName]: deleteRequests
          }
        }));
        console.log(`\u{1F5D1}\uFE0F \uAE30\uC874 \uC2A4\uB0C5\uC0F7 \uBC30\uCE58 \uC0AD\uC81C \uC644\uB8CC: ${deleteRequests.length}\uAC1C \uC544\uC774\uD15C`);
      }
      console.log(`\u2705 \uAE30\uC874 \uC2A4\uB0C5\uC0F7 \uC0AD\uC81C \uC644\uB8CC: ${snapshotPK} (\uCD1D ${items.length}\uAC1C \uC544\uC774\uD15C)`);
    } catch (error) {
      console.error(`\u274C \uAE30\uC874 \uC2A4\uB0C5\uC0F7 \uC0AD\uC81C \uC2E4\uD328: ${snapshotPK}`, error);
    }
  }
  /**
   * 🆕 My Account Rank History: 사용자별 랭킹 히스토리 저장
   * 각 사용자의 일자별 랭킹 정보를 USER#{userId} PK로 저장
   * TTL 정책: 이벤트 최종 히스토리(10년 영구 보관), 일일 히스토리(1년 후 삭제)
   */
  async saveUserRankHistories(period, entries, isEventEnded = false) {
    const currentDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    let ttl;
    if (isEventEnded) {
      ttl = Math.floor(Date.now() / 1e3) + 3650 * 24 * 60 * 60;
      console.log(`\u{1F4CC} [EVENT_HISTORY] \uCD5C\uC885 \uD788\uC2A4\uD1A0\uB9AC \uC601\uAD6C \uBCF4\uAD00 (TTL: 10\uB144)`);
    } else {
      ttl = Math.floor(Date.now() / 1e3) + 365 * 24 * 60 * 60;
      console.log(`\u{1F4C5} [DAILY_HISTORY] \uC77C\uC77C \uD788\uC2A4\uD1A0\uB9AC TTL: 1\uB144`);
    }
    console.log(`\u{1F4CA} \uC0AC\uC6A9\uC790 \uB7AD\uD0B9 \uD788\uC2A4\uD1A0\uB9AC \uC800\uC7A5 \uC2DC\uC791: ${period} / ${currentDate}`, {
      period,
      date: currentDate,
      entriesCount: entries.length,
      isEventEnded,
      ttlExpiration: new Date(ttl * 1e3).toISOString(),
      ttlDays: isEventEnded ? 3650 : 365
    });
    try {
      const historyItems = entries.map((entry) => ({
        pk: `USER#${entry.userId}`,
        sk: `RANK_HISTORY#${period}#${currentDate}`,
        userId: entry.userId,
        username: entry.username,
        period,
        date: currentDate,
        rank: entry.rank,
        finalScore: entry.finalScore,
        totalScore: entry.totalScore,
        totalLikes: entry.totalLikes,
        totalReplies: entry.totalReplies,
        totalReposts: entry.totalReposts,
        totalQuotes: entry.totalQuotes,
        totalMentions: entry.totalMentions,
        displayName: entry.displayName,
        profileImageUrl: entry.profileImageUrl,
        followersCount: entry.followersCount,
        dominantLanguage: entry.dominantLanguage,
        ttl,
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
      }));
      const batchSize = 25;
      let successCount = 0;
      let failureCount = 0;
      for (let i = 0; i < historyItems.length; i += batchSize) {
        const batch = historyItems.slice(i, i + batchSize);
        const writeRequests = batch.map((item) => ({
          PutRequest: {
            Item: (0, import_util_dynamodb2.marshall)(item, { removeUndefinedValues: true })
          }
        }));
        try {
          let currentRequests = writeRequests;
          let retryCount = 0;
          const maxRetries = 3;
          while (retryCount <= maxRetries && currentRequests.length > 0) {
            const batchWriteResult = await this.ddbClient.send(new import_client_dynamodb2.BatchWriteItemCommand({
              RequestItems: {
                [this.config.cumulativeTableName]: currentRequests
              }
            }));
            if (batchWriteResult.UnprocessedItems && Object.keys(batchWriteResult.UnprocessedItems).length > 0) {
              const unprocessedItems = batchWriteResult.UnprocessedItems[this.config.cumulativeTableName] || [];
              if (retryCount < maxRetries) {
                currentRequests = unprocessedItems.filter((item) => item.PutRequest);
                retryCount++;
                const waitTime = Math.pow(2, retryCount) * 1e3;
                console.log(`\u23F3 \uC7AC\uC2DC\uB3C4 \uB300\uAE30 ${waitTime / 1e3}\uCD08... (${currentRequests.length}\uAC1C \uC544\uC774\uD15C)`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
              } else {
                failureCount += unprocessedItems.length;
                console.error(`\u274C \uCD5C\uB300 \uC7AC\uC2DC\uB3C4 \uD69F\uC218 \uCD08\uACFC (${unprocessedItems.length}\uAC1C \uC2E4\uD328)`);
                break;
              }
            } else {
              successCount += currentRequests.length;
              break;
            }
          }
        } catch (batchError) {
          failureCount += batch.length;
          console.error(`\u274C \uBC30\uCE58 \uC800\uC7A5 \uC2E4\uD328 (\uBC30\uCE58 \uC778\uB371\uC2A4: ${i / batchSize})`, {
            error: batchError,
            batchSize: batch.length
          });
        }
      }
      console.log(`\u2705 \uC0AC\uC6A9\uC790 \uB7AD\uD0B9 \uD788\uC2A4\uD1A0\uB9AC \uC800\uC7A5 \uC644\uB8CC: ${period} / ${currentDate}`, {
        totalEntries: historyItems.length,
        successCount,
        failureCount,
        ttlExpiration: new Date(ttl * 1e3).toISOString()
      });
    } catch (error) {
      console.error(`\u274C \uC0AC\uC6A9\uC790 \uB7AD\uD0B9 \uD788\uC2A4\uD1A0\uB9AC \uC800\uC7A5 \uC2E4\uD328: ${period} / ${currentDate}`, {
        error,
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
  /**
   * RECENT# 활동 데이터에 프로필 정보를 보강합니다.
   * 3-tier fallback: 파이프라인 데이터(최신) → CUMULATIVE_SCORE → 기본값
   */
  async enrichActivitiesWithProfiles(activities, pipelineData) {
    console.log(`\u{1F527} [PROFILE_ENRICH] \uD504\uB85C\uD544 \uBCF4\uAC15 \uC2DC\uC791: ${activities.length}\uAC1C \uD65C\uB3D9`);
    const pipelineProfileMap = /* @__PURE__ */ new Map();
    if (pipelineData && pipelineData.length > 0) {
      pipelineData.forEach((e) => {
        pipelineProfileMap.set(e.engaging_user_id, {
          displayName: e.engaging_display_name,
          followersCount: e.engaging_followers_count,
          profileImageUrl: e.engaging_profile_image_url,
          language: e.engaging_tweet_lang
        });
      });
      console.log(`\u{1F4CA} [PROFILE_ENRICH] \uD30C\uC774\uD504\uB77C\uC778 \uD504\uB85C\uD544: ${pipelineProfileMap.size}\uBA85`);
    }
    const cumulativeScores = await this.getAllCumulativeScores();
    const cumulativeProfileMap = /* @__PURE__ */ new Map();
    cumulativeScores.forEach((s) => {
      cumulativeProfileMap.set(s.userId, {
        displayName: s.displayName,
        followersCount: s.followersCount,
        profileImageUrl: s.profileImageUrl,
        language: s.dominantLanguage
      });
    });
    console.log(`\u{1F4CA} [PROFILE_ENRICH] CUMULATIVE_SCORE \uD504\uB85C\uD544: ${cumulativeProfileMap.size}\uBA85`);
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    const enrichedActivities = activities.map((activity) => {
      const userId = activity.engaging_user_id;
      let profile = pipelineProfileMap.get(userId);
      if (profile) {
        tier1Count++;
      } else {
        profile = cumulativeProfileMap.get(userId);
        if (profile) {
          tier2Count++;
        } else {
          tier3Count++;
          profile = {
            displayName: activity.engaging_username,
            followersCount: 0,
            profileImageUrl: void 0,
            language: "unknown"
          };
        }
      }
      return {
        ...activity,
        engaging_display_name: profile.displayName || activity.engaging_username,
        engaging_followers_count: profile.followersCount || 0,
        engaging_profile_image_url: profile.profileImageUrl,
        engaging_tweet_lang: profile.language || "unknown"
      };
    });
    console.log(`\u2705 [PROFILE_ENRICH] \uC644\uB8CC:`, {
      \uCD1D\uD65C\uB3D9\uC218: activities.length,
      \uD30C\uC774\uD504\uB77C\uC778\uD504\uB85C\uD544: tier1Count,
      \uB204\uC801\uD504\uB85C\uD544: tier2Count,
      \uAE30\uBCF8\uAC12: tier3Count
    });
    return enrichedActivities;
  }
  /**
   * 🆕 Phase 3: 특정 날짜의 리더보드 스냅샷을 가져오는 헬퍼 함수
   */
  async getLeaderboardSnapshot(period, daysAgo) {
    const targetDate = /* @__PURE__ */ new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    const dateString = targetDate.toISOString().split("T")[0];
    const snapshotPK = `LEADERBOARD#${period}#${dateString}`;
    console.log(`[RANK_CHANGE] ${daysAgo}\uC77C \uC804 \uC2A4\uB0C5\uC0F7 \uC870\uD68C \uC911: ${snapshotPK}`);
    try {
      const result = await this.ddbClient.send(new import_client_dynamodb2.QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: snapshotPK }
        }
      }));
      if (!result.Items || result.Items.length === 0) {
        console.log(`[RANK_CHANGE] \uC2A4\uB0C5\uC0F7 \uB370\uC774\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${snapshotPK}`);
        return null;
      }
      return result.Items.map((item) => (0, import_util_dynamodb2.unmarshall)(item)).filter((entry) => entry.sk.startsWith("RANK#"));
    } catch (error) {
      console.error(`[RANK_CHANGE] \uC2A4\uB0C5\uC0F7 \uC870\uD68C \uC2E4\uD328: ${snapshotPK}`, error);
      return null;
    }
  }
  /**
   * 🚀 API Gateway 캐시 무효화
   * 리더보드 생성 완료 후 API Gateway 캐시를 플러시하여 사용자가 즉시 최신 데이터를 볼 수 있도록 함
   */
  async flushAPIGatewayCache() {
    const apiGatewayId = process.env.API_GATEWAY_ID;
    const apiGatewayStage = process.env.API_GATEWAY_STAGE || "prod";
    if (!apiGatewayId) {
      console.warn("\u26A0\uFE0F [API_CACHE] API_GATEWAY_ID \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC544 \uCE90\uC2DC \uBB34\uD6A8\uD654\uB97C \uAC74\uB108\uB701\uB2C8\uB2E4.");
      return;
    }
    try {
      console.log(`\u{1F504} [API_CACHE] API Gateway \uCE90\uC2DC \uBB34\uD6A8\uD654 \uC2DC\uC791: ${apiGatewayId}/${apiGatewayStage}`);
      const command = new import_client_api_gateway.FlushStageCacheCommand({
        restApiId: apiGatewayId,
        stageName: apiGatewayStage
      });
      await this.apiGateway.send(command);
      console.log(`\u2705 [API_CACHE] API Gateway \uCE90\uC2DC \uBB34\uD6A8\uD654 \uC644\uB8CC`);
    } catch (error) {
      console.error(`\u274C [API_CACHE] API Gateway \uCE90\uC2DC \uBB34\uD6A8\uD654 \uC2E4\uD328:`, error);
    }
  }
};

// src/handlers/batch/cumulative-leaderboard-generator.ts
var ddbClient = new import_client_dynamodb3.DynamoDBClient({});
var handler = async (event) => {
  const startTime = Date.now();
  try {
    const config = getEnvConfigV2();
    const leaderboardGenerator = new LeaderboardGenerator(ddbClient, config);
    const eventData = event.body ? JSON.parse(event.body) : event;
    const { collectedEngagements } = eventData;
    console.log(`\u{1F4C5} [HANDLER] Generating leaderboards`, {
      hasCollectedEngagements: !!collectedEngagements,
      engagementsCount: collectedEngagements?.length || 0
    });
    const results = await leaderboardGenerator.generateAllLeaderboards(collectedEngagements);
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const response = {
      success: true,
      executedAt: (/* @__PURE__ */ new Date()).toISOString(),
      processingTimeMs: processingTime,
      results
    };
    console.log(`\u2705 [HANDLER] Leaderboard generation complete`, {
      cumulative: results.cumulative?.entriesGenerated,
      event1: results.event1?.entriesGenerated,
      event2: results.event2?.entriesGenerated,
      processingTimeMs: processingTime
    });
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error("\u274C [HANDLER] \uB9AC\uB354\uBCF4\uB4DC \uC0DD\uC131 \uC2E4\uD328:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executedAt: (/* @__PURE__ */ new Date()).toISOString()
      })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=cumulative-leaderboard-generator.js.map
