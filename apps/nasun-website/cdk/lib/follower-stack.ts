import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export interface FollowerStackProps extends cdk.StackProps {
  readonly twitterBearerToken: string;
  readonly targetAccounts: string; // JSON array of { userId, username }
}

export class FollowerStack extends cdk.Stack {
  public readonly followersTable: dynamodb.Table;
  public readonly collectFollowersFunction: lambda.Function;

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
    this.collectFollowersFunction = new lambda.Function(this, 'CollectFollowersFunction', {
      functionName: 'nasun-collect-followers',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda-src/collect-followers/dist')
      ),
      timeout: cdk.Duration.minutes(10), // 10 minutes for large follower lists
      memorySize: 512,
      environment: {
        TARGET_ACCOUNTS: props.targetAccounts,
        FOLLOWERS_TABLE_NAME: this.followersTable.tableName,
        TWITTER_BEARER_TOKEN: props.twitterBearerToken,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
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
  }
}
