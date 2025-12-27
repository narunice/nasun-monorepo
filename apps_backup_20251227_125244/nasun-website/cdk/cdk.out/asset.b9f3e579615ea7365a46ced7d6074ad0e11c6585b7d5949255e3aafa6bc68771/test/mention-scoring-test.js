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

// src/handlers/test/mention-scoring-test.ts
var mention_scoring_test_exports = {};
__export(mention_scoring_test_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(mention_scoring_test_exports);

// src/types/cumulative.ts
var MENTION_RULES = {
  dailyLimit: 3,
  // 일일 멘션 제한: 3개
  baseScore: 2.5,
  // 기본 점수: 2.5점 (2.3 → 2.5 상향 조정)
  cooldownHours: 4,
  // 쿨다운: 4시간
  minContentLength: 20,
  // 최소 콘텐츠 길이: 20자
  ttlDays: 365,
  // TTL: 1년 (환경변수로 변경 예정)
  currentVersion: "v2"
  // 버전: v2
};
function calculateMentionScore(baseScore = MENTION_RULES.baseScore, qualityMultiplier = 1, cooldownBonus = 0) {
  const finalScore = baseScore * qualityMultiplier + cooldownBonus;
  return Math.round(finalScore * 10) / 10;
}
function calculateMentionCooldownBonus(intervalHours) {
  if (intervalHours >= 24) return 0.5;
  if (intervalHours >= 12) return 0.4;
  if (intervalHours >= 8) return 0.3;
  if (intervalHours >= MENTION_RULES.cooldownHours) return 0.1;
  return 0;
}
function calculateCooldownBonus(intervalHours) {
  return calculateMentionCooldownBonus(intervalHours);
}

// src/utils/mention-detector.ts
function detectMentions(tweetText) {
  const mentions = [];
  const mentionRegex = /@([a-zA-Z0-9_]{1,15})\b/g;
  let match;
  while ((match = mentionRegex.exec(tweetText)) !== null) {
    mentions.push({
      username: match[1],
      // 캡처 그룹 (@ 제외한 사용자명)
      fullMention: match[0],
      // 전체 매치 (@username)
      startIndex: match.index,
      // 시작 위치
      endIndex: match.index + match[0].length
      // 종료 위치
    });
  }
  return mentions;
}
function validateMentions(tweetText, targetUsernames) {
  const contentLength = tweetText.trim().length;
  const passesMinLength = contentLength >= MENTION_RULES.minContentLength;
  const hasSpamIndicators = detectSpamIndicators(tweetText);
  const allMentions = detectMentions(tweetText);
  const targetMentions = allMentions.filter(
    (mention) => targetUsernames.some(
      (target) => target.toLowerCase() === mention.username.toLowerCase()
    )
  );
  const isValid = passesMinLength && !hasSpamIndicators && targetMentions.length > 0;
  let reason = "";
  if (!passesMinLength) {
    reason = `\uCF58\uD150\uCE20 \uAE38\uC774 \uBD80\uC871 (${contentLength}\uC790, \uCD5C\uC18C ${MENTION_RULES.minContentLength}\uC790 \uD544\uC694)`;
  } else if (hasSpamIndicators) {
    reason = "\uC2A4\uD338 \uC9C0\uD45C \uD0D0\uC9C0\uB428";
  } else if (targetMentions.length === 0) {
    reason = "\uD0C0\uAC9F \uC0AC\uC6A9\uC790 \uBA58\uC158 \uC5C6\uC74C";
  } else {
    reason = "\uAC80\uC99D \uD1B5\uACFC";
  }
  return {
    isValid,
    mentions: allMentions,
    targetMentions,
    contentLength,
    passesMinLength,
    hasSpamIndicators,
    reason
  };
}
function detectSpamIndicators(tweetText) {
  const text = tweetText.toLowerCase();
  const spamPatterns = [
    // 1. 과도한 반복 문자 (3개 이상 연속)
    /(.)\1{3,}/,
    // 2. 과도한 해시태그 (5개 이상)
    /(#\w+.*){5,}/,
    // 3. 과도한 멘션 (5개 이상)
    /(@\w+.*){5,}/,
    // 4. 스팸성 키워드
    /팔로우.*팔로우|follow.*follow|구독.*구독|광고|홍보|무료|이벤트.*참여/,
    // 5. URL 단축 서비스 (의심스러운 경우)
    /(bit\.ly|tinyurl|t\.co).{3,}/,
    // 6. 과도한 특수 문자 패턴 (5개 이상 연속)
    /[!@#$%^&*()]{5,}/
  ];
  return spamPatterns.some((pattern) => pattern.test(text));
}
function evaluateMentionQuality(tweetText, mentionInfo) {
  let qualityScore = 0.5;
  const beforeMention = tweetText.substring(0, mentionInfo.startIndex).trim();
  const afterMention = tweetText.substring(mentionInfo.endIndex).trim();
  if (beforeMention.length > 10 || afterMention.length > 10) {
    qualityScore += 0.2;
  }
  const conversationalPatterns = /[?!]|어떻게|왜|무엇|언제|어디서|어떤|생각|의견|어떠세요/;
  if (conversationalPatterns.test(tweetText)) {
    qualityScore += 0.2;
  }
  const gratitudePatterns = /감사|고마워|thanks|thank you|좋아요|훌륭|멋져/;
  if (gratitudePatterns.test(tweetText.toLowerCase())) {
    qualityScore += 0.1;
  }
  const cleanText = tweetText.replace(/@\w+/g, "").trim();
  if (cleanText.length < 10) {
    qualityScore -= 0.3;
  }
  const mentionDensity = (tweetText.match(/@\w+/g) || []).length / tweetText.length * 100;
  if (mentionDensity > 20) {
    qualityScore -= 0.2;
  }
  return Math.max(0, Math.min(1, qualityScore));
}
function extractValidTargetMentions(tweetText, targetUsernames) {
  const validation = validateMentions(tweetText, targetUsernames);
  if (!validation.isValid) {
    console.log(`\u{1F50D} [MENTION_DETECTOR] \uBA58\uC158 \uAC80\uC99D \uC2E4\uD328: ${validation.reason}`);
    return [];
  }
  console.log(`\u2705 [MENTION_DETECTOR] \uC720\uD6A8\uD55C \uD0C0\uAC9F \uBA58\uC158 ${validation.targetMentions.length}\uAC1C \uD0D0\uC9C0`);
  return validation.targetMentions;
}

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

// src/handlers/test/mention-scoring-test.ts
var TEST_CASES = [
  // 1. 유효한 멘션 테스트
  {
    id: "valid_01",
    description: "\uC720\uD6A8\uD55C \uC77C\uBC18 \uBA58\uC158 (\uCCAB \uBC88\uC9F8)",
    tweetText: "@nasun_official \uC548\uB155\uD558\uC138\uC694! \uC624\uB298 \uD504\uB85C\uC81D\uD2B8 \uC9C4\uD589\uC0C1\uD669\uC774 \uAD81\uAE08\uD569\uB2C8\uB2E4. \uC5B4\uB5BB\uAC8C \uC9C4\uD589\uB418\uACE0 \uC788\uB098\uC694?",
    userId: "user_test_001",
    expectedValid: true,
    intervalHours: 0
  },
  {
    id: "valid_02",
    description: "\uC720\uD6A8\uD55C \uAC10\uC0AC \uD45C\uD604 \uBA58\uC158",
    tweetText: "@nasun_official \uC815\uB9D0 \uC88B\uC740 \uD504\uB85C\uC81D\uD2B8\uB124\uC694! \uAC10\uC0AC\uD569\uB2C8\uB2E4. \uACC4\uC18D \uC751\uC6D0\uD558\uACA0\uC2B5\uB2C8\uB2E4.",
    userId: "user_test_002",
    expectedValid: true,
    intervalHours: 5
    // 쿨다운 통과
  },
  {
    id: "valid_03",
    description: "\uC720\uD6A8\uD55C \uC9C8\uBB38 \uBA58\uC158",
    tweetText: "@nasun_official \uD639\uC2DC \uB2E4\uC74C \uC5C5\uB370\uC774\uD2B8\uB294 \uC5B8\uC81C\uCBE4 \uC608\uC815\uB418\uC5B4 \uC788\uB098\uC694? \uAE30\uB300\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.",
    userId: "user_test_003",
    expectedValid: true,
    intervalHours: 8
    // 더 긴 간격
  },
  // 2. 콘텐츠 길이 제한 테스트
  {
    id: "invalid_length_01",
    description: "\uCF58\uD150\uCE20 \uAE38\uC774 \uBD80\uC871",
    tweetText: "@nasun_official \uC548\uB155",
    userId: "user_test_004",
    expectedValid: false,
    expectedReason: "\uCF58\uD150\uCE20 \uAE38\uC774 \uBD80\uC871"
  },
  // 3. 스팸 탐지 테스트
  {
    id: "spam_01",
    description: "\uACFC\uB3C4\uD55C \uBC18\uBCF5 \uBB38\uC790",
    tweetText: "@nasun_official \uC548\uB155\uD558\uC138\uC694!!!! \uD504\uB85C\uC81D\uD2B8 \uC815\uB9D0 \uC88B\uC544\uC694\uC694\uC694\uC694\uC694\uC694!!!!",
    userId: "user_test_005",
    expectedValid: false,
    expectedReason: "\uC2A4\uD338 \uC9C0\uD45C \uD0D0\uC9C0\uB428",
    isSpam: true
  },
  {
    id: "spam_02",
    description: "\uACFC\uB3C4\uD55C \uD574\uC2DC\uD0DC\uADF8",
    tweetText: "@nasun_official #\uD314\uB85C\uC6B0 #\uC88B\uC544\uC694 #\uAD6C\uB3C5 #\uC774\uBCA4\uD2B8 #\uBB34\uB8CC #\uD61C\uD0DD \uC548\uB155\uD558\uC138\uC694",
    userId: "user_test_006",
    expectedValid: false,
    expectedReason: "\uC2A4\uD338 \uC9C0\uD45C \uD0D0\uC9C0\uB428",
    isSpam: true
  },
  // 4. 쿨다운 위반 테스트
  {
    id: "cooldown_01",
    description: "\uCFE8\uB2E4\uC6B4 \uC704\uBC18 (2\uC2DC\uAC04 \uAC04\uACA9)",
    tweetText: "@nasun_official \uB610 \uB2E4\uB978 \uC9C8\uBB38\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uD504\uB85C\uC81D\uD2B8\uC5D0 \uB300\uD574 \uB354 \uC54C\uACE0 \uC2F6\uC5B4\uC694.",
    userId: "user_test_001",
    // 동일 사용자
    expectedValid: false,
    expectedReason: "\uCFE8\uB2E4\uC6B4 \uC704\uBC18",
    intervalHours: 2
    // 4시간 미만
  },
  // 5. 타겟 멘션 없음
  {
    id: "no_target_01",
    description: "\uD0C0\uAC9F \uBA58\uC158 \uC5C6\uC74C",
    tweetText: "@other_user \uC548\uB155\uD558\uC138\uC694! \uC88B\uC740 \uD558\uB8E8 \uB418\uC138\uC694. \uD504\uB85C\uC81D\uD2B8\uC5D0 \uB300\uD574 \uC774\uC57C\uAE30\uD574\uBD05\uC2DC\uB2E4.",
    userId: "user_test_007",
    expectedValid: false,
    expectedReason: "\uD0C0\uAC9F \uC0AC\uC6A9\uC790 \uBA58\uC158 \uC5C6\uC74C"
  }
];
var handler = async (event, context) => {
  console.log("\u{1F9EA} [MENTION_TEST] \uBA58\uC158 \uC810\uC218 \uC2DC\uC2A4\uD15C \uD14C\uC2A4\uD2B8 \uC2DC\uC791");
  const testResults = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    requestId: context.awsRequestId,
    totalTests: TEST_CASES.length,
    passedTests: 0,
    failedTests: 0,
    testDetails: [],
    performanceMetrics: {
      totalDuration: 0,
      avgProcessingTime: 0,
      detectionAccuracy: 0,
      scoringConsistency: 0
    }
  };
  const startTime = Date.now();
  try {
    console.log("\u{1F4CB} [MENTION_TEST] \uC124\uC815 \uAC80\uC99D");
    console.log(`  - \uC77C\uC77C \uC81C\uD55C: ${MENTION_RULES.dailyLimit}\uD68C`);
    console.log(`  - \uAE30\uBCF8 \uC810\uC218: ${MENTION_RULES.baseScore}\uC810`);
    console.log(`  - \uCFE8\uB2E4\uC6B4: ${MENTION_RULES.cooldownHours}\uC2DC\uAC04`);
    console.log(`  - \uCD5C\uC18C \uAE38\uC774: ${MENTION_RULES.minContentLength}\uC790`);
    for (const testCase of TEST_CASES) {
      console.log(`
\u{1F50D} [TEST_${testCase.id}] ${testCase.description}`);
      const testStartTime = Date.now();
      let testPassed = false;
      let testMessage = "";
      try {
        const targetUsernames = ["nasun_official"];
        const validTargetMentions = extractValidTargetMentions(testCase.tweetText, targetUsernames);
        const isSpam = detectSpamIndicators(testCase.tweetText);
        let qualityScore = 0;
        if (validTargetMentions.length > 0) {
          qualityScore = evaluateMentionQuality(testCase.tweetText, validTargetMentions[0]);
        }
        const cooldownBonus = calculateCooldownBonus(testCase.intervalHours || 0);
        const finalScore = calculateMentionScore(MENTION_RULES.baseScore, qualityScore, cooldownBonus);
        const contentLength = testCase.tweetText.trim().length;
        const passesMinLength = contentLength >= MENTION_RULES.minContentLength;
        const hasValidTarget = validTargetMentions.length > 0;
        const passesSpamCheck = !isSpam;
        const passesCooldown = (testCase.intervalHours || 0) >= MENTION_RULES.cooldownHours;
        const actualValid = passesMinLength && hasValidTarget && passesSpamCheck && passesCooldown;
        testPassed = actualValid === testCase.expectedValid;
        if (testPassed) {
          testMessage = `\u2705 \uC608\uC0C1\uB300\uB85C ${actualValid ? "\uC720\uD6A8" : "\uBB34\uD6A8"} \uD310\uC815`;
        } else {
          testMessage = `\u274C \uC608\uC0C1: ${testCase.expectedValid ? "\uC720\uD6A8" : "\uBB34\uD6A8"}, \uC2E4\uC81C: ${actualValid ? "\uC720\uD6A8" : "\uBB34\uD6A8"}`;
        }
        const testDetail = {
          id: testCase.id,
          description: testCase.description,
          passed: testPassed,
          message: testMessage,
          details: {
            tweetText: testCase.tweetText,
            contentLength,
            validTargetMentions: validTargetMentions.length,
            isSpam,
            qualityScore: Math.round(qualityScore * 100) / 100,
            cooldownBonus,
            finalScore,
            checks: {
              minLength: passesMinLength,
              validTarget: hasValidTarget,
              spamCheck: passesSpamCheck,
              cooldown: passesCooldown
            }
          },
          processingTime: Date.now() - testStartTime
        };
        testResults.testDetails.push(testDetail);
        console.log(`  ${testMessage}`);
        console.log(`  \u{1F4CA} \uAE38\uC774: ${contentLength}\uC790, \uD488\uC9C8: ${(qualityScore * 100).toFixed(0)}%, \uC810\uC218: ${finalScore}`);
        if (testPassed) {
          testResults.passedTests++;
        } else {
          testResults.failedTests++;
        }
      } catch (error) {
        testMessage = `\u{1F4A5} \uD14C\uC2A4\uD2B8 \uC2E4\uD589 \uC624\uB958: ${error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"}`;
        console.error(`  ${testMessage}`);
        testResults.testDetails.push({
          id: testCase.id,
          description: testCase.description,
          passed: false,
          message: testMessage,
          error: error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958",
          processingTime: Date.now() - testStartTime
        });
        testResults.failedTests++;
      }
    }
    const totalDuration = Date.now() - startTime;
    const avgProcessingTime = testResults.testDetails.reduce((sum, test) => sum + (test.processingTime || 0), 0) / testResults.testDetails.length;
    const detectionAccuracy = testResults.passedTests / testResults.totalTests * 100;
    testResults.performanceMetrics = {
      totalDuration,
      avgProcessingTime: Math.round(avgProcessingTime * 100) / 100,
      detectionAccuracy: Math.round(detectionAccuracy * 100) / 100,
      scoringConsistency: 100
      // 추후 구현
    };
    console.log("\n\u{1F4CA} [MENTION_TEST] CloudWatch \uBA54\uD2B8\uB9AD \uC804\uC1A1");
    await cloudWatchMetrics.putMentionSummaryMetrics({
      totalMentionsProcessed: testResults.totalTests,
      validMentions: testResults.passedTests,
      rejectedMentions: testResults.failedTests,
      dailyLimitReached: 0,
      cooldownViolations: TEST_CASES.filter((tc) => tc.expectedReason?.includes("\uCFE8\uB2E4\uC6B4")).length,
      spamDetected: TEST_CASES.filter((tc) => tc.isSpam).length,
      avgQualityScore: 0.75,
      // 예시값
      avgFinalScore: 2.3,
      // 예시값
      processingTime: totalDuration
    });
    console.log("\n\u{1F3AF} [MENTION_TEST] \uD14C\uC2A4\uD2B8 \uC644\uB8CC");
    console.log(`  \uCD1D \uD14C\uC2A4\uD2B8: ${testResults.totalTests}\uAC1C`);
    console.log(`  \uC131\uACF5: ${testResults.passedTests}\uAC1C (${detectionAccuracy.toFixed(1)}%)`);
    console.log(`  \uC2E4\uD328: ${testResults.failedTests}\uAC1C`);
    console.log(`  \uD3C9\uADE0 \uCC98\uB9AC \uC2DC\uAC04: ${avgProcessingTime.toFixed(2)}ms`);
    console.log(`  \uCD1D \uC18C\uC694 \uC2DC\uAC04: ${totalDuration}ms`);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: true,
        testResults,
        summary: {
          overallSuccess: testResults.failedTests === 0,
          successRate: `${detectionAccuracy.toFixed(1)}%`,
          recommendations: testResults.failedTests > 0 ? [
            "\uC77C\uBD80 \uD14C\uC2A4\uD2B8\uAC00 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uB85C\uADF8\uB97C \uD655\uC778\uD558\uC5EC \uBB38\uC81C\uB97C \uD574\uACB0\uD558\uC138\uC694.",
            "\uC2A4\uD338 \uD0D0\uC9C0 \uB85C\uC9C1\uC744 \uC870\uC815\uD574\uC57C \uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
            "\uCFE8\uB2E4\uC6B4 \uBC0F \uD488\uC9C8 \uC810\uC218 \uACC4\uC0B0\uC744 \uC7AC\uAC80\uD1A0\uD558\uC138\uC694."
          ] : [
            "\uBAA8\uB4E0 \uD14C\uC2A4\uD2B8\uAC00 \uC131\uACF5\uC801\uC73C\uB85C \uD1B5\uACFC\uD588\uC2B5\uB2C8\uB2E4.",
            "\uBA58\uC158 \uC810\uC218 \uC2DC\uC2A4\uD15C\uC774 \uC815\uC0C1\uC801\uC73C\uB85C \uC791\uB3D9\uD569\uB2C8\uB2E4.",
            "\uD504\uB85C\uB355\uC158 \uD658\uACBD\uC5D0 \uBC30\uD3EC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
          ]
        }
      })
    };
  } catch (error) {
    console.error("\u274C [MENTION_TEST] \uD14C\uC2A4\uD2B8 \uC2E4\uD589 \uC2E4\uD328:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958",
        testResults
      })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=mention-scoring-test.js.map
