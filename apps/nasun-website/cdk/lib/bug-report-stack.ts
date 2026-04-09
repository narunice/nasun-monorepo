/**
 * Bug Report Stack
 *
 * Structured bug report form submissions.
 * Primary storage: DynamoDB. Best-effort notification: Telegram Bot API.
 *
 * Resources:
 * - DynamoDB table: nasun-bug-reports
 * - Lambda: bug-report
 * - API Gateway: /bug-report (POST)
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
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
      removalPolicy:
        environmentName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // GSI for querying by status
    bugReportsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ============================================
    // Token Authorizer (reuse pattern from admin-stack)
    // ============================================

    const authorizerFn = new NodejsFunction(this, 'TokenAuthorizer', {
      entry: path.join(__dirname, '../lambda-src/admin-api/src/authorizer/tokenAuthorizer.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        COGNITO_IDENTITY_POOL_ID: cognitoIdentityPoolId,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    const authorizer = new apigw.TokenAuthorizer(this, 'BugReportAuthorizer', {
      handler: authorizerFn,
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: cdk.Duration.minutes(5),
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
      environment: {
        BUG_REPORTS_TABLE: bugReportsTable.tableName,
        TELEGRAM_BOT_TOKEN_SECRET_NAME: 'nasun-telegram-bot-token',
        NARU_TELEGRAM_CHAT_ID: naruTelegramChatId,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant DynamoDB write access
    bugReportsTable.grantWriteData(bugReportFn);

    // Grant Secrets Manager read access for Telegram bot token
    bugReportFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:nasun-telegram-bot-token*`],
    }));

    // ============================================
    // API Gateway
    // ============================================

    this.api = new apigw.RestApi(this, 'BugReportApi', {
      restApiName: `${envPrefix}nasun-bug-report-api`,
      description: 'Bug Report API for nasun.io',
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      },
    });

    // POST /bug-report
    const bugReportResource = this.api.root.addResource('bug-report');
    bugReportResource.addMethod('POST', new apigw.LambdaIntegration(bugReportFn), {
      authorizer,
      authorizationType: apigw.AuthorizationType.CUSTOM,
    });

    // ============================================
    // Outputs
    // ============================================

    new cdk.CfnOutput(this, 'BugReportApiUrl', {
      value: this.api.url,
      description: 'Bug Report API Gateway URL',
    });
  }
}
