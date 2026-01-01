/**
 * NFT Event Stack - Wave 1 Battalion Free Mint Event
 *
 * @description
 * DynamoDB 테이블, Lambda 함수, API Gateway 엔드포인트를 포함하는
 * NFT 이벤트 전용 인프라 스택입니다.
 *
 * Feature Flag: VITE_ENABLE_NFT_EVENT (default: false)
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// Security: CORS 허용 도메인 목록
const ALLOWED_ORIGINS = [
  'https://nasun.io',
  'https://www.nasun.io',
  'https://staging.nasun.io',
  'https://gensol.nasun.io',
  'https://staging.gensol.io',
  'https://pado.finance',
  'https://staging.pado.finance',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'] : []),
];

export class NftEventStack extends cdk.Stack {
  public readonly whitelistTable: dynamodb.Table;
  public readonly tasksTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ========== 1. DynamoDB Tables ==========

    // 1.1 NftWhitelist Table
    this.whitelistTable = new dynamodb.Table(this, 'NftWhitelistTable', {
      tableName: 'nasun-nft-whitelist',
      partitionKey: {
        name: 'walletAddress',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // 실수로 삭제 방지
      pointInTimeRecovery: true, // 롤백용 (최대 35일)
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // 감사 로그용
      encryption: dynamodb.TableEncryption.AWS_MANAGED, // 암호화
    });

    // GSI 1: X User ID로 조회 (중복 등록 방지)
    this.whitelistTable.addGlobalSecondaryIndex({
      indexName: 'xUserId-index',
      partitionKey: {
        name: 'xUserId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI 2: status로 조회 (CSV export 최적화, Scan → Query)
    this.whitelistTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI 3: Allowlist Batch로 조회 (Batch별 CSV export, 등록순 정렬)
    this.whitelistTable.addGlobalSecondaryIndex({
      indexName: 'batch-index',
      partitionKey: {
        name: 'allowlistBatchId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'verifiedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 1.2 EventTasks Table
    this.tasksTable = new dynamodb.Table(this, 'EventTasksTable', {
      tableName: 'nasun-nft-event-tasks',
      partitionKey: {
        name: 'walletAddress',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'taskType',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // ========== 2. CloudWatch Log Groups ==========

    const verifyLogGroup = new logs.LogGroup(this, 'VerifyEligibilityLogGroup', {
      logGroupName: '/aws/lambda/nasun-nft-verify-eligibility',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const registerLogGroup = new logs.LogGroup(this, 'RegisterUserLogGroup', {
      logGroupName: '/aws/lambda/nasun-nft-register-user',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const exportLogGroup = new logs.LogGroup(this, 'ExportCsvLogGroup', {
      logGroupName: '/aws/lambda/nasun-nft-export-csv',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const withdrawLogGroup = new logs.LogGroup(this, 'WithdrawUserLogGroup', {
      logGroupName: '/aws/lambda/nasun-nft-withdraw-user',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const checkStatusLogGroup = new logs.LogGroup(this, 'CheckStatusLogGroup', {
      logGroupName: '/aws/lambda/nasun-nft-check-status',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== 3. S3 Bucket for CSV Export ==========

    const exportBucket = new s3.Bucket(this, 'WhitelistExportBucket', {
      bucketName: `nasun-whitelist-exports-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      versioned: true, // 버전 관리
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // ========== 4. Lambda Functions ==========

    // 환경 변수 (cdk/.env에서 로드)
    const X_TARGET_USERNAME = process.env.X_TARGET_USERNAME || 'Nasun_io';
    const X_TARGET_USER_ID = process.env.X_TARGET_USER_ID || '1863020068785004544';
    const X_TARGET_TWEET_ID = process.env.X_TARGET_TWEET_ID || '';
    const CURRENT_BATCH_ID = process.env.CURRENT_BATCH_ID || '1';

    // Lambda 1: verify-eligibility
    const verifyEligibilityLambda = new lambda.Function(this, 'VerifyEligibilityLambda', {
      functionName: 'nasun-nft-verify-eligibility',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda-src/nft-event/verify-eligibility'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logGroup: verifyLogGroup,
      environment: {
        WHITELIST_TABLE_NAME: this.whitelistTable.tableName,
        TASKS_TABLE_NAME: this.tasksTable.tableName,
        X_API_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || '',
        X_TARGET_USERNAME,
        X_TARGET_USER_ID,
        X_TARGET_TWEET_ID,
        ENABLE_RATE_LIMIT_CACHE: 'true',
        CACHE_TTL_MINUTES: '15',
      },
    });

    // IAM 권한: DynamoDB 읽기/쓰기
    this.whitelistTable.grantReadWriteData(verifyEligibilityLambda);
    this.tasksTable.grantReadWriteData(verifyEligibilityLambda);

    // Lambda 2: register-user
    const registerUserLambda = new lambda.Function(this, 'RegisterUserLambda', {
      functionName: 'nasun-nft-register-user',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda-src/nft-event/register-user'),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      logGroup: registerLogGroup,
      environment: {
        WHITELIST_TABLE_NAME: this.whitelistTable.tableName,
        TASKS_TABLE_NAME: this.tasksTable.tableName,
        X_API_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || '',
        X_TARGET_USERNAME,
        X_TARGET_TWEET_ID,
        ENABLE_RATE_LIMIT_CACHE: 'true',
        CACHE_TTL_MINUTES: '15',
        CURRENT_BATCH_ID, // Allowlist Batch ID
      },
    });

    this.whitelistTable.grantReadWriteData(registerUserLambda);
    this.tasksTable.grantReadWriteData(registerUserLambda); // copyTasks() PutItem 권한 필요

    // Lambda 3: withdraw-user
    const withdrawUserLambda = new lambda.Function(this, 'WithdrawUserLambda', {
      functionName: 'nasun-nft-withdraw-user',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda-src/nft-event/withdraw-user'),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      logGroup: withdrawLogGroup,
      environment: {
        WHITELIST_TABLE_NAME: this.whitelistTable.tableName,
      },
    });

    this.whitelistTable.grantReadWriteData(withdrawUserLambda);

    // Lambda 4: export-csv (OpenSea Allowlist)
    const exportCsvLambda = new lambda.Function(this, 'ExportCsvLambda', {
      functionName: 'nasun-nft-export-csv',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda-src/nft-event/export-csv'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      logGroup: exportLogGroup,
      environment: {
        WHITELIST_TABLE_NAME: this.whitelistTable.tableName,
        TASKS_TABLE_NAME: this.tasksTable.tableName,
        X_API_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || '',
        X_TARGET_USERNAME,
        X_TARGET_TWEET_ID,
        ENABLE_RATE_LIMIT_CACHE: 'true',
        CACHE_TTL_MINUTES: '15',
        EXPORT_BUCKET_NAME: exportBucket.bucketName,
      },
    });

    this.whitelistTable.grantReadData(exportCsvLambda);
    exportBucket.grantPut(exportCsvLambda);
    exportBucket.grantRead(exportCsvLambda); // Presigned URL 생성용

    // Lambda 5: check-registration-status
    const checkStatusLambda = new lambda.Function(this, 'CheckStatusLambda', {
      functionName: 'nasun-nft-check-status',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda-src/nft-event/check-registration-status'),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logGroup: checkStatusLogGroup,
      environment: {
        WHITELIST_TABLE_NAME: this.whitelistTable.tableName,
      },
    });

    this.whitelistTable.grantReadData(checkStatusLambda);

    // ========== 5. API Gateway ==========

    this.api = new apigateway.RestApi(this, 'NftEventApi', {
      restApiName: 'NASUN NFT Event API',
      description: 'Wave 1 Battalion NFT Free Mint Event API',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100, // 초당 100 요청
        throttlingBurstLimit: 200, // 버스트 200 요청
        tracingEnabled: true, // X-Ray tracing
        dataTraceEnabled: true, // API Gateway 로그
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
        allowCredentials: false,
      },
    });

    // /event 리소스
    const eventResource = this.api.root.addResource('event');

    // POST /event/verify
    const verifyResource = eventResource.addResource('verify');
    verifyResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(verifyEligibilityLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );

    // POST /event/register
    const registerResource = eventResource.addResource('register');
    registerResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(registerUserLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );

    // POST /event/withdraw
    const withdrawResource = eventResource.addResource('withdraw');
    withdrawResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(withdrawUserLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );

    // GET /event/status?walletAddress=0x...
    const statusResource = eventResource.addResource('status');
    statusResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(checkStatusLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        requestParameters: {
          'method.request.querystring.walletAddress': true, // Required parameter
        },
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );

    // /admin 리소스 (관리자 전용)
    const adminResource = this.api.root.addResource('admin');

    // GET /admin/export-csv (관리자 전용, API Key 필요)
    const exportResource = adminResource.addResource('export-csv');

    // API Key 생성
    const apiKey = this.api.addApiKey('NftEventAdminApiKey', {
      apiKeyName: 'nft-event-admin-key',
      description: 'Admin API Key for NFT Event CSV Export',
    });

    // Usage Plan 생성
    const usagePlan = this.api.addUsagePlan('NftEventUsagePlan', {
      name: 'NFT Event Admin Usage Plan',
      throttle: {
        rateLimit: 10, // 초당 10 요청
        burstLimit: 20,
      },
      quota: {
        limit: 1000, // 일 1000 요청
        period: apigateway.Period.DAY,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: this.api.deploymentStage,
    });

    exportResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(exportCsvLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
          },
        ],
      }),
      {
        apiKeyRequired: true, // API Key 필수
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );

    // ========== 6. CloudFormation Outputs ==========

    new cdk.CfnOutput(this, 'WhitelistTableName', {
      value: this.whitelistTable.tableName,
      description: 'NFT Whitelist DynamoDB Table Name',
      exportName: 'NftWhitelistTableName',
    });

    new cdk.CfnOutput(this, 'WhitelistTableArn', {
      value: this.whitelistTable.tableArn,
      description: 'NFT Whitelist DynamoDB Table ARN',
      exportName: 'NftWhitelistTableArn',
    });

    new cdk.CfnOutput(this, 'TasksTableName', {
      value: this.tasksTable.tableName,
      description: 'NFT Event Tasks DynamoDB Table Name',
      exportName: 'NftEventTasksTableName',
    });

    new cdk.CfnOutput(this, 'TasksTableArn', {
      value: this.tasksTable.tableArn,
      description: 'NFT Event Tasks DynamoDB Table ARN',
      exportName: 'NftEventTasksTableArn',
    });

    new cdk.CfnOutput(this, 'ExportBucketName', {
      value: exportBucket.bucketName,
      description: 'S3 Bucket for CSV Export',
      exportName: 'NftEventExportBucketName',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'NFT Event API Gateway URL',
      exportName: 'NftEventApiUrl',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'Admin API Key ID (use AWS CLI to get value)',
    });

    new cdk.CfnOutput(this, 'VerifyEndpoint', {
      value: `${this.api.url}event/verify`,
      description: 'POST /event/verify - 참여 자격 검증',
    });

    new cdk.CfnOutput(this, 'RegisterEndpoint', {
      value: `${this.api.url}event/register`,
      description: 'POST /event/register - 화이트리스트 등록',
    });

    new cdk.CfnOutput(this, 'WithdrawEndpoint', {
      value: `${this.api.url}event/withdraw`,
      description: 'POST /event/withdraw - 화이트리스트 참여 취소',
    });

    new cdk.CfnOutput(this, 'StatusEndpoint', {
      value: `${this.api.url}event/status`,
      description: 'GET /event/status?walletAddress=0x... - 등록 상태 조회',
    });

    new cdk.CfnOutput(this, 'ExportEndpoint', {
      value: `${this.api.url}admin/export-csv`,
      description: 'GET /admin/export-csv - OpenSea CSV Export (API Key required)',
    });

    // Feature Flag Output
    new cdk.CfnOutput(this, 'FeatureFlag', {
      value: 'VITE_ENABLE_NFT_EVENT=false',
      description: 'NFT Event Feature Flag (default: disabled)',
    });
  }
}
