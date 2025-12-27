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

// src/handlers/system/refresh-oauth2-token.ts
var refresh_oauth2_token_exports = {};
__export(refresh_oauth2_token_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(refresh_oauth2_token_exports);
var import_client_secrets_manager = require("@aws-sdk/client-secrets-manager");
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");

// src/utils/oauth2-helper.ts
async function refreshAccessToken(config, refreshToken) {
  const tokenUrl = "https://api.x.com/2/oauth2/token";
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.oauth2ClientId
  });
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (config.oauth2ClientSecret) {
    const credentials = Buffer.from(`${config.oauth2ClientId}:${config.oauth2ClientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body: body.toString()
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }
  const tokenData = await response.json();
  return tokenData;
}
function calculateTokenExpiry(expiresIn) {
  return new Date(Date.now() + expiresIn * 1e3);
}

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

// src/handlers/system/refresh-oauth2-token.ts
var handler = async (event) => {
  const startTime = Date.now();
  console.log("\u{1F504} [REFRESH_OAUTH2_TOKEN] \uC2DC\uC791:", JSON.stringify(event, null, 2));
  try {
    const secretsClient = new import_client_secrets_manager.SecretsManagerClient({ region: "ap-northeast-2" });
    const cloudwatchClient = new import_client_cloudwatch.CloudWatchClient({ region: "ap-northeast-2" });
    const secretId = process.env.TWITTER_TOKENS_SECRET_NAME || "nasun-twitter-tokens";
    console.log(`\u{1F511} [SECRET_ID] \uC0AC\uC6A9\uD560 Secret: ${secretId}`);
    console.log("\u{1F4E5} [SECRETS_MANAGER] \uD604\uC7AC \uD1A0\uD070 \uC815\uBCF4 \uC870\uD68C \uC911...");
    const getSecretResponse = await secretsClient.send(
      new import_client_secrets_manager.GetSecretValueCommand({
        SecretId: secretId
      })
    );
    const currentValue = JSON.parse(getSecretResponse.SecretString || "{}");
    const { oauth2 } = currentValue;
    if (!oauth2 || !oauth2.refreshToken) {
      throw new Error("OAuth 2.0 Refresh Token\uC774 Secrets Manager\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
    console.log(`\u{1F4CB} [TOKEN_INFO] \uD604\uC7AC \uB9CC\uB8CC \uC2DC\uAC04: ${new Date(oauth2.expiresAt).toISOString()}`);
    console.log(`\u{1F4CB} [TOKEN_INFO] \uD604\uC7AC \uC2A4\uCF54\uD504: ${oauth2.scope || "N/A"}`);
    const expiryDate = new Date(oauth2.expiresAt);
    const remainingMinutes = Math.floor((expiryDate.getTime() - Date.now()) / 1e3 / 60);
    const needsRefresh = remainingMinutes <= 60 || event.forceRefresh;
    await cloudwatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: "NASUN/OAuth",
      MetricData: [{
        MetricName: "TokenRemainingMinutes",
        Value: remainingMinutes,
        Unit: "None",
        Timestamp: /* @__PURE__ */ new Date()
      }]
    }));
    if (!needsRefresh && !event.forceRefresh) {
      console.log(`\u2705 [TOKEN_CHECK] \uD1A0\uD070\uC774 \uC544\uC9C1 \uC720\uD6A8\uD569\uB2C8\uB2E4 (\uB0A8\uC740 \uC2DC\uAC04: ${remainingMinutes}\uBD84)`);
      return {
        success: true,
        refreshed: false,
        message: `\uD1A0\uD070 \uAC31\uC2E0 \uBD88\uD544\uC694 (\uB0A8\uC740 \uC2DC\uAC04: ${remainingMinutes}\uBD84)`,
        tokenInfo: {
          expiresAt: oauth2.expiresAt.toString(),
          expiresAtISO: expiryDate.toISOString(),
          scope: oauth2.scope,
          lastRefreshed: oauth2.lastRefreshed || "N/A"
        }
      };
    }
    const oldRefreshToken = oauth2.refreshToken;
    console.log("\u{1F510} [REFRESH_TOKEN] \uC0C8 Access Token \uBC1C\uAE09 \uC694\uCCAD \uC911...");
    console.log(`   Old Refresh Token: ${oldRefreshToken.substring(0, 30)}...`);
    const config = getEnvConfigV2();
    let newTokenResponse;
    try {
      newTokenResponse = await refreshAccessToken(config, oldRefreshToken);
    } catch (error) {
      console.error("\u274C [TWITTER_API] Refresh Token \uC0AC\uC6A9 \uC2E4\uD328:", error.message);
      if (error.message.includes("invalid")) {
        console.error("\u{1F6A8} [CRITICAL] Refresh Token\uC774 \uBB34\uD6A8\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4!");
        console.error("\u{1F6A8} [ACTION REQUIRED] \uC218\uB3D9 OAuth 2.0 \uC7AC\uC778\uC99D \uD544\uC694!");
        await cloudwatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
          Namespace: "NASUN/OAuth",
          MetricData: [{
            MetricName: "InvalidRefreshToken",
            Value: 1,
            Unit: "Count",
            Timestamp: /* @__PURE__ */ new Date()
          }]
        }));
      }
      throw error;
    }
    console.log("\u2705 [TWITTER_API] \uC0C8 Access Token \uBC1C\uAE09 \uC131\uACF5!");
    console.log(`   New Access Token: ${newTokenResponse.access_token.substring(0, 30)}...`);
    console.log(`   Expires In: ${newTokenResponse.expires_in} seconds (${Math.floor(newTokenResponse.expires_in / 3600)} hours)`);
    const hasRotation = newTokenResponse.refresh_token && newTokenResponse.refresh_token !== oldRefreshToken;
    if (hasRotation) {
      console.log("\u{1F504} [ROTATION] Refresh Token Rotation \uBC1C\uC0DD!");
      console.log(`   Old RT: ${oldRefreshToken.substring(0, 30)}...`);
      console.log(`   New RT: ${newTokenResponse.refresh_token.substring(0, 30)}...`);
      console.log("\u26A0\uFE0F  [WARNING] \uC774\uC804 Refresh Token\uC740 \uBB34\uD6A8\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4. Secrets Manager \uC5C5\uB370\uC774\uD2B8 \uD544\uC218!");
      await cloudwatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
        Namespace: "NASUN/OAuth",
        MetricData: [{
          MetricName: "RefreshTokenRotation",
          Value: 1,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        }]
      }));
    } else {
      console.log("\u2139\uFE0F  [NO_ROTATION] Refresh Token \uC7AC\uC0AC\uC6A9 (Rotation \uC5C6\uC74C)");
    }
    const newExpiresAt = calculateTokenExpiry(newTokenResponse.expires_in);
    console.log(`   New Expiry: ${newExpiresAt.toISOString()} (KST: ${newExpiresAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })})`);
    console.log("\u{1F4BE} [SECRETS_MANAGER] \uC0C8 \uD1A0\uD070 \uC800\uC7A5 \uC911 (Retry \uC9C0\uC6D0)...");
    const updatedValue = {
      ...currentValue,
      oauth2: {
        ...oauth2,
        userAccessToken: newTokenResponse.access_token,
        // Refresh Token Rotation 처리: 새 값이 있으면 사용, 없으면 기존 유지
        refreshToken: newTokenResponse.refresh_token || oauth2.refreshToken,
        expiresAt: newExpiresAt.getTime(),
        lastRefreshed: (/* @__PURE__ */ new Date()).toISOString(),
        scope: newTokenResponse.scope
      }
    };
    let updateSuccess = false;
    let lastUpdateError = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`   Attempt ${attempt}/5...`);
        await secretsClient.send(
          new import_client_secrets_manager.UpdateSecretCommand({
            SecretId: secretId,
            SecretString: JSON.stringify(updatedValue, null, 2)
          })
        );
        updateSuccess = true;
        console.log(`\u2705 [SECRETS_MANAGER] \uC5C5\uB370\uC774\uD2B8 \uC131\uACF5 (Attempt ${attempt})!`);
        break;
      } catch (updateError) {
        lastUpdateError = updateError;
        console.error(`\u274C [SECRETS_MANAGER] Attempt ${attempt}/5 \uC2E4\uD328:`, updateError.message);
        if (attempt < 5) {
          const backoffMs = Math.pow(2, attempt - 1) * 1e3;
          console.log(`   \u23F3 ${backoffMs}ms \uD6C4 \uC7AC\uC2DC\uB3C4...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }
    if (!updateSuccess) {
      console.error("\u{1F6A8} [CRITICAL] Secrets Manager \uC5C5\uB370\uC774\uD2B8 \uC644\uC804 \uC2E4\uD328!");
      console.error("\u{1F6A8} [CRITICAL] Refresh Token\uC774 \uBB34\uD6A8\uD654\uB418\uC5C8\uC744 \uAC00\uB2A5\uC131 \uB192\uC74C!");
      console.error("\u{1F6A8} [ACTION REQUIRED] \uC989\uC2DC \uC218\uB3D9 OAuth 2.0 \uC7AC\uC778\uC99D \uD544\uC694!");
      await cloudwatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
        Namespace: "NASUN/OAuth",
        MetricData: [{
          MetricName: "SecretUpdateFailure",
          Value: 1,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        }]
      }));
      throw new Error(`Secrets Manager \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328 (3\uD68C \uC2DC\uB3C4): ${lastUpdateError?.message}`);
    }
    const duration = Date.now() - startTime;
    console.log(`\u2705 [REFRESH_OAUTH2_TOKEN] \uC644\uB8CC (\uC18C\uC694 \uC2DC\uAC04: ${duration}ms)`);
    await cloudwatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
      Namespace: "NASUN/OAuth",
      MetricData: [{
        MetricName: "TokenRefreshSuccess",
        Value: 1,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      }]
    }));
    return {
      success: true,
      refreshed: true,
      message: "\uD1A0\uD070 \uAC31\uC2E0 \uC131\uACF5",
      tokenInfo: {
        expiresAt: newExpiresAt.getTime().toString(),
        expiresAtISO: newExpiresAt.toISOString(),
        scope: newTokenResponse.scope,
        lastRefreshed: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
  } catch (error) {
    console.error("\u274C [REFRESH_OAUTH2_TOKEN] \uC624\uB958 \uBC1C\uC0DD:", error);
    try {
      const cloudwatchClient = new import_client_cloudwatch.CloudWatchClient({ region: "ap-northeast-2" });
      await cloudwatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
        Namespace: "NASUN/OAuth",
        MetricData: [{
          MetricName: "TokenRefreshFailure",
          Value: 1,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        }]
      }));
    } catch (metricError) {
      console.error("\u26A0\uFE0F [CLOUDWATCH] \uBA54\uD2B8\uB9AD \uC804\uC1A1 \uC2E4\uD328:", metricError);
    }
    return {
      success: false,
      refreshed: false,
      message: "\uD1A0\uD070 \uAC31\uC2E0 \uC2E4\uD328",
      error: error.message || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=refresh-oauth2-token.js.map
