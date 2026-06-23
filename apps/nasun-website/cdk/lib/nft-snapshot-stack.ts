/**
 * NFT Snapshot Stack
 *
 * Standalone CDK stack for NFT ownership tracking.
 *
 * Resources:
 * - DynamoDB table: nasun-nft-ownership (ETH ownership snapshots)
 * - Lambda: nasun-eth-nft-collector-v2 (daily holder-centric ETH NFT ownership via Alchemy)
 * - Lambda: nasun-eth-ownership-verifier (daily ownership verification + auto-deactivation)
 * - EventBridge rules: ETH collect at 01:00 UTC, verify at 01:45 UTC
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
    // NFT API v3 base URL is required by eth-collector-v2 (getOwnersForContract).
    const alchemyNftV3BaseUrl =
      process.env.VITE_ALCHEMY_NFT_V3_URL || 'https://eth-mainnet.g.alchemy.com/nft/v3';

    // ========== ETH NFT Collector (daily EventBridge rule) ==========

    // EventBridge: daily at 01:00 UTC (target = holder-centric v2 below)
    const dailyRule = new events.Rule(this, 'EthNftDailyRule', {
      ruleName: 'nasun-eth-nft-daily',
      description: 'Daily ETH NFT ownership snapshot at 01:00 UTC',
      enabled: true,
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '1',
      }),
    });

    // ========== ETH NFT Collector v2 (holder-centric, ACTIVE) ==========
    //
    // Holder-centric collector: one getOwnersForContract call per enabled ETH
    // contract (~150 CU * M contracts) instead of wallet-by-wallet polling.
    // Sole daily ETH ownership collector (legacy v1 removed 2026-06-23).

    const ethCollectorV2 = new NodejsFunction(this, 'EthNftCollectorV2Function', {
      functionName: 'nasun-eth-nft-collector-v2',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'eth-collector-v2.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      description: 'Holder-centric ETH NFT ownership collector (Phase B, daily 01:00 UTC)',
      environment: {
        OWNERSHIP_TABLE: ownershipTable.tableName,
        COLLECTIONS_TABLE: collectionsTable.tableName,
        PROFILES_TABLE: profilesTable.tableName,
        ALCHEMY_API_KEY: alchemyApiKey,
        ALCHEMY_NFT_V3_BASE_URL: alchemyNftV3BaseUrl,
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

    ownershipTable.grantReadWriteData(ethCollectorV2);
    collectionsTable.grantReadData(ethCollectorV2);
    profilesTable.grantReadData(ethCollectorV2);

    // EventBridge daily target: v2.
    dailyRule.addTarget(new targets.LambdaFunction(ethCollectorV2));

    // ========== CloudWatch Alarm ==========

    const alertTopic = sns.Topic.fromTopicArn(
      this,
      'MonitoringAlertTopic',
      `arn:aws:sns:${this.region}:${this.account}:nasun-monitoring-alerts`,
    );

    const ethV2ErrorAlarm = new cloudwatch.Alarm(this, 'EthNftCollectorV2ErrorAlarm', {
      alarmName: 'nasun-eth-nft-collector-v2-errors',
      alarmDescription: 'ETH NFT collector v2 (holder-centric) Lambda errors',
      metric: ethCollectorV2.metricErrors({ period: cdk.Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    ethV2ErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // ========== Ownership Verifier Lambda ==========

    // Cross-stack reference: ecosystem-activations table (owned by EcosystemStack)
    const activationsTable = dynamodb.Table.fromTableName(
      this,
      'EcosystemActivationsTable',
      'nasun-ecosystem-activations',
    );

    const ownershipVerifier = new NodejsFunction(this, 'OwnershipVerifierFunction', {
      functionName: 'nasun-eth-ownership-verifier',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, 'ownership-verifier.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      reservedConcurrentExecutions: 1,
      description: 'Daily ETH NFT ownership verification and auto-deactivation',
      environment: {
        OWNERSHIP_TABLE: ownershipTable.tableName,
        ACTIVATIONS_TABLE: activationsTable.tableName,
        COLLECTIONS_TABLE: collectionsTable.tableName,
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

    ownershipTable.grantReadData(ownershipVerifier);
    // Write META#VERIFICATION records
    ownershipTable.grantWriteData(ownershipVerifier);
    collectionsTable.grantReadData(ownershipVerifier);
    // Least-privilege: Scan (read) + UpdateItem (write) on activations table
    activationsTable.grantReadWriteData(ownershipVerifier);

    // EventBridge: daily at 01:45 UTC (45min after eth-collector)
    const verifierRule = new events.Rule(this, 'OwnershipVerifierDailyRule', {
      ruleName: 'nasun-eth-ownership-verifier-daily',
      description: 'Daily ETH NFT ownership verification at 01:45 UTC',
      enabled: true,
      schedule: events.Schedule.cron({
        minute: '45',
        hour: '1',
      }),
    });

    verifierRule.addTarget(new targets.LambdaFunction(ownershipVerifier));

    // CloudWatch alarm for verifier errors
    const verifierErrorAlarm = new cloudwatch.Alarm(this, 'OwnershipVerifierErrorAlarm', {
      alarmName: 'nasun-eth-ownership-verifier-errors',
      alarmDescription: 'ETH NFT ownership verifier Lambda errors',
      metric: ownershipVerifier.metricErrors({ period: cdk.Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    verifierErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
  }
}
