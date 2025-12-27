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

// src/handlers/test/mock-data-generator.ts
var mock_data_generator_exports = {};
__export(mock_data_generator_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(mock_data_generator_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

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

// src/handlers/test/mock-data-generator.ts
var ddbClient = new import_client_dynamodb.DynamoDBClient({});
var docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(ddbClient);
var handler = async (event) => {
  const startTime = Date.now();
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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
    const config = getEnvConfigV2();
    const tableName = config.cumulativeTableName;
    let requestBody = {};
    if (event.body) {
      requestBody = JSON.parse(event.body);
    }
    const userCount = requestBody.userCount || 250;
    const clearExisting = requestBody.clearExisting || false;
    const generateRecentActivity = requestBody.generateRecentActivity || true;
    const scoreDistribution = requestBody.scoreDistribution || "exponential";
    console.log("\u{1F3AD} Mock \uB370\uC774\uD130 \uC0DD\uC131 \uC2DC\uC791:", {
      userCount,
      clearExisting,
      generateRecentActivity,
      scoreDistribution
    });
    const mockUsers = generateMockUsers(userCount, scoreDistribution);
    let allActivities = [];
    if (generateRecentActivity) {
      allActivities = generateRecentActivities(mockUsers);
    }
    const leaderboardEntries = generateLeaderboardEntries(mockUsers);
    const saveResults = await saveMockDataToDynamoDB(
      tableName,
      mockUsers,
      allActivities,
      leaderboardEntries,
      clearExisting
    );
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const result = {
      success: true,
      usersGenerated: mockUsers.length,
      activitiesGenerated: allActivities.length,
      leaderboardEntriesGenerated: leaderboardEntries.length,
      processingTimeMs: processingTime,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.log("\u2705 Mock \uB370\uC774\uD130 \uC0DD\uC131 \uC644\uB8CC:", result);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result)
    };
  } catch (error) {
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    console.error("\u274C Mock \uB370\uC774\uD130 \uC0DD\uC131 \uC2E4\uD328:", error);
    const errorResult = {
      success: false,
      usersGenerated: 0,
      activitiesGenerated: 0,
      leaderboardEntriesGenerated: 0,
      processingTimeMs: processingTime,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      error: error instanceof Error ? error.message : "Unknown error"
    };
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify(errorResult)
    };
  }
};
function generateMockUsers(count, distribution) {
  console.log(`\u{1F465} ${count}\uBA85\uC758 Mock \uC0AC\uC6A9\uC790 \uC0DD\uC131 \uC911 (\uBD84\uD3EC: ${distribution})`);
  const users = [];
  const currentDate = (/* @__PURE__ */ new Date()).toISOString();
  for (let i = 1; i <= count; i++) {
    const userId = `mock_user_${i.toString().padStart(4, "0")}`;
    const username = generateRandomUsername(i);
    const engagement = generateEngagementMetrics(i, count, distribution);
    const totalScore = calculateTotalScore(engagement);
    if (i < 3) {
      console.log(`User ${i} engagement:`, engagement);
      console.log(`User ${i} mentions value:`, engagement.mentions);
    }
    const mockUser = {
      pk: `USER#${userId}`,
      sk: "CUMULATIVE_SCORE",
      userId,
      username,
      totalScore,
      totalLikes: engagement.likes,
      totalReplies: engagement.replies,
      totalReposts: engagement.reposts,
      totalQuotes: engagement.quotes,
      totalMentions: engagement.mentions || 0,
      firstActivity: getRandomDate(-60, -1),
      // 최근 60일 내 첫 활동
      lastUpdated: currentDate,
      version: "v2"
    };
    if (i === 0) {
      console.log("\u{1F50D} \uCCAB \uBC88\uC9F8 Mock \uC720\uC800 \uB370\uC774\uD130:", JSON.stringify(mockUser, null, 2));
    }
    users.push(mockUser);
  }
  users.sort((a, b) => b.totalScore - a.totalScore);
  console.log(`\u{1F4CA} \uC0DD\uC131\uB41C \uC0AC\uC6A9\uC790 \uC810\uC218 \uBD84\uD3EC:`, {
    \uCD5C\uACE0\uC810: users[0]?.totalScore || 0,
    \uC911\uAC04\uAC12: users[Math.floor(users.length / 2)]?.totalScore || 0,
    \uCD5C\uC800\uC810: users[users.length - 1]?.totalScore || 0,
    \uD3C9\uADE0\uC810\uC218: users.reduce((sum, user) => sum + user.totalScore, 0) / users.length
  });
  return users;
}
function generateRandomUsername(index) {
  const prefixes = [
    "crypto",
    "nft",
    "web3",
    "blockchain",
    "defi",
    "dao",
    "metaverse",
    "gamefi",
    "tech",
    "dev",
    "code",
    "build",
    "create",
    "innovate",
    "future",
    "digital",
    "moon",
    "diamond",
    "rocket",
    "star",
    "cosmic",
    "galaxy",
    "nebula",
    "solar",
    "alpha",
    "beta",
    "sigma",
    "omega",
    "prime",
    "elite",
    "master",
    "legend"
  ];
  const suffixes = [
    "trader",
    "holder",
    "builder",
    "creator",
    "developer",
    "engineer",
    "wizard",
    "ninja",
    "samurai",
    "warrior",
    "champion",
    "hero",
    "legend",
    "master",
    "king",
    "queen",
    "prince",
    "duke",
    "lord",
    "sage",
    "guru",
    "expert",
    "hunter",
    "explorer",
    "pioneer",
    "innovator",
    "visionary",
    "dreamer"
  ];
  const numbers = Math.floor(Math.random() * 9999);
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const addNumbers = Math.random() < 0.2;
  return addNumbers ? `${prefix}_${suffix}${numbers}` : `${prefix}_${suffix}`;
}
function generateEngagementMetrics(userIndex, totalUsers, distribution) {
  let baseLikes;
  let baseReplies;
  let baseReposts;
  let baseQuotes;
  let baseMentions;
  switch (distribution) {
    case "exponential":
      const rank = userIndex / totalUsers;
      const exponentialFactor = Math.pow(1 - rank, 3);
      baseLikes = Math.floor(exponentialFactor * 500 + Math.random() * 100);
      baseReplies = Math.floor(exponentialFactor * 200 + Math.random() * 50);
      baseReposts = Math.floor(exponentialFactor * 150 + Math.random() * 30);
      baseQuotes = Math.floor(exponentialFactor * 100 + Math.random() * 25);
      baseMentions = Math.floor(exponentialFactor * 80 + Math.random() * 20);
      break;
    case "normal":
      const normalLikes = gaussianRandom(150, 75);
      const normalReplies = gaussianRandom(50, 25);
      const normalReposts = gaussianRandom(40, 20);
      const normalQuotes = gaussianRandom(25, 15);
      const normalMentions = gaussianRandom(20, 12);
      baseLikes = Math.max(0, Math.floor(normalLikes));
      baseReplies = Math.max(0, Math.floor(normalReplies));
      baseReposts = Math.max(0, Math.floor(normalReposts));
      baseQuotes = Math.max(0, Math.floor(normalQuotes));
      baseMentions = Math.max(0, Math.floor(normalMentions));
      break;
    case "uniform":
    default:
      baseLikes = Math.floor(Math.random() * 300 + 10);
      baseReplies = Math.floor(Math.random() * 100 + 5);
      baseReposts = Math.floor(Math.random() * 80 + 3);
      baseQuotes = Math.floor(Math.random() * 50 + 2);
      baseMentions = Math.floor(Math.random() * 40 + 1);
      break;
  }
  return {
    likes: baseLikes,
    replies: baseReplies,
    reposts: baseReposts,
    quotes: baseQuotes,
    mentions: baseMentions
  };
}
function gaussianRandom(mean, stdDev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return z * stdDev + mean;
}
function calculateTotalScore(engagement) {
  const weights = {
    likes: 0.8,
    replies: 2.2,
    reposts: 2,
    quotes: 3,
    mentions: 2.3
  };
  const score = engagement.likes * weights.likes + engagement.replies * weights.replies + engagement.reposts * weights.reposts + engagement.quotes * weights.quotes + engagement.mentions * weights.mentions;
  return Math.round(score * 10) / 10;
}
function generateRecentActivities(users) {
  console.log("\u{1F4DD} Recent Activity \uB370\uC774\uD130 \uC0DD\uC131 \uC911...");
  const activities = [];
  const engagementTypes = ["like", "reply", "repost", "quote", "mention"];
  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const user = users[userIndex];
    const activityCount = Math.floor(user.totalScore / 5) + Math.floor(Math.random() * 10);
    for (let i = 0; i < activityCount; i++) {
      const engagementType = engagementTypes[Math.floor(Math.random() * engagementTypes.length)];
      const tweetId = `tweet_${userIndex}_${i}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
      const addedAt = getRandomEventDate();
      const activity = {
        pk: user.pk,
        sk: `RECENT#${tweetId}#${engagementType}`,
        userId: user.userId,
        tweetId,
        engagementType,
        addedAt,
        tweetCreatedAt: getRandomEventDate(),
        // 트윗도 이벤트 기간 내 생성
        scoreValue: void 0
      };
      activities.push(activity);
    }
  }
  console.log(`\u{1F4CA} \uCD1D ${activities.length}\uAC1C\uC758 Recent Activity \uC0DD\uC131 \uC644\uB8CC`);
  return activities;
}
function generateLeaderboardEntries(users) {
  console.log("\u{1F3C6} \uB9AC\uB354\uBCF4\uB4DC \uC5D4\uD2B8\uB9AC \uC0DD\uC131 \uC911...");
  const entries = [];
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  users.forEach((user, index) => {
    const rank = index + 1;
    const uniqueTimestamp = `${timestamp}_${rank}`;
    const entry = {
      pk: `LEADERBOARD#${"CUMULATIVE" /* CUMULATIVE */}`,
      sk: `RANK#${rank.toString().padStart(4, "0")}#${uniqueTimestamp}`,
      rank,
      userId: user.userId,
      username: user.username,
      totalScore: user.totalScore,
      totalLikes: user.totalLikes,
      totalReplies: user.totalReplies,
      totalReposts: user.totalReposts,
      totalQuotes: user.totalQuotes,
      totalMentions: user.totalMentions,
      lastUpdated: timestamp,
      period: "CUMULATIVE" /* CUMULATIVE */,
      periodStartDate: "2025-08-01",
      periodEndDate: "2025-12-31",
      periodDescription: "\uC804\uCCB4 \uAE30\uAC04 \uB204\uC801 \uB9AC\uB354\uBCF4\uB4DC"
    };
    entries.push(entry);
  });
  console.log(`\u{1F3C6} ${entries.length}\uAC1C\uC758 \uB9AC\uB354\uBCF4\uB4DC \uC5D4\uD2B8\uB9AC \uC0DD\uC131 \uC644\uB8CC`);
  return entries;
}
function getRandomDate(minDaysAgo, maxDaysAgo) {
  const now = /* @__PURE__ */ new Date();
  const randomDays = Math.floor(Math.random() * (maxDaysAgo - minDaysAgo + 1)) + minDaysAgo;
  const randomDate = new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1e3);
  return randomDate.toISOString();
}
function getRandomEventDate() {
  const config = getEnvConfigV2();
  const startDate = /* @__PURE__ */ new Date(`${config.systemStartDate}T00:00:00.000Z`);
  const endDate = /* @__PURE__ */ new Date("2025-10-05T23:59:59.999Z");
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  const randomTime = startTime + Math.random() * (endTime - startTime);
  return new Date(randomTime).toISOString();
}
async function saveMockDataToDynamoDB(tableName, users, activities, leaderboardEntries, clearExisting) {
  console.log("\u{1F4BE} DynamoDB\uC5D0 Mock \uB370\uC774\uD130 \uC800\uC7A5 \uC911...");
  const allItems = [
    ...users,
    ...activities,
    ...leaderboardEntries
  ];
  console.log(`\u{1F4E6} \uCD1D ${allItems.length}\uAC1C \uC544\uC774\uD15C\uC744 \uBC30\uCE58\uB85C \uC800\uC7A5 \uC2DC\uC791`);
  const batchSize = 25;
  const batches = [];
  for (let i = 0; i < allItems.length; i += batchSize) {
    const batch = allItems.slice(i, i + batchSize);
    batches.push(batch);
  }
  console.log(`\u{1F4E6} ${batches.length}\uAC1C \uBC30\uCE58\uB85C \uBD84\uD560\uD558\uC5EC \uC800\uC7A5`);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (i === 0) {
      const firstActivity = batch.find((item) => item.sk?.startsWith("RECENT#"));
      if (firstActivity) {
        console.log("\u{1F50D} \uCCAB \uBC88\uC9F8 Recent Activity \uC0D8\uD50C:", JSON.stringify(firstActivity, null, 2));
      }
    }
    const putRequests = batch.map((item) => ({
      PutRequest: {
        Item: item
      }
    }));
    try {
      await docClient.send(new import_lib_dynamodb.BatchWriteCommand({
        RequestItems: {
          [tableName]: putRequests
        }
      }));
      console.log(`  \u2705 \uBC30\uCE58 ${i + 1}/${batches.length} \uC800\uC7A5 \uC644\uB8CC (${batch.length}\uAC1C \uC544\uC774\uD15C)`);
    } catch (error) {
      console.error(`  \u274C \uBC30\uCE58 ${i + 1} \uC800\uC7A5 \uC2E4\uD328:`, error);
      throw error;
    }
  }
  console.log("\u{1F4BE} \uBAA8\uB4E0 Mock \uB370\uC774\uD130 \uC800\uC7A5 \uC644\uB8CC");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=mock-data-generator.js.map
