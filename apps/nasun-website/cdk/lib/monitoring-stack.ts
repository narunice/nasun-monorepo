import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import { aws_apigateway as apigw, aws_lambda as lambda, aws_dynamodb as dynamodb, aws_events as events, aws_stepfunctions as stepfunctions } from "aws-cdk-lib";

export interface MonitoringStackProps extends cdk.StackProps {
  priceApiGateway: apigw.LambdaRestApi;
  nasunApi: apigw.RestApi;
  priceUpdaterLambda: lambda.Function;
  cumulativeScoreCalculatorFunction: lambda.Function;
  cumulativeLeaderboardGeneratorFunction: lambda.Function;
  getCumulativeLeaderboardFunction: lambda.Function;
  getBookmarkStatsFunction: lambda.Function;
  cumulativeLeaderboardTable: dynamodb.ITable;
  leaderboardDataPipeline: stepfunctions.StateMachine;

  // Lambda Timeout Monitoring (Stage 3)
  // API Lambda
  getUserRankFunction: lambda.Function;

  // Data Collection Lambda
  collectLikesFunction: lambda.Function;
  collectRetweetsFunction: lambda.Function;
  collectQuotesFunction: lambda.Function;
  mentionCollectorFunction: lambda.Function;
  mentionDetailsCollectorFunction: lambda.Function;

  // Data Processing Lambda
  aggregateResultsFunction: lambda.Function;

