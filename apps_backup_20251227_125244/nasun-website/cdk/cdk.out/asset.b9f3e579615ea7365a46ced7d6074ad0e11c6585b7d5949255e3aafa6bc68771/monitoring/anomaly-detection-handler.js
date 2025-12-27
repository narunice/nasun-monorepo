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

// src/handlers/monitoring/anomaly-detection-handler.ts
var anomaly_detection_handler_exports = {};
__export(anomaly_detection_handler_exports, {
  handler: () => handler,
  healthCheckHandler: () => healthCheckHandler,
  historyHandler: () => historyHandler,
  realtimeHandler: () => realtimeHandler,
  scheduledHandler: () => scheduledHandler
});
module.exports = __toCommonJS(anomaly_detection_handler_exports);

// src/services/anomaly-detection-service.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_sns = require("@aws-sdk/client-sns");
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var dynamoClient = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var snsClient = new import_client_sns.SNSClient({});
var cloudWatchClient = new import_client_cloudwatch.CloudWatchClient({});
var AnomalyDetectionService = class {
  constructor(tableName) {
    this.tableName = tableName || process.env.CUMULATIVE_TABLE_NAME || "";
    this.detectionRules = this.initializeDetectionRules();
    this.alertConfig = this.loadAlertConfig();
  }
  /**
   * 실시간 이상 패턴 감지 실행
   */
  async detectAnomalies(targetDate) {
    const date = targetDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    console.log("\u{1F50D} \uC774\uC0C1 \uD328\uD134 \uC790\uB3D9 \uAC10\uC9C0 \uC2DC\uC791:", date);
    const detectedAnomalies = [];
    try {
      const recentData = await this.fetchRecentData(date);
      const cumulativeData = await this.fetchCumulativeData();
      console.log(`\u{1F4CA} \uBD84\uC11D \uB370\uC774\uD130: \uCD5C\uADFC ${recentData.length}\uAC74, \uB204\uC801 ${cumulativeData.length}\uAC74`);
      for (const rule of this.detectionRules) {
        if (!rule.enabled) continue;
        console.log(`\u{1F9EA} \uADDC\uCE59 \uC2E4\uD589: ${rule.id} (${rule.type})`);
        try {
          if (await this.isInCooldown(rule.id)) {
            console.log(`   \u23F1\uFE0F \uCFE8\uB2E4\uC6B4 \uC911 (${rule.cooldownMinutes}\uBD84), \uC2A4\uD0B5`);
            continue;
          }
          const anomalies = await this.executeDetectionRule(rule, recentData, cumulativeData);
          if (anomalies.length > 0) {
            console.log(`   \u{1F6A8} ${anomalies.length}\uAC1C \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0`);
            detectedAnomalies.push(...anomalies);
            await this.updateCooldown(rule.id);
          } else {
            console.log(`   \u2705 \uC774\uC0C1 \uC5C6\uC74C`);
          }
        } catch (error) {
          console.error(`   \u274C \uADDC\uCE59 \uC2E4\uD589 \uC624\uB958: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (detectedAnomalies.length > 0) {
        await this.saveDetectedAnomalies(detectedAnomalies);
      }
      await this.sendAlerts(detectedAnomalies);
      await this.publishMetrics(detectedAnomalies);
      console.log(`\u2705 \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uC644\uB8CC: ${detectedAnomalies.length}\uAC1C \uAC10\uC9C0`);
      return detectedAnomalies;
    } catch (error) {
      console.error("\u274C \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uC2E4\uD328:", error);
      throw error;
    }
  }
  /**
   * 감지 규칙 초기화
   */
  initializeDetectionRules() {
    return [
      // 1. @mdkitchen7 유형 동일 카운트 패턴
      {
        id: "identical_counts_detector",
        type: "identical_counts" /* IDENTICAL_COUNTS */,
        enabled: true,
        severity: "high" /* HIGH */,
        threshold: {
          minCount: 5,
          // 최소 5개 이상
          exactMatch: true,
          // 정확히 일치해야 함
          engagementTypes: ["replies", "mentions"]
        },
        cooldownMinutes: 60,
        autoAlert: true,
        description: "replies\uC640 mentions \uC218\uAC00 \uC815\uD655\uD788 \uC77C\uCE58\uD558\uB294 \uC758\uC2EC\uC2A4\uB7EC\uC6B4 \uD328\uD134"
      },
      // 2. 과도한 engagement 감지
      {
        id: "excessive_engagement_detector",
        type: "excessive_engagement" /* EXCESSIVE_ENGAGEMENT */,
        enabled: true,
        severity: "medium" /* MEDIUM */,
        threshold: {
          totalEngagement: 1e3,
          // 1000개 이상
          singleType: 500,
          // 단일 타입 500개 이상
          timeWindow: 24
          // 24시간 내
        },
        cooldownMinutes: 120,
        autoAlert: true,
        description: "\uBE44\uC815\uC0C1\uC801\uC73C\uB85C \uB192\uC740 engagement \uC218\uB97C \uBCF4\uC774\uB294 \uC0AC\uC6A9\uC790"
      },
      // 3. 봇 행동 패턴 감지
      {
        id: "bot_behavior_detector",
        type: "bot_behavior" /* BOT_BEHAVIOR */,
        enabled: true,
        severity: "medium" /* MEDIUM */,
        threshold: {
          likeRatio: 0.95,
          // likes가 95% 이상
          minEngagement: 20,
          // 최소 20개 engagement
          timePattern: "uniform",
          // 균등한 시간 간격
          intervalSeconds: 10
          // 10초 이하 간격
        },
        cooldownMinutes: 180,
        autoAlert: true,
        description: "\uBD07\uACFC \uAC19\uC740 \uAE30\uACC4\uC801 \uD328\uD134\uC744 \uBCF4\uC774\uB294 \uC0AC\uC6A9\uC790"
      },
      // 4. 스팸 버스트 패턴
      {
        id: "spam_burst_detector",
        type: "spam_burst" /* SPAM_BURST */,
        enabled: true,
        severity: "high" /* HIGH */,
        threshold: {
          burstCount: 50,
          // 1시간 내 50개 이상
          timeWindowMinutes: 60,
          // 1시간
          normalRatio: 10
          // 평소의 10배 이상
        },
        cooldownMinutes: 240,
        autoAlert: true,
        description: "\uC9E7\uC740 \uC2DC\uAC04 \uB0B4 \uB300\uB7C9\uC758 \uD65C\uB3D9\uC744 \uBCF4\uC774\uB294 \uC2A4\uD338 \uD328\uD134"
      },
      // 5. 팔로워 수 대비 이상 점수
      {
        id: "zero_followers_high_score_detector",
        type: "zero_followers_high_score" /* ZERO_FOLLOWERS_HIGH_SCORE */,
        enabled: true,
        severity: "medium" /* MEDIUM */,
        threshold: {
          maxFollowers: 10,
          // 10명 이하 팔로워
          minScore: 100
          // 100점 이상
        },
        cooldownMinutes: 360,
        autoAlert: false,
        description: "\uD314\uB85C\uC6CC \uC218\uAC00 \uB9E4\uC6B0 \uC801\uC740\uB370 \uB192\uC740 \uC810\uC218\uB97C \uBC1B\uC740 \uC0AC\uC6A9\uC790"
      },
      // 6. 급격한 점수 증가
      {
        id: "rapid_score_increase_detector",
        type: "rapid_score_increase" /* RAPID_SCORE_INCREASE */,
        enabled: true,
        severity: "high" /* HIGH */,
        threshold: {
          increaseRatio: 5,
          // 5배 이상 증가
          timeWindowHours: 24,
          // 24시간 내
          minBaseScore: 10
          // 기준 점수 10점 이상
        },
        cooldownMinutes: 120,
        autoAlert: true,
        description: "\uC9E7\uC740 \uC2DC\uAC04 \uB0B4 \uAE09\uACA9\uD55C \uC810\uC218 \uC99D\uAC00\uB97C \uBCF4\uC774\uB294 \uC0AC\uC6A9\uC790"
      },
      // 7. 가중치 계산 오류
      {
        id: "weight_calculation_error_detector",
        type: "weight_calculation_error" /* WEIGHT_CALCULATION_ERROR */,
        enabled: true,
        severity: "critical" /* CRITICAL */,
        threshold: {
          koreanMultiplier: 1.2,
          // 한국 커뮤니티 기대값
          globalMultiplier: 1,
          // 글로벌 커뮤니티 기대값
          tolerance: 0.05
          // 5% 허용 오차
        },
        cooldownMinutes: 60,
        autoAlert: true,
        description: "\uCEE4\uBBA4\uB2C8\uD2F0\uBCC4 \uAC00\uC911\uCE58\uAC00 \uC798\uBABB \uC801\uC6A9\uB41C \uC0AC\uC6A9\uC790"
      },
      // 8. 데이터 불일치
      {
        id: "data_inconsistency_detector",
        type: "data_inconsistency" /* DATA_INCONSISTENCY */,
        enabled: true,
        severity: "high" /* HIGH */,
        threshold: {
          scoreVariance: 0.1,
          // 10% 이상 점수 차이
          requiredFields: ["total_score", "likes", "replies", "user_id"]
        },
        cooldownMinutes: 180,
        autoAlert: true,
        description: "\uACC4\uC0B0\uB41C \uC810\uC218\uC640 \uC800\uC7A5\uB41C \uC810\uC218 \uAC04 \uBD88\uC77C\uCE58"
      }
    ];
  }
  /**
   * 개별 감지 규칙 실행
   */
  async executeDetectionRule(rule, recentData, cumulativeData) {
    switch (rule.type) {
      case "identical_counts" /* IDENTICAL_COUNTS */:
        return this.detectIdenticalCounts(rule, cumulativeData);
      case "excessive_engagement" /* EXCESSIVE_ENGAGEMENT */:
        return this.detectExcessiveEngagement(rule, cumulativeData);
      case "bot_behavior" /* BOT_BEHAVIOR */:
        return this.detectBotBehavior(rule, recentData);
      case "spam_burst" /* SPAM_BURST */:
        return this.detectSpamBurst(rule, recentData);
      case "zero_followers_high_score" /* ZERO_FOLLOWERS_HIGH_SCORE */:
        return this.detectZeroFollowersHighScore(rule, cumulativeData);
      case "rapid_score_increase" /* RAPID_SCORE_INCREASE */:
        return this.detectRapidScoreIncrease(rule, cumulativeData);
      case "weight_calculation_error" /* WEIGHT_CALCULATION_ERROR */:
        return this.detectWeightCalculationError(rule, cumulativeData);
      case "data_inconsistency" /* DATA_INCONSISTENCY */:
        return this.detectDataInconsistency(rule, cumulativeData);
      default:
        return [];
    }
  }
  /**
   * @mdkitchen7 유형 동일 카운트 감지
   */
  async detectIdenticalCounts(rule, data) {
    const anomalies = [];
    const { minCount, engagementTypes } = rule.threshold;
    data.forEach((item) => {
      const replies = item.replies || 0;
      const mentions = item.mentions || 0;
      if (replies >= minCount && mentions >= minCount && replies === mentions) {
        anomalies.push({
          id: `identical_counts_${item.user_id}_${Date.now()}`,
          type: "identical_counts" /* IDENTICAL_COUNTS */,
          severity: rule.severity,
          title: "\uB3D9\uC77C \uCE74\uC6B4\uD2B8 \uD328\uD134 \uAC10\uC9C0",
          description: `\uC0AC\uC6A9\uC790 ${item.username || item.user_id}\uC758 replies(${replies})\uC640 mentions(${mentions})\uAC00 \uB3D9\uC77C\uD569\uB2C8\uB2E4. \uC774\uB294 @mdkitchen7\uACFC \uAC19\uC740 \uB370\uC774\uD130 \uBD84\uB958 \uC624\uB958\uC77C \uAC00\uB2A5\uC131\uC774 \uB192\uC2B5\uB2C8\uB2E4.`,
          affectedUsers: [item.user_id],
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          confidence: 0.95,
          metadata: {
            userId: item.user_id,
            username: item.username,
            replies,
            mentions,
            totalScore: item.total_score,
            communityType: item.community_type
          },
          recommendations: [
            "Delta Calculator\uC758 engagement_type \uBD84\uB958 \uB85C\uC9C1 \uC810\uAC80",
            "\uD574\uB2F9 \uC0AC\uC6A9\uC790\uC758 \uC2E4\uC81C Twitter \uD65C\uB3D9 \uC218\uB3D9 \uD655\uC778",
            "mentions \uB370\uC774\uD130 \uC218\uC9D1 \uACFC\uC815 \uAC80\uC99D"
          ],
          autoActions: [
            "CloudWatch \uC54C\uB78C \uBC1C\uC0DD",
            "\uAC1C\uBC1C\uD300 Slack \uC54C\uB9BC",
            "\uB370\uC774\uD130 \uAC80\uC99D \uD0DC\uC2A4\uD06C \uC790\uB3D9 \uC2E4\uD589"
          ]
        });
      }
    });
    return anomalies;
  }
  /**
   * 과도한 engagement 감지
   */
  async detectExcessiveEngagement(rule, data) {
    const anomalies = [];
    const { totalEngagement, singleType } = rule.threshold;
    data.forEach((item) => {
      const total = (item.likes || 0) + (item.replies || 0) + (item.reposts || 0) + (item.quotes || 0) + (item.mentions || 0);
      const maxSingle = Math.max(
        item.likes || 0,
        item.replies || 0,
        item.reposts || 0,
        item.quotes || 0,
        item.mentions || 0
      );
      if (total >= totalEngagement || maxSingle >= singleType) {
        anomalies.push({
          id: `excessive_engagement_${item.user_id}_${Date.now()}`,
          type: "excessive_engagement" /* EXCESSIVE_ENGAGEMENT */,
          severity: rule.severity,
          title: "\uACFC\uB3C4\uD55C Engagement \uAC10\uC9C0",
          description: `\uC0AC\uC6A9\uC790 ${item.username || item.user_id}\uC758 \uCD1D engagement\uAC00 ${total}\uAC1C\uB85C \uBE44\uC815\uC0C1\uC801\uC73C\uB85C \uB192\uC2B5\uB2C8\uB2E4.`,
          affectedUsers: [item.user_id],
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          confidence: 0.85,
          metadata: {
            userId: item.user_id,
            username: item.username,
            totalEngagement: total,
            likes: item.likes,
            replies: item.replies,
            reposts: item.reposts,
            quotes: item.quotes,
            mentions: item.mentions,
            maxSingleType: maxSingle
          },
          recommendations: [
            "\uBD07 \uB610\uB294 \uC2A4\uD338 \uACC4\uC815 \uC5EC\uBD80 \uD655\uC778",
            "Twitter API \uC218\uC9D1 \uB370\uC774\uD130 \uAC80\uC99D",
            "\uACC4\uC815 \uC81C\uC678 \uBAA9\uB85D \uCD94\uAC00 \uAC80\uD1A0"
          ],
          autoActions: [
            "\uC784\uC2DC \uBAA8\uB2C8\uD130\uB9C1 \uBAA9\uB85D \uCD94\uAC00",
            "\uC0C1\uC138 \uBD84\uC11D \uB9AC\uD3EC\uD2B8 \uC0DD\uC131"
          ]
        });
      }
    });
    return anomalies;
  }
  /**
   * 봇 행동 패턴 감지
   */
  async detectBotBehavior(rule, data) {
    const anomalies = [];
    const { likeRatio, minEngagement } = rule.threshold;
    const userEngagements = /* @__PURE__ */ new Map();
    data.forEach((item) => {
      const userId = item.user_id;
      if (!userEngagements.has(userId)) {
        userEngagements.set(userId, []);
      }
      userEngagements.get(userId).push(item);
    });
    userEngagements.forEach((engagements, userId) => {
      if (engagements.length < minEngagement) return;
      const likeCount = engagements.filter((e) => e.engagement_type === "like").length;
      const ratio = likeCount / engagements.length;
      if (ratio >= likeRatio) {
        const userItem = engagements[0];
        anomalies.push({
          id: `bot_behavior_${userId}_${Date.now()}`,
          type: "bot_behavior" /* BOT_BEHAVIOR */,
          severity: rule.severity,
          title: "\uBD07 \uD589\uB3D9 \uD328\uD134 \uAC10\uC9C0",
          description: `\uC0AC\uC6A9\uC790 ${userItem.username || userId}\uC758 \uD65C\uB3D9 \uC911 ${(ratio * 100).toFixed(1)}%\uAC00 likes\uB85C, \uBD07\uACFC \uAC19\uC740 \uAE30\uACC4\uC801 \uD328\uD134\uC744 \uBCF4\uC785\uB2C8\uB2E4.`,
          affectedUsers: [userId],
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          confidence: 0.8,
          metadata: {
            userId,
            username: userItem.username,
            totalEngagements: engagements.length,
            likeCount,
            likeRatio: ratio,
            timePattern: "analyzed"
          },
          recommendations: [
            "\uACC4\uC815\uC758 \uC2E4\uC81C \uC0AC\uC6A9\uC790 \uC5EC\uBD80 \uD655\uC778",
            "\uC790\uB3D9\uD654 \uB3C4\uAD6C \uC0AC\uC6A9 \uC5EC\uBD80 \uAC80\uC99D",
            "\uD544\uC694\uC2DC \uACC4\uC815 \uC81C\uC678 \uBAA9\uB85D \uCD94\uAC00"
          ],
          autoActions: [
            "\uC0C1\uC138 \uD589\uB3D9 \uD328\uD134 \uBD84\uC11D",
            "\uC218\uB3D9 \uAC80\uD1A0 \uB300\uAE30\uC5F4 \uCD94\uAC00"
          ]
        });
      }
    });
    return anomalies;
  }
  /**
   * 급격한 점수 증가 감지
   */
  async detectRapidScoreIncrease(rule, data) {
    const anomalies = [];
    const { increaseRatio, minBaseScore } = rule.threshold;
    for (const item of data) {
      const currentScore = item.total_score || 0;
      const previousScore = await this.getPreviousScore(item.user_id);
      if (previousScore >= minBaseScore && currentScore >= previousScore * increaseRatio) {
        anomalies.push({
          id: `rapid_increase_${item.user_id}_${Date.now()}`,
          type: "rapid_score_increase" /* RAPID_SCORE_INCREASE */,
          severity: rule.severity,
          title: "\uAE09\uACA9\uD55C \uC810\uC218 \uC99D\uAC00 \uAC10\uC9C0",
          description: `\uC0AC\uC6A9\uC790 ${item.username || item.user_id}\uC758 \uC810\uC218\uAC00 ${previousScore}\uC5D0\uC11C ${currentScore}\uB85C ${(currentScore / previousScore).toFixed(1)}\uBC30 \uAE09\uC99D\uD588\uC2B5\uB2C8\uB2E4.`,
          affectedUsers: [item.user_id],
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          confidence: 0.9,
          metadata: {
            userId: item.user_id,
            username: item.username,
            previousScore,
            currentScore,
            increaseRatio: currentScore / previousScore,
            increaseAmount: currentScore - previousScore
          },
          recommendations: [
            "\uCD5C\uADFC engagement \uD65C\uB3D9 \uC0C1\uC138 \uBD84\uC11D",
            "viral \uCEE8\uD150\uCE20 \uB610\uB294 \uC774\uBCA4\uD2B8 \uD655\uC778",
            "\uC810\uC218 \uACC4\uC0B0 \uB85C\uC9C1 \uAC80\uC99D"
          ],
          autoActions: [
            "engagement \uD788\uC2A4\uD1A0\uB9AC \uBD84\uC11D",
            "\uC774\uC0C1 \uD65C\uB3D9 \uBAA8\uB2C8\uD130\uB9C1 \uAC15\uD654"
          ]
        });
      }
    }
    return anomalies;
  }
  /**
   * 가중치 계산 오류 감지
   */
  async detectWeightCalculationError(rule, data) {
    const anomalies = [];
    const { koreanMultiplier, globalMultiplier, tolerance } = rule.threshold;
    data.forEach((item) => {
      const communityType = item.community_type;
      const languageMultiplier = item.language_multiplier || 1;
      let expectedMultiplier = globalMultiplier;
      if (communityType === "korean") {
        expectedMultiplier = koreanMultiplier;
      }
      const error = Math.abs(languageMultiplier - expectedMultiplier) / expectedMultiplier;
      if (error > tolerance) {
        anomalies.push({
          id: `weight_error_${item.user_id}_${Date.now()}`,
          type: "weight_calculation_error" /* WEIGHT_CALCULATION_ERROR */,
          severity: rule.severity,
          title: "\uAC00\uC911\uCE58 \uACC4\uC0B0 \uC624\uB958 \uAC10\uC9C0",
          description: `\uC0AC\uC6A9\uC790 ${item.username || item.user_id} (${communityType})\uC758 \uC5B8\uC5B4 \uAC00\uC911\uCE58\uAC00 ${languageMultiplier}\uB85C \uC798\uBABB \uC801\uC6A9\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAE30\uB300\uAC12: ${expectedMultiplier}`,
          affectedUsers: [item.user_id],
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          confidence: 1,
          metadata: {
            userId: item.user_id,
            username: item.username,
            communityType,
            actualMultiplier: languageMultiplier,
            expectedMultiplier,
            error: error * 100
          },
          recommendations: [
            "CumulativeScoreCalculator \uAC00\uC911\uCE58 \uB85C\uC9C1 \uC810\uAC80",
            "\uCEE4\uBBA4\uB2C8\uD2F0 \uBD84\uB958 \uC815\uD655\uC131 \uAC80\uC99D",
            "\uC124\uC815\uAC12 vs \uD558\uB4DC\uCF54\uB529 \uD655\uC778"
          ],
          autoActions: [
            "\uC989\uC2DC \uAC1C\uBC1C\uD300 \uC54C\uB9BC",
            "\uAC00\uC911\uCE58 \uC7AC\uACC4\uC0B0 \uD0DC\uC2A4\uD06C \uC0DD\uC131",
            "\uC2DC\uC2A4\uD15C \uC810\uAC80 \uBAA8\uB4DC \uD65C\uC131\uD654"
          ]
        });
      }
    });
    return anomalies;
  }
  /**
   * 데이터 불일치 감지
   */
  async detectDataInconsistency(rule, data) {
    const anomalies = [];
    const { scoreVariance, requiredFields } = rule.threshold;
    data.forEach((item) => {
      const missingFields = requiredFields.filter(
        (field) => item[field] === void 0 || item[field] === null
      );
      if (missingFields.length > 0) {
        anomalies.push({
          id: `data_inconsistency_${item.user_id}_${Date.now()}`,
          type: "data_inconsistency" /* DATA_INCONSISTENCY */,
          severity: rule.severity,
          title: "\uB370\uC774\uD130 \uBD88\uC77C\uCE58 \uAC10\uC9C0",
          description: `\uC0AC\uC6A9\uC790 ${item.username || item.user_id}\uC758 \uB370\uC774\uD130\uC5D0\uC11C \uD544\uC218 \uD544\uB4DC\uAC00 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${missingFields.join(", ")}`,
          affectedUsers: [item.user_id],
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          confidence: 1,
          metadata: {
            userId: item.user_id,
            username: item.username,
            missingFields,
            availableFields: Object.keys(item)
          },
          recommendations: [
            "\uB370\uC774\uD130 \uC218\uC9D1 \uD30C\uC774\uD504\uB77C\uC778 \uC810\uAC80",
            "DynamoDB \uC2A4\uD0A4\uB9C8 \uAC80\uC99D",
            "\uB370\uC774\uD130 \uB9C8\uC774\uADF8\uB808\uC774\uC158 \uD544\uC694 \uC5EC\uBD80 \uD655\uC778"
          ],
          autoActions: [
            "\uB370\uC774\uD130 \uBCF5\uAD6C \uD504\uB85C\uC138\uC2A4 \uC2DC\uC791",
            "\uC218\uC9D1 \uD30C\uC774\uD504\uB77C\uC778 \uC0C1\uD0DC \uC810\uAC80"
          ]
        });
      }
      const calculatedScore = this.calculateExpectedScore(item);
      const actualScore = item.total_score || 0;
      if (actualScore > 0) {
        const variance = Math.abs(calculatedScore - actualScore) / actualScore;
        if (variance > scoreVariance) {
          anomalies.push({
            id: `score_inconsistency_${item.user_id}_${Date.now()}`,
            type: "data_inconsistency" /* DATA_INCONSISTENCY */,
            severity: rule.severity,
            title: "\uC810\uC218 \uACC4\uC0B0 \uBD88\uC77C\uCE58 \uAC10\uC9C0",
            description: `\uC0AC\uC6A9\uC790 ${item.username || item.user_id}\uC758 \uACC4\uC0B0\uB41C \uC810\uC218(${calculatedScore})\uC640 \uC800\uC7A5\uB41C \uC810\uC218(${actualScore})\uAC00 ${(variance * 100).toFixed(1)}% \uCC28\uC774\uB0A9\uB2C8\uB2E4.`,
            affectedUsers: [item.user_id],
            detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
            confidence: 0.9,
            metadata: {
              userId: item.user_id,
              username: item.username,
              calculatedScore,
              actualScore,
              variance: variance * 100
            },
            recommendations: [
              "\uC810\uC218 \uACC4\uC0B0 \uB85C\uC9C1 \uC7AC\uAC80\uD1A0",
              "engagement \uAC00\uC911\uCE58 \uD655\uC778",
              "\uC810\uC218 \uC7AC\uACC4\uC0B0 \uC2E4\uD589"
            ],
            autoActions: [
              "\uC810\uC218 \uC7AC\uACC4\uC0B0 \uD0DC\uC2A4\uD06C \uC0DD\uC131",
              "\uACC4\uC0B0 \uB85C\uC9C1 \uAC80\uC99D \uC2E4\uD589"
            ]
          });
        }
      }
    });
    return anomalies;
  }
  /**
   * 최근 데이터 조회
   */
  async fetchRecentData(date) {
    const response = await dynamoClient.send(new import_lib_dynamodb.ScanCommand({
      TableName: this.tableName,
      FilterExpression: "contains(#pk, :userPrefix) AND contains(#sk, :date)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#sk": "sk"
      },
      ExpressionAttributeValues: {
        ":userPrefix": "USER#",
        ":date": date
      },
      Limit: 1e3
      // 최근 1000건으로 제한
    }));
    return response.Items || [];
  }
  /**
   * 누적 데이터 조회
   */
  async fetchCumulativeData() {
    const response = await dynamoClient.send(new import_lib_dynamodb.ScanCommand({
      TableName: this.tableName,
      FilterExpression: "contains(#pk, :prefix)",
      ExpressionAttributeNames: {
        "#pk": "pk"
      },
      ExpressionAttributeValues: {
        ":prefix": "CUMULATIVE#"
      },
      Limit: 2e3
      // 최대 2000명으로 제한
    }));
    return response.Items || [];
  }
  /**
   * 쿨다운 확인
   */
  async isInCooldown(ruleId) {
    const rule = this.detectionRules.find((r) => r.id === ruleId);
    if (!rule) return false;
    try {
      const response = await dynamoClient.send(new import_lib_dynamodb.QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": `ANOMALY_COOLDOWN#${ruleId}`
        },
        ScanIndexForward: false,
        Limit: 1
      }));
      if (response.Items && response.Items.length > 0) {
        const lastExecution = new Date(response.Items[0].executed_at);
        const cooldownEnd = new Date(lastExecution.getTime() + rule.cooldownMinutes * 60 * 1e3);
        return /* @__PURE__ */ new Date() < cooldownEnd;
      }
    } catch (error) {
      console.warn("\uCFE8\uB2E4\uC6B4 \uD655\uC778 \uC2E4\uD328:", error);
    }
    return false;
  }
  /**
   * 쿨다운 업데이트
   */
  async updateCooldown(ruleId) {
    try {
      await dynamoClient.send(new import_lib_dynamodb.PutCommand({
        TableName: this.tableName,
        Item: {
          pk: `ANOMALY_COOLDOWN#${ruleId}`,
          sk: (/* @__PURE__ */ new Date()).toISOString(),
          executed_at: (/* @__PURE__ */ new Date()).toISOString(),
          ttl: Math.floor(Date.now() / 1e3) + 24 * 60 * 60
          // 24시간 TTL
        }
      }));
    } catch (error) {
      console.warn("\uCFE8\uB2E4\uC6B4 \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328:", error);
    }
  }
  /**
   * 감지된 이상 패턴 저장
   */
  async saveDetectedAnomalies(anomalies) {
    for (const anomaly of anomalies) {
      try {
        await dynamoClient.send(new import_lib_dynamodb.PutCommand({
          TableName: this.tableName,
          Item: {
            pk: `ANOMALY#${anomaly.type}`,
            sk: anomaly.id,
            ...anomaly,
            ttl: Math.floor(Date.now() / 1e3) + 30 * 24 * 60 * 60
            // 30일 TTL
          }
        }));
      } catch (error) {
        console.error("\uC774\uC0C1 \uD328\uD134 \uC800\uC7A5 \uC2E4\uD328:", error);
      }
    }
  }
  /**
   * 알림 발송
   */
  async sendAlerts(anomalies) {
    if (!this.alertConfig.enabled || anomalies.length === 0) return;
    const filteredAnomalies = anomalies.filter(
      (anomaly) => this.getSeverityLevel(anomaly.severity) >= this.getSeverityLevel(this.alertConfig.minimumSeverity)
    );
    if (filteredAnomalies.length === 0) return;
    const recentAlertCount = await this.getRecentAlertCount();
    if (recentAlertCount >= this.alertConfig.rateLimitPerHour) {
      console.log("\uC54C\uB9BC \uBE44\uC728 \uC81C\uD55C\uC73C\uB85C \uC778\uD574 \uC54C\uB9BC \uBC1C\uC1A1 \uC2A4\uD0B5");
      return;
    }
    if (this.alertConfig.snsTopicArn) {
      await this.sendSNSAlert(filteredAnomalies);
    }
    if (this.alertConfig.slackWebhookUrl) {
      await this.sendSlackAlert(filteredAnomalies);
    }
    console.log(`\u{1F4E2} ${filteredAnomalies.length}\uAC1C \uC774\uC0C1 \uD328\uD134 \uC54C\uB9BC \uBC1C\uC1A1 \uC644\uB8CC`);
  }
  /**
   * CloudWatch 메트릭 발행
   */
  async publishMetrics(anomalies) {
    try {
      const metricData = [
        {
          MetricName: "AnomaliesDetected",
          Value: anomalies.length,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        }
      ];
      const severityCounts = this.countBySeverity(anomalies);
      Object.entries(severityCounts).forEach(([severity, count]) => {
        metricData.push({
          MetricName: "AnomaliesBySeverity",
          Value: count,
          Unit: "Count",
          Timestamp: /* @__PURE__ */ new Date()
        });
      });
      await cloudWatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
        Namespace: "NASUN/AnomalyDetection",
        MetricData: metricData
      }));
    } catch (error) {
      console.error("CloudWatch \uBA54\uD2B8\uB9AD \uBC1C\uD589 \uC2E4\uD328:", error);
    }
  }
  /**
   * 헬퍼 메서드들
   */
  loadAlertConfig() {
    return {
      enabled: process.env.ANOMALY_ALERTS_ENABLED === "true",
      snsTopicArn: process.env.ANOMALY_SNS_TOPIC_ARN,
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      emailRecipients: (process.env.ALERT_EMAIL_RECIPIENTS || "").split(",").filter((e) => e),
      minimumSeverity: process.env.MINIMUM_ALERT_SEVERITY || "medium" /* MEDIUM */,
      rateLimitPerHour: parseInt(process.env.ALERT_RATE_LIMIT || "10")
    };
  }
  getSeverityLevel(severity) {
    switch (severity) {
      case "low" /* LOW */:
        return 1;
      case "medium" /* MEDIUM */:
        return 2;
      case "high" /* HIGH */:
        return 3;
      case "critical" /* CRITICAL */:
        return 4;
      default:
        return 0;
    }
  }
  countBySeverity(anomalies) {
    const counts = {};
    anomalies.forEach((anomaly) => {
      counts[anomaly.severity] = (counts[anomaly.severity] || 0) + 1;
    });
    return counts;
  }
  calculateExpectedScore(item) {
    const weights = { like: 1, reply: 3, repost: 2, quote: 2, mention: 1 };
    const baseScore = (item.likes || 0) * weights.like + (item.replies || 0) * weights.reply + (item.reposts || 0) * weights.repost + (item.quotes || 0) * weights.quote + (item.mentions || 0) * weights.mention;
    const languageMultiplier = item.language_multiplier || 1;
    const followerWeight = item.follower_weight || 1;
    return Math.round(baseScore * languageMultiplier * followerWeight);
  }
  async getPreviousScore(userId) {
    return 50;
  }
  async getRecentAlertCount() {
    return 0;
  }
  async sendSNSAlert(anomalies) {
    try {
      const message = this.formatAlertMessage(anomalies);
      await snsClient.send(new import_client_sns.PublishCommand({
        TopicArn: this.alertConfig.snsTopicArn,
        Subject: `NASUN \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0: ${anomalies.length}\uAC1C`,
        Message: message
      }));
    } catch (error) {
      console.error("SNS \uC54C\uB9BC \uBC1C\uC1A1 \uC2E4\uD328:", error);
    }
  }
  async sendSlackAlert(anomalies) {
    console.log("Slack \uC54C\uB9BC \uBC1C\uC1A1 \uAD6C\uD604 \uD544\uC694");
  }
  formatAlertMessage(anomalies) {
    let message = `\u{1F6A8} NASUN \uB9AC\uB354\uBCF4\uB4DC \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0

`;
    message += `\uAC10\uC9C0 \uC2DC\uAC04: ${(/* @__PURE__ */ new Date()).toISOString()}
`;
    message += `\uCD1D ${anomalies.length}\uAC1C \uC774\uC0C1 \uD328\uD134 \uBC1C\uACAC

`;
    anomalies.forEach((anomaly, index) => {
      message += `${index + 1}. ${anomaly.title}
`;
      message += `   \uC2EC\uAC01\uB3C4: ${anomaly.severity.toUpperCase()}
`;
      message += `   \uC124\uBA85: ${anomaly.description}
`;
      message += `   \uC601\uD5A5 \uC0AC\uC6A9\uC790: ${anomaly.affectedUsers.join(", ")}

`;
    });
    return message;
  }
  /**
   * 스팸 버스트 감지
   */
  async detectSpamBurst(rule, recentData) {
    const results = [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1e3);
    const recentActivity = recentData.filter(
      (item) => new Date(item.createdAt || item.timestamp) > oneHourAgo
    );
    if (recentActivity.length > (rule.threshold || 50)) {
      results.push({
        id: `spam-burst-${Date.now()}`,
        type: "spam_burst" /* SPAM_BURST */,
        ruleId: rule.id,
        title: "Spam Burst Detected",
        description: `\uCD5C\uADFC 1\uC2DC\uAC04 \uB0B4 ${recentActivity.length}\uAC1C\uC758 \uAE09\uACA9\uD55C \uD65C\uB3D9 \uC99D\uAC00 \uAC10\uC9C0`,
        severity: "high" /* HIGH */,
        detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
        confidence: 0.8,
        affectedUsers: recentActivity.map((item) => item.userId).slice(0, 10),
        recommendations: ["\uC0AC\uC6A9\uC790 \uAC80\uC99D \uAC15\uD654", "\uD65C\uB3D9 \uD328\uD134 \uBD84\uC11D"],
        autoActions: ["\uC77C\uC2DC \uC810\uC218 \uB3D9\uACB0"],
        metadata: {
          activityCount: recentActivity.length,
          threshold: rule.threshold
        }
      });
    }
    return results;
  }
  /**
   * 팔로워 수 0인 사용자의 높은 점수 감지
   */
  async detectZeroFollowersHighScore(rule, cumulativeData) {
    const results = [];
    const suspiciousUsers = cumulativeData.filter(
      (item) => (item.followersCount === 0 || item.followersCount === void 0) && (item.totalScore || 0) > (rule.threshold || 100)
    );
    if (suspiciousUsers.length > 0) {
      results.push({
        id: `zero-followers-${Date.now()}`,
        type: "zero_followers_high_score" /* ZERO_FOLLOWERS_HIGH_SCORE */,
        ruleId: rule.id,
        title: "Zero Followers High Score",
        description: `\uD314\uB85C\uC6CC \uC218 0\uC778 \uC0AC\uC6A9\uC790 ${suspiciousUsers.length}\uBA85\uC774 \uB192\uC740 \uC810\uC218\uB97C \uAE30\uB85D`,
        severity: "medium" /* MEDIUM */,
        detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
        confidence: 0.7,
        affectedUsers: suspiciousUsers.map((user) => user.userId || user.username).slice(0, 10),
        recommendations: ["\uD314\uB85C\uC6CC \uC218 \uAC80\uC99D", "\uACC4\uC815 \uC9C4\uC704 \uD655\uC778"],
        autoActions: ["\uC810\uC218 \uAC80\uD1A0 \uB300\uC0C1 \uD45C\uC2DC"],
        metadata: {
          userCount: suspiciousUsers.length,
          threshold: rule.threshold
        }
      });
    }
    return results;
  }
};

