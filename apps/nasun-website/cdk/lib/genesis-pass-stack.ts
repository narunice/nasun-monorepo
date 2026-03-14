/**
 * Genesis Pass Allowlist Stack
 *
 * DynamoDB table, Lambda functions, and API Gateway for
 * Genesis Pass NFT allowlist registration.
 *
 * Security: Register Lambda reads EVM address from UserProfiles (server-side),
 * not from client request. JWT authorizer verifies Cognito identity.
 */

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";
import { Construct } from "constructs";
import { ALLOWED_ORIGINS, ALLOWED_ORIGINS_ENV } from "./constants/cors";

interface GenesisPassStackProps extends cdk.StackProps {
  userProfilesTableName: string;
  cognitoIdentityPoolId: string;
}

export class GenesisPassStack extends cdk.Stack {
  public readonly allowlistTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: GenesisPassStackProps) {
    super(scope, id, props);

    const { userProfilesTableName, cognitoIdentityPoolId } = props;

    // ========== 1. DynamoDB Table ==========

    this.allowlistTable = new dynamodb.Table(this, "GenesisPassAllowlistTable", {
      tableName: "nasun-genesis-pass-allowlist",
      partitionKey: {
        name: "walletAddress",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI: 1 Nasun account = 1 allowlist registration
    this.allowlistTable.addGlobalSecondaryIndex({
      indexName: "identityId-index",
      partitionKey: {
        name: "identityId",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========== 2. CloudWatch Log Groups ==========

    const registerLogGroup = new logs.LogGroup(this, "RegisterLogGroup", {
      logGroupName: "/aws/lambda/nasun-genesis-pass-register",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const checkLogGroup = new logs.LogGroup(this, "CheckLogGroup", {
      logGroupName: "/aws/lambda/nasun-genesis-pass-check",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const authorizerLogGroup = new logs.LogGroup(this, "AuthorizerLogGroup", {
      logGroupName: "/aws/lambda/nasun-genesis-pass-authorizer",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== 3. Lambda Functions ==========

    const lambdaSrcPath = path.join(__dirname, "..", "lambda-src", "genesis-pass");
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

    // 3.1 Register Lambda (JWT authorized)
    const registerLambda = new NodejsFunction(this, "RegisterLambda", {
      functionName: "nasun-genesis-pass-register",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, "register", "src", "index.ts"),
      handler: "handler",
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      logGroup: registerLogGroup,
      environment: {
        ALLOWLIST_TABLE_NAME: this.allowlistTable.tableName,
        USER_PROFILES_TABLE_NAME: userProfilesTableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    this.allowlistTable.grantReadWriteData(registerLambda);

    // Read access to UserProfiles table (cross-stack reference by name)
    registerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${userProfilesTableName}`,
        ],
      })
    );

    // 3.2 Check Lambda (public, no auth)
    const checkLambda = new NodejsFunction(this, "CheckLambda", {
      functionName: "nasun-genesis-pass-check",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, "check", "src", "index.ts"),
      handler: "handler",
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logGroup: checkLogGroup,
      environment: {
        ALLOWLIST_TABLE_NAME: this.allowlistTable.tableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    this.allowlistTable.grantReadData(checkLambda);

    // 3.3 Authorizer Lambda (Cognito JWT verification)
    const authorizerLambda = new NodejsFunction(this, "AuthorizerLambda", {
      functionName: "nasun-genesis-pass-authorizer",
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

    const tokenAuthorizer = new apigateway.TokenAuthorizer(this, "TokenAuthorizer", {
      handler: authorizerLambda,
      resultsCacheTtl: cdk.Duration.seconds(60),
      identitySource: "method.request.header.Authorization",
    });

    // ========== 4. API Gateway ==========

    this.api = new apigateway.RestApi(this, "GenesisPassApi", {
      restApiName: "NASUN Genesis Pass API",
      description: "Genesis Pass NFT Allowlist Registration API",
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

    const genesisPassResource = this.api.root.addResource("genesis-pass");

    // GET    /genesis-pass/register (JWT required) - Check own status
    // POST   /genesis-pass/register (JWT required) - Register (upsert)
    // DELETE /genesis-pass/register (JWT required) - Withdraw
    const registerResource = genesisPassResource.addResource("register");
    const registerIntegration = new apigateway.LambdaIntegration(registerLambda, { proxy: true });
    const authOptions = {
      authorizer: tokenAuthorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };
    registerResource.addMethod("GET", registerIntegration, authOptions);
    registerResource.addMethod("POST", registerIntegration, authOptions);
    registerResource.addMethod("DELETE", registerIntegration, authOptions);

    // GET /genesis-pass/check?walletAddress=0x...
    const checkResource = genesisPassResource.addResource("check");
    checkResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(checkLambda, { proxy: true })
    );

    // ========== 5. CloudFormation Outputs ==========

    new cdk.CfnOutput(this, "AllowlistTableName", {
      value: this.allowlistTable.tableName,
      description: "Genesis Pass Allowlist DynamoDB Table Name",
    });

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.api.url,
      description: "Genesis Pass API Gateway URL",
    });

    new cdk.CfnOutput(this, "RegisterEndpoint", {
      value: `${this.api.url}genesis-pass/register`,
      description: "POST /genesis-pass/register (JWT required)",
    });

    new cdk.CfnOutput(this, "CheckEndpoint", {
      value: `${this.api.url}genesis-pass/check`,
      description: "GET /genesis-pass/check?walletAddress=0x...",
    });
  }
}
