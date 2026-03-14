/**
 * Leaderboard V3 Stack
 *
 * Completely independent from V2 leaderboard system.
 * Manual curation system for community engagement tracking.
 *
 * Resources:
 * - DynamoDB tables: leaderboard-v3-posts, leaderboard-v3-accounts,
 *                    leaderboard-v3-seasons, leaderboard-v3-snapshots,
 *                    leaderboard-v3-season-accounts
 * - Lambda functions: create-post, get-leaderboard, get-account,
 *                     admin-seasons, generate-snapshot, get-top-climbers,
 *                     get-my-rank, get-rank-history
 * - API Gateway: /v3/posts, /v3/leaderboard, /v3/accounts, /v3/admin/seasons
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

import { ALLOWED_ORIGINS_ENV } from './constants/cors';

export interface LeaderboardV3StackProps extends cdk.StackProps {
  /** Environment name (dev, staging, prod) */
  environmentName: string;
  /** Cognito Identity Pool ID for JWT verification */
  cognitoIdentityPoolId: string;
  /** UserProfiles table for profile data lookup (required for admin auth) */
  userProfilesTableName: string;
}

export class LeaderboardV3Stack extends cdk.Stack {
  public readonly postsTable: dynamodb.Table;
  public readonly accountsTable: dynamodb.Table;
  public readonly seasonsTable: dynamodb.Table;
  public readonly snapshotsTable: dynamodb.Table;
  public readonly seasonAccountsTable: dynamodb.Table;
  public readonly api: apigw.RestApi;

