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

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as path from "path";
import { Construct } from "constructs";
import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from "./constants/cors";

export interface NftEventStackProps extends cdk.StackProps {
  /** Shared WAF WebACL ARN to attach this API's stage to */
  readonly sharedWafArn: string;
}

export class NftEventStack extends cdk.Stack {
  public readonly whitelistTable: dynamodb.Table;
  public readonly tasksTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: NftEventStackProps) {
    super(scope, id, props);

    // ========== 1. DynamoDB Tables ==========

    // 1.1 NftWhitelist Table
    this.whitelistTable = new dynamodb.Table(this, "NftWhitelistTable", {
      tableName: "nasun-nft-whitelist",
      partitionKey: {
        name: "walletAddress",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // 실수로 삭제 방지
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true, // 롤백용 (최대 35일)
      },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES, // 감사 로그용
      encryption: dynamodb.TableEncryption.AWS_MANAGED, // 암호화
    });

    // GSI 1: X User ID로 조회 (중복 등록 방지)
    this.whitelistTable.addGlobalSecondaryIndex({
      indexName: "xUserId-index",
      partitionKey: {
        name: "xUserId",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI 2: status로 조회 (CSV export 최적화, Scan → Query)
    this.whitelistTable.addGlobalSecondaryIndex({
      indexName: "status-index",
      partitionKey: {
        name: "status",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI 3: Allowlist Batch로 조회 (Batch별 CSV export, 등록순 정렬)
    this.whitelistTable.addGlobalSecondaryIndex({
      indexName: "batch-index",
      partitionKey: {
        name: "allowlistBatchId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "verifiedAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 1.2 EventTasks Table
    this.tasksTable = new dynamodb.Table(this, "EventTasksTable", {
      tableName: "nasun-nft-event-tasks",
      partitionKey: {
        name: "walletAddress",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "taskType",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // ========== 2. CloudWatch Log Groups ==========
    // verify/register/export/withdraw/withdraw-authorizer log groups RETIRED (AWS-exit #5, 2026-06-15).

    const checkStatusLogGroup = new logs.LogGroup(this, "CheckStatusLogGroup", {
      logGroupName: "/aws/lambda/nasun-nft-check-status",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== 3. S3 Bucket for CSV Export ==========

    const exportBucket = new s3.Bucket(this, "WhitelistExportBucket", {
      bucketName: `nasun-whitelist-exports-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      versioned: true, // 버전 관리
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ALLOWED_ORIGINS,
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    // ========== 4. Lambda Functions ==========

    // Common NodejsFunction options
    const nftEventLambdaSrcPath = path.join(__dirname, "..", "lambda-src", "nft-event");
    const depsLockFilePath = path.join(__dirname, "..", "pnpm-lock.yaml");
    const bundlingOptions = {
      minify: true,
      sourceMap: true,
      externalModules: [
        "@aws-sdk/client-dynamodb",
        "@aws-sdk/lib-dynamodb",
        "@aws-sdk/util-dynamodb",
        "@aws-sdk/client-s3",
        "@aws-sdk/s3-request-presigner",
        "@aws-sdk/client-secrets-manager",
      ],
    };

    // Lambda 1-4 (verify-eligibility / register-user / withdraw-user / withdraw-authorizer / export-csv)
    // RETIRED (AWS-exit #5 Tier-1, 2026-06-15): Genesis Battalion event over, 0 invocations/14d,
    // frontend battalion flow unmounted from prod routes. The withdraw Cognito TokenAuthorizer + the
    // /admin export-csv ApiKey/UsagePlan are removed with them. Only check-status survives below.
    // The whitelist/tasks tables (RETAIN) + exportBucket (RETAIN) are kept for the #8 decommission gate.

    // Lambda 5: check-registration-status
    const checkStatusLambda = new NodejsFunction(this, "CheckStatusLambda", {
      functionName: "nasun-nft-check-status",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(nftEventLambdaSrcPath, "check-registration-status", "src", "index.ts"),
      handler: "handler",
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logGroup: checkStatusLogGroup,
      environment: {
        WHITELIST_TABLE_NAME: this.whitelistTable.tableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    this.whitelistTable.grantReadData(checkStatusLambda);

    // ========== 5. API Gateway ==========

    this.api = new apigateway.RestApi(this, "NftEventApi", {
      restApiName: "NASUN NFT Event API",
      description: "Wave 1 Battalion NFT Event API",
      deployOptions: {
        stageName: "prod",
        throttlingRateLimit: 100, // 초당 100 요청
        throttlingBurstLimit: 200, // 버스트 200 요청
        tracingEnabled: true, // X-Ray tracing
        dataTraceEnabled: false, // Disabled: prevents logging request/response bodies with sensitive data
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization", "X-Api-Key"],
        allowCredentials: false,
      },
    });

    // /event 리소스
    const eventResource = this.api.root.addResource("event");

    // POST /event/{verify,register,withdraw} RETIRED (AWS-exit #5, 2026-06-15). Only /event/status kept.

    // GET /event/status?walletAddress=0x...
    const statusResource = eventResource.addResource("status");
    statusResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(checkStatusLambda, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        requestParameters: {
          "method.request.querystring.walletAddress": true, // Required parameter
        },
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // /admin/export-csv + NftEventAdminApiKey + NftEventUsagePlan RETIRED (AWS-exit #5, 2026-06-15).

    // ========== 6. CloudFormation Outputs ==========

    new cdk.CfnOutput(this, "WhitelistTableName", {
      value: this.whitelistTable.tableName,
      description: "NFT Whitelist DynamoDB Table Name",
      exportName: "NftWhitelistTableName",
    });

    new cdk.CfnOutput(this, "WhitelistTableArn", {
      value: this.whitelistTable.tableArn,
      description: "NFT Whitelist DynamoDB Table ARN",
      exportName: "NftWhitelistTableArn",
    });

    new cdk.CfnOutput(this, "TasksTableName", {
      value: this.tasksTable.tableName,
      description: "NFT Event Tasks DynamoDB Table Name",
      exportName: "NftEventTasksTableName",
    });

    new cdk.CfnOutput(this, "TasksTableArn", {
      value: this.tasksTable.tableArn,
      description: "NFT Event Tasks DynamoDB Table ARN",
      exportName: "NftEventTasksTableArn",
    });

    new cdk.CfnOutput(this, "ExportBucketName", {
      value: exportBucket.bucketName,
      description: "S3 Bucket for CSV Export",
      exportName: "NftEventExportBucketName",
    });

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.api.url,
      description: "NFT Event API Gateway URL",
      exportName: "NftEventApiUrl",
    });

    // ApiKeyId / VerifyEndpoint / RegisterEndpoint / WithdrawEndpoint outputs RETIRED (AWS-exit #5, 2026-06-15).

    new cdk.CfnOutput(this, "StatusEndpoint", {
      value: `${this.api.url}event/status`,
      description: "GET /event/status?walletAddress=0x... - 등록 상태 조회",
    });

    // Feature Flag Output
    new cdk.CfnOutput(this, "FeatureFlag", {
      value: "VITE_ENABLE_NFT_EVENT=false",
      description: "NFT Event Feature Flag (default: disabled)",
    });

    new wafv2.CfnWebACLAssociation(this, "NftEventWafAssociation", {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: props.sharedWafArn,
    });
  }
}
