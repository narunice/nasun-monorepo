/**
 * Devnet Metrics Stack
 *
 * Standalone CDK stack for daily metrics collection.
 *
 * Resources:
 * - DynamoDB table: devnet-metrics (shared with user analytics)
 * - Lambda: nasun-devnet-metrics-collector (DAU, addresses via RPC)
 * - Lambda: nasun-user-analytics-collector (user/leaderboard/telegram/X counts)
 * - EventBridge rules: daily at 00:30 UTC (devnet) and 00:45 UTC (user analytics)
 * - CloudWatch alarm: devnet collector error notification
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

const FAUCET_ADDRESS = '0x7edae6935438fc1323858d45e7131c9b1c34fbfdff225eb5f1fe741886ff750a';
const EXCLUDED_ADDRESSES = [
  '0x0000000000000000000000000000000000000000000000000000000000000000',
  FAUCET_ADDRESS,
  '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90',
].join(',');

export class DevnetMetricsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const metricsTable = new dynamodb.Table(this, 'DevnetMetricsTable', {
      tableName: 'devnet-metrics',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Lambda
    const lambdaSrcPath = path.join(__dirname, '..', 'lambda-src', 'devnet-metrics', 'src');
    const depsLockFilePath = path.join(__dirname, '..', 'pnpm-lock.yaml');

    const collectorLambda = new NodejsFunction(this, 'DevnetMetricsCollectorFunction', {
      functionName: 'nasun-devnet-metrics-collector',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'index.ts'),
      handler: 'handler',
      // v2 collector fetches pre-aggregated metrics from explorer-api over
      // HTTPS (single ~300ms call), so 1 minute would suffice. Headroom kept
      // at 15min/1024MB so that occasional API-side cold starts or DB query
      // spikes never trip the timeout.
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      description: 'Devnet daily metrics collector (fetches from explorer-api /stats/daily-metrics)',
      environment: {
        DEVNET_METRICS_TABLE: metricsTable.tableName,
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
        FAUCET_ADDRESS,
        EXCLUDED_ADDRESSES,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      depsLockFilePath,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
        ],
      },
    });

    metricsTable.grantReadWriteData(collectorLambda);

    // EventBridge: daily at 00:30 UTC
    const dailyRule = new events.Rule(this, 'DevnetMetricsDailyRule', {
      ruleName: 'nasun-devnet-metrics-daily',
      description: 'Daily devnet metrics collection at 00:30 UTC',
      enabled: true,
      schedule: events.Schedule.cron({
        minute: '30',
        hour: '0',
      }),
    });

    dailyRule.addTarget(new targets.LambdaFunction(collectorLambda));

    // CloudWatch Alarm: notify on Lambda errors
    const alertTopic = sns.Topic.fromTopicArn(
      this,
      'MonitoringAlertTopic',
      `arn:aws:sns:${this.region}:${this.account}:nasun-monitoring-alerts`,
    );

    const errorAlarm = new cloudwatch.Alarm(this, 'DevnetMetricsErrorAlarm', {
      alarmName: 'nasun-devnet-metrics-collector-errors',
      alarmDescription: 'Devnet metrics collector Lambda errors',
      metric: collectorLambda.metricErrors({ period: cdk.Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // ========================================
    // User Analytics Collector
    // ========================================

    const userProfilesTable = dynamodb.Table.fromTableName(
      this,
      'UserProfilesTable',
      'UserProfiles',
    );

    const leaderboardAccountsTable = dynamodb.Table.fromTableName(
      this,
      'LeaderboardAccountsTable',
      'leaderboard-v3-accounts',
    );

    const userAnalyticsSrcPath = path.join(__dirname, '..', 'lambda-src', 'user-analytics-collector', 'src');

    // NASUN_METRICS_API_KEY is supplied at deploy time via shell env. The
    // collector uses it to POST wallet arrays to the explorer-api /stats/nasun-metrics
    // endpoint, which runs the 11-CTE postgres query and returns the full
    // report data for CSV/TXT snapshot.
    const nasunMetricsApiKey = process.env.NASUN_METRICS_API_KEY ?? '';
    if (!nasunMetricsApiKey) {
      console.warn(
        '[DevnetMetricsStack] NASUN_METRICS_API_KEY env not set — nasun-stats snapshot build will be skipped at runtime.',
      );
    }

    const userAnalyticsCollector = new NodejsFunction(this, 'UserAnalyticsCollectorFunction', {
      functionName: 'nasun-user-analytics-collector',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(userAnalyticsSrcPath, 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      description: 'Daily user analytics collector + nasun-stats snapshot builder',
      environment: {
        DEVNET_METRICS_TABLE: metricsTable.tableName,
        USER_PROFILES_TABLE: 'UserProfiles',
        LEADERBOARD_ACCOUNTS_TABLE: 'leaderboard-v3-accounts',
        EXPLORER_API_BASE: 'https://explorer.nasun.io/api/v1',
        NASUN_METRICS_API_KEY: nasunMetricsApiKey,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      depsLockFilePath,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
        ],
      },
    });

    metricsTable.grantReadWriteData(userAnalyticsCollector);
    userProfilesTable.grantReadData(userAnalyticsCollector);
    leaderboardAccountsTable.grantReadData(userAnalyticsCollector);

    // EventBridge: daily at 00:45 UTC (after devnet metrics at 00:30)
    const userAnalyticsRule = new events.Rule(this, 'UserAnalyticsDailyRule', {
      ruleName: 'nasun-user-analytics-daily',
      description: 'Daily user analytics collection at 00:45 UTC',
      enabled: true,
      schedule: events.Schedule.cron({
        minute: '45',
        hour: '0',
      }),
    });

    userAnalyticsRule.addTarget(new targets.LambdaFunction(userAnalyticsCollector));
  }
}
