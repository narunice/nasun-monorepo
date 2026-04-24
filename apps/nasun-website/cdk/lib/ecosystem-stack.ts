/**
 * Ecosystem Stack
 *
 * NFT activation management for ecosystem points.
 * Users activate their NFTs (Alliance, Genesis Pass, Battalion) to earn
 * multiplied ecosystem points.
 *
 * Architecture:
 * - nasun-ecosystem-activations: identityId + nftType#walletAddress (2-state: ACTIVE/INACTIVE)
 * - Single Lambda handler with route-based dispatch
 * - JWT authorizer (Cognito Identity Pool)
 * - Cross-stack read access to alliance-mint, nft-ownership, nft-collections, UserProfiles, UserWallets
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

interface EcosystemStackProps extends cdk.StackProps {
  userProfilesTableName: string;
  cognitoIdentityPoolId: string;
  sharedWafArn: string;
}

export class EcosystemStack extends cdk.Stack {
  public readonly activationsTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: EcosystemStackProps) {
    super(scope, id, props);

    const { userProfilesTableName, cognitoIdentityPoolId } = props;

    // ========== 1. DynamoDB Table ==========

    this.activationsTable = new dynamodb.Table(this, "ActivationsTable", {
      tableName: "nasun-ecosystem-activations",
      partitionKey: {
        name: "identityId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // ========== 2. Cross-Stack Table References ==========

    const allianceMintTable = dynamodb.Table.fromTableName(
      this, "AllianceMintTable", "nasun-alliance-mint"
    );
    const nftOwnershipTable = dynamodb.Table.fromTableName(
      this, "NftOwnershipTable", "nasun-nft-ownership"
    );
    const nftCollectionsTable = dynamodb.Table.fromTableName(
      this, "NftCollectionsTable", "nasun-nft-collections"
    );
    const userWalletsTable = dynamodb.Table.fromTableName(
      this, "UserWalletsTable", "UserWallets"
    );

    // ========== 3. CloudWatch Log Groups ==========

    const handlerLogGroup = new logs.LogGroup(this, "HandlerLogGroup", {
      logGroupName: "/aws/lambda/nasun-ecosystem-handler",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const authorizerLogGroup = new logs.LogGroup(this, "AuthorizerLogGroup", {
      logGroupName: "/aws/lambda/nasun-ecosystem-authorizer",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========== 4. Lambda Functions ==========

    const lambdaSrcPath = path.join(__dirname, "..", "lambda-src", "ecosystem-api");
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

    // 4.1 Handler Lambda
    const handlerLambda = new NodejsFunction(this, "HandlerLambda", {
      functionName: "nasun-ecosystem-handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(lambdaSrcPath, "handler", "src", "index.ts"),
      handler: "handler",
      depsLockFilePath,
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      logGroup: handlerLogGroup,
      environment: {
        ACTIVATIONS_TABLE_NAME: this.activationsTable.tableName,
        ALLIANCE_MINT_TABLE_NAME: allianceMintTable.tableName,
        NFT_OWNERSHIP_TABLE_NAME: nftOwnershipTable.tableName,
        NFT_COLLECTIONS_TABLE_NAME: nftCollectionsTable.tableName,
        USER_PROFILES_TABLE_NAME: userProfilesTableName,
        USER_WALLETS_TABLE_NAME: userWalletsTable.tableName,
        ALLOWED_ORIGINS: ALLOWED_ORIGINS_ENV,
        GENESIS_PASS_CONTRACT_ADDRESS: process.env.GENESIS_PASS_CONTRACT_ADDRESS || "",
        ALCHEMY_API_KEY: process.env.VITE_ALCHEMY_API_KEY || "",
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    // Grant table permissions
    this.activationsTable.grantReadWriteData(handlerLambda);
    allianceMintTable.grantReadData(handlerLambda);
    nftOwnershipTable.grantReadWriteData(handlerLambda);
    nftCollectionsTable.grantReadData(handlerLambda);
    userWalletsTable.grantReadData(handlerLambda);

    // UserProfiles: Read + Query on GSI (twitterId-index, telegramUserId-index)
    handlerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:GetItem", "dynamodb:Query"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${userProfilesTableName}`,
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${userProfilesTableName}/index/*`,
        ],
      })
    );

    // 4.2 Authorizer Lambda
    const authorizerLambda = new NodejsFunction(this, "AuthorizerLambda", {
      functionName: "nasun-ecosystem-authorizer",
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
      this, "TokenAuthorizer", {
        handler: authorizerLambda,
        resultsCacheTtl: cdk.Duration.seconds(60),
        identitySource: "method.request.header.Authorization",
      }
    );

    // ========== 5. API Gateway ==========

    this.api = new apigateway.RestApi(this, "EcosystemApi", {
      restApiName: "NASUN Ecosystem API",
      description: "NFT Activation Management for Ecosystem Points",
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

    const ecosystemResource = this.api.root.addResource("ecosystem");
    const handlerIntegration = new apigateway.LambdaIntegration(handlerLambda, {
      proxy: true,
    });

    const authOptions = {
      authorizer: tokenAuthorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    // GET  /ecosystem/status
    const statusResource = ecosystemResource.addResource("status");
    statusResource.addMethod("GET", handlerIntegration, authOptions);

    // POST /ecosystem/activate
    const activateResource = ecosystemResource.addResource("activate");
    activateResource.addMethod("POST", handlerIntegration, authOptions);

    // POST /ecosystem/deactivate
    const deactivateResource = ecosystemResource.addResource("deactivate");
    deactivateResource.addMethod("POST", handlerIntegration, authOptions);

    // ========== 6. Outputs ==========

    new cdk.CfnOutput(this, "EcosystemApiUrl", {
      value: this.api.url,
      description: "Ecosystem API URL",
      exportName: "EcosystemApiUrl",
    });

    new wafv2.CfnWebACLAssociation(this, "EcosystemWafAssociation", {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: props.sharedWafArn,
    });
  }
}
