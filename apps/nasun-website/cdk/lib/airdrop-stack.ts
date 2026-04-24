/**
 * Airdrop Stack
 *
 * April 16th Airdrop registration system.
 * Users apply for the airdrop via My Account page; admin approves later.
 *
 * Architecture:
 * - nasun-airdrop-registrations: identityId PK (permanent data, PITR + deletion protection)
 * - Single Lambda handler with route-based dispatch (GET status / POST register)
 * - JWT authorizer (Cognito Identity Pool)
 * - Reads UserProfiles for walletAddress + twitterHandle (server-side)
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

interface AirdropStackProps extends cdk.StackProps {
  userProfilesTableName: string;
  cognitoIdentityPoolId: string;
  sharedWafArn: string;
}

export class AirdropStack extends cdk.Stack {
  public readonly registrationsTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: AirdropStackProps) {
    super(scope, id, props);

    const { userProfilesTableName, cognitoIdentityPoolId } = props;

    // ========== 1. DynamoDB Table ==========

    this.registrationsTable = new dynamodb.Table(this, "AirdropRegistrationsTable", {
      tableName: "nasun-airdrop-registrations",
      partitionKey: {
        name: "identityId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // ========== 2. CloudWatch Log Groups ==========

    const handlerLogGroup = new logs.LogGroup(this, "HandlerLogGroup", {
      logGroupName: "/aws/lambda/nasun-airdrop-handler",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const authorizerLogGroup = new logs.LogGroup(this, "AuthorizerLogGroup", {
      logGroupName: "/aws/lambda/nasun-airdrop-authorizer",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== 3. Lambda Functions ==========

    const lambdaSrcPath = path.join(__dirname, "..", "lambda-src", "airdrop");
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

    // 3.1 Handler Lambda (GET status + POST register)
    const handlerLambda = new NodejsFunction(this, "HandlerLambda", {
      functionName: "nasun-airdrop-handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, "handler", "src", "index.ts"),
      handler: "handler",
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      logGroup: handlerLogGroup,
      environment: {
        REGISTRATIONS_TABLE_NAME: this.registrationsTable.tableName,
        USER_PROFILES_TABLE_NAME: userProfilesTableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    this.registrationsTable.grantReadWriteData(handlerLambda);

    // Read access to UserProfiles table (cross-stack reference by name)
    handlerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${userProfilesTableName}`,
        ],
      })
    );

    // 3.2 Authorizer Lambda (Cognito JWT verification)
    const authorizerLambda = new NodejsFunction(this, "AuthorizerLambda", {
      functionName: "nasun-airdrop-authorizer",
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

    this.api = new apigateway.RestApi(this, "AirdropApi", {
      restApiName: "NASUN Airdrop API",
      description: "April 16th Airdrop Registration API",
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

    const airdropResource = this.api.root.addResource("airdrop");
    const registerResource = airdropResource.addResource("register");
    const handlerIntegration = new apigateway.LambdaIntegration(handlerLambda, { proxy: true });
    const authOptions = {
      authorizer: tokenAuthorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    // GET  /airdrop/register - Check own registration status
    // POST /airdrop/register - Apply for airdrop
    registerResource.addMethod("GET", handlerIntegration, authOptions);
    registerResource.addMethod("POST", handlerIntegration, authOptions);

    // ========== 5. CloudFormation Outputs ==========

    new cdk.CfnOutput(this, "RegistrationsTableName", {
      value: this.registrationsTable.tableName,
      description: "Airdrop Registrations DynamoDB Table Name",
    });

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.api.url,
      description: "Airdrop API Gateway URL",
    });

    new wafv2.CfnWebACLAssociation(this, "AirdropWafAssociation", {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: props.sharedWafArn,
    });
  }
}
