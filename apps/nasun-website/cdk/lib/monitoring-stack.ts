import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import { aws_apigateway as apigw } from "aws-cdk-lib";

export interface MonitoringStackProps extends cdk.StackProps {
  metamaskAuthApi?: apigw.RestApi;
  leaderboardV3Api?: apigw.RestApi;
  nftEventApi?: apigw.RestApi;
  genesisPassApi?: apigw.RestApi;
  zkLoginAuthApi?: apigw.RestApi;
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
    const widgetRows: cloudwatch.IWidget[][] = [];

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

    // Genesis Pass API 5xx + 429
    if (props.genesisPassApi) {
      const gpApi5xxAlarm = new cloudwatch.Alarm(this, "GenesisPassApiServerErrorAlarm", {
        alarmName: "NASUN-GenesisPassAPI-서버에러",
        alarmDescription: "Genesis Pass API 5xx 에러가 5분간 5회 이상 발생",
        metric: props.genesisPassApi.metricServerError({ period }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      gpApi5xxAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

      const gpApi429Alarm = new cloudwatch.Alarm(this, "GenesisPassApiThrottleAlarm", {
        alarmName: "NASUN-GenesisPassAPI-스로틀링",
        alarmDescription: "Genesis Pass API 429 (throttling) 이 5분간 10회 이상 발생",
        metric: props.genesisPassApi.metricClientError({ period }),
        threshold: 10,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      gpApi429Alarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    }

    // zkLogin Auth API 5xx + 429
    if (props.zkLoginAuthApi) {
      const zkApi5xxAlarm = new cloudwatch.Alarm(this, "ZkLoginApiServerErrorAlarm", {
        alarmName: "NASUN-ZkLoginAPI-서버에러",
        alarmDescription: "zkLogin API 5xx 에러가 5분간 5회 이상 발생",
        metric: props.zkLoginAuthApi.metricServerError({ period }),
        threshold: 5,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      zkApi5xxAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

      const zkApi429Alarm = new cloudwatch.Alarm(this, "ZkLoginApiThrottleAlarm", {
        alarmName: "NASUN-ZkLoginAPI-스로틀링",
        alarmDescription: "zkLogin API 429 (throttling) 이 5분간 10회 이상 발생",
        metric: props.zkLoginAuthApi.metricClientError({ period }),
        threshold: 10,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      zkApi429Alarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
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

    // Genesis Pass Allowlist DynamoDB Throttling
    const gpAllowlistThrottleAlarm = new cloudwatch.Alarm(this, "GPAllowlistTableThrottleAlarm", {
      alarmName: "NASUN-DynamoDB-GenesisPassAllowlist-Throttle",
      alarmDescription: "Genesis Pass Allowlist 테이블에서 throttling 발생 (온디맨드 모드에서 비정상)",
      metric: new cloudwatch.Metric({
        namespace: "AWS/DynamoDB",
        metricName: "ThrottledRequests",
        dimensionsMap: { TableName: "nasun-genesis-pass-allowlist" },
        statistic: "Sum",
        period,
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    gpAllowlistThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

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
