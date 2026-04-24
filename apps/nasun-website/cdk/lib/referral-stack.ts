/**
 * Referral System Stack
 *
 * DynamoDB tables, Lambda functions, and API Gateway for
 * referral code generation, application, and statistics.
 *
 * Architecture:
 * - nasun-referral-codes: referralCode -> identityId (reverse lookup)
 * - nasun-referrals: referredIdentityId -> referrerIdentityId (1:1 relationship)
 * - JWT authorizer verifies Cognito identity for all public endpoints
 * - Internal /referral-mappings endpoint uses x-api-key auth (served from AdminStack)
 */

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as path from "path";
import { Construct } from "constructs";
import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from "./constants/cors";

interface ReferralStackProps extends cdk.StackProps {
  userProfilesTableName: string;
  cognitoIdentityPoolId: string;
  sharedWafArn: string;
}

export class ReferralStack extends cdk.Stack {
  public readonly referralCodesTable: dynamodb.Table;
  public readonly referralsTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ReferralStackProps) {
    super(scope, id, props);

    const { userProfilesTableName, cognitoIdentityPoolId } = props;

    // ========== 1. DynamoDB Tables ==========

    // Referral codes: reverse lookup from code -> identityId
    // Separate table because UserProfiles uses fromTableName() (no GSI addition)
    this.referralCodesTable = new dynamodb.Table(this, "ReferralCodesTable", {
      tableName: "nasun-referral-codes",
      partitionKey: {
        name: "referralCode",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Referral relationships: 1 referred user = 1 referrer (PK uniqueness)
    this.referralsTable = new dynamodb.Table(this, "ReferralsTable", {
      tableName: "nasun-referrals",
      partitionKey: {
        name: "referredIdentityId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI: query all referrals by referrer (for my-stats and referral-mappings)
    this.referralsTable.addGlobalSecondaryIndex({
      indexName: "referrerIdentityId-index",
      partitionKey: {
        name: "referrerIdentityId",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========== 2. CloudWatch Log Groups ==========

    const handlerLogGroup = new logs.LogGroup(this, "HandlerLogGroup", {
      logGroupName: "/aws/lambda/nasun-referral-handler",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const authorizerLogGroup = new logs.LogGroup(this, "AuthorizerLogGroup", {
      logGroupName: "/aws/lambda/nasun-referral-authorizer",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== 3. Lambda Functions ==========

    const lambdaSrcPath = path.join(__dirname, "..", "lambda-src", "referral");
    const depsLockFilePath = path.join(__dirname, "..", "pnpm-lock.yaml");
    const bundlingOptions = {
      minify: true,
      sourceMap: true,
      externalModules: [
        "@aws-sdk/client-dynamodb",
        "@aws-sdk/lib-dynamodb",
        "@aws-sdk/util-dynamodb",
      ],
    };

    // 3.1 Handler Lambda (JWT authorized) - my-code, apply, my-stats
    const handlerLambda = new NodejsFunction(this, "HandlerLambda", {
      functionName: "nasun-referral-handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, "handler", "src", "index.ts"),
      handler: "handler",
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      logGroup: handlerLogGroup,
      environment: {
        REFERRAL_CODES_TABLE_NAME: this.referralCodesTable.tableName,
        REFERRALS_TABLE_NAME: this.referralsTable.tableName,
        USER_PROFILES_TABLE_NAME: userProfilesTableName,
        REFERRAL_STATS_API_URL: process.env.REFERRAL_STATS_API_URL || "",
        REFERRAL_STATS_API_KEY: process.env.INTERNAL_API_KEY || "",
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    this.referralCodesTable.grantReadWriteData(handlerLambda);
    this.referralsTable.grantReadWriteData(handlerLambda);

    // Read + Update access to UserProfiles table (store referralCode field)
    handlerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${userProfilesTableName}`,
        ],
      })
    );

    // 3.2 Authorizer Lambda (Cognito JWT verification)
    const authorizerLambda = new NodejsFunction(this, "AuthorizerLambda", {
      functionName: "nasun-referral-authorizer",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, "authorizer", "src", "index.ts"),
      handler: "handler",
      depsLockFilePath,
      bundling: {
        minify: true,
        sourceMap: true,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logGroup: authorizerLogGroup,
      environment: {
        COGNITO_IDENTITY_POOL_ID: cognitoIdentityPoolId,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    const tokenAuthorizer = new apigateway.TokenAuthorizer(
      this,
      "TokenAuthorizer",
      {
        handler: authorizerLambda,
        resultsCacheTtl: cdk.Duration.seconds(60),
        identitySource: "method.request.header.Authorization",
      }
    );

    // ========== 4. API Gateway ==========

    this.api = new apigateway.RestApi(this, "ReferralApi", {
      restApiName: "NASUN Referral API",
      description: "Referral System API - code generation, application, statistics",
      deployOptions: {
        stageName: "prod",
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
        tracingEnabled: true,
        dataTraceEnabled: false,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
        allowCredentials: false,
      },
    });

    const referralResource = this.api.root.addResource("referral");
    const handlerIntegration = new apigateway.LambdaIntegration(handlerLambda, {
      proxy: true,
    });
    const authOptions = {
      authorizer: tokenAuthorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    // GET  /referral/my-code  - Get or generate referral code
    const myCodeResource = referralResource.addResource("my-code");
    myCodeResource.addMethod("GET", handlerIntegration, authOptions);

    // POST /referral/apply    - Apply a referral code
    const applyResource = referralResource.addResource("apply");
    applyResource.addMethod("POST", handlerIntegration, authOptions);

    // GET  /referral/my-stats - Get referral statistics
    const myStatsResource = referralResource.addResource("my-stats");
    myStatsResource.addMethod("GET", handlerIntegration, authOptions);

    // ========== 5. CloudFormation Outputs ==========

    new cdk.CfnOutput(this, "ReferralCodesTableName", {
      value: this.referralCodesTable.tableName,
      description: "Referral Codes DynamoDB Table Name",
    });

    new cdk.CfnOutput(this, "ReferralsTableName", {
      value: this.referralsTable.tableName,
      description: "Referrals DynamoDB Table Name",
    });

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.api.url,
      description: "Referral API Gateway URL",
    });

    new wafv2.CfnWebACLAssociation(this, "ReferralWafAssociation", {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: props.sharedWafArn,
    });
  }
}
