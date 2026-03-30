/**
 * NFT Snapshot Stack
 *
 * Standalone CDK stack for NFT ownership tracking.
 *
 * Resources:
 * - DynamoDB table: nasun-nft-ownership (ETH + Devnet snapshots)
 * - Lambda: nasun-eth-nft-collector (daily ETH NFT ownership via Alchemy)
 * - Lambda: nasun-devnet-nft-collector (daily + on-demand devnet NFT backup via RPC)
 * - EventBridge rules: ETH at 01:00 UTC, Devnet at 02:00 UTC
 * - CloudWatch alarm: ETH collector error notification
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
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class NftSnapshotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========== DynamoDB Table ==========

    const ownershipTable = new dynamodb.Table(this, 'NftOwnershipTable', {
      tableName: 'nasun-nft-ownership',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // GSI: wallet-date-index (for staking duration queries)
    ownershipTable.addGlobalSecondaryIndex({
      indexName: 'wallet-date-index',
      partitionKey: { name: 'walletAddress', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'snapshotDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========== Shared Config ==========

    const lambdaSrcPath = path.join(__dirname, '..', 'lambda-src', 'nft-snapshot', 'src');
    const depsLockFilePath = path.join(__dirname, '..', 'pnpm-lock.yaml');

    // Reference existing tables
    const collectionsTable = dynamodb.Table.fromTableName(
      this,
      'NftCollectionsTable',
      'nasun-nft-collections',
    );

    const profilesTable = dynamodb.Table.fromTableName(
      this,
      'UserProfilesTable',
      'UserProfiles',
    );

    // Alchemy API key from environment (set in .env files)
    const alchemyApiKey = process.env.VITE_ALCHEMY_API_KEY || '';
    const alchemyBaseUrl = process.env.VITE_ALCHEMY_MAINNET_URL || 'https://eth-mainnet.g.alchemy.com/v2';

    // ========== ETH NFT Collector Lambda ==========

    const ethCollector = new NodejsFunction(this, 'EthNftCollectorFunction', {
      functionName: 'nasun-eth-nft-collector',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'eth-collector.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(10),
      memorySize: 256,
      description: 'Daily ETH NFT ownership collector via Alchemy API',
      environment: {
        OWNERSHIP_TABLE: ownershipTable.tableName,
        COLLECTIONS_TABLE: collectionsTable.tableName,
        PROFILES_TABLE: profilesTable.tableName,
        ALCHEMY_API_KEY: alchemyApiKey,
        ALCHEMY_BASE_URL: alchemyBaseUrl,
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

    ownershipTable.grantReadWriteData(ethCollector);
    collectionsTable.grantReadData(ethCollector);
    profilesTable.grantReadData(ethCollector);

    // EventBridge: daily at 01:00 UTC
    const dailyRule = new events.Rule(this, 'EthNftDailyRule', {
      ruleName: 'nasun-eth-nft-daily',
      description: 'Daily ETH NFT ownership snapshot at 01:00 UTC',
      enabled: true,
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '1',
      }),
    });

    dailyRule.addTarget(new targets.LambdaFunction(ethCollector));

    // ========== Devnet NFT Collector Lambda ==========

    const devnetCollector = new NodejsFunction(this, 'DevnetNftCollectorFunction', {
      functionName: 'nasun-devnet-nft-collector',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'devnet-collector.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      description: 'On-demand devnet NFT snapshot collector via Nasun RPC',
      environment: {
        OWNERSHIP_TABLE: ownershipTable.tableName,
        NASUN_RPC_URL: 'https://rpc.devnet.nasun.io',
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

    ownershipTable.grantReadWriteData(devnetCollector);

    // EventBridge: daily at 02:00 UTC (after ETH collector at 01:00)
    const devnetDailyRule = new events.Rule(this, 'DevnetNftDailyRule', {
      ruleName: 'nasun-devnet-nft-daily',
      description: 'Daily devnet NFT ownership snapshot at 02:00 UTC',
      enabled: true,
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
      }),
    });

    devnetDailyRule.addTarget(new targets.LambdaFunction(devnetCollector));

    // ========== CloudWatch Alarm ==========

    const alertTopic = sns.Topic.fromTopicArn(
      this,
      'MonitoringAlertTopic',
      `arn:aws:sns:${this.region}:${this.account}:nasun-monitoring-alerts`,
    );

    const ethErrorAlarm = new cloudwatch.Alarm(this, 'EthNftCollectorErrorAlarm', {
      alarmName: 'nasun-eth-nft-collector-errors',
      alarmDescription: 'ETH NFT collector Lambda errors',
      metric: ethCollector.metricErrors({ period: cdk.Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    ethErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
  }
}
