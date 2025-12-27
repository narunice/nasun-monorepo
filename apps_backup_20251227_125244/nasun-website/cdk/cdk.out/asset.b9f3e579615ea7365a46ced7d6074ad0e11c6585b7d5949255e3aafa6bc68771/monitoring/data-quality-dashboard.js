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

// src/handlers/monitoring/data-quality-dashboard.ts
var data_quality_dashboard_exports = {};
__export(data_quality_dashboard_exports, {
  alertHandler: () => alertHandler,
  handler: () => handler,
  scheduledHandler: () => scheduledHandler
});
module.exports = __toCommonJS(data_quality_dashboard_exports);
var import_client_dynamodb2 = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb2 = require("@aws-sdk/lib-dynamodb");

// src/services/data-quality-monitor.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var dynamoClient = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var cloudWatchClient = new import_client_cloudwatch.CloudWatchClient({});
var DataQualityMonitor = class {
  constructor(tableName = process.env.CUMULATIVE_TABLE_NAME || "") {
    this.tableName = tableName;
  }
  /**
   * 전체 데이터 품질 메트릭 수집
   */
  async collectQualityMetrics(targetDate) {
    const date = targetDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    console.log(`\u{1F50D} \uB370\uC774\uD130 \uD488\uC9C8 \uBA54\uD2B8\uB9AD \uC218\uC9D1 \uC2DC\uC791: ${date}`);
    try {
      const [
        engagementMetrics,
        followersMetrics,
        scoreMetrics,
        pipelineMetrics,
        anomalies
      ] = await Promise.all([
        this.analyzeEngagementTypeQuality(date),
        this.analyzeFollowersCountQuality(date),
        this.analyzeScoreCalculationQuality(date),
        this.analyzePipelineQuality(date),
        this.detectAnomalies(date)
      ]);
      const metrics = {
        ...engagementMetrics,
        ...followersMetrics,
        ...scoreMetrics,
        ...pipelineMetrics,
        suspiciousPatterns: anomalies,
        alertLevel: this.calculateAlertLevel(anomalies)
      };
      await this.publishToCloudWatch(metrics, date);
      console.log(`\u2705 \uB370\uC774\uD130 \uD488\uC9C8 \uBA54\uD2B8\uB9AD \uC218\uC9D1 \uC644\uB8CC`);
      return metrics;
    } catch (error) {
      console.error("\u274C \uB370\uC774\uD130 \uD488\uC9C8 \uBA54\uD2B8\uB9AD \uC218\uC9D1 \uC2E4\uD328:", error);
      throw error;
    }
  }
  /**
   * Engagement Type 품질 분석
   */
  async analyzeEngagementTypeQuality(date) {
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
      ProjectionExpression: "engagement_type, validation_stats"
    }));
    const items = response.Items || [];
    const totalEngagements = items.length;
    let validCount = 0;
    let unknownCount = 0;
    const typeDistribution = /* @__PURE__ */ new Map();
    items.forEach((item) => {
      const engagementType = item.engagement_type;
      if (engagementType && ["like", "reply", "repost", "quote", "mention"].includes(engagementType)) {
        validCount++;
        typeDistribution.set(engagementType, (typeDistribution.get(engagementType) || 0) + 1);
      } else {
        unknownCount++;
        typeDistribution.set("unknown", (typeDistribution.get("unknown") || 0) + 1);
      }
    });
    return {
      validEngagementTypeRatio: totalEngagements > 0 ? validCount / totalEngagements : 1,
      unknownEngagementTypeCount: unknownCount,
      engagementTypeDistribution: typeDistribution
    };
  }
  /**
   * Followers Count 품질 분석
   */
  async analyzeFollowersCountQuality(date) {
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
      ProjectionExpression: "engaging_followers_count"
    }));
    const items = response.Items || [];
    const totalItems = items.length;
    let withFollowersCount = 0;
    let totalFollowers = 0;
    const distribution = /* @__PURE__ */ new Map();
    items.forEach((item) => {
      const followersCount = item.engaging_followers_count;
      if (followersCount !== void 0 && followersCount !== null) {
        withFollowersCount++;
        totalFollowers += followersCount;
        const category = this.categorizeFollowersCount(followersCount);
        distribution.set(category, (distribution.get(category) || 0) + 1);
      }
    });
    return {
      followersCountCoverageRatio: totalItems > 0 ? withFollowersCount / totalItems : 0,
      followersCountDistribution: distribution,
      averageFollowersCount: withFollowersCount > 0 ? totalFollowers / withFollowersCount : 0
    };
  }
  /**
   * Score Calculation 품질 분석
   */
  async analyzeScoreCalculationQuality(date) {
    const response = await dynamoClient.send(new import_lib_dynamodb.ScanCommand({
      TableName: this.tableName,
      FilterExpression: "contains(#pk, :cumulativePrefix)",
      ExpressionAttributeNames: {
        "#pk": "pk"
      },
      ExpressionAttributeValues: {
        ":cumulativePrefix": "CUMULATIVE#"
      },
      ProjectionExpression: "community_type, weight_applied, log_base, language_multiplier"
    }));
    const items = response.Items || [];
    let koreanCount = 0;
    let globalCount = 0;
    let totalWeight = 0;
    let validWeightCount = 0;
    items.forEach((item) => {
      if (item.community_type === "korean") koreanCount++;
      if (item.community_type === "global") globalCount++;
      if (item.weight_applied && item.weight_applied > 0) {
        totalWeight += item.weight_applied;
        validWeightCount++;
      }
    });
    const totalUsers = items.length;
    return {
      weightCalculationAccuracy: validWeightCount / Math.max(totalUsers, 1),
      koreanCommunityRatio: totalUsers > 0 ? koreanCount / totalUsers : 0,
      globalCommunityRatio: totalUsers > 0 ? globalCount / totalUsers : 0,
      averageWeightApplied: validWeightCount > 0 ? totalWeight / validWeightCount : 0
    };
  }
  /**
   * Data Pipeline 품질 분석
   */
  async analyzePipelineQuality(date) {
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
    const response = await dynamoClient.send(new import_lib_dynamodb.ScanCommand({
      TableName: this.tableName,
      FilterExpression: "contains(#sk, :date) OR contains(#sk, :yesterday)",
      ExpressionAttributeNames: {
        "#sk": "sk"
      },
      ExpressionAttributeValues: {
        ":date": date,
        ":yesterday": yesterdayDate
      },
      ProjectionExpression: "created_at, processing_error"
    }));
    const items = response.Items || [];
    const todayItems = items.filter((item) => item.sk && item.sk.includes(date));
    const errorItems = items.filter((item) => item.processing_error);
    const avgLatency = 5;
    return {
      dataProcessingLatency: avgLatency,
      errorRate: items.length > 0 ? errorItems.length / items.length : 0,
      dataCompletenessRatio: 0.95,
      // 실제 구현시 더 정교한 계산
      dailyProcessedCount: todayItems.length
    };
  }
  /**
   * 이상 패턴 감지
   */
  async detectAnomalies(date) {
    const anomalies = [];
    const identicalCountsAnomalies = await this.detectIdenticalCounts(date);
    anomalies.push(...identicalCountsAnomalies);
    const excessiveEngagementAnomalies = await this.detectExcessiveEngagement(date);
    anomalies.push(...excessiveEngagementAnomalies);
    const weightErrorAnomalies = await this.detectWeightCalculationErrors(date);
    anomalies.push(...weightErrorAnomalies);
    return anomalies;
  }
  /**
   * 동일한 카운트 패턴 감지
   */
  async detectIdenticalCounts(date) {
    const response = await dynamoClient.send(new import_lib_dynamodb.ScanCommand({
      TableName: this.tableName,
      FilterExpression: "contains(#pk, :cumulativePrefix)",
      ExpressionAttributeNames: {
        "#pk": "pk"
      },
      ExpressionAttributeValues: {
        ":cumulativePrefix": "CUMULATIVE#"
      },
      ProjectionExpression: "user_id, username, replies, mentions, likes, reposts, quotes"
    }));
    const anomalies = [];
    const items = response.Items || [];
    items.forEach((item) => {
      const { replies = 0, mentions = 0, likes = 0, reposts = 0, quotes = 0 } = item;
      if (replies > 0 && mentions > 0 && replies === mentions) {
        anomalies.push({
          type: "IDENTICAL_COUNTS",
          userId: item.user_id,
          description: `User ${item.username || item.user_id} has identical replies (${replies}) and mentions (${mentions}) counts`,
          severity: "HIGH",
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          metadata: { replies, mentions, likes, reposts, quotes }
        });
      }
    });
    return anomalies;
  }
  /**
   * 과도한 engagement 감지
   */
  async detectExcessiveEngagement(date) {
    const response = await dynamoClient.send(new import_lib_dynamodb.ScanCommand({
      TableName: this.tableName,
      FilterExpression: "contains(#pk, :cumulativePrefix)",
      ExpressionAttributeNames: {
        "#pk": "pk"
      },
      ExpressionAttributeValues: {
        ":cumulativePrefix": "CUMULATIVE#"
      },
      ProjectionExpression: "user_id, username, total_score, replies, mentions, likes, reposts, quotes"
    }));
    const anomalies = [];
    const items = response.Items || [];
    items.forEach((item) => {
      const totalEngagements = (item.replies || 0) + (item.mentions || 0) + (item.likes || 0) + (item.reposts || 0) + (item.quotes || 0);
      if (totalEngagements > 1e3) {
        anomalies.push({
          type: "EXCESSIVE_ENGAGEMENT",
          userId: item.user_id,
          description: `User ${item.username || item.user_id} has excessive engagement count: ${totalEngagements}`,
          severity: "MEDIUM",
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          metadata: { totalEngagements, totalScore: item.total_score }
        });
      }
    });
    return anomalies;
  }
  /**
   * 가중치 계산 오류 감지
   */
  async detectWeightCalculationErrors(date) {
    const response = await dynamoClient.send(new import_lib_dynamodb.ScanCommand({
      TableName: this.tableName,
      FilterExpression: "contains(#pk, :cumulativePrefix)",
      ExpressionAttributeNames: {
        "#pk": "pk"
      },
      ExpressionAttributeValues: {
        ":cumulativePrefix": "CUMULATIVE#"
      },
      ProjectionExpression: "user_id, username, community_type, weight_applied, language_multiplier"
    }));
    const anomalies = [];
    const items = response.Items || [];
    items.forEach((item) => {
      const { community_type, weight_applied, language_multiplier } = item;
      if (community_type === "korean" && language_multiplier !== 1.2) {
        anomalies.push({
          type: "WEIGHT_CALCULATION_ERROR",
          userId: item.user_id,
          description: `Korean user ${item.username || item.user_id} has incorrect language multiplier: ${language_multiplier} (expected: 1.2)`,
          severity: "HIGH",
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          metadata: { community_type, weight_applied, language_multiplier }
        });
      }
      if (community_type === "global" && language_multiplier !== 1) {
        anomalies.push({
          type: "WEIGHT_CALCULATION_ERROR",
          userId: item.user_id,
          description: `Global user ${item.username || item.user_id} has incorrect language multiplier: ${language_multiplier} (expected: 1.0)`,
          severity: "HIGH",
          detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
          metadata: { community_type, weight_applied, language_multiplier }
        });
      }
    });
    return anomalies;
  }
  /**
   * 대시보드 위젯 데이터 생성
   */
  async generateDashboardWidgets(metrics) {
    const widgets = [];
    widgets.push({
      id: "engagement-type-quality",
      title: "Engagement Type \uD488\uC9C8",
      type: "metric",
      data: {
        validRatio: (metrics.validEngagementTypeRatio * 100).toFixed(2) + "%",
        unknownCount: metrics.unknownEngagementTypeCount,
        distribution: Array.from(metrics.engagementTypeDistribution.entries())
      },
      status: metrics.validEngagementTypeRatio > 0.95 ? "healthy" : metrics.validEngagementTypeRatio > 0.9 ? "warning" : "critical",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    });
    widgets.push({
      id: "followers-coverage",
      title: "Followers Count \uCEE4\uBC84\uB9AC\uC9C0",
      type: "metric",
      data: {
        coverageRatio: (metrics.followersCountCoverageRatio * 100).toFixed(2) + "%",
        averageFollowers: Math.round(metrics.averageFollowersCount),
        distribution: Array.from(metrics.followersCountDistribution.entries())
      },
      status: metrics.followersCountCoverageRatio > 0.9 ? "healthy" : metrics.followersCountCoverageRatio > 0.7 ? "warning" : "critical",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    });
    widgets.push({
      id: "weight-calculation",
      title: "\uAC00\uC911\uCE58 \uACC4\uC0B0 \uC815\uD655\uB3C4",
      type: "metric",
      data: {
        accuracy: (metrics.weightCalculationAccuracy * 100).toFixed(2) + "%",
        koreanRatio: (metrics.koreanCommunityRatio * 100).toFixed(2) + "%",
        globalRatio: (metrics.globalCommunityRatio * 100).toFixed(2) + "%",
        averageWeight: metrics.averageWeightApplied.toFixed(2)
      },
      status: metrics.weightCalculationAccuracy > 0.95 ? "healthy" : metrics.weightCalculationAccuracy > 0.9 ? "warning" : "critical",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    });
    widgets.push({
      id: "anomaly-alerts",
      title: "\uC774\uC0C1 \uD328\uD134 \uC54C\uB9BC",
      type: "alert",
      data: {
        totalAnomalies: metrics.suspiciousPatterns.length,
        highSeverity: metrics.suspiciousPatterns.filter((a) => a.severity === "HIGH").length,
        mediumSeverity: metrics.suspiciousPatterns.filter((a) => a.severity === "MEDIUM").length,
        lowSeverity: metrics.suspiciousPatterns.filter((a) => a.severity === "LOW").length,
        patterns: metrics.suspiciousPatterns.slice(0, 5)
        // 최근 5개만
      },
      status: metrics.alertLevel === "GREEN" ? "healthy" : metrics.alertLevel === "YELLOW" ? "warning" : "critical",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    });
    widgets.push({
      id: "pipeline-status",
      title: "\uB370\uC774\uD130 \uD30C\uC774\uD504\uB77C\uC778 \uC0C1\uD0DC",
      type: "metric",
      data: {
        latency: metrics.dataProcessingLatency + " minutes",
        errorRate: (metrics.errorRate * 100).toFixed(2) + "%",
        completeness: (metrics.dataCompletenessRatio * 100).toFixed(2) + "%",
        dailyProcessed: metrics.dailyProcessedCount
      },
      status: metrics.errorRate < 0.01 && metrics.dataCompletenessRatio > 0.95 ? "healthy" : metrics.errorRate < 0.05 && metrics.dataCompletenessRatio > 0.9 ? "warning" : "critical",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    });
    return widgets;
  }
  /**
   * CloudWatch 메트릭 발행
   */
  async publishToCloudWatch(metrics, date) {
    const metricData = [
      {
        MetricName: "ValidEngagementTypeRatio",
        Value: metrics.validEngagementTypeRatio,
        Unit: "Percent",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "FollowersCountCoverage",
        Value: metrics.followersCountCoverageRatio,
        Unit: "Percent",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "WeightCalculationAccuracy",
        Value: metrics.weightCalculationAccuracy,
        Unit: "Percent",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "AnomalyCount",
        Value: metrics.suspiciousPatterns.length,
        Unit: "Count",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "DataProcessingLatency",
        Value: metrics.dataProcessingLatency,
        Unit: "Seconds",
        Timestamp: /* @__PURE__ */ new Date()
      },
      {
        MetricName: "ErrorRate",
        Value: metrics.errorRate,
        Unit: "Percent",
        Timestamp: /* @__PURE__ */ new Date()
      }
    ];
    try {
      await cloudWatchClient.send(new import_client_cloudwatch.PutMetricDataCommand({
        Namespace: "NASUN/DataQuality",
        MetricData: metricData
      }));
      console.log("\u{1F4CA} CloudWatch \uBA54\uD2B8\uB9AD \uBC1C\uD589 \uC644\uB8CC");
    } catch (error) {
      console.error("\u274C CloudWatch \uBA54\uD2B8\uB9AD \uBC1C\uD589 \uC2E4\uD328:", error);
    }
  }
  /**
   * 전체 경고 수준 계산
   */
  calculateAlertLevel(anomalies) {
    const highSeverityCount = anomalies.filter((a) => a.severity === "HIGH").length;
    const mediumSeverityCount = anomalies.filter((a) => a.severity === "MEDIUM").length;
    if (highSeverityCount > 0 || mediumSeverityCount > 10) {
      return "RED";
    } else if (mediumSeverityCount > 0 || anomalies.length > 20) {
      return "YELLOW";
    } else {
      return "GREEN";
    }
  }
  /**
   * 팔로워 수 범위별 분류
   */
  categorizeFollowersCount(count) {
    if (count === 0) return "0";
    if (count <= 100) return "1-100";
    if (count <= 500) return "101-500";
    if (count <= 1e3) return "501-1K";
    if (count <= 5e3) return "1K-5K";
    if (count <= 1e4) return "5K-10K";
    if (count <= 5e4) return "10K-50K";
    if (count <= 1e5) return "50K-100K";
    if (count <= 5e5) return "100K-500K";
    if (count <= 1e6) return "500K-1M";
    return "1M+";
  }
  /**
   * 품질 리포트 생성
   */
  async generateQualityReport(targetDate) {
    const metrics = await this.collectQualityMetrics(targetDate);
    const widgets = await this.generateDashboardWidgets(metrics);
    let report = "\n=== NASUN \uB370\uC774\uD130 \uD488\uC9C8 \uBAA8\uB2C8\uD130\uB9C1 \uB9AC\uD3EC\uD2B8 ===\n\n";
    report += `\u{1F4C5} \uBD84\uC11D \uC77C\uC790: ${targetDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]}
`;
    report += `\u{1F6A8} \uC804\uCCB4 \uACBD\uACE0 \uC218\uC900: ${metrics.alertLevel}

`;
    widgets.forEach((widget) => {
      const statusIcon = widget.status === "healthy" ? "\u2705" : widget.status === "warning" ? "\u26A0\uFE0F" : "\u274C";
      report += `${statusIcon} ${widget.title}: ${widget.status.toUpperCase()}
`;
    });
    report += "\n--- \uC0C1\uC138 \uBA54\uD2B8\uB9AD ---\n";
    report += `\u{1F4CA} Engagement Type \uD488\uC9C8: ${(metrics.validEngagementTypeRatio * 100).toFixed(2)}% (\uBBF8\uBD84\uB958: ${metrics.unknownEngagementTypeCount}\uAC74)
`;
    report += `\u{1F465} Followers Count \uCEE4\uBC84\uB9AC\uC9C0: ${(metrics.followersCountCoverageRatio * 100).toFixed(2)}% (\uD3C9\uADE0: ${Math.round(metrics.averageFollowersCount)})
`;
    report += `\u2696\uFE0F \uAC00\uC911\uCE58 \uACC4\uC0B0 \uC815\uD655\uB3C4: ${(metrics.weightCalculationAccuracy * 100).toFixed(2)}%
`;
    report += `\u{1F1F0}\u{1F1F7} \uD55C\uAD6D \uCEE4\uBBA4\uB2C8\uD2F0: ${(metrics.koreanCommunityRatio * 100).toFixed(2)}% | \u{1F30D} \uAE00\uB85C\uBC8C: ${(metrics.globalCommunityRatio * 100).toFixed(2)}%
`;
    report += `\u23F1\uFE0F \uCC98\uB9AC \uC9C0\uC5F0\uC2DC\uAC04: ${metrics.dataProcessingLatency}\uBD84 | \uC624\uB958\uC728: ${(metrics.errorRate * 100).toFixed(2)}%
`;
    report += `\u{1F4C8} \uC77C\uC77C \uCC98\uB9AC\uB7C9: ${metrics.dailyProcessedCount}\uAC74
`;
    if (metrics.suspiciousPatterns.length > 0) {
      report += "\n--- \uAC10\uC9C0\uB41C \uC774\uC0C1 \uD328\uD134 ---\n";
      metrics.suspiciousPatterns.slice(0, 10).forEach((pattern, index) => {
        const severityIcon = pattern.severity === "HIGH" ? "\u{1F534}" : pattern.severity === "MEDIUM" ? "\u{1F7E1}" : "\u{1F7E2}";
        report += `${severityIcon} ${pattern.description}
`;
      });
    }
    report += "\n==============================================\n";
    return report;
  }
};

