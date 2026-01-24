import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import { aws_apigateway as apigw, aws_lambda as lambda } from "aws-cdk-lib";

export interface MonitoringStackProps extends cdk.StackProps {
  priceApiGateway: apigw.LambdaRestApi;
  priceUpdaterLambda: lambda.Function;
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
            title: "Price API Gateway - 호출 수 & 지연시간",
            width: 12,
            height: 6,
            left: [
              props.priceApiGateway.metricCount({ period: cdk.Duration.minutes(5) })
            ],
            right: [
              props.priceApiGateway.metricLatency({ period: cdk.Duration.minutes(5) })
            ]
          }),
          new cloudwatch.GraphWidget({
            title: "Price API Gateway - 에러율",
            width: 12,
            height: 6,
            left: [
              props.priceApiGateway.metricClientError({ period: cdk.Duration.minutes(5) }),
              props.priceApiGateway.metricServerError({ period: cdk.Duration.minutes(5) })
            ]
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Price Updater Lambda - 실행 상태",
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
            title: "Price Updater Lambda - 실행 시간",
            width: 12,
            height: 6,
            left: [
              props.priceUpdaterLambda.metricDuration({ period: cdk.Duration.minutes(5) })
            ]
          })
        ]
      ]
    });

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
