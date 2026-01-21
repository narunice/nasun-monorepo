/**
 * Leaderboard V3 Stack
 *
 * Completely independent from V2 leaderboard system.
 * Manual curation system for community engagement tracking.
 *
 * Resources:
 * - DynamoDB tables: leaderboard-v3-posts, leaderboard-v3-accounts
 * - Lambda functions: create-post, get-leaderboard, get-account
 * - API Gateway: /v3/posts, /v3/leaderboard, /v3/accounts
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

export interface LeaderboardV3StackProps extends cdk.StackProps {
  /** Environment name (dev, staging, prod) */
  environmentName: string;
  /** Admin password for POST /v3/posts endpoint */
  adminPassword: string;
  /** UserProfiles table for profile data lookup (optional) */
  userProfilesTableName?: string;
}

export class LeaderboardV3Stack extends cdk.Stack {
  public readonly postsTable: dynamodb.Table;
  public readonly accountsTable: dynamodb.Table;
  public readonly api: apigw.RestApi;

  constructor(scope: Construct, id: string, props: LeaderboardV3StackProps) {
    super(scope, id, props);

    const { environmentName, adminPassword, userProfilesTableName } = props;
    const envPrefix = environmentName === 'prod' ? '' : `${environmentName}-`;

    // Import UserProfiles table for profile data lookup (Internal Data Sync)
    const userProfilesTable = userProfilesTableName
      ? dynamodb.Table.fromTableName(this, 'UserProfilesTable', userProfilesTableName)
      : undefined;

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
      pointInTimeRecovery: environmentName === 'prod',
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

    // Accounts table
    this.accountsTable = new dynamodb.Table(this, 'LeaderboardV3AccountsTable', {
      tableName: `${envPrefix}leaderboard-v3-accounts`,
      partitionKey: { name: 'accountId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: environmentName === 'prod',
    });

    // GSI for username lookup
    this.accountsTable.addGlobalSecondaryIndex({
      indexName: 'platform-username-index',
      partitionKey: { name: 'platform', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'username', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================
    // Lambda Functions (using NodejsFunction for automatic bundling)
    // ============================================

    const lambdaEnvironment: Record<string, string> = {
      LEADERBOARD_V3_POSTS_TABLE: this.postsTable.tableName,
      LEADERBOARD_V3_ACCOUNTS_TABLE: this.accountsTable.tableName,
      LEADERBOARD_V3_ADMIN_PASSWORD: adminPassword,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Add UserProfiles table name if available
    if (userProfilesTableName) {
      lambdaEnvironment.USER_PROFILES_TABLE = userProfilesTableName;
    }

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
      runtime: lambda.Runtime.NODEJS_18_X,
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

    // Grant DynamoDB permissions
    this.postsTable.grantReadWriteData(createPostLambda);
    this.postsTable.grantReadData(getLeaderboardLambda);
    this.postsTable.grantReadData(getAccountLambda);

    this.accountsTable.grantReadWriteData(createPostLambda);
    this.accountsTable.grantReadData(getLeaderboardLambda);
    this.accountsTable.grantReadData(getAccountLambda);

    // Grant read access to UserProfiles table for profile data lookup
    if (userProfilesTable) {
      userProfilesTable.grantReadData(createPostLambda);
    }

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

    // GET /v3/accounts/{username}
    const accountsResource = v3Resource.addResource('accounts');
    const accountUsernameResource = accountsResource.addResource('{username}');
    accountUsernameResource.addMethod(
      'GET',
      new apigw.LambdaIntegration(getAccountLambda)
    );

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
    });
  }
}