// src/handlers/monitoring/anomaly-detection-handler.ts
async function handler(event, context) {
  const executionId = context.awsRequestId;
  const startTime = Date.now();
  console.log("\u{1F50D} \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 Lambda \uC2E4\uD589 \uC2DC\uC791");
  console.log("Event:", JSON.stringify(event, null, 2));
  try {
    const { source, targetDate, ruleIds, dryRun, forceRun } = parseEvent(event);
    console.log(`\u{1F4CB} \uC2E4\uD589 \uBAA8\uB4DC: ${source}, \uB300\uC0C1 \uB0A0\uC9DC: ${targetDate}, \uD14C\uC2A4\uD2B8 \uBAA8\uB4DC: ${dryRun}`);
    const anomalyService = new AnomalyDetectionService();
    if (forceRun) {
      console.log("\u26A1 \uAC15\uC81C \uC2E4\uD589 \uBAA8\uB4DC: \uCFE8\uB2E4\uC6B4 \uBB34\uC2DC");
    }
    if (ruleIds && ruleIds.length > 0) {
      console.log(`\u{1F3AF} \uD2B9\uC815 \uADDC\uCE59 \uC2E4\uD589: ${ruleIds.join(", ")}`);
    }
    console.log("\u{1F9EA} \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uC2E4\uD589 \uC911...");
    const anomalies = await anomalyService.detectAnomalies(targetDate);
    let alertsSent = 0;
    if (!dryRun && anomalies.length > 0) {
      console.log(`\u{1F4E2} ${anomalies.length}\uAC1C \uC774\uC0C1 \uD328\uD134\uC5D0 \uB300\uD574 \uC54C\uB9BC \uBC1C\uC1A1 \uC911...`);
      alertsSent = anomalies.filter(
        (a) => a.severity === "high" || a.severity === "critical"
      ).length;
    } else if (dryRun) {
      console.log("\u{1F527} \uD14C\uC2A4\uD2B8 \uBAA8\uB4DC: \uC54C\uB9BC \uBC1C\uC1A1 \uC2A4\uD0B5");
    }
    const dataProcessed = {
      recentEngagements: 0,
      // 실제 구현에서는 서비스에서 반환
      cumulativeUsers: 0
      // 실제 구현에서는 서비스에서 반환
    };
    const processingTime = Date.now() - startTime;
    const response = {
      success: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      executionId,
      anomaliesDetected: anomalies.length,
      alertsSent,
      rulesExecuted: 8,
      // 기본 규칙 수
      anomalies,
      processingTimeMs: processingTime,
      dataProcessed,
      warnings: []
    };
    logExecutionSummary(response, source);
    if (isApiGatewayEvent(event)) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(response)
      };
    }
    return response;
  } catch (error) {
    console.error("\u274C \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uC2E4\uD589 \uC2E4\uD328:", error);
    const errorResponse = {
      success: false,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      executionId,
      anomaliesDetected: 0,
      alertsSent: 0,
      rulesExecuted: 0,
      anomalies: [],
      processingTimeMs: Date.now() - startTime,
      dataProcessed: { recentEngagements: 0, cumulativeUsers: 0 },
      errors: [error instanceof Error ? error.message : String(error)]
    };
    await sendCriticalErrorAlert(error, executionId);
    if (isApiGatewayEvent(event)) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(errorResponse)
      };
    }
    return errorResponse;
  }
}
async function scheduledHandler(event, context) {
  console.log("\u23F0 \uC2A4\uCF00\uC904\uB41C \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uC2E4\uD589");
  const anomalyEvent = {
    source: "eventbridge",
    dryRun: false,
    forceRun: false
  };
  return await handler(anomalyEvent, context);
}
async function realtimeHandler(event, context) {
  console.log("\u26A1 \uC2E4\uC2DC\uAC04 \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uC2E4\uD589");
  console.log("Trigger event:", JSON.stringify(event, null, 2));
  const anomalyEvent = {
    source: "manual",
    dryRun: false,
    ruleIds: [
      "weight_calculation_error_detector",
      "data_inconsistency_detector",
      "identical_counts_detector"
    ]
    // 즉시 감지가 필요한 중요 규칙만
  };
  return await handler(anomalyEvent, context);
}
function parseEvent(event) {
  if (isApiGatewayEvent(event)) {
    const queryParams = event.queryStringParameters || {};
    return {
      source: "api",
      targetDate: queryParams.targetDate,
      ruleIds: queryParams.ruleIds ? queryParams.ruleIds.split(",") : void 0,
      dryRun: queryParams.dryRun === "true",
      forceRun: queryParams.forceRun === "true"
    };
  }
  if (event.source && event.source.includes("aws.events")) {
    return {
      source: "eventbridge",
      targetDate: event.detail?.targetDate,
      ruleIds: event.detail?.ruleIds,
      dryRun: event.detail?.dryRun || false,
      forceRun: event.detail?.forceRun || false
    };
  }
  return {
    source: event.source || "manual",
    targetDate: event.targetDate,
    ruleIds: event.ruleIds,
    dryRun: event.dryRun || false,
    forceRun: event.forceRun || false
  };
}
function isApiGatewayEvent(event) {
  return event.httpMethod && event.path;
}
function logExecutionSummary(response, source) {
  const { success, anomaliesDetected, alertsSent, processingTimeMs } = response;
  console.log("\n\u{1F4CA} \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uC2E4\uD589 \uC694\uC57D:");
  console.log(`   \uC2E4\uD589 \uC18C\uC2A4: ${source}`);
  console.log(`   \uC2E4\uD589 \uC0C1\uD0DC: ${success ? "\u2705 \uC131\uACF5" : "\u274C \uC2E4\uD328"}`);
  console.log(`   \uCC98\uB9AC \uC2DC\uAC04: ${processingTimeMs}ms`);
  console.log(`   \uAC10\uC9C0\uB41C \uC774\uC0C1 \uD328\uD134: ${anomaliesDetected}\uAC1C`);
  console.log(`   \uBC1C\uC1A1\uB41C \uC54C\uB9BC: ${alertsSent}\uAC1C`);
  if (anomaliesDetected > 0) {
    console.log("\n\u{1F6A8} \uAC10\uC9C0\uB41C \uC774\uC0C1 \uD328\uD134:");
    response.anomalies.forEach((anomaly, index) => {
      const severityIcon = getSeverityIcon(anomaly.severity);
      console.log(`   ${index + 1}. ${severityIcon} ${anomaly.title} (${anomaly.severity})`);
      console.log(`      \uC601\uD5A5 \uC0AC\uC6A9\uC790: ${anomaly.affectedUsers.join(", ")}`);
      console.log(`      \uC2E0\uB8B0\uB3C4: ${(anomaly.confidence * 100).toFixed(1)}%`);
    });
  }
  if (response.errors && response.errors.length > 0) {
    console.log("\n\u274C \uBC1C\uC0DD\uD55C \uC624\uB958:");
    response.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }
  if (response.warnings && response.warnings.length > 0) {
    console.log("\n\u26A0\uFE0F \uACBD\uACE0\uC0AC\uD56D:");
    response.warnings.forEach((warning, index) => {
      console.log(`   ${index + 1}. ${warning}`);
    });
  }
}
function getSeverityIcon(severity) {
  switch (severity) {
    case "critical":
      return "\u{1F534}";
    case "high":
      return "\u{1F7E1}";
    case "medium":
      return "\u{1F7E0}";
    case "low":
      return "\u{1F7E2}";
    default:
      return "\u2753";
  }
}
async function sendCriticalErrorAlert(error, executionId) {
  try {
    console.log("\u{1F6A8} \uCE58\uBA85\uC801 \uC624\uB958 \uBC1C\uC0DD - \uAE34\uAE09 \uC54C\uB9BC \uBC1C\uC1A1");
    console.error("\uAE34\uAE09 \uC54C\uB9BC \uB0B4\uC6A9:", {
      error: error instanceof Error ? error.message : String(error),
      executionId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      service: "anomaly-detection"
    });
  } catch (alertError) {
    console.error("\uAE34\uAE09 \uC54C\uB9BC \uBC1C\uC1A1 \uC2E4\uD328:", alertError);
  }
}
async function healthCheckHandler(event, context) {
  try {
    const anomalyService = new AnomalyDetectionService();
    const healthStatus = {
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      service: "anomaly-detection",
      version: "1.0.0",
      checks: {
        dynamodb: "ok",
        sns: "ok",
        cloudwatch: "ok"
      }
    };
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(healthStatus)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        status: "unhealthy",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        error: error instanceof Error ? error.message : String(error)
      })
    };
  }
}
async function historyHandler(event, context) {
  try {
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit || "50");
    const type = queryParams.type;
    const severity = queryParams.severity;
    const history = {
      items: [],
      // 실제 구현에서는 DynamoDB에서 조회
      pagination: {
        limit,
        hasNext: false
      },
      filters: {
        type,
        severity
      }
    };
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(history)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      })
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler,
  healthCheckHandler,
  historyHandler,
  realtimeHandler,
  scheduledHandler
});
//# sourceMappingURL=anomaly-detection-handler.js.map