  constructor(scope: Construct, id: string, props: LeaderboardV3StackProps) {
    super(scope, id, props);

    const { environmentName, cognitoIdentityPoolId, userProfilesTableName } = props;
    const envPrefix = environmentName === 'prod' ? '' : `${environmentName}-`;

    // Import UserProfiles table for admin auth + profile data lookup
    const userProfilesTable = dynamodb.Table.fromTableName(this, 'UserProfilesTable', userProfilesTableName);

    // ============================================
    // DynamoDB Tables
    // ============================================

    // Posts table
    this.postsTable = new dynamodb.Table(this, 'LeaderboardV3PostsTable', {
      tableName: `${envPrefix}leaderboard-v3-posts`,
      partitionKey: { name: 'postId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environmentName === 'prod',
      },
    });

    // GSI for URL lookup (deduplication)
    this.postsTable.addGlobalSecondaryIndex({
      indexName: 'postUrl-index',
      partitionKey: { name: 'postUrl', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for createdAt (period filtering)
    this.postsTable.addGlobalSecondaryIndex({
      indexName: 'createdAt-index',
      partitionKey: { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for season-based queries (Phase 5)
    this.postsTable.addGlobalSecondaryIndex({
      indexName: 'seasonId-createdAt-index',
      partitionKey: { name: 'seasonId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Accounts table
    this.accountsTable = new dynamodb.Table(this, 'LeaderboardV3AccountsTable', {
      tableName: `${envPrefix}leaderboard-v3-accounts`,
      partitionKey: { name: 'accountId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environmentName === 'prod',
      },
    });

    // GSI for username lookup
    this.accountsTable.addGlobalSecondaryIndex({
      indexName: 'platform-username-index',
      partitionKey: { name: 'platform', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Seasons table (Phase 5)
    this.seasonsTable = new dynamodb.Table(this, 'LeaderboardV3SeasonsTable', {
      tableName: `${envPrefix}leaderboard-v3-seasons`,
      partitionKey: { name: 'seasonId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environmentName === 'prod',
      },
    });

    // Snapshots table (Phase 5)
    // pk: "{seasonId}#{date}" e.g., "SEASON1#2026-01-21"
    // sk: "RANK#{rank:04d}" e.g., "RANK#0001"
    this.snapshotsTable = new dynamodb.Table(this, 'LeaderboardV3SnapshotsTable', {
      tableName: `${envPrefix}leaderboard-v3-snapshots`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environmentName === 'prod',
      },
      timeToLiveAttribute: 'ttl', // Enable TTL for auto-cleanup of old snapshots
    });

    // GSI for user rank history lookup
    this.snapshotsTable.addGlobalSecondaryIndex({
      indexName: 'accountId-snapshotDate-index',
      partitionKey: { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'snapshotDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Season-Accounts table (Phase 5)
    // pk: "SEASON#{seasonId}#ACCOUNT#{accountId}"
    // sk: "SCORE"
    this.seasonAccountsTable = new dynamodb.Table(this, 'LeaderboardV3SeasonAccountsTable', {
      tableName: `${envPrefix}leaderboard-v3-season-accounts`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environmentName === 'prod',
      },
    });

    // GSI for season-based leaderboard ranking
    this.seasonAccountsTable.addGlobalSecondaryIndex({
      indexName: 'seasonId-userScore-index',
      partitionKey: { name: 'seasonId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userScore', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================
    // Lambda Functions (using NodejsFunction for automatic bundling)
    // ============================================

    const lambdaEnvironment: Record<string, string> = {
      LEADERBOARD_V3_POSTS_TABLE: this.postsTable.tableName,
      LEADERBOARD_V3_ACCOUNTS_TABLE: this.accountsTable.tableName,
      LEADERBOARD_V3_SEASONS_TABLE: this.seasonsTable.tableName,
      LEADERBOARD_V3_SNAPSHOTS_TABLE: this.snapshotsTable.tableName,
      LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE: this.seasonAccountsTable.tableName,
      COGNITO_IDENTITY_POOL_ID: cognitoIdentityPoolId,
      USER_PROFILES_TABLE: userProfilesTableName,
      ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      NODE_OPTIONS: '--enable-source-maps',
    };

    const lambdaSrcPath = path.join(__dirname, '..', 'lambda-src', 'leaderboard-v3', 'src');
    const depsLockFilePath = path.join(__dirname, '..', 'pnpm-lock.yaml');

    // Common bundling options
    const bundlingOptions = {
      minify: true,
      sourceMap: true,
      externalModules: [
        '@aws-sdk/client-dynamodb',
        '@aws-sdk/lib-dynamodb',
      ],
    };

    // Common NodejsFunction options
    const nodejsFunctionDefaults = {
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: lambdaEnvironment,
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: bundlingOptions,
      depsLockFilePath,
    };

    // Create Post Lambda
    const createPostLambda = new NodejsFunction(
      this,
      'LeaderboardV3CreatePostFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-create-post`,
        entry: path.join(lambdaSrcPath, 'handlers', 'create-post.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Admin endpoint to register social media posts',
      }
    );

    // Get Leaderboard Lambda
    const getLeaderboardLambda = new NodejsFunction(
      this,
      'LeaderboardV3GetLeaderboardFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-get-leaderboard`,
        entry: path.join(lambdaSrcPath, 'handlers', 'get-leaderboard.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        description: 'Leaderboard V3: Public endpoint to get rankings',
      }
    );

    // Get Account Lambda
    const getAccountLambda = new NodejsFunction(
      this,
      'LeaderboardV3GetAccountFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-get-account`,
        entry: path.join(lambdaSrcPath, 'handlers', 'get-account.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Get account details for auto-prefill',
      }
    );

    // Admin Seasons Lambda (Phase 5)
    const adminSeasonsLambda = new NodejsFunction(
      this,
      'LeaderboardV3AdminSeasonsFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-admin-seasons`,
        entry: path.join(lambdaSrcPath, 'handlers', 'admin-seasons.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Admin season CRUD operations',
      }
    );

    // Admin Stats Lambda (Phase 7) - Dashboard statistics
    const adminStatsLambda = new NodejsFunction(
      this,
      'LeaderboardV3AdminStatsFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-admin-stats`,
        entry: path.join(lambdaSrcPath, 'handlers', 'admin-stats.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Admin dashboard statistics',
      }
    );

    // Generate Snapshot Lambda (Phase 5) - triggered by EventBridge
    const generateSnapshotLambda = new NodejsFunction(
      this,
      'LeaderboardV3GenerateSnapshotFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-generate-snapshot`,
        entry: path.join(lambdaSrcPath, 'handlers', 'generate-snapshot.ts'),
        handler: 'handler',
        timeout: cdk.Duration.minutes(5), // Longer timeout for batch operations
        memorySize: 512,
        description: 'Leaderboard V3: Daily snapshot generation',
        environment: {
          ...lambdaEnvironment,
          ENABLE_BATCH_DECAY: 'true',
        },
      }
    );

    // EventBridge rule: Run daily at 09:10 KST (00:10 UTC)
    const snapshotScheduleRule = new events.Rule(this, 'LeaderboardV3SnapshotSchedule', {
      ruleName: `${envPrefix}leaderboard-v3-snapshot-schedule`,
      description: 'Daily snapshot generation for Leaderboard V3 at 09:10 KST',
      enabled: false,
      schedule: events.Schedule.cron({
        minute: '10',
        hour: '0', // 00:10 UTC = 09:10 KST
      }),
    });

    snapshotScheduleRule.addTarget(new targets.LambdaFunction(generateSnapshotLambda));

    // Get Top Climbers Lambda (Phase 5)
    const getTopClimbersLambda = new NodejsFunction(
      this,
      'LeaderboardV3GetTopClimbersFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-get-top-climbers`,
        entry: path.join(lambdaSrcPath, 'handlers', 'get-top-climbers.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Get top rank climbers',
      }
    );

    // Get Featured Feed Lambda (Phase 10)
    const getFeaturedFeedLambda = new NodejsFunction(
      this,
      'LeaderboardV3GetFeaturedFeedFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-get-featured-feed`,
        entry: path.join(lambdaSrcPath, 'handlers', 'get-featured-feed.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        description: 'Leaderboard V3: Get featured content feed',
      }
    );

    // Get My Rank Lambda (Phase 10)
    const getMyRankLambda = new NodejsFunction(
      this,
      'LeaderboardV3GetMyRankFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-get-my-rank`,
        entry: path.join(lambdaSrcPath, 'handlers', 'get-my-rank.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Get my rank for logged-in user',
      }
    );

    // Get Rank History Lambda (Phase 12)
    const getRankHistoryLambda = new NodejsFunction(
      this,
      'LeaderboardV3GetRankHistoryFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-get-rank-history`,
        entry: path.join(lambdaSrcPath, 'handlers', 'get-rank-history.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Get user rank history over time',
      }
    );

    // Search Accounts Lambda (Phase 8)
    const searchAccountsLambda = new NodejsFunction(
      this,
      'LeaderboardV3SearchAccountsFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-search-accounts`,
        entry: path.join(lambdaSrcPath, 'handlers', 'search-accounts.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Search accounts by username',
      }
    );

    // Admin Blacklist Lambda (Phase 11)
    const adminBlacklistLambda = new NodejsFunction(
      this,
      'LeaderboardV3AdminBlacklistFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-admin-blacklist`,
        entry: path.join(lambdaSrcPath, 'handlers', 'admin-blacklist.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Admin blacklist management (ban/unban/list)',
      }
    );

    // Admin Edit Post Lambda (post editing from dashboard)
    const adminEditPostLambda = new NodejsFunction(
      this,
      'LeaderboardV3AdminEditPostFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-admin-edit-post`,
        entry: path.join(lambdaSrcPath, 'handlers', 'admin-edit-post.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Admin edit post fields and adjust scores',
      }
    );

    // Admin Featured Feed Lambda (curated feed management)
    const adminFeaturedFeedLambda = new NodejsFunction(
      this,
      'LeaderboardV3AdminFeaturedFeedFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-admin-featured-feed`,
        entry: path.join(lambdaSrcPath, 'handlers', 'admin-featured-feed.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Admin featured feed curation (GET/PUT)',
      }
    );

    // Admin Adjust Score Lambda (manual score adjustment)
    const adjustScoreLambda = new NodejsFunction(
      this,
      'LeaderboardV3AdjustScoreFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-adjust-score`,
        entry: path.join(lambdaSrcPath, 'handlers', 'adjust-score.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Admin manual score adjustment',
      }
    );

    // Verify Telegram Lambda (Telegram channel membership verification)
    const verifyTelegramLambda = new NodejsFunction(
      this,
      'LeaderboardV3VerifyTelegramFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-verify-telegram`,
        entry: path.join(lambdaSrcPath, 'handlers', 'verify-telegram.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Verify Telegram channel membership for sky-blue checkmark',
        environment: {
          ...lambdaEnvironment,
          TELEGRAM_BOT_TOKEN_SECRET_NAME: process.env.TELEGRAM_BOT_TOKEN_SECRET_NAME || 'nasun-telegram-bot-token',
          TELEGRAM_CHANNEL_USERNAME: process.env.TELEGRAM_CHANNEL_USERNAME || '',
        },
        bundling: {
          ...bundlingOptions,
          externalModules: [
            '@aws-sdk/client-dynamodb',
            '@aws-sdk/lib-dynamodb',
            '@aws-sdk/client-secrets-manager',
          ],
        },
      }
    );

    // Telegram Status Lambda (lightweight GET endpoint for checking verification status)
    const telegramStatusLambda = new NodejsFunction(
      this,
      'LeaderboardV3TelegramStatusFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-telegram-status`,
        entry: path.join(lambdaSrcPath, 'handlers', 'telegram-status.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        description: 'Leaderboard V3: Check Telegram verification status from UserProfiles',
      }
    );

    // Disconnect Telegram Lambda (unlink Telegram from user account)
    const disconnectTelegramLambda = new NodejsFunction(
      this,
      'LeaderboardV3DisconnectTelegramFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-disconnect-telegram`,
        entry: path.join(lambdaSrcPath, 'handlers', 'disconnect-telegram.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        description: 'Leaderboard V3: Disconnect Telegram from user account',
      }
    );

    // Grant DynamoDB permissions
    this.postsTable.grantReadWriteData(createPostLambda);
    this.postsTable.grantReadData(getLeaderboardLambda);
    this.postsTable.grantReadData(getAccountLambda);

    this.accountsTable.grantReadWriteData(createPostLambda);
    this.accountsTable.grantReadData(getLeaderboardLambda);
    this.accountsTable.grantReadData(getAccountLambda);

    // Season tables permissions
    this.seasonsTable.grantReadData(createPostLambda); // Read active season
    this.seasonsTable.grantReadData(getLeaderboardLambda); // Read season info
    this.seasonsTable.grantReadWriteData(adminSeasonsLambda); // Full CRUD for admin
    this.seasonsTable.grantReadWriteData(generateSnapshotLambda); // Read season, update metadata
    this.postsTable.grantReadData(generateSnapshotLambda); // Read posts for batch decay calculation
    this.seasonAccountsTable.grantReadWriteData(createPostLambda); // Update season-specific aggregates
    this.seasonAccountsTable.grantReadData(getLeaderboardLambda); // Read season rankings
    this.seasonAccountsTable.grantReadWriteData(generateSnapshotLambda); // Read scores + persist corrected displayNames
    this.accountsTable.grantReadWriteData(generateSnapshotLambda); // Read accounts + persist corrected displayNames
    this.snapshotsTable.grantReadData(getLeaderboardLambda); // Read past snapshots
    this.snapshotsTable.grantReadWriteData(generateSnapshotLambda); // Write snapshots, read previous
    this.snapshotsTable.grantReadData(getTopClimbersLambda); // Read snapshots for comparison
    this.seasonsTable.grantReadData(getTopClimbersLambda); // Read season info
    this.accountsTable.grantReadData(getTopClimbersLambda); // Read banned accounts
    this.postsTable.grantReadData(adminSeasonsLambda); // Check posts before delete

    // Admin Stats permissions (Phase 7)
    this.postsTable.grantReadData(adminStatsLambda);
    this.accountsTable.grantReadData(adminStatsLambda);
    this.seasonsTable.grantReadData(adminStatsLambda);
    this.seasonAccountsTable.grantReadData(adminStatsLambda);

    // Search Accounts permissions (Phase 8)
    this.accountsTable.grantReadData(searchAccountsLambda);
    this.seasonAccountsTable.grantReadData(searchAccountsLambda);
    this.snapshotsTable.grantReadData(searchAccountsLambda);
    this.seasonsTable.grantReadData(searchAccountsLambda);

    // Admin Blacklist permissions (Phase 11)
    this.accountsTable.grantReadWriteData(adminBlacklistLambda);

    // Admin Edit Post permissions
    this.postsTable.grantReadWriteData(adminEditPostLambda);
    this.accountsTable.grantReadWriteData(adminEditPostLambda);
    this.seasonAccountsTable.grantReadWriteData(adminEditPostLambda);

    // Admin Adjust Score permissions
    this.accountsTable.grantReadWriteData(adjustScoreLambda);
    this.seasonsTable.grantReadData(adjustScoreLambda);
    this.seasonAccountsTable.grantReadWriteData(adjustScoreLambda);

    // Admin Featured Feed permissions (curated feed management)
    this.seasonsTable.grantReadWriteData(adminFeaturedFeedLambda);
    this.postsTable.grantReadData(adminFeaturedFeedLambda);
    this.accountsTable.grantReadData(adminFeaturedFeedLambda);

    // Featured Feed permissions (Phase 10)
    this.postsTable.grantReadData(getFeaturedFeedLambda);
    this.accountsTable.grantReadData(getFeaturedFeedLambda);
    this.seasonsTable.grantReadData(getFeaturedFeedLambda);
    this.seasonAccountsTable.grantReadData(getFeaturedFeedLambda);
    this.snapshotsTable.grantReadData(getFeaturedFeedLambda);

    // My Rank permissions (Phase 10) - ReadWrite for profile sync (accounts + season-accounts)
    this.accountsTable.grantReadWriteData(getMyRankLambda);
    this.seasonsTable.grantReadData(getMyRankLambda);
    this.seasonAccountsTable.grantReadWriteData(getMyRankLambda);
    this.snapshotsTable.grantReadData(getMyRankLambda);

    // Rank History permissions (Phase 12)
    this.accountsTable.grantReadData(getRankHistoryLambda);
    this.seasonsTable.grantReadData(getRankHistoryLambda);
    this.snapshotsTable.grantReadData(getRankHistoryLambda);

    // Grant read access to UserProfiles table for admin auth + profile data lookup
    const adminAuthLambdas = [
      createPostLambda,
      adminSeasonsLambda,
      adminStatsLambda,
      adminBlacklistLambda,
      adminEditPostLambda,
      adminFeaturedFeedLambda,
      adjustScoreLambda,
      getLeaderboardLambda,  // cumulative view requires admin auth
      generateSnapshotLambda, // API Gateway path requires admin auth via UserProfiles
    ];
    for (const fn of adminAuthLambdas) {
      userProfilesTable.grantReadData(fn);
    }
    // Profile data lookup (non-admin)
    userProfilesTable.grantReadData(getMyRankLambda);

    // Verify Telegram permissions
    this.accountsTable.grantReadWriteData(verifyTelegramLambda);
    this.seasonAccountsTable.grantReadWriteData(verifyTelegramLambda);
    this.seasonsTable.grantReadData(verifyTelegramLambda);
    userProfilesTable.grantReadWriteData(verifyTelegramLambda); // v2: primary storage in UserProfiles

    // Telegram Status permissions (read-only)
    userProfilesTable.grantReadData(telegramStatusLambda);

    // Disconnect Telegram permissions (same tables as verify-telegram)
    this.accountsTable.grantReadWriteData(disconnectTelegramLambda);
    this.seasonAccountsTable.grantReadWriteData(disconnectTelegramLambda);
    this.seasonsTable.grantReadData(disconnectTelegramLambda);
    userProfilesTable.grantReadWriteData(disconnectTelegramLambda);

    // Secrets Manager read for Telegram bot token
    verifyTelegramLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${
            process.env.TELEGRAM_BOT_TOKEN_SECRET_NAME || 'nasun-telegram-bot-token'
          }*`,
        ],
      })
    );

    // fromTableName() doesn't include GSI permissions - add explicitly
    const userProfilesIndexPolicy = new iam.PolicyStatement({
      actions: ['dynamodb:Query'],
      resources: [`${userProfilesTable.tableArn}/index/*`],
    });
    createPostLambda.addToRolePolicy(userProfilesIndexPolicy);
    getMyRankLambda.addToRolePolicy(userProfilesIndexPolicy);
    verifyTelegramLambda.addToRolePolicy(userProfilesIndexPolicy);
    generateSnapshotLambda.addToRolePolicy(userProfilesIndexPolicy);

    // ============================================
    // API Gateway
    // ============================================

    this.api = new apigw.RestApi(this, 'LeaderboardV3Api', {
      restApiName: `${envPrefix}nasun-leaderboard-v3-api`,
      description: 'Nasun Community Leaderboard V3 API',
      deployOptions: {
        stageName: environmentName === 'prod' ? 'prod' : 'dev',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Admin-Username',
        ],
      },
    });

    // POST /v3/posts
    const v3Resource = this.api.root.addResource('v3');
    const postsResource = v3Resource.addResource('posts');
    postsResource.addMethod(
      'POST',
      new apigw.LambdaIntegration(createPostLambda)
    );

    // GET /v3/leaderboard
    const leaderboardResource = v3Resource.addResource('leaderboard');
    leaderboardResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(getLeaderboardLambda)
    );

    // GET /v3/leaderboard/top-climbers
    const topClimbersResource = leaderboardResource.addResource('top-climbers');
    topClimbersResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(getTopClimbersLambda)
    );

    // GET /v3/leaderboard/my-rank
    const myRankResource = leaderboardResource.addResource('my-rank');
    myRankResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(getMyRankLambda)
    );

    // GET /v3/leaderboard/rank-history
    const rankHistoryResource = leaderboardResource.addResource('rank-history');
    rankHistoryResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(getRankHistoryLambda)
    );

    // POST /v3/leaderboard/verify-telegram
    const verifyTelegramResource = leaderboardResource.addResource('verify-telegram');
    verifyTelegramResource.addMethod(
      'POST',
      new apigw.LambdaIntegration(verifyTelegramLambda)
    );

    // GET /v3/leaderboard/telegram-status
    const telegramStatusResource = leaderboardResource.addResource('telegram-status');
    telegramStatusResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(telegramStatusLambda)
    );

    // POST /v3/leaderboard/disconnect-telegram
    const disconnectTelegramResource = leaderboardResource.addResource('disconnect-telegram');
    disconnectTelegramResource.addMethod(
      'POST',
      new apigw.LambdaIntegration(disconnectTelegramLambda)
    );

    // GET /v3/feed/featured
    const feedResource = v3Resource.addResource('feed');
    const featuredFeedResource = feedResource.addResource('featured');
    featuredFeedResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(getFeaturedFeedLambda)
    );

    // GET /v3/accounts/search?q={query}&limit={limit}&seasonId={seasonId}
    // IMPORTANT: Define 'search' route BEFORE {username} to prevent path parameter collision
    const accountsResource = v3Resource.addResource('accounts');
    const accountsSearchResource = accountsResource.addResource('search');
    accountsSearchResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(searchAccountsLambda)
    );

    // GET /v3/accounts/{username}
    const accountUsernameResource = accountsResource.addResource('{username}');
    accountUsernameResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(getAccountLambda)
    );

    // Admin Seasons API routes (Phase 5)
    const adminResource = v3Resource.addResource('admin');
    const adminSeasonsResource = adminResource.addResource('seasons');
    const adminSeasonsIntegration = new apigw.LambdaIntegration(adminSeasonsLambda);

    // POST /v3/admin/seasons - Create season
    // GET /v3/admin/seasons - List seasons
    adminSeasonsResource.addMethod('POST', adminSeasonsIntegration);
    adminSeasonsResource.addMethod('GET', adminSeasonsIntegration);

    // GET/PATCH/DELETE /v3/admin/seasons/{seasonId}
    const adminSeasonIdResource = adminSeasonsResource.addResource('{seasonId}');
    adminSeasonIdResource.addMethod('GET', adminSeasonsIntegration);
    adminSeasonIdResource.addMethod('PATCH', adminSeasonsIntegration);
    adminSeasonIdResource.addMethod('DELETE', adminSeasonsIntegration);

    // POST /v3/admin/seasons/{seasonId}/activate
    const adminSeasonActivateResource = adminSeasonIdResource.addResource('activate');
    adminSeasonActivateResource.addMethod('POST', adminSeasonsIntegration);

    // POST /v3/admin/seasons/{seasonId}/end
    const adminSeasonEndResource = adminSeasonIdResource.addResource('end');
    adminSeasonEndResource.addMethod('POST', adminSeasonsIntegration);

    // GET /v3/admin/stats - Dashboard statistics (Phase 7)
    const adminStatsResource = adminResource.addResource('stats');
    adminStatsResource.addMethod('GET', new apigw.LambdaIntegration(adminStatsLambda));

    // Admin Blacklist routes (Phase 11)
    // POST /v3/admin/blacklist - Ban account
    // GET /v3/admin/blacklist - List banned accounts
    const adminBlacklistResource = adminResource.addResource('blacklist');
    const adminBlacklistIntegration = new apigw.LambdaIntegration(adminBlacklistLambda);
    adminBlacklistResource.addMethod('POST', adminBlacklistIntegration);
    adminBlacklistResource.addMethod('GET', adminBlacklistIntegration);

    // DELETE /v3/admin/blacklist/{accountId} - Unban account
    const adminBlacklistIdResource = adminBlacklistResource.addResource('{accountId}');
    adminBlacklistIdResource.addMethod('DELETE', adminBlacklistIntegration);

    // Admin Featured Feed routes
    // GET /v3/admin/featured-feed - Get curated feed
    // PUT /v3/admin/featured-feed - Replace curated feed
    const adminFeaturedFeedResource = adminResource.addResource('featured-feed');
    const adminFeaturedFeedIntegration = new apigw.LambdaIntegration(adminFeaturedFeedLambda);
    adminFeaturedFeedResource.addMethod('GET', adminFeaturedFeedIntegration);
    adminFeaturedFeedResource.addMethod('PUT', adminFeaturedFeedIntegration);

    // POST /v3/admin/snapshot - Preview (dryRun=true) or generate (dryRun=false) snapshot
    const adminSnapshotResource = adminResource.addResource('snapshot');
    adminSnapshotResource.addMethod('POST', new apigw.LambdaIntegration(generateSnapshotLambda));

    // POST /v3/admin/adjust-score - Manual score adjustment
    const adminAdjustScoreResource = adminResource.addResource('adjust-score');
    adminAdjustScoreResource.addMethod('POST', new apigw.LambdaIntegration(adjustScoreLambda));

    // PATCH /v3/admin/posts/{postId} - Edit post
    const adminPostsResource = adminResource.addResource('posts');
    const adminPostIdResource = adminPostsResource.addResource('{postId}');
    adminPostIdResource.addMethod('PATCH', new apigw.LambdaIntegration(adminEditPostLambda));

    // ============================================
    // Outputs
    // ============================================

    new cdk.CfnOutput(this, 'LeaderboardV3ApiUrl', {
      value: this.api.url,
      description: 'Leaderboard V3 API URL',
      exportName: `${envPrefix}LeaderboardV3ApiUrl`,
    });

    new cdk.CfnOutput(this, 'LeaderboardV3PostsTableName', {
      value: this.postsTable.tableName,
      description: 'Leaderboard V3 Posts Table Name',
    });

    new cdk.CfnOutput(this, 'LeaderboardV3AccountsTableName', {
      value: this.accountsTable.tableName,
      description: 'Leaderboard V3 Accounts Table Name',
      exportName: `${envPrefix}LeaderboardV3AccountsTableName`,
    });

    new cdk.CfnOutput(this, 'LeaderboardV3SeasonsTableName', {
      value: this.seasonsTable.tableName,
      description: 'Leaderboard V3 Seasons Table Name',
    });

    new cdk.CfnOutput(this, 'LeaderboardV3SnapshotsTableName', {
      value: this.snapshotsTable.tableName,
      description: 'Leaderboard V3 Snapshots Table Name',
    });

    new cdk.CfnOutput(this, 'LeaderboardV3SeasonAccountsTableName', {
      value: this.seasonAccountsTable.tableName,
      description: 'Leaderboard V3 Season Accounts Table Name',
    });
  }
}