  // OAuth 2.0 Token Refresh Lambda
  refreshOAuth2TokenFunction: lambda.Function;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: "nasun-monitoring-alerts",
      displayName: "NASUN 모니터링 알림"
    });

    const dashboard = new cloudwatch.Dashboard(this, "MonitoringDashboard", {
      dashboardName: "NASUN-Operations-Monitoring",
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: "API Gateway - 호출 수 & 지연시간",
            width: 12,
            height: 6,
            left: [
              props.priceApiGateway.metricCount({ period: cdk.Duration.minutes(5) }),
              props.nasunApi.metricCount({ period: cdk.Duration.minutes(5) })
            ],
            right: [
              props.priceApiGateway.metricLatency({ period: cdk.Duration.minutes(5) }),
              props.nasunApi.metricLatency({ period: cdk.Duration.minutes(5) })
            ]
          }),
          new cloudwatch.GraphWidget({
            title: "API Gateway - 에러율",
            width: 12,
            height: 6,
            left: [
              props.priceApiGateway.metricClientError({ period: cdk.Duration.minutes(5) }),
              props.priceApiGateway.metricServerError({ period: cdk.Duration.minutes(5) }),
              props.nasunApi.metricClientError({ period: cdk.Duration.minutes(5) }),
              props.nasunApi.metricServerError({ period: cdk.Duration.minutes(5) })
            ]
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "V2 X Leaderboard - 점수 집계 상태",
            width: 12,
            height: 6,
            left: [
              props.cumulativeScoreCalculatorFunction.metricInvocations({ period: cdk.Duration.hours(1) })
            ],
            right: [
              props.cumulativeScoreCalculatorFunction.metricErrors({ period: cdk.Duration.hours(1) })
            ]
          }),
          new cloudwatch.GraphWidget({
            title: "V2 X Leaderboard - 점수 집계 처리 시간",
            width: 12,
            height: 6,
            left: [
              props.cumulativeScoreCalculatorFunction.metricDuration({ period: cdk.Duration.hours(1) })
            ]
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "기타 배치 작업 - 실행 상태",
            width: 12,
            height: 6,
            left: [
              props.priceUpdaterLambda.metricInvocations({ period: cdk.Duration.minutes(5) })
            ],
            right: [
              props.priceUpdaterLambda.metricErrors({ period: cdk.Duration.minutes(5) })
            ]
          }),
          new cloudwatch.GraphWidget({
            title: "기타 배치 작업 - 실행 시간",
            width: 12,
            height: 6,
            left: [
              props.priceUpdaterLambda.metricDuration({ period: cdk.Duration.minutes(5) })
            ]
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "DynamoDB - V2 Cumulative 테이블 사용량",
            width: 12,
            height: 6,
            left: [
              props.cumulativeLeaderboardTable.metric('ConsumedReadCapacityUnits', { period: cdk.Duration.minutes(5), label: "V2 Cumulative 테이블 읽기" }),
              props.cumulativeLeaderboardTable.metric('ConsumedWriteCapacityUnits', { period: cdk.Duration.minutes(5), label: "V2 Cumulative 테이블 쓰기" })
            ],
            right: [
               props.cumulativeLeaderboardTable.metric('ItemCount', { period: cdk.Duration.hours(1), label: "V2 저장된 아이템 수" })
            ]
          }),
          new cloudwatch.GraphWidget({
            title: "DynamoDB - 에러율 (System / ConditionalCheck / Throttle)",
            width: 12,
            height: 6,
            left: [
              props.cumulativeLeaderboardTable.metric('SystemErrors', {
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
                label: 'System Errors (AWS 내부 오류)',
                color: '#d13212'
              }),
              props.cumulativeLeaderboardTable.metric('ConditionalCheckFailedRequests', {
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
                label: 'ConditionalCheck Failed (낙관적 잠금 충돌)',
                color: '#ff9900'
              }),
              props.cumulativeLeaderboardTable.metric('ReadThrottleEvents', {
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
                label: 'Read Throttles',
                color: '#1f77b4'
              }),
              props.cumulativeLeaderboardTable.metric('WriteThrottleEvents', {
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
                label: 'Write Throttles',
                color: '#2ca02c'
              })
            ]
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Step Functions - 파이프라인 실행 상태 (24시간)",
            width: 12,
            height: 6,
            left: [
              props.leaderboardDataPipeline.metricStarted({ period: cdk.Duration.hours(1), label: "시작됨" }),
              props.leaderboardDataPipeline.metricSucceeded({ period: cdk.Duration.hours(1), label: "성공" }),
              props.leaderboardDataPipeline.metricFailed({ period: cdk.Duration.hours(1), label: "실패" }),
              props.leaderboardDataPipeline.metricTimedOut({ period: cdk.Duration.hours(1), label: "타임아웃" })
            ]
          }),
          new cloudwatch.GraphWidget({
            title: "Step Functions - 파이프라인 실행 시간",
            width: 12,
            height: 6,
            left: [
              props.leaderboardDataPipeline.metricTime({
                period: cdk.Duration.hours(1),
                statistic: 'Average',
                label: '평균 실행 시간 (ms)'
              }),
              props.leaderboardDataPipeline.metricTime({
                period: cdk.Duration.hours(1),
                statistic: 'Maximum',
                label: '최대 실행 시간 (ms)'
              })
            ]
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Lambda Duration - API (24초 임계값)",
            width: 12,
            height: 6,
            left: [
              props.getCumulativeLeaderboardFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Get Leaderboard'
              }),
              props.getBookmarkStatsFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Get Bookmark Stats'
              }),
              props.getUserRankFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Get User Rank'
              })
            ]
          }),
          new cloudwatch.GraphWidget({
            title: "Lambda Duration - 처리 (480s/720s 임계값)",
            width: 12,
            height: 6,
            left: [
              props.cumulativeScoreCalculatorFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Score Calculator'
              }),
              props.aggregateResultsFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Aggregate Results'
              }),
              props.cumulativeLeaderboardGeneratorFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Leaderboard Generator'
              })
            ]
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Lambda Duration - 수집 (240s/480s 임계값)",
            width: 24,
            height: 6,
            left: [
              props.collectLikesFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Collect Likes'
              }),
              props.collectRetweetsFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Collect Retweets'
              }),
              props.collectQuotesFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Collect Quotes'
              }),
              props.mentionCollectorFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Mentions Search'
              }),
              props.mentionDetailsCollectorFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
                label: 'Mention Details'
              })
            ]
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "OAuth 2.0 Token Refresh - 실행 상태 (90분 주기)",
            width: 12,
            height: 6,
            left: [
              props.refreshOAuth2TokenFunction.metricInvocations({
                period: cdk.Duration.minutes(30),
                statistic: 'Sum',
                label: '실행 횟수'
              }),
              props.refreshOAuth2TokenFunction.metricErrors({
                period: cdk.Duration.minutes(30),
                statistic: 'Sum',
                label: '실패 횟수'
              })
            ]
          }),
          new cloudwatch.GraphWidget({
            title: "OAuth 2.0 Token Refresh - 실행 시간",
            width: 12,
            height: 6,
            left: [
              props.refreshOAuth2TokenFunction.metricDuration({
                period: cdk.Duration.minutes(30),
                statistic: 'Average',
                label: '평균 실행 시간 (ms)'
              }),
              props.refreshOAuth2TokenFunction.metricDuration({
                period: cdk.Duration.minutes(30),
                statistic: 'Maximum',
                label: '최대 실행 시간 (ms)'
              })
            ]
          })
        ]
      ]
    });

    const apiServerErrorAlarm = new cloudwatch.Alarm(this, "ApiServerErrorAlarm", {
      alarmName: "NASUN-API-서버에러",
      alarmDescription: "API Gateway 5xx 에러가 5분간 5회 이상 발생",
      metric: props.nasunApi.metricServerError({ period: cdk.Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    apiServerErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const priceApiServerErrorAlarm = new cloudwatch.Alarm(this, "PriceApiServerErrorAlarm", {
      alarmName: "NASUN-PriceAPI-서버에러",
      alarmDescription: "Price API 5xx 에러가 5분간 3회 이상 발생",
      metric: props.priceApiGateway.metricServerError({ period: cdk.Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    priceApiServerErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const priceUpdaterErrorAlarm = new cloudwatch.Alarm(this, "PriceUpdaterErrorAlarm", {
      alarmName: "NASUN-가격업데이트-연속실패",
      alarmDescription: "가격 업데이트가 15분간 3회 이상 실패",
      metric: props.priceUpdaterLambda.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING
    });
    priceUpdaterErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const v2ScoreCalculatorErrorAlarm = new cloudwatch.Alarm(this, "V2ScoreCalculatorErrorAlarm", {
      alarmName: "NASUN-점수계산기-실패",
      metric: props.cumulativeScoreCalculatorFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    v2ScoreCalculatorErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const v2LeaderboardGeneratorErrorAlarm = new cloudwatch.Alarm(this, "V2LeaderboardGeneratorErrorAlarm", {
      alarmName: "NASUN-리더보드생성기-실패",
      metric: props.cumulativeLeaderboardGeneratorFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    v2LeaderboardGeneratorErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const v2GetLeaderboardErrorAlarm = new cloudwatch.Alarm(this, "V2GetLeaderboardErrorAlarm", {
      alarmName: "NASUN-API-리더보드조회-실패",
      metric: props.getCumulativeLeaderboardFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    v2GetLeaderboardErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const v2GetBookmarkStatsErrorAlarm = new cloudwatch.Alarm(this, "V2GetBookmarkStatsErrorAlarm", {
      alarmName: "NASUN-API-북마크통계-실패",
      metric: props.getBookmarkStatsFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    v2GetBookmarkStatsErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const v2DynamoDbReadThrottleAlarm = new cloudwatch.Alarm(this, "V2DynamoDbReadThrottleAlarm", {
        alarmName: "NASUN-DynamoDB-읽기스로틀링",
        metric: props.cumulativeLeaderboardTable.metric('ReadThrottleEvents', { period: cdk.Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    v2DynamoDbReadThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const v2DynamoDbWriteThrottleAlarm = new cloudwatch.Alarm(this, "V2DynamoDbWriteThrottleAlarm", {
        alarmName: "NASUN-DynamoDB-쓰기스로틀링",
        metric: props.cumulativeLeaderboardTable.metric('WriteThrottleEvents', { period: cdk.Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    v2DynamoDbWriteThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // DynamoDB SystemErrors Alarm (AWS 내부 오류 감지)
    const v2DynamoDbSystemErrorsAlarm = new cloudwatch.Alarm(this, "V2DynamoDbSystemErrorsAlarm", {
      alarmName: "NASUN-DynamoDB-시스템에러",
      alarmDescription: "DynamoDB 시스템 에러 발생 (AWS 내부 오류, HTTP 500). AWS Support 즉시 연락 필요.",
      metric: props.cumulativeLeaderboardTable.metric('SystemErrors', {
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    v2DynamoDbSystemErrorsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // DynamoDB ConditionalCheckFailedRequests Alarm (낙관적 잠금 충돌 과다 감지)
    const v2DynamoDbConditionalCheckFailedAlarm = new cloudwatch.Alarm(this, "V2DynamoDbConditionalCheckFailedAlarm", {
      alarmName: "NASUN-DynamoDB-조건부체크실패",
      alarmDescription: "DynamoDB 조건부 업데이트 실패가 5분간 100회 초과. 동시성 이슈 또는 잘못된 조건식 가능성.",
      metric: props.cumulativeLeaderboardTable.metric('ConditionalCheckFailedRequests', {
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 100,
      evaluationPeriods: 2,  // 2회 연속 초과 시 (오탐 방지)
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    v2DynamoDbConditionalCheckFailedAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Step Functions ExecutionsFailed Alarm (파이프라인 실행 실패 감지)
    const stepFunctionsFailedAlarm = new cloudwatch.Alarm(this, "StepFunctionsFailedAlarm", {
      alarmName: "NASUN-파이프라인-실행실패",
      alarmDescription: "리더보드 파이프라인 실행 실패 시 즉시 알림. CloudWatch Logs에서 에러 원인 확인 필요.",
      metric: props.leaderboardDataPipeline.metricFailed({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    stepFunctionsFailedAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Step Functions ExecutionTimedOut Alarm (파이프라인 타임아웃 감지)
    const stepFunctionsTimeoutAlarm = new cloudwatch.Alarm(this, "StepFunctionsTimeoutAlarm", {
      alarmName: "NASUN-파이프라인-타임아웃",
      alarmDescription: "리더보드 파이프라인 실행 시간이 1시간 초과. 성능 이슈 점검 필요.",
      metric: props.leaderboardDataPipeline.metricTime({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 3600000,  // 1시간 (밀리초)
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    stepFunctionsTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // ========================================
    // Lambda Timeout Monitoring (Stage 3)
    // ========================================

    // API Lambda Timeout Alarms (High Priority, 30s timeout → 24s threshold)
    const getLeaderboardTimeoutAlarm = new cloudwatch.Alarm(this, "GetLeaderboardTimeoutAlarm", {
      alarmName: "NASUN-Lambda-GetLeaderboard-타임아웃경고",
      alarmDescription: "리더보드 조회 Lambda 실행 시간이 24초 초과 (timeout 30초의 80%)",
      metric: props.getCumulativeLeaderboardFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 24000,  // 24초 (밀리초)
      evaluationPeriods: 2,  // 2회 연속 초과 시 (오탐 방지)
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    getLeaderboardTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const getBookmarkStatsTimeoutAlarm = new cloudwatch.Alarm(this, "GetBookmarkStatsTimeoutAlarm", {
      alarmName: "NASUN-Lambda-GetBookmarkStats-타임아웃경고",
      alarmDescription: "북마크 통계 Lambda 실행 시간이 24초 초과 (timeout 30초의 80%)",
      metric: props.getBookmarkStatsFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 24000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    getBookmarkStatsTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const getUserRankTimeoutAlarm = new cloudwatch.Alarm(this, "GetUserRankTimeoutAlarm", {
      alarmName: "NASUN-Lambda-GetUserRank-타임아웃경고",
      alarmDescription: "사용자 랭킹 조회 Lambda 실행 시간이 24초 초과 (timeout 30초의 80%)",
      metric: props.getUserRankFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 24000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    getUserRankTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Data Processing Lambda Timeout Alarms (Medium Priority)
    const scoreCalculatorTimeoutAlarm = new cloudwatch.Alarm(this, "ScoreCalculatorTimeoutAlarm", {
      alarmName: "NASUN-Lambda-ScoreCalculator-타임아웃경고",
      alarmDescription: "점수 계산 Lambda 실행 시간이 480초 초과 (timeout 600초의 80%)",
      metric: props.cumulativeScoreCalculatorFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 480000,  // 480초 (밀리초)
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    scoreCalculatorTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const aggregateResultsTimeoutAlarm = new cloudwatch.Alarm(this, "AggregateResultsTimeoutAlarm", {
      alarmName: "NASUN-Lambda-Aggregate-타임아웃경고",
      alarmDescription: "결과 집계 Lambda 실행 시간이 720초 초과 (timeout 900초의 80%)",
      metric: props.aggregateResultsFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 720000,  // 720초 (밀리초)
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    aggregateResultsTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const leaderboardGeneratorTimeoutAlarm = new cloudwatch.Alarm(this, "LeaderboardGeneratorTimeoutAlarm", {
      alarmName: "NASUN-Lambda-Generator-타임아웃경고",
      alarmDescription: "리더보드 생성 Lambda 실행 시간이 720초 초과 (timeout 900초의 80%)",
      metric: props.cumulativeLeaderboardGeneratorFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 720000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    leaderboardGeneratorTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Data Collection Lambda Timeout Alarms (Low Priority)
    const collectLikesTimeoutAlarm = new cloudwatch.Alarm(this, "CollectLikesTimeoutAlarm", {
      alarmName: "NASUN-Lambda-CollectLikes-타임아웃경고",
      alarmDescription: "좋아요 수집 Lambda 실행 시간이 240초 초과 (timeout 300초의 80%)",
      metric: props.collectLikesFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 240000,  // 240초 (밀리초)
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    collectLikesTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const collectRetweetsTimeoutAlarm = new cloudwatch.Alarm(this, "CollectRetweetsTimeoutAlarm", {
      alarmName: "NASUN-Lambda-CollectRetweets-타임아웃경고",
      alarmDescription: "리트윗 수집 Lambda 실행 시간이 240초 초과 (timeout 300초의 80%)",
      metric: props.collectRetweetsFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 240000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    collectRetweetsTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const collectQuotesTimeoutAlarm = new cloudwatch.Alarm(this, "CollectQuotesTimeoutAlarm", {
      alarmName: "NASUN-Lambda-CollectQuotes-타임아웃경고",
      alarmDescription: "인용 트윗 수집 Lambda 실행 시간이 240초 초과 (timeout 300초의 80%)",
      metric: props.collectQuotesFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 240000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    collectQuotesTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const collectMentionsSearchTimeoutAlarm = new cloudwatch.Alarm(this, "CollectMentionsSearchTimeoutAlarm", {
      alarmName: "NASUN-Lambda-CollectMentionsSearch-타임아웃경고",
      alarmDescription: "멘션 검색 Lambda 실행 시간이 240초 초과 (timeout 300초의 80%)",
      metric: props.mentionCollectorFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 240000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    collectMentionsSearchTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const collectMentionDetailsTimeoutAlarm = new cloudwatch.Alarm(this, "CollectMentionDetailsTimeoutAlarm", {
      alarmName: "NASUN-Lambda-CollectMentionDetails-타임아웃경고",
      alarmDescription: "멘션 상세 수집 Lambda 실행 시간이 480초 초과 (timeout 600초의 80%)",
      metric: props.mentionDetailsCollectorFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum'
      }),
      threshold: 480000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    collectMentionDetailsTimeoutAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // ========================================
    // OAuth 2.0 Token Refresh Monitoring
    // ========================================

    // OAuth 토큰 갱신 실패 알람 (Critical Priority)
    const oauthTokenRefreshErrorAlarm = new cloudwatch.Alarm(this, "OAuthTokenRefreshErrorAlarm", {
      alarmName: "NASUN-OAuth토큰-갱신실패",
      alarmDescription: "OAuth 2.0 토큰 갱신이 10분간 2회 이상 실패. Refresh Token이 revoked되었거나 X API 장애 가능성.",
      metric: props.refreshOAuth2TokenFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 2,  // 2회 연속 실패 시 (10분간 2번 실패)
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    oauthTokenRefreshErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    new cdk.CfnOutput(this, "MonitoringDashboardUrl", {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: "CloudWatch 모니터링 대시보드 URL"
    });

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: alertTopic.topicArn,
      description: "모니터링 알림용 SNS Topic ARN (이메일 구독 설정 필요)"
    });
  }
}