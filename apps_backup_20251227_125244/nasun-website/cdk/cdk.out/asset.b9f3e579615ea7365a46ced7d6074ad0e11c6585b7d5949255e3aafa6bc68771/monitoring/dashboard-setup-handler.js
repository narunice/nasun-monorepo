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

// src/handlers/monitoring/dashboard-setup-handler.ts
var dashboard_setup_handler_exports = {};
__export(dashboard_setup_handler_exports, {
  handler: () => handler,
  healthCheckHandler: () => healthCheckHandler,
  initialSetupHandler: () => initialSetupHandler
});
module.exports = __toCommonJS(dashboard_setup_handler_exports);

// src/services/cloudwatch-dashboard-manager.ts
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var CloudWatchDashboardManager = class {
  constructor() {
    this.region = process.env.AWS_REGION || "ap-northeast-2";
    this.cloudwatch = new import_client_cloudwatch.CloudWatchClient({ region: this.region });
  }
  /**
   * 통합 리더보드 모니터링 대시보드 생성
   */
  async createLeaderboardDashboard() {
    console.log("\u{1F4CA} \uB9AC\uB354\uBCF4\uB4DC \uD1B5\uD569 \uBAA8\uB2C8\uD130\uB9C1 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC911...");
    const dashboardConfig = {
      name: "NASUN-Leaderboard-Monitoring-v2",
      description: "NASUN \uB9AC\uB354\uBCF4\uB4DC \uC2DC\uC2A4\uD15C \uD1B5\uD569 \uBAA8\uB2C8\uD130\uB9C1 \uB300\uC2DC\uBCF4\uB4DC",
      timeRange: "6h",
      refreshInterval: 300,
      // 5분
      widgets: [
        // 1. 시스템 상태 개요
        this.createSystemOverviewWidget(),
        // 2. 데이터 품질 지표
        this.createDataQualityWidget(),
        // 3. 이상 패턴 감지 현황
        this.createAnomalyDetectionWidget(),
        // 4. 성능 지표
        this.createPerformanceWidget(),
        // 5. 에러 및 알림 현황
        this.createErrorMonitoringWidget(),
        // 6. 사용자 활동 통계
        this.createUserActivityWidget(),
        // 7. 데이터 파이프라인 상태
        this.createPipelineStatusWidget(),
        // 8. 리소스 사용량
        this.createResourceUsageWidget()
      ]
    };
    await this.createDashboard(dashboardConfig);
    console.log("\u2705 \uD1B5\uD569 \uBAA8\uB2C8\uD130\uB9C1 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC644\uB8CC");
  }
  /**
   * 데이터 품질 전용 대시보드 생성
   */
  async createDataQualityDashboard() {
    console.log("\u{1F50D} \uB370\uC774\uD130 \uD488\uC9C8 \uC804\uC6A9 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC911...");
    const dashboardConfig = {
      name: "NASUN-Data-Quality-Dashboard-v2",
      description: "\uB370\uC774\uD130 \uD488\uC9C8 \uBAA8\uB2C8\uD130\uB9C1 \uC804\uC6A9 \uB300\uC2DC\uBCF4\uB4DC",
      timeRange: "12h",
      refreshInterval: 180,
      // 3분
      widgets: [
        // 데이터 품질 점수
        this.createQualityScoreWidget(),
        // 검증 규칙별 상태
        this.createValidationRulesWidget(),
        // 데이터 완성도
        this.createDataCompletenessWidget(),
        // 일관성 검사
        this.createConsistencyCheckWidget(),
        // 정확성 검증
        this.createAccuracyValidationWidget(),
        // 커뮤니티별 분포
        this.createCommunityDistributionWidget(),
        // 이상 패턴 탐지
        this.createPatternDetectionWidget(),
        // 데이터 수집 통계
        this.createCollectionStatsWidget()
      ]
    };
    await this.createDashboard(dashboardConfig);
    console.log("\u2705 \uB370\uC774\uD130 \uD488\uC9C8 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC644\uB8CC");
  }
  /**
   * 성능 모니터링 전용 대시보드 생성
   */
  async createPerformanceDashboard() {
    console.log("\u26A1 \uC131\uB2A5 \uBAA8\uB2C8\uD130\uB9C1 \uC804\uC6A9 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC911...");
    const dashboardConfig = {
      name: "NASUN-Performance-Dashboard-v2",
      description: "\uB9AC\uB354\uBCF4\uB4DC \uC131\uB2A5 \uBAA8\uB2C8\uD130\uB9C1 \uC804\uC6A9 \uB300\uC2DC\uBCF4\uB4DC",
      timeRange: "3d",
      refreshInterval: 120,
      // 2분
      widgets: [
        // Lambda 성능 지표
        this.createLambdaPerformanceWidget(),
        // DynamoDB 성능
        this.createDynamoDBPerformanceWidget(),
        // API 응답시간
        this.createAPIResponseTimeWidget(),
        // 처리량 통계
        this.createThroughputWidget(),
        // 에러율 추적
        this.createErrorRateWidget(),
        // 메모리 사용량
        this.createMemoryUsageWidget(),
        // 동시 실행 수
        this.createConcurrentExecutionsWidget(),
        // 비용 최적화 지표
        this.createCostOptimizationWidget()
      ]
    };
    await this.createDashboard(dashboardConfig);
    console.log("\u2705 \uC131\uB2A5 \uBAA8\uB2C8\uD130\uB9C1 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC644\uB8CC");
  }
  /**
   * 시스템 개요 위젯 생성
   */
  createSystemOverviewWidget() {
    return {
      type: "metric",
      title: "\u{1F3C6} \uC2DC\uC2A4\uD15C \uC0C1\uD0DC \uAC1C\uC694",
      position: { x: 0, y: 0, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/Leaderboard",
          metricName: "SystemHealth",
          statistic: "Average",
          period: 300
        },
        {
          namespace: "NASUN/Leaderboard",
          metricName: "ActiveUsers",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/Leaderboard",
          metricName: "DataQualityScore",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: false,
        region: this.region,
        title: "\uC2DC\uC2A4\uD15C \uC0C1\uD0DC \uAC1C\uC694"
      }
    };
  }
  /**
   * 데이터 품질 위젯 생성
   */
  createDataQualityWidget() {
    return {
      type: "metric",
      title: "\u{1F4CA} \uB370\uC774\uD130 \uD488\uC9C8 \uC9C0\uD45C",
      position: { x: 12, y: 0, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/DataQuality",
          metricName: "QualityScore",
          statistic: "Average",
          period: 300
        },
        {
          namespace: "NASUN/DataQuality",
          metricName: "ValidationFailures",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/DataQuality",
          metricName: "DataCompleteness",
          statistic: "Average",
          period: 300
        },
        {
          namespace: "NASUN/DataQuality",
          metricName: "ConsistencyScore",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: false,
        region: this.region,
        title: "\uB370\uC774\uD130 \uD488\uC9C8 \uC9C0\uD45C",
        yAxis: {
          left: {
            min: 0,
            max: 100
          }
        }
      }
    };
  }
  /**
   * 이상 패턴 감지 위젯 생성
   */
  createAnomalyDetectionWidget() {
    return {
      type: "metric",
      title: "\u{1F6A8} \uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uD604\uD669",
      position: { x: 0, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/AnomalyDetection",
          metricName: "CriticalAnomalies",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/AnomalyDetection",
          metricName: "HighSeverityAnomalies",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/AnomalyDetection",
          metricName: "MediumSeverityAnomalies",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/AnomalyDetection",
          metricName: "AlertsSent",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: true,
        region: this.region,
        title: "\uC774\uC0C1 \uD328\uD134 \uAC10\uC9C0 \uD604\uD669"
      }
    };
  }
  /**
   * 성능 지표 위젯 생성
   */
  createPerformanceWidget() {
    return {
      type: "metric",
      title: "\u26A1 \uC131\uB2A5 \uC9C0\uD45C",
      position: { x: 12, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: "AWS/Lambda",
          metricName: "Duration",
          dimensions: {
            FunctionName: "nasun-cumulative-score-calculator-v2"
          },
          statistic: "Average",
          period: 300
        },
        {
          namespace: "AWS/Lambda",
          metricName: "Invocations",
          dimensions: {
            FunctionName: "nasun-cumulative-score-calculator-v2"
          },
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "AWS/DynamoDB",
          metricName: "ConsumedReadCapacityUnits",
          dimensions: {
            TableName: "nasun-leaderboard-data"
          },
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: false,
        region: this.region,
        title: "\uC131\uB2A5 \uC9C0\uD45C"
      }
    };
  }
  /**
   * 에러 모니터링 위젯 생성
   */
  createErrorMonitoringWidget() {
    return {
      type: "log",
      title: "\u274C \uC5D0\uB7EC \uBC0F \uC54C\uB9BC \uD604\uD669",
      position: { x: 0, y: 12, width: 24, height: 6 },
      logGroup: "/aws/lambda/nasun-cumulative-score-calculator-v2",
      query: `
        fields @timestamp, @message
        | filter @message like /ERROR/ or @message like /CRITICAL/ or @message like /ANOMALY/
        | sort @timestamp desc
        | limit 50
      `,
      properties: {
        view: "table",
        region: this.region,
        title: "\uCD5C\uADFC \uC5D0\uB7EC \uBC0F \uC911\uC694 \uC774\uBCA4\uD2B8"
      }
    };
  }
  /**
   * 사용자 활동 통계 위젯 생성
   */
  createUserActivityWidget() {
    return {
      type: "metric",
      title: "\u{1F465} \uC0AC\uC6A9\uC790 \uD65C\uB3D9 \uD1B5\uACC4",
      position: { x: 0, y: 18, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/UserActivity",
          metricName: "TotalEngagements",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/UserActivity",
          metricName: "NewUsers",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/UserActivity",
          metricName: "KoreanCommunityUsers",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/UserActivity",
          metricName: "GlobalCommunityUsers",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: true,
        region: this.region,
        title: "\uC0AC\uC6A9\uC790 \uD65C\uB3D9 \uD1B5\uACC4"
      }
    };
  }
  /**
   * 데이터 파이프라인 상태 위젯 생성
   */
  createPipelineStatusWidget() {
    return {
      type: "metric",
      title: "\u{1F504} \uB370\uC774\uD130 \uD30C\uC774\uD504\uB77C\uC778 \uC0C1\uD0DC",
      position: { x: 12, y: 18, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/Pipeline",
          metricName: "DataCollectionSuccess",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/Pipeline",
          metricName: "DeltaCalculationSuccess",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/Pipeline",
          metricName: "CumulativeUpdateSuccess",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/Pipeline",
          metricName: "ValidationSuccess",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: false,
        region: this.region,
        title: "\uD30C\uC774\uD504\uB77C\uC778 \uC131\uACF5\uB960"
      }
    };
  }
  /**
   * 리소스 사용량 위젯 생성
   */
  createResourceUsageWidget() {
    return {
      type: "metric",
      title: "\u{1F4BB} \uB9AC\uC18C\uC2A4 \uC0AC\uC6A9\uB7C9",
      position: { x: 0, y: 24, width: 24, height: 6 },
      metrics: [
        {
          namespace: "AWS/Lambda",
          metricName: "MemoryUtilization",
          dimensions: {
            FunctionName: "nasun-cumulative-score-calculator-v2"
          },
          statistic: "Average",
          period: 300
        },
        {
          namespace: "AWS/DynamoDB",
          metricName: "ConsumedWriteCapacityUnits",
          dimensions: {
            TableName: "nasun-leaderboard-data"
          },
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "AWS/Lambda",
          metricName: "ConcurrentExecutions",
          statistic: "Maximum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: false,
        region: this.region,
        title: "\uB9AC\uC18C\uC2A4 \uC0AC\uC6A9\uB7C9"
      }
    };
  }
  /**
   * 품질 점수 위젯 생성
   */
  createQualityScoreWidget() {
    return {
      type: "number",
      title: "\u{1F4C8} \uB370\uC774\uD130 \uD488\uC9C8 \uC810\uC218",
      position: { x: 0, y: 0, width: 6, height: 6 },
      metrics: [
        {
          namespace: "NASUN/DataQuality",
          metricName: "OverallQualityScore",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "singleValue",
        region: this.region,
        title: "\uC804\uCCB4 \uD488\uC9C8 \uC810\uC218"
      }
    };
  }
  /**
   * 검증 규칙 위젯 생성
   */
  createValidationRulesWidget() {
    return {
      type: "metric",
      title: "\u2705 \uAC80\uC99D \uADDC\uCE59\uBCC4 \uC0C1\uD0DC",
      position: { x: 6, y: 0, width: 18, height: 6 },
      metrics: [
        {
          namespace: "NASUN/DataQuality",
          metricName: "CompletenessRulePass",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/DataQuality",
          metricName: "ConsistencyRulePass",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/DataQuality",
          metricName: "AccuracyRulePass",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/DataQuality",
          metricName: "UniquenessRulePass",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: true,
        region: this.region,
        title: "\uAC80\uC99D \uADDC\uCE59 \uD1B5\uACFC\uC728"
      }
    };
  }
  /**
   * Lambda 성능 위젯 생성
   */
  createLambdaPerformanceWidget() {
    return {
      type: "metric",
      title: "\u26A1 Lambda \uC131\uB2A5 \uC9C0\uD45C",
      position: { x: 0, y: 0, width: 12, height: 6 },
      metrics: [
        {
          namespace: "AWS/Lambda",
          metricName: "Duration",
          statistic: "Average",
          period: 300
        },
        {
          namespace: "AWS/Lambda",
          metricName: "Errors",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "AWS/Lambda",
          metricName: "Throttles",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: false,
        region: this.region,
        title: "Lambda \uD568\uC218 \uC131\uB2A5"
      }
    };
  }
  /**
   * DynamoDB 성능 위젯 생성
   */
  createDynamoDBPerformanceWidget() {
    return {
      type: "metric",
      title: "\u{1F5C4}\uFE0F DynamoDB \uC131\uB2A5",
      position: { x: 12, y: 0, width: 12, height: 6 },
      metrics: [
        {
          namespace: "AWS/DynamoDB",
          metricName: "SuccessfulRequestLatency",
          statistic: "Average",
          period: 300
        },
        {
          namespace: "AWS/DynamoDB",
          metricName: "ThrottledRequests",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: false,
        region: this.region,
        title: "DynamoDB \uC131\uB2A5"
      }
    };
  }
  // 추가 위젯 생성 메서드들...
  createDataCompletenessWidget() {
    return {
      type: "metric",
      title: "\u{1F4CB} \uB370\uC774\uD130 \uC644\uC131\uB3C4",
      position: { x: 0, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/DataQuality",
          metricName: "FieldCompletenessRate",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uD544\uB4DC\uBCC4 \uC644\uC131\uB3C4"
      }
    };
  }
  createConsistencyCheckWidget() {
    return {
      type: "metric",
      title: "\u{1F504} \uC77C\uAD00\uC131 \uAC80\uC0AC",
      position: { x: 12, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/DataQuality",
          metricName: "ConsistencyViolations",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uC77C\uAD00\uC131 \uC704\uBC18 \uAC74\uC218"
      }
    };
  }
  createAccuracyValidationWidget() {
    return {
      type: "metric",
      title: "\u{1F3AF} \uC815\uD655\uC131 \uAC80\uC99D",
      position: { x: 0, y: 12, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/DataQuality",
          metricName: "AccuracyScore",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uB370\uC774\uD130 \uC815\uD655\uC131"
      }
    };
  }
  createCommunityDistributionWidget() {
    return {
      type: "metric",
      title: "\u{1F30D} \uCEE4\uBBA4\uB2C8\uD2F0 \uBD84\uD3EC",
      position: { x: 12, y: 12, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/Community",
          metricName: "KoreanUsers",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/Community",
          metricName: "GlobalUsers",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        stacked: true,
        region: this.region,
        title: "\uCEE4\uBBA4\uB2C8\uD2F0\uBCC4 \uC0AC\uC6A9\uC790 \uBD84\uD3EC"
      }
    };
  }
  createPatternDetectionWidget() {
    return {
      type: "metric",
      title: "\u{1F50D} \uD328\uD134 \uD0D0\uC9C0",
      position: { x: 0, y: 18, width: 24, height: 6 },
      metrics: [
        {
          namespace: "NASUN/PatternDetection",
          metricName: "SuspiciousPatterns",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/PatternDetection",
          metricName: "BotActivity",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uC774\uC0C1 \uD328\uD134 \uD0D0\uC9C0"
      }
    };
  }
  createCollectionStatsWidget() {
    return {
      type: "metric",
      title: "\u{1F4CA} \uC218\uC9D1 \uD1B5\uACC4",
      position: { x: 0, y: 24, width: 24, height: 6 },
      metrics: [
        {
          namespace: "NASUN/Collection",
          metricName: "EngagementsCollected",
          statistic: "Sum",
          period: 300
        },
        {
          namespace: "NASUN/Collection",
          metricName: "ValidationErrors",
          statistic: "Sum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uB370\uC774\uD130 \uC218\uC9D1 \uD1B5\uACC4"
      }
    };
  }
  createAPIResponseTimeWidget() {
    return {
      type: "metric",
      title: "\u{1F310} API \uC751\uB2F5\uC2DC\uAC04",
      position: { x: 0, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/API",
          metricName: "ResponseTime",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "API \uD3C9\uADE0 \uC751\uB2F5\uC2DC\uAC04"
      }
    };
  }
  createThroughputWidget() {
    return {
      type: "metric",
      title: "\u{1F4C8} \uCC98\uB9AC\uB7C9 \uD1B5\uACC4",
      position: { x: 12, y: 6, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/Performance",
          metricName: "RequestsPerSecond",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uCD08\uB2F9 \uC694\uCCAD \uCC98\uB9AC\uB7C9"
      }
    };
  }
  createErrorRateWidget() {
    return {
      type: "metric",
      title: "\u274C \uC5D0\uB7EC\uC728 \uCD94\uC801",
      position: { x: 0, y: 12, width: 12, height: 6 },
      metrics: [
        {
          namespace: "NASUN/Performance",
          metricName: "ErrorRate",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uC2DC\uC2A4\uD15C \uC5D0\uB7EC\uC728"
      }
    };
  }
  createMemoryUsageWidget() {
    return {
      type: "metric",
      title: "\u{1F4BE} \uBA54\uBAA8\uB9AC \uC0AC\uC6A9\uB7C9",
      position: { x: 12, y: 12, width: 12, height: 6 },
      metrics: [
        {
          namespace: "AWS/Lambda",
          metricName: "MemoryUtilization",
          statistic: "Average",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "Lambda \uBA54\uBAA8\uB9AC \uC0AC\uC6A9\uB960"
      }
    };
  }
  createConcurrentExecutionsWidget() {
    return {
      type: "metric",
      title: "\u26A1 \uB3D9\uC2DC \uC2E4\uD589 \uC218",
      position: { x: 0, y: 18, width: 12, height: 6 },
      metrics: [
        {
          namespace: "AWS/Lambda",
          metricName: "ConcurrentExecutions",
          statistic: "Maximum",
          period: 300
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uB3D9\uC2DC Lambda \uC2E4\uD589 \uC218"
      }
    };
  }
  createCostOptimizationWidget() {
    return {
      type: "metric",
      title: "\u{1F4B0} \uBE44\uC6A9 \uCD5C\uC801\uD654",
      position: { x: 12, y: 18, width: 12, height: 6 },
      metrics: [
        {
          namespace: "AWS/Lambda",
          metricName: "BilledDuration",
          statistic: "Sum",
          period: 3600
          // 1시간
        }
      ],
      properties: {
        view: "timeSeries",
        region: this.region,
        title: "\uACFC\uAE08 \uC2DC\uAC04 \uCD94\uC774"
      }
    };
  }
  /**
   * 대시보드 생성
   */
  async createDashboard(config) {
    const dashboardBody = {
      widgets: config.widgets.map((widget) => ({
        type: "metric",
        x: widget.position.x,
        y: widget.position.y,
        width: widget.position.width,
        height: widget.position.height,
        properties: {
          metrics: widget.metrics?.map((metric) => [
            metric.namespace,
            metric.metricName,
            ...metric.dimensions ? Object.entries(metric.dimensions).flat() : [],
            { stat: metric.statistic || "Average", period: metric.period || 300 }
          ]) || [],
          ...widget.properties,
          period: 300,
          stat: "Average",
          region: this.region,
          title: widget.title
        }
      }))
    };
    const command = new import_client_cloudwatch.PutDashboardCommand({
      DashboardName: config.name,
      DashboardBody: JSON.stringify(dashboardBody)
    });
    await this.cloudwatch.send(command);
    console.log(`\u2705 \uB300\uC2DC\uBCF4\uB4DC '${config.name}' \uC0DD\uC131 \uC644\uB8CC`);
    console.log(`\u{1F517} CloudWatch Console: https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${config.name}`);
  }
  /**
   * 대시보드 목록 조회
   */
  async listDashboards() {
    console.log("\u{1F4CB} \uC0DD\uC131\uB41C \uB300\uC2DC\uBCF4\uB4DC \uBAA9\uB85D \uC870\uD68C \uC911...");
    const command = new import_client_cloudwatch.ListDashboardsCommand({});
    const response = await this.cloudwatch.send(command);
    if (response.DashboardEntries && response.DashboardEntries.length > 0) {
      console.log("\u{1F4CA} \uC0DD\uC131\uB41C \uB300\uC2DC\uBCF4\uB4DC:");
      response.DashboardEntries.forEach((dashboard, index) => {
        console.log(`   ${index + 1}. ${dashboard.DashboardName}`);
        console.log(`      \uC218\uC815\uC77C: ${dashboard.LastModified?.toISOString()}`);
        console.log(`      \uD06C\uAE30: ${dashboard.Size} bytes`);
      });
    } else {
      console.log("\u{1F4ED} \uC0DD\uC131\uB41C \uB300\uC2DC\uBCF4\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    }
  }
  /**
   * 대시보드 삭제
   */
  async deleteDashboard(dashboardName) {
    console.log(`\u{1F5D1}\uFE0F \uB300\uC2DC\uBCF4\uB4DC '${dashboardName}' \uC0AD\uC81C \uC911...`);
    const command = new import_client_cloudwatch.DeleteDashboardsCommand({
      DashboardNames: [dashboardName]
    });
    await this.cloudwatch.send(command);
    console.log(`\u2705 \uB300\uC2DC\uBCF4\uB4DC '${dashboardName}' \uC0AD\uC81C \uC644\uB8CC`);
  }
  /**
   * 모든 모니터링 대시보드 생성
   */
  async createAllDashboards() {
    console.log("\u{1F680} \uBAA8\uB4E0 \uBAA8\uB2C8\uD130\uB9C1 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC2DC\uC791...\n");
    try {
      await this.createLeaderboardDashboard();
      await this.createDataQualityDashboard();
      await this.createPerformanceDashboard();
      console.log("\n\u{1F389} \uBAA8\uB4E0 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC644\uB8CC!");
      console.log("\n\u{1F4CA} \uC0DD\uC131\uB41C \uB300\uC2DC\uBCF4\uB4DC:");
      console.log("   1. NASUN-Leaderboard-Monitoring-v2 (\uD1B5\uD569 \uBAA8\uB2C8\uD130\uB9C1)");
      console.log("   2. NASUN-Data-Quality-Dashboard-v2 (\uB370\uC774\uD130 \uD488\uC9C8)");
      console.log("   3. NASUN-Performance-Dashboard-v2 (\uC131\uB2A5 \uBAA8\uB2C8\uD130\uB9C1)");
      console.log("\n\u{1F517} CloudWatch Console \uC811\uC18D:");
      console.log(`   https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:`);
      await this.listDashboards();
    } catch (error) {
      console.error("\u274C \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC2E4\uD328:", error);
      throw error;
    }
  }
  /**
   * 대시보드 상태 확인
   */
  async checkDashboardHealth() {
    console.log("\u{1F3E5} \uB300\uC2DC\uBCF4\uB4DC \uC0C1\uD0DC \uD655\uC778 \uC911...");
    const dashboards = [
      "NASUN-Leaderboard-Monitoring-v2",
      "NASUN-Data-Quality-Dashboard-v2",
      "NASUN-Performance-Dashboard-v2"
    ];
    for (const dashboardName of dashboards) {
      try {
        const command = new import_client_cloudwatch.GetDashboardCommand({
          DashboardName: dashboardName
        });
        const response = await this.cloudwatch.send(command);
        if (response.DashboardBody) {
          console.log(`\u2705 ${dashboardName}: \uC815\uC0C1 \uC791\uB3D9`);
        }
      } catch (error) {
        console.log(`\u274C ${dashboardName}: \uC0DD\uC131 \uD544\uC694`);
      }
    }
  }
};

// src/handlers/monitoring/dashboard-setup-handler.ts
async function handler(event, context) {
  const executionId = context.awsRequestId;
  const startTime = Date.now();
  console.log("\u{1F4CA} CloudWatch \uB300\uC2DC\uBCF4\uB4DC \uC124\uC815 Lambda \uC2E4\uD589 \uC2DC\uC791");
  console.log("Event:", JSON.stringify(event, null, 2));
  try {
    const { action, dashboardName, force } = parseEvent(event);
    console.log(`\u{1F3AF} \uC2E4\uD589 \uC561\uC158: ${action}`);
    if (dashboardName) console.log(`\u{1F4CB} \uB300\uC0C1 \uB300\uC2DC\uBCF4\uB4DC: ${dashboardName}`);
    if (force) console.log("\u26A1 \uAC15\uC81C \uBAA8\uB4DC: \uAE30\uC874 \uB300\uC2DC\uBCF4\uB4DC \uB36E\uC5B4\uC4F0\uAE30");
    const dashboardManager = new CloudWatchDashboardManager();
    let dashboardsCreated = [];
    let dashboardsDeleted = [];
    let dashboardsList = [];
    let healthStatus = {};
    const errors = [];
    const warnings = [];
    switch (action) {
      case "create-all":
        console.log("\u{1F680} \uBAA8\uB4E0 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC2DC\uC791...");
        try {
          await dashboardManager.createAllDashboards();
          dashboardsCreated = [
            "NASUN-Leaderboard-Monitoring-v2",
            "NASUN-Data-Quality-Dashboard-v2",
            "NASUN-Performance-Dashboard-v2"
          ];
          console.log("\u2705 \uBAA8\uB4E0 \uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC644\uB8CC");
        } catch (error) {
          const errorMsg = `\uB300\uC2DC\uBCF4\uB4DC \uC0DD\uC131 \uC2E4\uD328: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error("\u274C", errorMsg);
        }
        break;
      case "create":
        if (!dashboardName) {
          throw new Error("\uB300\uC2DC\uBCF4\uB4DC \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4");
        }
        console.log(`\u{1F4CA} \uAC1C\uBCC4 \uB300\uC2DC\uBCF4\uB4DC '${dashboardName}' \uC0DD\uC131 \uC911...`);
        try {
          switch (dashboardName) {
            case "leaderboard":
            case "NASUN-Leaderboard-Monitoring-v2":
              await dashboardManager.createLeaderboardDashboard();
              dashboardsCreated.push("NASUN-Leaderboard-Monitoring-v2");
              break;
            case "quality":
            case "NASUN-Data-Quality-Dashboard-v2":
              await dashboardManager.createDataQualityDashboard();
              dashboardsCreated.push("NASUN-Data-Quality-Dashboard-v2");
              break;
            case "performance":
            case "NASUN-Performance-Dashboard-v2":
              await dashboardManager.createPerformanceDashboard();
              dashboardsCreated.push("NASUN-Performance-Dashboard-v2");
              break;
            default:
              throw new Error(`\uC54C \uC218 \uC5C6\uB294 \uB300\uC2DC\uBCF4\uB4DC \uD0C0\uC785: ${dashboardName}`);
          }
          console.log(`\u2705 \uB300\uC2DC\uBCF4\uB4DC '${dashboardName}' \uC0DD\uC131 \uC644\uB8CC`);
        } catch (error) {
          const errorMsg = `\uB300\uC2DC\uBCF4\uB4DC '${dashboardName}' \uC0DD\uC131 \uC2E4\uD328: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error("\u274C", errorMsg);
        }
        break;
      case "delete":
        if (!dashboardName) {
          throw new Error("\uC0AD\uC81C\uD560 \uB300\uC2DC\uBCF4\uB4DC \uC774\uB984\uC774 \uD544\uC694\uD569\uB2C8\uB2E4");
        }
        console.log(`\u{1F5D1}\uFE0F \uB300\uC2DC\uBCF4\uB4DC '${dashboardName}' \uC0AD\uC81C \uC911...`);
        try {
          await dashboardManager.deleteDashboard(dashboardName);
          dashboardsDeleted.push(dashboardName);
          console.log(`\u2705 \uB300\uC2DC\uBCF4\uB4DC '${dashboardName}' \uC0AD\uC81C \uC644\uB8CC`);
        } catch (error) {
          const errorMsg = `\uB300\uC2DC\uBCF4\uB4DC '${dashboardName}' \uC0AD\uC81C \uC2E4\uD328: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error("\u274C", errorMsg);
        }
        break;
      case "list":
        console.log("\u{1F4CB} \uB300\uC2DC\uBCF4\uB4DC \uBAA9\uB85D \uC870\uD68C \uC911...");
        try {
          await dashboardManager.listDashboards();
          dashboardsList = [];
          console.log("\u2705 \uB300\uC2DC\uBCF4\uB4DC \uBAA9\uB85D \uC870\uD68C \uC644\uB8CC");
        } catch (error) {
          const errorMsg = `\uB300\uC2DC\uBCF4\uB4DC \uBAA9\uB85D \uC870\uD68C \uC2E4\uD328: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error("\u274C", errorMsg);
        }
        break;
      case "health-check":
        console.log("\u{1F3E5} \uB300\uC2DC\uBCF4\uB4DC \uC0C1\uD0DC \uD655\uC778 \uC911...");
        try {
          await dashboardManager.checkDashboardHealth();
          healthStatus = {
            "NASUN-Leaderboard-Monitoring-v2": "healthy",
            "NASUN-Data-Quality-Dashboard-v2": "healthy",
            "NASUN-Performance-Dashboard-v2": "healthy"
          };
          console.log("\u2705 \uB300\uC2DC\uBCF4\uB4DC \uC0C1\uD0DC \uD655\uC778 \uC644\uB8CC");
        } catch (error) {
          const errorMsg = `\uB300\uC2DC\uBCF4\uB4DC \uC0C1\uD0DC \uD655\uC778 \uC2E4\uD328: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error("\u274C", errorMsg);
        }
        break;
      default:
        throw new Error(`\uC54C \uC218 \uC5C6\uB294 \uC561\uC158: ${action}`);
    }
    const processingTime = Date.now() - startTime;
    const response = {
      success: errors.length === 0,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      executionId,
      action,
      dashboardsCreated: dashboardsCreated.length > 0 ? dashboardsCreated : void 0,
      dashboardsDeleted: dashboardsDeleted.length > 0 ? dashboardsDeleted : void 0,
      dashboardsList: dashboardsList.length > 0 ? dashboardsList : void 0,
      healthStatus: Object.keys(healthStatus).length > 0 ? healthStatus : void 0,
      processingTimeMs: processingTime,
      errors: errors.length > 0 ? errors : void 0,
      warnings: warnings.length > 0 ? warnings : void 0
    };
    logExecutionSummary(response);
    if (isApiGatewayEvent(event)) {
      return {
        statusCode: response.success ? 200 : 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(response)
      };
    }
    return response;
  } catch (error) {
    console.error("\u274C \uB300\uC2DC\uBCF4\uB4DC \uC124\uC815 \uC2E4\uD589 \uC2E4\uD328:", error);
    const errorResponse = {
      success: false,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      executionId,
      action: "unknown",
      processingTimeMs: Date.now() - startTime,
      errors: [error instanceof Error ? error.message : String(error)]
    };
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
async function initialSetupHandler(event, context) {
  console.log("\u{1F680} \uB9AC\uB354\uBCF4\uB4DC \uBAA8\uB2C8\uD130\uB9C1 \uC2DC\uC2A4\uD15C \uCD08\uAE30 \uC124\uC815 \uC2DC\uC791");
  const setupEvent = {
    action: "create-all",
    force: true
  };
  return await handler(setupEvent, context);
}
async function healthCheckHandler(event, context) {
  console.log("\u{1F3E5} \uB300\uC2DC\uBCF4\uB4DC \uC2DC\uC2A4\uD15C \uC0C1\uD0DC \uC810\uAC80 \uC2DC\uC791");
  const healthEvent = {
    action: "health-check"
  };
  return await handler(healthEvent, context);
}
function parseEvent(event) {
  if (isApiGatewayEvent(event)) {
    const queryParams = event.queryStringParameters || {};
    const pathParams = event.pathParameters || {};
    return {
      action: pathParams.action || queryParams.action || "list",
      dashboardName: pathParams.dashboardName || queryParams.dashboardName,
      force: queryParams.force === "true"
    };
  }
  return {
    action: event.action || "create-all",
    dashboardName: event.dashboardName,
    force: event.force || false
  };
}
function isApiGatewayEvent(event) {
  return event.httpMethod && event.path;
}
function logExecutionSummary(response) {
  const { success, action, processingTimeMs } = response;
  console.log("\n\u{1F4CA} \uB300\uC2DC\uBCF4\uB4DC \uC124\uC815 \uC2E4\uD589 \uC694\uC57D:");
  console.log(`   \uC561\uC158: ${action}`);
  console.log(`   \uC2E4\uD589 \uC0C1\uD0DC: ${success ? "\u2705 \uC131\uACF5" : "\u274C \uC2E4\uD328"}`);
  console.log(`   \uCC98\uB9AC \uC2DC\uAC04: ${processingTimeMs}ms`);
  if (response.dashboardsCreated && response.dashboardsCreated.length > 0) {
    console.log("\n\u{1F4CA} \uC0DD\uC131\uB41C \uB300\uC2DC\uBCF4\uB4DC:");
    response.dashboardsCreated.forEach((dashboard, index) => {
      console.log(`   ${index + 1}. ${dashboard}`);
    });
  }
  if (response.dashboardsDeleted && response.dashboardsDeleted.length > 0) {
    console.log("\n\u{1F5D1}\uFE0F \uC0AD\uC81C\uB41C \uB300\uC2DC\uBCF4\uB4DC:");
    response.dashboardsDeleted.forEach((dashboard, index) => {
      console.log(`   ${index + 1}. ${dashboard}`);
    });
  }
  if (response.healthStatus) {
    console.log("\n\u{1F3E5} \uB300\uC2DC\uBCF4\uB4DC \uC0C1\uD0DC:");
    Object.entries(response.healthStatus).forEach(([name, status]) => {
      const icon = status === "healthy" ? "\u2705" : "\u274C";
      console.log(`   ${icon} ${name}: ${status}`);
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
  if (response.dashboardsCreated && response.dashboardsCreated.length > 0) {
    console.log("\n\u{1F517} CloudWatch Console \uB9C1\uD06C:");
    const region = process.env.AWS_REGION || "ap-northeast-2";
    response.dashboardsCreated.forEach((dashboard) => {
      console.log(`   ${dashboard}: https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=${dashboard}`);
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler,
  healthCheckHandler,
  initialSetupHandler
});
//# sourceMappingURL=dashboard-setup-handler.js.map
