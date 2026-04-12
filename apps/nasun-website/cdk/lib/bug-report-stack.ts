/**
 * Bug Report Stack
 *
 * Structured bug report form submissions with screenshot support.
 * Primary storage: DynamoDB. Best-effort notification: Telegram Bot API.
 *
 * Resources:
 * - DynamoDB table: nasun-bug-reports (with identityId-index, status-index GSIs)
 * - DynamoDB table: nasun-creator-posts (Creator Posts Program)
 * - Lambda: bug-report (user-facing: submit, my-reports, upload-url, creator-posts)
 * - Lambda: bug-report-admin (admin: list, status change, reward, creator-posts admin)
 * - API Gateway: /bug-report (POST, GET my-reports, GET upload-url)
 * - API Gateway: /admin/bug-reports (GET list, PATCH status/reward)
 * - API Gateway: /v1/creator-posts (POST, GET my) + /admin/creator-posts/* (admin)
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from './constants/cors';

export interface BugReportStackProps extends cdk.StackProps {
  environmentName: string;
  cognitoIdentityPoolId: string;
  naruTelegramChatId: string;
}

export class BugReportStack extends cdk.Stack {
  public readonly api: apigw.RestApi;
  public readonly bugReportsTableName: string;

  constructor(scope: Construct, id: string, props: BugReportStackProps) {
    super(scope, id, props);

    const { environmentName, cognitoIdentityPoolId, naruTelegramChatId } = props;
    const envPrefix = environmentName === 'prod' ? '' : `${environmentName}-`;

    // ============================================
    // DynamoDB Table
    // ============================================

    const bugReportsTable = new dynamodb.Table(this, 'BugReportsTable', {
      tableName: `${envPrefix}nasun-bug-reports`,
      partitionKey: { name: 'reportId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    this.bugReportsTableName = bugReportsTable.tableName;

    // GSI for querying by status (admin list)
    bugReportsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for querying by identityId (user's own reports)
    bugReportsTable.addGlobalSecondaryIndex({
      indexName: 'identityId-index',
      partitionKey: { name: 'identityId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================
    // DynamoDB Table: Creator Posts
    // ============================================

    const creatorPostsTable = new dynamodb.Table(this, 'CreatorPostsTable', {
      tableName: `${envPrefix}nasun-creator-posts`,
      partitionKey: { name: 'postId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: user's own submissions + rate-limit counting.
    // Projection INCLUDE (status) keeps rate-limit queries single-GSI.
    creatorPostsTable.addGlobalSecondaryIndex({
      indexName: 'identityId-createdAt-index',
      partitionKey: { name: 'identityId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['status'],
    });

    // GSI: admin list by status.
    creatorPostsTable.addGlobalSecondaryIndex({
      indexName: 'status-createdAt-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // ============================================
    // S3 Bucket Reference (screenshots stored in nasun-internal-cache)
    // ============================================

    const screenshotBucket = s3.Bucket.fromBucketName(
      this,
      'ScreenshotBucket',
      `nasun-internal-cache-${this.account}`,
    );

    // ============================================
    // Token Authorizer (reuse pattern from admin-stack)
    // ============================================

    const authorizerFn = new NodejsFunction(this, 'TokenAuthorizer', {
      entry: path.join(__dirname, '../lambda-src/admin-api/src/authorizer/tokenAuthorizer.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      depsLockFilePath: path.join(__dirname, '../pnpm-lock.yaml'),
      environment: {
        COGNITO_IDENTITY_POOL_ID: cognitoIdentityPoolId,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    const authorizer = new apigw.TokenAuthorizer(this, 'BugReportAuthorizer', {
      handler: authorizerFn,
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: cdk.Duration.seconds(60),
    });

    // ============================================
    // Lambda Function
    // ============================================

    const bugReportFn = new NodejsFunction(this, 'BugReportFunction', {
      entry: path.join(__dirname, '../lambda-src/bug-report/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      depsLockFilePath: path.join(__dirname, '../pnpm-lock.yaml'),
      environment: {
        BUG_REPORTS_TABLE: bugReportsTable.tableName,
        CREATOR_POSTS_TABLE: creatorPostsTable.tableName,
        CREATOR_POSTS_DAILY_LIMIT: process.env.CREATOR_POSTS_DAILY_LIMIT || '20',
        USER_PROFILES_TABLE: 'UserProfiles',
        TELEGRAM_BOT_TOKEN_SECRET_NAME: 'nasun-telegram-bot-token',
        NARU_TELEGRAM_CHAT_ID: naruTelegramChatId,
        INTERNAL_CACHE_BUCKET: screenshotBucket.bucketName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant DynamoDB read/write access (read for my-reports + cooldown check)
    bugReportsTable.grantReadWriteData(bugReportFn);
    // Creator Posts table: read/write for submit + my list
    creatorPostsTable.grantReadWriteData(bugReportFn);
    // Read UserProfiles for twitter handle/profile image at submit time
    const userProfilesTableForUser = dynamodb.Table.fromTableName(this, 'UserProfilesRefForUser', 'UserProfiles');
    userProfilesTableForUser.grantReadData(bugReportFn);

    // Grant Secrets Manager read access for Telegram bot token
    bugReportFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun-telegram-bot-token*`],
    }));

    // Grant S3 access for screenshot presigned URLs (restricted to bug-screenshots/ prefix)
    bugReportFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:GetObject'],
      resources: [`${screenshotBucket.bucketArn}/bug-screenshots/*`],
    }));

    // ============================================
    // Admin Lambda (separate Lambda for admin endpoints)
    // Placed here instead of admin-stack to avoid resource policy size limit.
    // Admin authorization is handled inside the Lambda via authenticateAdmin().
    // ============================================

    const bugReportAdminFn = new NodejsFunction(this, 'BugReportAdminFunction', {
      entry: path.join(__dirname, '../lambda-src/bug-report-admin/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      depsLockFilePath: path.join(__dirname, '../pnpm-lock.yaml'),
      environment: {
        BUG_REPORTS_TABLE: bugReportsTable.tableName,
        CREATOR_POSTS_TABLE: creatorPostsTable.tableName,
        USER_PROFILES_TABLE: 'UserProfiles',
        COGNITO_IDENTITY_POOL_ID: cognitoIdentityPoolId,
        INTERNAL_CACHE_BUCKET: screenshotBucket.bucketName,
        EXPLORER_API_URL: process.env.EXPLORER_API_URL || '',
        BUG_REPORT_API_KEY: process.env.BUG_REPORT_API_KEY || '',
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Admin Lambda: full read/write on bug reports table
    bugReportsTable.grantReadWriteData(bugReportAdminFn);
    // Admin Lambda: full read/write on creator-posts table
    creatorPostsTable.grantReadWriteData(bugReportAdminFn);

    // Admin Lambda: read UserProfiles for admin role check
    const userProfilesTable = dynamodb.Table.fromTableName(this, 'UserProfilesRef', 'UserProfiles');
    userProfilesTable.grantReadData(bugReportAdminFn);

    // Admin Lambda: read screenshots for presigned GET URLs
    bugReportAdminFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${screenshotBucket.bucketArn}/bug-screenshots/*`],
    }));

    // ============================================
    // API Gateway
    // ============================================

    this.api = new apigw.RestApi(this, 'BugReportApi', {
      restApiName: `${envPrefix}nasun-bug-report-api`,
      description: 'Bug Report API for nasun.io',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      },
    });

    // Gateway Responses: ensure CORS headers on API Gateway-level errors
    this.api.addGatewayResponse('Default4xx', {
      type: apigw.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'https://nasun.io'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'GET,POST,PATCH,OPTIONS'",
      },
    });
    this.api.addGatewayResponse('Default5xx', {
      type: apigw.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'https://nasun.io'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'GET,POST,PATCH,OPTIONS'",
      },
    });

    const lambdaIntegration = new apigw.LambdaIntegration(bugReportFn);
    const authOptions = {
      authorizer,
      authorizationType: apigw.AuthorizationType.CUSTOM,
    };

    // POST /bug-report
    const bugReportResource = this.api.root.addResource('bug-report');
    bugReportResource.addMethod('POST', lambdaIntegration, authOptions);

    // GET /bug-report/my-reports
    const myReportsResource = bugReportResource.addResource('my-reports');
    myReportsResource.addMethod('GET', lambdaIntegration, authOptions);

    // GET /bug-report/upload-url
    const uploadUrlResource = bugReportResource.addResource('upload-url');
    uploadUrlResource.addMethod('GET', lambdaIntegration, authOptions);

    // POST /bug-report/{reportId}/reply - follow-up on a closed ticket
    const userReportIdResource = bugReportResource.addResource('{reportId}');
    const replyResource = userReportIdResource.addResource('reply');
    replyResource.addMethod('POST', lambdaIntegration, authOptions);

    // Admin endpoints (admin authorization checked inside Lambda)
    const adminIntegration = new apigw.LambdaIntegration(bugReportAdminFn);
    const adminResource = this.api.root.addResource('admin');
    const adminBugReportsResource = adminResource.addResource('bug-reports');

    // GET /admin/bug-reports (list all, status filter)
    adminBugReportsResource.addMethod('GET', adminIntegration, authOptions);

    // PATCH /admin/bug-reports/{reportId} (update status, reward points)
    const adminReportIdResource = adminBugReportsResource.addResource('{reportId}');
    adminReportIdResource.addMethod('PATCH', adminIntegration, authOptions);

    // ============================================
    // Creator Posts API routes
    // ============================================

    // User-facing: POST /v1/creator-posts, GET /v1/creator-posts/my
    const v1Resource = this.api.root.addResource('v1');
    const creatorPostsResource = v1Resource.addResource('creator-posts');
    creatorPostsResource.addMethod('POST', lambdaIntegration, authOptions);
    const myCreatorPostsResource = creatorPostsResource.addResource('my');
    myCreatorPostsResource.addMethod('GET', lambdaIntegration, authOptions);

    // Admin: GET /admin/creator-posts, PATCH /admin/creator-posts/{postId}/score,
    //        PATCH /admin/creator-posts/{postId}/reject, POST /admin/creator-posts/{postId}/grant
    const adminCreatorPostsResource = adminResource.addResource('creator-posts');
    adminCreatorPostsResource.addMethod('GET', adminIntegration, authOptions);
    const adminPostIdResource = adminCreatorPostsResource.addResource('{postId}');
    const adminScoreResource = adminPostIdResource.addResource('score');
    adminScoreResource.addMethod('PATCH', adminIntegration, authOptions);
    const adminRejectResource = adminPostIdResource.addResource('reject');
    adminRejectResource.addMethod('PATCH', adminIntegration, authOptions);
    const adminGrantResource = adminPostIdResource.addResource('grant');
    adminGrantResource.addMethod('POST', adminIntegration, authOptions);

    // ============================================
    // Outputs
    // ============================================

    new cdk.CfnOutput(this, 'BugReportApiUrl', {
      value: this.api.url,
      description: 'Bug Report API Gateway URL',
    });

    new cdk.CfnOutput(this, 'BugReportsTableName', {
      value: bugReportsTable.tableName,
      description: 'Bug Reports DynamoDB Table Name',
    });
  }
}
