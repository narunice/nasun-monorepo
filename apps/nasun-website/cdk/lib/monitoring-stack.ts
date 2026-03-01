import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import { aws_apigateway as apigw, aws_lambda as lambda } from "aws-cdk-lib";

export interface MonitoringStackProps extends cdk.StackProps {
  priceApiGateway: apigw.LambdaRestApi;
  priceUpdaterLambda: lambda.Function;
  governanceApi?: apigw.LambdaRestApi;
  governanceApiLambda?: lambda.Function;
  metamaskAuthApi?: apigw.RestApi;
  leaderboardV3Api?: apigw.RestApi;
  nftEventApi?: apigw.RestApi;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: "nasun-monitoring-alerts",
      displayName: "NASUN 모니터링 알림"
    });

    const period = cdk.Duration.minutes(5);

    // -- Dashboard widgets --
    const widgetRows: cloudwatch.IWidget[][] = [
      // Row 1: Price API
      [
        new cloudwatch.GraphWidget({
          title: "Price API Gateway - 호출 수 & 지연시간",
          width: 12,
          height: 6,
          left: [props.priceApiGateway.metricCount({ period })],
          right: [props.priceApiGateway.metricLatency({ period })]
        }),
        new cloudwatch.GraphWidget({
          title: "Price API Gateway - 에러율",
          width: 12,
          height: 6,
          left: [
            props.priceApiGateway.metricClientError({ period }),
            props.priceApiGateway.metricServerError({ period })
          ]
        })
      ],
      // Row 2: Price Updater Lambda
      [
        new cloudwatch.GraphWidget({
          title: "Price Updater Lambda - 실행 상태",
          width: 12,
          height: 6,
          left: [props.priceUpdaterLambda.metricInvocations({ period })],
          right: [props.priceUpdaterLambda.metricErrors({ period })]
        }),
        new cloudwatch.GraphWidget({
          title: "Price Updater Lambda - 실행 시간",
          width: 12,
          height: 6,
          left: [props.priceUpdaterLambda.metricDuration({ period })]
        })
      ],
    ];

    // Row 3: Governance API (optional)
    if (props.governanceApi && props.governanceApiLambda) {
      widgetRows.push([
        new cloudwatch.GraphWidget({
          title: "Governance API - 호출 수 & 지연시간",
          width: 12,
          height: 6,
          left: [props.governanceApi.metricCount({ period })],
          right: [props.governanceApi.metricLatency({ period })]
        }),
        new cloudwatch.GraphWidget({
          title: "Governance Lambda - 에러 & 실행시간",
          width: 12,
          height: 6,
          left: [props.governanceApiLambda.metricErrors({ period })],
          right: [props.governanceApiLambda.metricDuration({ period })]
        })
      ]);
    }

    // Row 4: Auth API (optional)
    if (props.metamaskAuthApi) {
      widgetRows.push([
        new cloudwatch.GraphWidget({
          title: "MetaMask Auth API - 호출 수 & 에러율",
          width: 12,
          height: 6,
          left: [props.metamaskAuthApi.metricCount({ period })],
          right: [
            props.metamaskAuthApi.metricClientError({ period }),
            props.metamaskAuthApi.metricServerError({ period })
          ]
        }),
        ...(props.leaderboardV3Api ? [
          new cloudwatch.GraphWidget({
            title: "Leaderboard V3 API - 호출 수 & 에러율",
            width: 12,
            height: 6,
            left: [props.leaderboardV3Api.metricCount({ period })],
            right: [
              props.leaderboardV3Api.metricClientError({ period }),
              props.leaderboardV3Api.metricServerError({ period })
            ]
          })
        ] : [])
      ]);
    }

    new cloudwatch.Dashboard(this, "MonitoringDashboard", {
      dashboardName: "NASUN-Operations-Monitoring",
      widgets: widgetRows
    });

    // -- Alarms --

    // Price API 5xx
    const priceApiServerErrorAlarm = new cloudwatch.Alarm(this, "PriceApiServerErrorAlarm", {
      alarmName: "NASUN-PriceAPI-서버에러",
      alarmDescription: "Price API 5xx 에러가 5분간 3회 이상 발생",
      metric: props.priceApiGateway.metricServerError({ period }),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    priceApiServerErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Price Updater 연속 실패
    const priceUpdaterErrorAlarm = new cloudwatch.Alarm(this, "PriceUpdaterErrorAlarm", {
      alarmName: "NASUN-가격업데이트-연속실패",
      alarmDescription: "가격 업데이트가 15분간 3회 이상 실패",
      metric: props.priceUpdaterLambda.metricErrors({ period }),
      threshold: 3,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING
    });
    priceUpdaterErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Governance API 5xx
    if (props.governanceApi) {
      const governanceApiErrorAlarm = new cloudwatch.Alarm(this, "GovernanceApiServerErrorAlarm", {
        alarmName: "NASUN-GovernanceAPI-서버에러",
        alarmDescription: "Governance API 5xx 에러가 5분간 3회 이상 발생",
        metric: props.governanceApi.metricServerError({ period }),
        threshold: 3,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      });
      governanceApiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    }

    // Governance Lambda 타임아웃/에러 (duration > 50s = 위험 신호)
    if (props.governanceApiLambda) {
      const governanceLambdaDurationAlarm = new cloudwatch.Alarm(this, "GovernanceLambdaDurationAlarm", {
        alarmName: "NASUN-GovernanceLambda-지연",
        alarmDescription: "Governance Lambda 평균 실행시간이 50초 초과 (타임아웃 위험)",
        metric: props.governanceApiLambda.metricDuration({ period, statistic: "Average" }),
        threshold: 50000,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      });
      governanceLambdaDurationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    }

    // MetaMask Auth API 5xx
    if (props.metamaskAuthApi) {
      const authApiErrorAlarm = new cloudwatch.Alarm(this, "AuthApiServerErrorAlarm", {
        alarmName: "NASUN-AuthAPI-서버에러",
        alarmDescription: "Auth API 5xx 에러가 5분간 5회 이상 발생",
        metric: props.metamaskAuthApi.metricServerError({ period }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      });
      authApiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    }

    // Leaderboard V3 API 5xx
    if (props.leaderboardV3Api) {
      const leaderboardApiErrorAlarm = new cloudwatch.Alarm(this, "LeaderboardApiServerErrorAlarm", {
        alarmName: "NASUN-LeaderboardV3API-서버에러",
        alarmDescription: "Leaderboard V3 API 5xx 에러가 5분간 5회 이상 발생",
        metric: props.leaderboardV3Api.metricServerError({ period }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      });
      leaderboardApiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    }

    // NFT Event API 5xx
    if (props.nftEventApi) {
      const nftEventApiErrorAlarm = new cloudwatch.Alarm(this, "NftEventApiServerErrorAlarm", {
        alarmName: "NASUN-NftEventAPI-서버에러",
        alarmDescription: "NFT Event API 5xx 에러가 5분간 5회 이상 발생",
        metric: props.nftEventApi.metricServerError({ period }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      });
      nftEventApiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    }

    // DynamoDB Throttling — on-demand tables should never throttle
    const whitelistThrottleAlarm = new cloudwatch.Alarm(this, "WhitelistTableThrottleAlarm", {
      alarmName: "NASUN-DynamoDB-Whitelist-Throttle",
      alarmDescription: "NFT Whitelist 테이블에서 throttling 발생 (온디맨드 모드에서 비정상)",
      metric: new cloudwatch.Metric({
        namespace: "AWS/DynamoDB",
        metricName: "ThrottledRequests",
        dimensionsMap: { TableName: "nasun-nft-whitelist" },
        statistic: "Sum",
        period,
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    whitelistThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    new cdk.CfnOutput(this, "MonitoringDashboardUrl", {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=NASUN-Operations-Monitoring`,
      description: "CloudWatch 모니터링 대시보드 URL"
    });

    new cdk.CfnOutput(this, "AlertTopicArn", {
      value: alertTopic.topicArn,
      description: "모니터링 알림용 SNS Topic ARN (이메일 구독 설정 필요)"
    });
  }
}