// src/handlers/monitoring/data-quality-dashboard.ts
var dynamoClient2 = import_lib_dynamodb2.DynamoDBDocumentClient.from(new import_client_dynamodb2.DynamoDBClient({}));
var qualityMonitor = new DataQualityMonitor();
async function handler(event, context) {
  console.log("\u{1F3AF} \uB370\uC774\uD130 \uD488\uC9C8 \uB300\uC2DC\uBCF4\uB4DC \uC2E4\uD589 \uC2DC\uC791");
  console.log("Event:", JSON.stringify(event, null, 2));
  try {
    const isApiGateway = "httpMethod" in event;
    let operation;
    let targetDate;
    let alertThreshold;
    if (isApiGateway) {
      const apiEvent = event;
      operation = apiEvent.queryStringParameters?.operation || "generate";
      targetDate = apiEvent.queryStringParameters?.targetDate;
      alertThreshold = apiEvent.queryStringParameters?.alertThreshold;
    } else {
      const dashboardEvent = event;
      operation = dashboardEvent.operation || "generate";
      targetDate = dashboardEvent.targetDate;
      alertThreshold = dashboardEvent.alertThreshold;
    }
    let result;
    switch (operation) {
      case "generate":
        result = await generateDashboard(targetDate);
        break;
      case "get":
        result = await getDashboardData(targetDate);
        break;
      case "alert":
        result = await getAlerts(alertThreshold);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    if (isApiGateway) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        },
        body: JSON.stringify(result)
      };
    } else {
      return result;
    }
  } catch (error) {
    console.error("\u274C \uB370\uC774\uD130 \uD488\uC9C8 \uB300\uC2DC\uBCF4\uB4DC \uC2E4\uD589 \uC2E4\uD328:", error);
    const errorResult = {
      success: false,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
    if ("httpMethod" in event) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(errorResult)
      };
    } else {
      return errorResult;
    }
  }
}
async function generateDashboard(targetDate) {
  const date = targetDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  console.log(`\u{1F4CA} \uB300\uC2DC\uBCF4\uB4DC \uB370\uC774\uD130 \uC0DD\uC131 \uC2DC\uC791: ${date}`);
  const metrics = await qualityMonitor.collectQualityMetrics(date);
  const widgets = await qualityMonitor.generateDashboardWidgets(metrics);
  const report = await qualityMonitor.generateQualityReport(date);
  const dashboardData = {
    pk: `DASHBOARD#QUALITY`,
    sk: date,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    metrics,
    widgets,
    report,
    alertLevel: metrics.alertLevel,
    ttl: Math.floor(Date.now() / 1e3) + 30 * 24 * 60 * 60
    // 30일 TTL
  };
  await dynamoClient2.send(new import_lib_dynamodb2.PutCommand({
    TableName: process.env.CUMULATIVE_TABLE_NAME,
    Item: dashboardData
  }));
  console.log("\u2705 \uB300\uC2DC\uBCF4\uB4DC \uB370\uC774\uD130 \uC0DD\uC131 \uBC0F \uC800\uC7A5 \uC644\uB8CC");
  console.log("\u{1F4CB} \uD488\uC9C8 \uB9AC\uD3EC\uD2B8:");
  console.log(report);
  return {
    success: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    metrics,
    widgets,
    report
  };
}
async function getDashboardData(targetDate) {
  const date = targetDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  console.log(`\u{1F4D6} \uB300\uC2DC\uBCF4\uB4DC \uB370\uC774\uD130 \uC870\uD68C: ${date}`);
  try {
    const response = await dynamoClient2.send(new import_lib_dynamodb2.GetCommand({
      TableName: process.env.CUMULATIVE_TABLE_NAME,
      Key: {
        pk: `DASHBOARD#QUALITY`,
        sk: date
      }
    }));
    if (!response.Item) {
      console.log("\u{1F4CA} \uAE30\uC874 \uB370\uC774\uD130\uAC00 \uC5C6\uC5B4 \uC0C8\uB85C \uC0DD\uC131\uD569\uB2C8\uB2E4");
      return await generateDashboard(date);
    }
    console.log("\u2705 \uAE30\uC874 \uB300\uC2DC\uBCF4\uB4DC \uB370\uC774\uD130 \uC870\uD68C \uC644\uB8CC");
    return {
      success: true,
      timestamp: response.Item.timestamp,
      metrics: response.Item.metrics,
      widgets: response.Item.widgets,
      report: response.Item.report
    };
  } catch (error) {
    console.error("\u274C \uB300\uC2DC\uBCF4\uB4DC \uB370\uC774\uD130 \uC870\uD68C \uC2E4\uD328:", error);
    return await generateDashboard(date);
  }
}
async function getAlerts(threshold = "MEDIUM") {
  console.log(`\u{1F6A8} \uACBD\uACE0 \uC54C\uB9BC \uC870\uD68C: ${threshold} \uC774\uC0C1`);
  const alerts = [];
  const today = /* @__PURE__ */ new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
    try {
      const response = await dynamoClient2.send(new import_lib_dynamodb2.GetCommand({
        TableName: process.env.CUMULATIVE_TABLE_NAME,
        Key: {
          pk: `DASHBOARD#QUALITY`,
          sk: date
        }
      }));
      if (response.Item && response.Item.metrics) {
        const metrics = response.Item.metrics;
        const filteredAnomalies = metrics.suspiciousPatterns.filter((pattern) => {
          if (threshold === "LOW") return true;
          if (threshold === "MEDIUM") return pattern.severity === "MEDIUM" || pattern.severity === "HIGH";
          if (threshold === "HIGH") return pattern.severity === "HIGH";
          return false;
        });
        if (filteredAnomalies.length > 0) {
          alerts.push({
            date,
            alertLevel: metrics.alertLevel,
            anomalies: filteredAnomalies,
            totalAnomalies: metrics.suspiciousPatterns.length
          });
        }
      }
    } catch (error) {
      console.error(`\u274C ${date} \uC54C\uB9BC \uB370\uC774\uD130 \uC870\uD68C \uC2E4\uD328:`, error);
    }
  }
  console.log(`\u2705 \uACBD\uACE0 \uC54C\uB9BC \uC870\uD68C \uC644\uB8CC: ${alerts.length}\uAC1C \uC77C\uC790\uC5D0\uC11C \uC54C\uB9BC \uBC1C\uACAC`);
  return {
    success: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    alerts
  };
}
async function scheduledHandler(event, context) {
  console.log("\u23F0 \uC2A4\uCF00\uC904\uB41C \uB300\uC2DC\uBCF4\uB4DC \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD589");
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
    await generateDashboard(yesterday);
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    await generateDashboard(today);
    console.log("\u2705 \uC2A4\uCF00\uC904\uB41C \uB300\uC2DC\uBCF4\uB4DC \uC5C5\uB370\uC774\uD2B8 \uC644\uB8CC");
  } catch (error) {
    console.error("\u274C \uC2A4\uCF00\uC904\uB41C \uB300\uC2DC\uBCF4\uB4DC \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328:", error);
    throw error;
  }
}
async function alertHandler(event, context) {
  console.log("\u{1F6A8} \uC2E4\uC2DC\uAC04 \uC54C\uB9BC \uCCB4\uD06C \uC2E4\uD589");
  try {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const metrics = await qualityMonitor.collectQualityMetrics(today);
    const criticalAnomalies = metrics.suspiciousPatterns.filter(
      (pattern) => pattern.severity === "HIGH"
    );
    if (criticalAnomalies.length > 0) {
      console.log(`\u{1F534} \uAE34\uAE09 \uC54C\uB9BC: ${criticalAnomalies.length}\uAC1C\uC758 \uC2EC\uAC01\uD55C \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0`);
      criticalAnomalies.forEach((anomaly) => {
        console.log(`- ${anomaly.description}`);
      });
      await dynamoClient2.send(new import_lib_dynamodb2.PutCommand({
        TableName: process.env.CUMULATIVE_TABLE_NAME,
        Item: {
          pk: `ALERT#CRITICAL`,
          sk: (/* @__PURE__ */ new Date()).toISOString(),
          anomalies: criticalAnomalies,
          alertLevel: metrics.alertLevel,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          ttl: Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60
          // 7일 TTL
        }
      }));
    }
    console.log("\u2705 \uC2E4\uC2DC\uAC04 \uC54C\uB9BC \uCCB4\uD06C \uC644\uB8CC");
  } catch (error) {
    console.error("\u274C \uC2E4\uC2DC\uAC04 \uC54C\uB9BC \uCCB4\uD06C \uC2E4\uD328:", error);
    throw error;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  alertHandler,
  handler,
  scheduledHandler
});
//# sourceMappingURL=data-quality-dashboard.js.map
