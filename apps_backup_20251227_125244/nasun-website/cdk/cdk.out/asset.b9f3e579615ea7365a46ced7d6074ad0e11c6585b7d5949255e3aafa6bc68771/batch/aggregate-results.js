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

// src/handlers/batch/aggregate-results.ts
var aggregate_results_exports = {};
__export(aggregate_results_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(aggregate_results_exports);
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");

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
function validateEnvConfigV2(config) {
  if (!config.enableOAuthAuthentication && !config.twitterBearerToken) {
    throw new Error("Twitter Bearer Token is required when OAuth authentication is disabled");
  }
  if (config.enableOAuthAuthentication) {
    const missingOAuthCredentials = [];
    if (!config.twitterApiKey) missingOAuthCredentials.push("TWITTER_API_KEY");
    if (!config.twitterApiSecret) missingOAuthCredentials.push("TWITTER_API_SECRET");
    if (!config.twitterAccessToken) missingOAuthCredentials.push("TWITTER_ACCESS_TOKEN");
    if (!config.twitterAccessTokenSecret) missingOAuthCredentials.push("TWITTER_ACCESS_TOKEN_SECRET");
    if (missingOAuthCredentials.length > 0) {
      throw new Error(`OAuth 1.0a authentication is enabled but missing credentials: ${missingOAuthCredentials.join(", ")}`);
    }
  }
  if (config.enableOAuth2Authentication || config.enableBookmarkScoring) {
    const missingOAuth2Credentials = [];
    if (!config.oauth2ClientId) missingOAuth2Credentials.push("OAUTH2_CLIENT_ID");
    if (!config.oauth2ClientSecret) missingOAuth2Credentials.push("OAUTH2_CLIENT_SECRET");
    if (!config.oauth2RedirectUri) missingOAuth2Credentials.push("OAUTH2_REDIRECT_URI");
    if (config.enableBookmarkScoring && missingOAuth2Credentials.length > 0) {
      throw new Error(`OAuth 2.0 authentication is required for bookmark scoring but missing credentials: ${missingOAuth2Credentials.join(", ")}`);
    }
    if (config.enableOAuth2Authentication && missingOAuth2Credentials.length > 0) {
      throw new Error(`OAuth 2.0 authentication is enabled but missing credentials: ${missingOAuth2Credentials.join(", ")}`);
    }
  }
  if (!config.targetUsername) {
    throw new Error("Target username is required");
  }
  if (!config.targetUserId) {
    console.warn("\u26A0\uFE0F TARGET_USER_ID not set, using default value. X API calls may fail.");
  } else if (!/^\d+$/.test(config.targetUserId)) {
    console.warn(`\u26A0\uFE0F TARGET_USER_ID should be numeric format, got: "${config.targetUserId}"`);
  }
  if (config.enableBookmarkScoring && (isNaN(config.bookmarkScoreValue) || config.bookmarkScoreValue <= 0)) {
    throw new Error("Bookmark score value must be a positive number");
  }
}

// src/handlers/batch/aggregate-results.ts
var region = process.env.AWS_REGION || "ap-northeast-2";
var dynamoClient = new import_client_dynamodb.DynamoDBClient({ region });
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(dynamoClient);
var cloudWatchClient = new import_client_cloudwatch.CloudWatchClient({ region });
var handler = async (event, context) => {
  const startTime = Date.now();
  console.log("Lambda context:", context);
  console.log("\u{1F3AF} Received raw event from Parallel state:", JSON.stringify(event, null, 2));
  const allEngagements = [];
  const engagementsCollected = { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 };
  let totalApiCalls = 0;
  let collectionDate = "unknown";
  try {
    const config = getEnvConfigV2();
    validateEnvConfigV2(config);
    const parallelResults = event.parallelResults || [];
    const batchResults = parallelResults?.[0] || [];
    const mentionsBranch = parallelResults?.[1];
    console.log("\u{1F4E6} Branch extraction:");
    console.log(`  - batchResults length: ${Array.isArray(batchResults) ? batchResults.length : 0}`);
    console.log(`  - mentionsBranch exists: ${!!mentionsBranch}`);
    if (event?.getTargetTweetsResult?.Payload?.collectionDate) {
      collectionDate = event.getTargetTweetsResult.Payload.collectionDate;
      console.log(`\u2705 collectionDate from getTargetTweetsResult: ${collectionDate}`);
    } else if (batchResults?.[0]?.collectionDate) {
      collectionDate = batchResults[0].collectionDate;
      console.log(`\u2705 collectionDate from batchResults: ${collectionDate}`);
    } else if (mentionsBranch?.mentionCollectorResult?.Payload?.collectionDate) {
      collectionDate = mentionsBranch.mentionCollectorResult.Payload.collectionDate;
      console.log(`\u2705 collectionDate from mentionCollectorResult: ${collectionDate}`);
    } else if (event?.highEngagementReplyResult?.Payload?.collectionDate) {
      collectionDate = event.highEngagementReplyResult.Payload.collectionDate;
      console.log(`\u2705 collectionDate from highEngagementReplyResult: ${collectionDate}`);
    } else {
      console.error(`\u274C CRITICAL: collectionDate\uB97C \uCD94\uCD9C\uD560 \uC218 \uC5C6\uC74C!`);
      console.error(`Debug - event.getTargetTweetsResult: ${!!event?.getTargetTweetsResult}`);
      console.error(`Debug - batchResults length: ${Array.isArray(batchResults) ? batchResults.length : 0}`);
      console.error(`Debug - mentionsBranch keys: ${mentionsBranch ? Object.keys(mentionsBranch).join(", ") : "null"}`);
    }
    const processCollectedData = (collectedData, type) => {
      if (collectedData && Array.isArray(collectedData) && collectedData.length > 0) {
        console.log(`  \u2705 Processing ${type}: ${collectedData.length} items`);
        allEngagements.push(...collectedData);
        engagementsCollected[type] += collectedData.length;
      } else {
        console.log(`  \u26AA No ${type} data`);
      }
    };
    console.log("\u{1F4CA} Processing engagement data from all batches:");
    if (Array.isArray(batchResults) && batchResults.length > 0) {
      console.log(`\u{1F504} Iterating through ${batchResults.length} batches...`);
      for (let i = 0; i < batchResults.length; i++) {
        const batch = batchResults[i];
        console.log(`
  === Batch ${i + 1}/${batchResults.length} ===`);
        processCollectedData(batch.likeResult?.Payload?.likesCollected, "likes");
        processCollectedData(batch.retweetResult?.Payload?.retweetsCollected, "reposts");
        processCollectedData(batch.quoteResult?.Payload?.quotesCollected, "quotes");
        totalApiCalls += batch.likeResult?.Payload?.apiCallsUsed || 0;
        totalApiCalls += batch.retweetResult?.Payload?.apiCallsUsed || 0;
        totalApiCalls += batch.quoteResult?.Payload?.apiCallsUsed || 0;
      }
    } else {
      console.log("\u26A0\uFE0F No batch results found in parallelResults[0]");
    }
    const mentionDetailsResults = event.mentionDetailsResults || [];
    if (Array.isArray(mentionDetailsResults) && mentionDetailsResults.length > 0) {
      console.log(`
  === Mentions Branch (${mentionDetailsResults.length} batches) ===`);
      for (let i = 0; i < mentionDetailsResults.length; i++) {
        const mentionBatch = mentionDetailsResults[i];
        const mentions = mentionBatch?.Payload?.mentions || [];
        if (mentions.length > 0) {
          console.log(`  \u2705 Mention batch ${i + 1}: ${mentions.length} mentions`);
          allEngagements.push(...mentions);
          engagementsCollected.mentions += mentions.length;
        }
        totalApiCalls += mentionBatch?.Payload?.apiCallCount || 0;
      }
      console.log(`  \u{1F4CA} Total mentions collected: ${engagementsCollected.mentions}`);
    } else {
      console.log("\n  === Mentions Branch ===");
      console.log("  \u26AA No mention batches found");
    }
    const highEngagementReplyResult = event.highEngagementReplyResult;
    if (highEngagementReplyResult?.Payload?.repliesData) {
      console.log(`
  === High Engagement Replies Branch ===`);
      processCollectedData(highEngagementReplyResult.Payload.repliesData, "replies");
    } else {
      console.log("\n  === High Engagement Replies Branch ===");
      console.log("  \u26AA No high engagement replies found");
    }
    engagementsCollected.total = allEngagements.length;
    console.log(`\u2705 Total engagements aggregated: ${engagementsCollected.total}`);
    if (engagementsCollected.total > 0) {
      console.log(`\u{1F4E6} \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8 \uC218\uC9D1 \uC644\uB8CC: ${allEngagements.length}\uAC1C (DB \uC800\uC7A5\uC740 ScoreCalculator\uC5D0\uC11C Delta \uACC4\uC0B0 \uD6C4 \uC218\uD589)`);
    }
    const qpzmzmData = allEngagements.filter((e) => e.engaging_user_id === "701404304683339776");
    if (qpzmzmData.length > 0) {
      console.log("[\uC871\uC801-qpzmzm] 3. aggregate-results: \uCDE8\uD569 \uC644\uB8CC \uD6C4 \uB370\uC774\uD130:", JSON.stringify(qpzmzmData, null, 2));
    }
    const processingTime = Date.now() - startTime;
    try {
      await cloudWatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
        Namespace: "NASUN/StepFunctions",
        MetricData: [
          { MetricName: "SuccessCount", Value: 1, Unit: "Count" },
          { MetricName: "EngagementsAggregated", Value: engagementsCollected.total, Unit: "Count" },
          { MetricName: "Duration", Value: processingTime, Unit: "Milliseconds" }
        ]
      }));
    } catch (metricError) {
      console.warn("Failed to send CloudWatch metrics:", metricError);
    }
    return {
      success: true,
      collectionDate,
      tweetsProcessed: engagementsCollected.total > 0 ? allEngagements.map((e) => e.tweet_id).filter((v, i, a) => a.indexOf(v) === i).length : 0,
      engagementsCollected,
      collectedEngagements: allEngagements,
      processingTime: `${processingTime}ms`,
      nextSteps: engagementsCollected.total > 0 ? ["\uC810\uC218 \uACC4\uC0B0 \uBC0F \uB9AC\uB354\uBCF4\uB4DC \uC0DD\uC131\uC744 \uC9C4\uD589\uD569\uB2C8\uB2E4."] : ["\uC218\uC9D1\uB41C \uC2E0\uADDC \uC778\uAC8C\uC774\uC9C0\uBA3C\uD2B8\uAC00 \uC5C6\uC5B4 \uB2E4\uC74C \uB2E8\uACC4\uB97C \uAC74\uB108\uB701\uB2C8\uB2E4."],
      executedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    console.error("\u274C [AGGREGATE] \uCE58\uBA85\uC801\uC778 \uC9D1\uACC4 \uC624\uB958 \uBC1C\uC0DD:", error);
    return {
      success: false,
      collectionDate,
      tweetsProcessed: 0,
      engagementsCollected,
      processingTime: `${Date.now() - startTime}ms`,
      nextSteps: [`\uC624\uB958 \uBC1C\uC0DD: ${error.message}`],
      executedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=aggregate-results.js.map
