import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as path from 'path';

export interface FollowerStackProps extends cdk.StackProps {
  readonly twitterBearerToken: string;
  readonly targetAccounts: string; // JSON array of { userId, username }
  readonly oauth2ClientId: string;
  readonly oauth2ClientSecret: string;
  readonly twitterTokensSecretName: string;
}

export class FollowerStack extends cdk.Stack {
  public readonly followersTable: dynamodb.Table;
  public readonly collectFollowersFunction: lambda.Function;
  public readonly refreshOAuth2TokenFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: FollowerStackProps) {
    super(scope, id, props);

    // ========================================
    // DynamoDB Table: NasunTargetFollowers
    // ========================================
    this.followersTable = new dynamodb.Table(this, 'TargetFollowersTable', {
      tableName: 'NasunTargetFollowers',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain data on stack deletion
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // GSI for querying by status (active/unfollowed)
    this.followersTable.addGlobalSecondaryIndex({
      indexName: 'status-lastSeenAt-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastSeenAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // Lambda Function: collect-followers
    // ========================================
    this.collectFollowersFunction = new NodejsFunction(this, 'CollectFollowersFunction', {
      functionName: 'nasun-collect-followers',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '..', 'lambda-src', 'collect-followers', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath: path.join(__dirname, '..', 'pnpm-lock.yaml'),
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
        ],
      },
      timeout: cdk.Duration.minutes(10), // 10 minutes for large follower lists
      memorySize: 512,
      environment: {
        TARGET_ACCOUNTS: props.targetAccounts,
        FOLLOWERS_TABLE_NAME: this.followersTable.tableName,
        TWITTER_BEARER_TOKEN: props.twitterBearerToken,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
        NODE_OPTIONS: '--enable-source-maps',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant DynamoDB permissions
    this.followersTable.grantReadWriteData(this.collectFollowersFunction);

    // ========================================
    // EventBridge Rule: Daily Schedule (09:00 UTC)
    // ========================================
    const dailyScheduleRule = new events.Rule(this, 'DailyFollowerCollectRule', {
      ruleName: 'nasun-daily-follower-collect',
      description: 'Trigger follower collection Lambda daily at 09:00 UTC',
      schedule: events.Schedule.cron({
        hour: '9',
        minute: '0',
      }),
    });

    dailyScheduleRule.addTarget(
      new targets.LambdaFunction(this.collectFollowersFunction, {
        retryAttempts: 2,
      })
    );

    // ========================================
    // OAuth2 Token Refresh Lambda
    // ========================================
    this.refreshOAuth2TokenFunction = new NodejsFunction(this, 'RefreshOAuth2TokenFunction', {
      functionName: 'nasun-follower-token-refresh',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '..', 'lambda-src', 'refresh-oauth2-token', 'src', 'index.ts'),
      handler: 'handler',
      depsLockFilePath: path.join(__dirname, '..', 'pnpm-lock.yaml'),
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [
          '@aws-sdk/client-secrets-manager',
          '@aws-sdk/client-cloudwatch',
        ],
      },
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
      environment: {
        OAUTH2_CLIENT_ID: props.oauth2ClientId,
        OAUTH2_CLIENT_SECRET: props.oauth2ClientSecret,
        TWITTER_TOKENS_SECRET_NAME: props.twitterTokensSecretName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // IAM: Secrets Manager read + update
    this.refreshOAuth2TokenFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:UpdateSecret',
          'secretsmanager:PutSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${props.twitterTokensSecretName}-*`,
        ],
      }),
    );

    // IAM: CloudWatch custom metrics
    this.refreshOAuth2TokenFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      }),
    );

    // ========================================
    // Token Refresh: DLQ + EventBridge (70 min)
    // ========================================
    const tokenRefreshDLQ = new sqs.Queue(this, 'TokenRefreshDLQ', {
      queueName: 'nasun-follower-token-refresh-dlq',
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout: cdk.Duration.minutes(5),
    });

    const tokenRefreshRule = new events.Rule(this, 'TokenRefreshSchedule', {
      ruleName: 'nasun-follower-token-refresh-schedule',
      schedule: events.Schedule.rate(cdk.Duration.minutes(70)),
      description: 'OAuth 2.0 token refresh every 70 minutes',
      enabled: true,
    });

    tokenRefreshRule.addTarget(
      new targets.LambdaFunction(this.refreshOAuth2TokenFunction, {
        event: events.RuleTargetInput.fromObject({
          source: 'eventbridge.scheduled',
          scheduledExecution: true,
          forceRefresh: false,
        }),
        deadLetterQueue: tokenRefreshDLQ,
        retryAttempts: 3,
        maxEventAge: cdk.Duration.minutes(10),
      }),
    );

    // ========================================
    // Token Refresh: CloudWatch Alarms
    // ========================================
    const monitoringTopic = sns.Topic.fromTopicArn(
      this,
      'MonitoringTopic',
      `arn:aws:sns:${this.region}:${this.account}:nasun-monitoring-alerts`,
    );

    // Alarm 1: Lambda execution error
    const refreshErrorAlarm = new cloudwatch.Alarm(this, 'TokenRefreshErrorAlarm', {
      alarmName: 'nasun-follower-token-refresh-error',
      alarmDescription: 'Token refresh Lambda error detected',
      metric: this.refreshOAuth2TokenFunction.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    refreshErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // Alarm 2: No successful invocation for 3+ hours
    const notRefreshedAlarm = new cloudwatch.Alarm(this, 'TokenNotRefreshedAlarm', {
      alarmName: 'nasun-follower-token-not-refreshed-3h',
      alarmDescription: 'Token refresh Lambda not invoked for 3+ hours',
      metric: this.refreshOAuth2TokenFunction.metricInvocations({
        period: cdk.Duration.hours(3),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    notRefreshedAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // Alarm 3: DLQ has messages (EventBridge delivery failures)
    const dlqAlarm = new cloudwatch.Alarm(this, 'TokenRefreshDLQAlarm', {
      alarmName: 'nasun-follower-token-refresh-dlq',
      alarmDescription: 'Token refresh DLQ has unprocessed messages',
      metric: tokenRefreshDLQ.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // Alarm 4: Invalid refresh token (CRITICAL - manual re-auth needed)
    const invalidTokenAlarm = new cloudwatch.Alarm(this, 'InvalidRefreshTokenAlarm', {
      alarmName: 'nasun-follower-invalid-refresh-token',
      alarmDescription: 'CRITICAL: Twitter refresh token invalidated, manual re-auth required',
      metric: new cloudwatch.Metric({
        namespace: 'NASUN/OAuth',
        metricName: 'InvalidRefreshToken',
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    invalidTokenAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // Alarm 5: Secrets Manager update failure (CRITICAL - token may be lost)
    const secretUpdateAlarm = new cloudwatch.Alarm(this, 'SecretUpdateFailureAlarm', {
      alarmName: 'nasun-follower-secret-update-failure',
      alarmDescription: 'CRITICAL: Secrets Manager update failed after retries',
      metric: new cloudwatch.Metric({
        namespace: 'NASUN/OAuth',
        metricName: 'SecretUpdateFailure',
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    secretUpdateAlarm.addAlarmAction(new cloudwatchActions.SnsAction(monitoringTopic));

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'FollowersTableName', {
      value: this.followersTable.tableName,
      description: 'DynamoDB table for storing follower data',
    });

    new cdk.CfnOutput(this, 'CollectFollowersFunctionArn', {
      value: this.collectFollowersFunction.functionArn,
      description: 'Lambda function ARN for collecting followers',
    });

    new cdk.CfnOutput(this, 'DailyScheduleRuleName', {
      value: dailyScheduleRule.ruleName,
      description: 'EventBridge rule for daily scheduling',
    });

    new cdk.CfnOutput(this, 'RefreshOAuth2TokenFunctionArn', {
      value: this.refreshOAuth2TokenFunction.functionArn,
      description: 'Lambda function ARN for OAuth2 token refresh',
    });

    new cdk.CfnOutput(this, 'TokenRefreshScheduleRuleName', {
      value: tokenRefreshRule.ruleName,
      description: 'EventBridge rule for token refresh (70 min)',
    });
  }
}
